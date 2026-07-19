const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const auth = require('../middleware/auth');
const identify = require('../middleware/identify');
const { Cart, CartItem, CollabSession, CollabMember, Reaction, User, Mission, MissionEvent, MissionMember, MissionSlot } = require('../models');
const { reconcileFeedback } = require('../services/llm');
const { transcribe } = require('../services/whisper');
const { rejectAndReharmonizeSlot } = require('./mission');
const { ownsCart, ownsMission } = require('../middleware/ownership');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

/**
 * A reaction's cartItemId/missionSlotId came from the request body — never
 * trust it points at something inside THIS token's actual session without
 * checking. Otherwise a legitimate collab-link holder for cart A could
 * attach a reaction to an arbitrary item in cart B just by knowing its id.
 */
async function belongsToSession(session, cartItemId, missionSlotId) {
  const sessionCartId = session.CART_ID || session.cartId;
  const sessionMissionId = session.MISSION_ID || session.missionId;

  if (cartItemId) {
    if (!sessionCartId) return false;
    const items = await CartItem.findByCart(sessionCartId);
    return items.some(i => i.id === cartItemId);
  }
  if (missionSlotId) {
    if (!sessionMissionId) return false;
    const slots = await MissionSlot.findByMission(sessionMissionId);
    return slots.some(s => s.id === missionSlotId);
  }
  return false;
}

// POST /api/collab/create/:cartId
// body: { askMode, recipientName, recipientRelation } — all optional, all
// Five-Modes concepts (collab_cart_five_modes.md). Omitting askMode keeps
// the original 'advisor' swipe/react/comment behavior exactly as it was.
router.post('/create/:cartId', auth, async (req, res) => {
  try {
    const cart = await Cart.findById(req.params.cartId);
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    // Otherwise this route would let any authenticated user mint a valid
    // share link for a cart they don't own — a bypass of the ownership
    // check on the direct /api/cart/:id routes, since collab tokens are
    // intentionally allowed to view a cart's contents.
    if (!ownsCart(cart, req.user.id)) return res.status(403).json({ error: 'Not authorized for this cart' });

    const { askMode, recipientName, recipientRelation } = req.body || {};
    const validModes = ['advisor', 'approver', 'proxy', 'peer', 'co_attendee'];
    const mode = validModes.includes(askMode) ? askMode : 'advisor';

    let session = await CollabSession.findByCart(req.params.cartId);
    if (!session) {
      session = await CollabSession.create({
        cartId: req.params.cartId, shareToken: uuidv4(),
        askMode: mode, recipientName, recipientRelation,
      });
    }

    const token = session.SHARE_TOKEN || session.shareToken;
    const baseUrl = process.env.PUBLIC_URL || 'http://localhost:3000';
    const shareUrl = `${baseUrl}/collab/${token}`;

    const shareCopy = {
      approver: `Can you take a quick look and approve? One tap. 💳\n${shareUrl}`,
      proxy: `Picked something out for ${recipientName || 'you'} — take a look? 🎁\n${shareUrl}`,
      peer: `We need to agree on this cart together 🤝\n${shareUrl}`,
      co_attendee: `Check what I'm wearing so we don't clash 👀\n${shareUrl}`,
      advisor: `Check out my wardrobe and give me your opinion! 👗\n${shareUrl}`,
    }[mode];

    res.json({
      shareToken: token,
      shareUrl,
      askMode: mode,
      whatsappUrl: `https://wa.me/?text=${encodeURIComponent(shareCopy)}`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create collab session' });
  }
});

// POST /api/collab/mission/create/:missionId — Family Council for the Wedding Matrix
router.post('/mission/create/:missionId', auth, async (req, res) => {
  try {
    const mission = await Mission.findById(req.params.missionId);
    if (!mission) return res.status(404).json({ error: 'Mission not found' });
    if (!ownsMission(mission, req.user.id)) return res.status(403).json({ error: 'Not authorized for this mission' });

    let session = await CollabSession.findByMission(req.params.missionId);
    if (!session) {
      session = await CollabSession.create({ missionId: req.params.missionId, shareToken: uuidv4() });
    }

    const token = session.SHARE_TOKEN || session.shareToken;
    const baseUrl = process.env.PUBLIC_URL || 'http://localhost:3000';
    const shareUrl = `${baseUrl}/collab/${token}`;

    res.json({
      shareToken: token,
      shareUrl,
      whatsappUrl: `https://wa.me/?text=${encodeURIComponent(`Come weigh in on the wedding wardrobe! 💍\n${shareUrl}`)}`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create mission collab session' });
  }
});

// POST /api/collab/:token/join
router.post('/:token/join', auth, async (req, res) => {
  try {
    const session = await CollabSession.findByToken(req.params.token);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const sessionId = session.ID || session.id;
    const existing = await CollabMember.findOne({ sessionId, userId: req.user.id });
    if (!existing) {
      await CollabMember.create({ sessionId, userId: req.user.id });
    }

    if (req.io) {
      req.io.to(`collab_${req.params.token}`).emit('member:joined', {
        userId: req.user.id, name: req.user.name,
      });
    }

    res.json({
      sessionId, cartId: session.CART_ID || session.cartId,
      missionId: session.MISSION_ID || session.missionId, joined: true,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to join session' });
  }
});

// POST /api/collab/:token/guest-join — no account needed, just a name.
// This is the zero-friction entry point Section 3.2 asks for: the person
// whose opinion is wanted should never have to make a StyleOS account to
// give it. The returned guestToken is only ever valid for THIS session.
router.post('/:token/guest-join', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'A name is needed to join' });

    const session = await CollabSession.findByToken(req.params.token);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const sessionId = session.ID || session.id;
    const cleanName = name.trim().slice(0, 60);
    const guestToken = uuidv4();
    const member = await CollabMember.create({ sessionId, guestName: cleanName, guestToken });

    if (req.io) {
      req.io.to(`collab_${req.params.token}`).emit('member:joined', { name: cleanName, isGuest: true });
    }

    res.json({ guestToken, name: cleanName, memberId: member.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to join session' });
  }
});

// GET /api/collab/:token
router.get('/:token', identify, async (req, res) => {
  try {
    const session = await CollabSession.findByToken(req.params.token);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const sessionId = session.ID || session.id;
    const missionId = session.MISSION_ID || session.missionId;
    const members = await CollabMember.findBySession(sessionId);

    if (missionId) {
      const mission = await Mission.findById(missionId);
      const events = await MissionEvent.findByMission(missionId);
      const missionMembers = await MissionMember.findByMission(missionId);
      const slots = await MissionSlot.findByMission(missionId);
      for (const slot of slots) {
        slot.reactions = await Reaction.findByMissionSlot(slot.id);
      }
      return res.json({ session, mode: 'mission', mission, events, missionMembers, slots, members });
    }

    const cartId = session.CART_ID || session.cartId;
    const cart = await Cart.findById(cartId);
    const items = await CartItem.findByCart(cartId);
    for (const item of items) {
      item.reactions = await Reaction.findByCartItem(item.id);
    }
    cart.items = items;

    res.json({ session, mode: 'cart', cart, members });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch collab session' });
  }
});

// POST /api/collab/:token/payer-lock — APPROVER mode's one real action.
// body: { budgetLock, itemPriceCap, detailLevel }. Setting this is what
// turns "review every item" into "set the fence, then get out of the way" —
// every /shop call for this cart treats item_price_cap as a hard ceiling
// (agent.js), and /finalize's optimizeUnderBudget treats budget_lock the
// same way any stated goal budget is treated.
router.post('/:token/payer-lock', identify, async (req, res) => {
  try {
    const { budgetLock, itemPriceCap, detailLevel } = req.body || {};
    const session = await CollabSession.findByToken(req.params.token);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const sessionId = session.ID || session.id;
    const cartId = session.CART_ID || session.cartId;
    await CollabSession.setPayerLock(sessionId, { budgetLock, itemPriceCap, detailLevel });

    // "Too much" — re-solve the cart against the new number right away,
    // the same optimizeUnderBudget swap/remove ladder /finalize already
    // uses, not a second bespoke implementation of "make it cheaper".
    let refit = null;
    if (budgetLock && cartId) {
      const { optimizeUnderBudget } = require('../services/budget');
      refit = await optimizeUnderBudget({ cartId, totalBudget: budgetLock, io: req.io });
      await Cart.updateTotal(cartId);
    }

    const updatedCart = cartId ? await Cart.findById(cartId) : null;
    if (req.io) req.io.to(`collab_${req.params.token}`).emit('payer_lock:updated', {
      budgetLock, itemPriceCap, total: updatedCart?.TOTAL_PRICE,
    });

    res.json({
      budgetLock, itemPriceCap,
      total: updatedCart?.TOTAL_PRICE || updatedCart?.totalPrice || 0,
      changes: refit?.changes || [],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to set payer lock' });
  }
});

// POST /api/collab/:token/recipient-profile — PROXY mode. Whatever the
// buyer actually knows about who this is for (size, colours, avoid-list).
// Honestly partial: StyleOS has no cross-account order-history sharing, so
// this is buyer-entered, not pulled from a real linked account — see
// collab_cart_five_modes.md's "privacy-preserving size" framing, delivered
// as best-effort rather than a fabricated data connection.
router.post('/:token/recipient-profile', identify, async (req, res) => {
  try {
    const { size, colours, avoid, notes } = req.body || {};
    const session = await CollabSession.findByToken(req.params.token);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const sessionId = session.ID || session.id;
    await CollabSession.setRecipientProfile(sessionId, { size, colours, avoid, notes });
    res.json({ saved: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save recipient profile' });
  }
});

// GET /api/collab/:token/vote-options/:cartItemId — ADVISOR mode's live
// vote. Guest-accessible (unlike /agent/alternatives, which is owner-only)
// since the whole point is letting reviewers pick, not just the shopper.
router.get('/:token/vote-options/:cartItemId', identify, async (req, res) => {
  try {
    const session = await CollabSession.findByToken(req.params.token);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (!(await belongsToSession(session, req.params.cartItemId, null))) {
      return res.status(403).json({ error: 'That item is not part of this shared wardrobe' });
    }

    const { query } = require('../db');
    const r0 = await query(
      `SELECT ci.id AS ci_id, p.id AS product_id, p.title, p.brand, p.price, p.images,
              p.article_type, p.base_colour, p.gender
       FROM cart_items ci JOIN products p ON p.id = ci.product_id WHERE ci.id = :id`,
      { id: req.params.cartItemId }
    );
    const row = r0.rows?.[0];
    if (!row) return res.status(404).json({ error: 'Cart item not found' });

    const r = await query(
      `SELECT * FROM products WHERE LOWER(article_type) = LOWER(:at) AND gender = :gdr
       AND id <> :pid AND in_stock = 1 ORDER BY rating DESC FETCH FIRST 3 ROWS ONLY`,
      { at: row.ARTICLE_TYPE, gdr: row.GENDER || 'Unisex', pid: row.PRODUCT_ID }
    );

    const options = [
      { id: row.PRODUCT_ID, title: row.TITLE, brand: row.BRAND, price: row.PRICE, images: safeJsonArr(row.IMAGES) },
      ...(r.rows || []).map(a => ({ id: a.ID, title: a.TITLE, brand: a.BRAND, price: a.PRICE, images: safeJsonArr(a.IMAGES) })),
    ];

    const votesR = await Reaction.findByCartItem(req.params.cartItemId);
    const votes = votesR.filter(v => v.type === 'vote');
    const tally = {};
    for (const v of votes) tally[v.content] = (tally[v.content] || 0) + 1;

    res.json({ options, tally });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load vote options' });
  }
});
function safeJsonArr(val) { try { return JSON.parse(val || '[]'); } catch { return []; } }

// POST /api/collab/:token/vote — ADVISOR mode. Cast/change a vote for
// which product should win this slot; stored as a Reaction (type='vote',
// content=productId) so it rides the same live-broadcast plumbing as
// love/skip/comment instead of a second parallel system.
router.post('/:token/vote', identify, async (req, res) => {
  try {
    const { cartItemId, productId } = req.body || {};
    const session = await CollabSession.findByToken(req.params.token);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (!(await belongsToSession(session, cartItemId, null))) {
      return res.status(403).json({ error: 'That item is not part of this shared wardrobe' });
    }

    const reaction = await Reaction.create({
      cartItemId, userId: req.identity.id,
      guestName: req.identity.type === 'guest' ? req.identity.name : null,
      type: 'vote', content: productId,
    });

    const allVotes = (await Reaction.findByCartItem(cartItemId)).filter(v => v.type === 'vote');
    const tally = {};
    for (const v of allVotes) tally[v.content] = (tally[v.content] || 0) + 1;

    if (req.io) req.io.to(`collab_${req.params.token}`).emit('vote:updated', { cartItemId, tally });

    res.status(201).json({ reaction, tally });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to cast vote' });
  }
});

// POST /api/collab/:token/react
router.post('/:token/react', identify, async (req, res) => {
  try {
    const { cartItemId, missionSlotId, type, content } = req.body;
    if (!['love', 'skip', 'comment'].includes(type))
      return res.status(400).json({ error: 'Invalid reaction type' });

    const session = await CollabSession.findByToken(req.params.token);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (!(await belongsToSession(session, cartItemId, missionSlotId))) {
      return res.status(403).json({ error: 'That item is not part of this shared wardrobe' });
    }

    const reaction = await Reaction.create({
      cartItemId, missionSlotId,
      userId: req.identity.id, guestName: req.identity.type === 'guest' ? req.identity.name : null,
      type, content,
    });

    if (req.io) {
      req.io.to(`collab_${req.params.token}`).emit('reaction:new', reaction);
    }

    res.status(201).json(reaction);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to post reaction' });
  }
});

// POST /api/collab/:token/voice
router.post('/:token/voice', identify, upload.single('audio'), async (req, res) => {
  try {
    const { cartItemId, missionSlotId } = req.body;
    if (!req.file) return res.status(400).json({ error: 'No audio file' });

    const session = await CollabSession.findByToken(req.params.token);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (!(await belongsToSession(session, cartItemId, missionSlotId))) {
      return res.status(403).json({ error: 'That item is not part of this shared wardrobe' });
    }

    let transcript = '[voice note]';
    try {
      transcript = await transcribe(req.file.buffer, req.file.mimetype);
    } catch (e) {
      console.error('Whisper error:', e.message);
    }

    const reaction = await Reaction.create({
      cartItemId, missionSlotId,
      userId: req.identity.id, guestName: req.identity.type === 'guest' ? req.identity.name : null,
      type: 'voice', content: transcript,
    });

    if (req.io) {
      req.io.to(`collab_${req.params.token}`).emit('reaction:new', reaction);
    }

    res.status(201).json({ reaction, transcript });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to process voice note' });
  }
});

// POST /api/collab/:token/reconcile
router.post('/:token/reconcile', identify, async (req, res) => {
  try {
    const session = await CollabSession.findByToken(req.params.token);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const missionId = session.MISSION_ID || session.missionId;
    if (missionId) {
      const slots = await MissionSlot.findByMission(missionId);
      for (const slot of slots) {
        slot.reactions = await Reaction.findByMissionSlot(slot.id);
      }
      // A skip or a voice note on a slot is the family vetoing that pick —
      // the voice transcript (if any) becomes the reason for re-harmonizing.
      const vetoedSlots = slots.filter(s =>
        (s.reactions || []).some(r => r.type === 'skip' || r.type === 'voice')
      );

      if (vetoedSlots.length === 0) {
        return res.json({ actions: [], message: 'No vetoes to reconcile yet' });
      }

      let totalChanged = 0;
      for (const slot of vetoedSlots) {
        const voiceReaction = (slot.reactions || []).find(r => r.type === 'voice' && r.content);
        const skipReaction = (slot.reactions || []).find(r => r.type === 'skip');
        const vetoReaction = voiceReaction || skipReaction;
        const reason = voiceReaction?.content || skipReaction?.content || '';
        try {
          const result = await rejectAndReharmonizeSlot({
            missionId, eventId: slot.eventId, memberId: slot.memberId, reason, io: req.io,
            rejectedBy: vetoReaction?.user?.id || null,
            rejectedByName: vetoReaction?.user?.name || null,
          });
          totalChanged += result.changed;
        } catch (e) {
          console.error('Mission reconcile slot error:', e.message);
        }
      }

      return res.json({ actions: vetoedSlots.length, changed: totalChanged, message: `Re-harmonized ${vetoedSlots.length} vetoed slot(s)` });
    }

    const cartId = session.CART_ID || session.cartId;
    const items = await CartItem.findByCart(cartId);

    for (const item of items) {
      item.reactions = await Reaction.findByCartItem(item.id);
    }

    const allReactions = items.flatMap(item =>
      (item.reactions || []).map(r => ({ ...r, cartItem: item }))
    );

    if (allReactions.length === 0) {
      return res.json({ actions: [], message: 'No feedback to reconcile yet' });
    }

    // PEER mode — shuttle diplomacy (collab_cart_five_modes.md). Two people
    // with no hierarchy between them can reject the SAME item for opposite
    // reasons ("too expensive" vs "not nice enough") and loop forever with
    // no tiebreaker. Reuses the exact convergence engine built for the
    // Wedding Matrix's deadlock detection — recordRejection/detectConflict
    // are already generic over cartId, not mission-only.
    if ((session.ASK_MODE || session.askMode) === 'peer') {
      const convergence = require('../services/convergence');
      for (const item of items) {
        const skipsWithReason = (item.reactions || []).filter(r => r.type === 'skip' && r.content);
        for (const reaction of skipsWithReason) {
          const slotKey = `cart:${cartId}:${item.id}`;
          await convergence.recordRejection({
            slotKey, cartId,
            productId: item.productId, productPrice: item.product?.price, productColour: item.product?.baseColour,
            rejectedBy: reaction.userId || null, rejectedByName: reaction.user?.name || null,
            reasonText: reaction.content,
          });
        }
        if (skipsWithReason.length === 0) continue;

        const slotKey = `cart:${cartId}:${item.id}`;
        const { constraints } = await convergence.getLearnedConstraintsForSlot(slotKey);
        const conflict = convergence.detectConflict(constraints);
        if (conflict) {
          const payload = {
            cartItemId: item.id, itemTitle: item.product?.title,
            conflict: {
              ...conflict,
              minPriceSetByName: conflict.minPriceSetByName || 'Someone',
              maxPriceSetByName: conflict.maxPriceSetByName || 'Someone',
            },
          };
          if (req.io) req.io.to(`collab_${req.params.token}`).emit('peer:deadlock', payload);
          return res.json({ actions: [], deadlock: true, payload, message: 'Shuttle diplomacy needed — see the deadlock prompt' });
        }
      }
    }

    const actions = await reconcileFeedback(items, allReactions);
    const { query } = require('../db');
    const applied = [];

    for (const action of actions) {
      if (action.action === 'remove') {
        await CartItem.remove(action.cartItemId, cartId);
        applied.push({ type: 'removed', cartItemId: action.cartItemId, reason: action.reason });
      }
      if (action.action === 'swap_color' && action.colorPreference) {
        const item = items.find(i => i.id === action.cartItemId);
        if (item) {
          const r = await query(
            `SELECT * FROM products WHERE LOWER(article_type) = LOWER(:at)
             AND LOWER(base_colour) LIKE LOWER(:col)
             AND price BETWEEN :plo AND :phi
             AND id <> :pid
             AND ROWNUM = 1`,
            {
              at: item.product.articleType,
              col: `%${action.colorPreference}%`,
              plo: Math.round(item.product.price * 0.7),
              phi: Math.round(item.product.price * 1.3),
              pid: item.productId,
            }
          );
          const replacement = r.rows?.[0];
          if (replacement) {
            await CartItem.update(action.cartItemId, { productId: replacement.ID });
            applied.push({ type: 'swapped', cartItemId: action.cartItemId, newProductId: replacement.ID });
          }
        }
      }
      // Page 55 — a quality/prestige objection with no explicit color given
      // ("this isn't nice enough"). Re-solve toward a higher-rated,
      // higher-priced-within-budget option in the same gender+category slot,
      // never a fabricated "premium" claim the catalog can't back up.
      if (action.action === 'swap_upgrade') {
        const item = items.find(i => i.id === action.cartItemId);
        if (item) {
          const r = await query(
            `SELECT * FROM products WHERE LOWER(article_type) = LOWER(:at)
             AND gender = :gdr AND id <> :pid AND in_stock = 1
             AND price BETWEEN :plo AND :phi
             ORDER BY rating DESC, price DESC
             FETCH FIRST 1 ROWS ONLY`,
            {
              at: item.product.articleType,
              gdr: item.product.gender || 'Unisex',
              pid: item.productId,
              plo: item.product.price,
              phi: Math.round(item.product.price * 1.5),
            }
          );
          const replacement = r.rows?.[0];
          if (replacement) {
            await CartItem.update(action.cartItemId, { productId: replacement.ID });
            applied.push({ type: 'swapped', cartItemId: action.cartItemId, newProductId: replacement.ID, reason: action.reason });
          }
        }
      }
    }

    await Cart.updateTotal(cartId);
    const updated = await Cart.findById(cartId);
    const total = updated?.TOTAL_PRICE || 0;

    if (req.io) {
      req.io.to(`collab_${req.params.token}`).emit('cart:reconciled', { actions: applied, total });
    }

    res.json({ actions: applied, total, message: `Applied ${applied.length} changes` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Reconciliation failed' });
  }
});

// POST /api/collab/:token/resolve-peer-deadlock — PEER mode's shuttle
// diplomacy. Each peer set a boundary on the SAME item with no hierarchy
// between them (collab_cart_five_modes.md); this is the private-ask
// resolution, reusing the exact split/cross-budget mechanics already
// proven for the Wedding Matrix's deadlock (mission.js's own
// resolve-deadlock route), just at the single-cart-item scope instead of
// a mission slot.
router.post('/:token/resolve-peer-deadlock', identify, async (req, res) => {
  try {
    const { cartItemId, resolution } = req.body || {}; // 'go_with_min' | 'go_with_max' | 'split'
    if (!['go_with_min', 'go_with_max', 'split'].includes(resolution)) {
      return res.status(400).json({ error: 'resolution must be go_with_min, go_with_max, or split' });
    }
    const session = await CollabSession.findByToken(req.params.token);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const cartId = session.CART_ID || session.cartId;

    const items = await CartItem.findByCart(cartId);
    const item = items.find(i => i.id === cartItemId);
    if (!item) return res.status(404).json({ error: 'Item not found in this cart' });

    const convergence = require('../services/convergence');
    const slotKey = `cart:${cartId}:${cartItemId}`;
    const { constraints } = await convergence.getLearnedConstraintsForSlot(slotKey);
    const conflict = convergence.detectConflict(constraints);
    if (!conflict) return res.status(400).json({ error: 'No active deadlock on this item' });

    const { query } = require('../db');
    let targetPrice;
    if (resolution === 'go_with_min') targetPrice = conflict.minPrice;
    else if (resolution === 'go_with_max') targetPrice = conflict.maxPrice;
    else targetPrice = Math.round((conflict.minPrice + conflict.maxPrice) / 2);

    const r = await query(
      `SELECT * FROM products WHERE LOWER(article_type) = LOWER(:at) AND gender = :gdr
       AND id NOT IN (SELECT product_id FROM slot_rejections WHERE slot_key = :sk)
       AND in_stock = 1 ORDER BY ABS(price - :target) ASC FETCH FIRST 1 ROWS ONLY`,
      { at: item.product.articleType, gdr: item.product.gender || 'Unisex', sk: slotKey, target: targetPrice }
    );
    const replacement = r.rows?.[0];
    if (!replacement) return res.status(404).json({ error: 'No alternative found near that price' });

    await CartItem.update(cartItemId, { productId: replacement.ID });
    await Cart.updateTotal(cartId);
    const updated = await Cart.findById(cartId);

    const message = resolution === 'split'
      ? `Split the difference at ₹${targetPrice.toLocaleString('en-IN')} — a compromise both of you can live with.`
      : `Going with ${resolution === 'go_with_min' ? conflict.minPriceSetByName : conflict.maxPriceSetByName}'s preference.`;

    if (req.io) req.io.to(`collab_${req.params.token}`).emit('peer:resolved', { cartItemId, newProductId: replacement.ID, message });

    res.json({ resolved: true, newProductId: replacement.ID, total: updated?.TOTAL_PRICE || 0, message });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to resolve peer deadlock' });
  }
});

// GET /api/collab/my/invites
router.get('/my/invites', auth, async (req, res) => {
  try {
    const { query } = require('../db');
    const r = await query(
      `SELECT cs.*, c.name as cart_name, c.total_price, m.title as mission_title
       FROM collab_members cm
       JOIN collab_sessions cs ON cs.id = cm.session_id
       LEFT JOIN carts c ON c.id = cs.cart_id
       LEFT JOIN missions m ON m.id = cs.mission_id
       WHERE cm.user_id = :inviteUid
       ORDER BY cm.created_at DESC`,
      { inviteUid: req.user.id }
    );
    res.json(r.rows || []);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch invites' });
  }
});

module.exports = router;
