import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { cart as cartApi, collab as collabApi, party as partyApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import './CartPage.css';

export default function CartPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cartData, setCartData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [shareUrl, setShareUrl] = useState('');
  const [sharing, setSharing] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);

  // Five Modes (collab_cart_five_modes.md) — who am I asking, and why.
  const [showModePicker, setShowModePicker] = useState(false);
  const [askMode, setAskMode] = useState('advisor');
  const [recipientName, setRecipientName] = useState('');
  const [recipientRelation, setRecipientRelation] = useState('');

  useEffect(() => {
    if (!id) return;
    cartApi.get(id)
      .then(data => {
        setCartData(data);
        const token = data.collabSession?.SHARE_TOKEN || data.collabSession?.shareToken;
        if (token) {
          const base = process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:3000';
          setShareUrl(`${base}/collab/${token}`);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  const handleShare = async (mode) => {
    setSharing(true);
    try {
      // CO-ATTENDEE is structurally different — a Party groups several
      // attendees' INDIVIDUAL carts (the Clash Engine needs to compare
      // across carts), not one shared cart with several reviewers, which
      // is what every other mode's collab_session already models.
      const { shareUrl: url, whatsappUrl } = mode === 'co_attendee'
        ? await partyApi.create(cartData?.name || cartData?.NAME)
        : await collabApi.create(id, mode, recipientName, recipientRelation);
      setShareUrl(url);
      setShowModePicker(false);
      window.open(whatsappUrl, '_blank');
    } catch (e) {
      console.error(e);
    } finally {
      setSharing(false);
    }
  };

  const MODE_OPTIONS = [
    { key: 'advisor', emoji: '💬', label: 'Ask their opinion', sub: 'Swipe, react, comment — the classic Squad Cart' },
    { key: 'approver', emoji: '💳', label: 'Get it approved', sub: 'One number, one tap — for whoever\'s paying' },
    { key: 'proxy', emoji: '🎁', label: "It's a gift", sub: 'Shop for someone else — they never see this cart' },
    { key: 'peer', emoji: '🤝', label: 'Split it with someone', sub: 'One budget, two people, no hierarchy' },
    { key: 'co_attendee', emoji: '👀', label: "Don't clash at the event", sub: 'Compare with everyone else going' },
  ];

  const handleApprove = async () => {
    setApproving(true);
    try {
      await cartApi.approve(id);
      setApproved(true);
    } catch (e) {
      console.error(e);
    } finally {
      setApproving(false);
    }
  };

  const handleRemove = async (itemId) => {
    try {
      await cartApi.removeItem(id, itemId);
      setCartData(prev => ({
        ...prev,
        items: prev.items.filter(i => i.id !== itemId),
      }));
    } catch (e) { console.error(e); }
  };

  if (loading) return <div className="cart-loading">Loading cart...</div>;
  if (!cartData) return <div className="cart-loading">Cart not found.</div>;

  const items = cartData.items || [];
  const total = cartData.TOTAL_PRICE || cartData.totalPrice || 0;

  return (
    <div className="cart-page">
      <div className="cart-header">
        <button className="back-btn" onClick={() => navigate('/agent')}>← Back</button>
        <h1>{cartData.NAME || cartData.name || 'My Wardrobe'}</h1>
        <div className="cart-total">₹{total.toLocaleString()}</div>
      </div>

      {cartData.GOAL_TEXT || cartData.goalText ? (
        <div className="cart-goal">
          🎯 {cartData.GOAL_TEXT || cartData.goalText}
        </div>
      ) : null}

      <div className="cart-items">
        {items.map(item => (
          <div key={item.id} className="cart-item">
            <div className="item-image">
              {item.product?.images?.[0]
                ? <img src={item.product.images[0]} alt={item.product.title}
                    onError={e => e.target.style.display='none'} />
                : <span className="item-placeholder">👕</span>
              }
            </div>
            <div className="item-info">
              <p className="item-brand">{item.product?.brand}</p>
              <p className="item-title">{item.product?.title}</p>
              <div className="item-meta">
                <span>{item.product?.baseColour}</span>
                <span>·</span>
                <span>Size: {item.size || item.ITEM_SIZE || 'M'}</span>
                <span>·</span>
                <span>🚚 {item.product?.deliveryDays} days</span>
              </div>
              <p className="item-price">₹{item.product?.price?.toLocaleString()}</p>
            </div>
            <button className="remove-btn" onClick={() => handleRemove(item.id)}>✕</button>
          </div>
        ))}
      </div>

      <div className="cart-actions">
        <div className="cart-summary">
          <span>{items.length} items</span>
          <span className="total-price">Total: ₹{total.toLocaleString()}</span>
        </div>

        {!shareUrl && !showModePicker && (
          <button className="btn-share" onClick={() => setShowModePicker(true)}>
            📱 Share for a second opinion
          </button>
        )}

        {showModePicker && !shareUrl && (
          <div className="mode-picker">
            <p className="mode-picker-label">Who am I asking, and why?</p>
            {MODE_OPTIONS.map(m => (
              <button
                key={m.key}
                className={`mode-option ${askMode === m.key ? 'mode-option-active' : ''}`}
                onClick={() => setAskMode(m.key)}
              >
                <span className="mode-emoji">{m.emoji}</span>
                <span className="mode-text">
                  <span className="mode-label">{m.label}</span>
                  <span className="mode-sub">{m.sub}</span>
                </span>
              </button>
            ))}
            {askMode === 'proxy' && (
              <div className="proxy-fields">
                <input
                  placeholder="Who is this for? (e.g. Mom)"
                  value={recipientName}
                  onChange={e => setRecipientName(e.target.value)}
                />
                <input
                  placeholder="Relation (e.g. Mother, Boyfriend)"
                  value={recipientRelation}
                  onChange={e => setRecipientRelation(e.target.value)}
                />
              </div>
            )}
            <button className="btn-share" onClick={() => handleShare(askMode)} disabled={sharing}>
              {sharing ? 'Generating link...' : `Generate link →`}
            </button>
          </div>
        )}

        {shareUrl && (
          <div className="share-link-row">
            <input readOnly value={shareUrl} onClick={e => e.target.select()} />
            <button onClick={() => navigator.clipboard.writeText(shareUrl)}>Copy</button>
          </div>
        )}

        {approved ? (
          <div className="cart-approved-banner">
            <span className="cart-approved-check">✅</span>
            <div>
              <p className="cart-approved-title">Wardrobe approved</p>
              <p className="cart-approved-sub">This cart is locked in — no browsing, no back-and-forth.</p>
            </div>
            <button className="cart-lookbook-btn" onClick={() => navigate(`/lookbook/cart/${id}`)}>
              View Lookbook →
            </button>
          </div>
        ) : (
          <button className="btn-approve" onClick={handleApprove} disabled={approving}>
            {approving ? 'Approving...' : '✅ Approve Wardrobe'}
          </button>
        )}
      </div>
    </div>
  );
}
