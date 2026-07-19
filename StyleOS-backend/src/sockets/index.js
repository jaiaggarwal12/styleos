/**
 * Socket.io event handlers
 * Rooms:
 *   user_{userId}         — personal room for agent progress events
 *   cart_{cartId}         — room for cart updates
 *   collab_{shareToken}   — room for Squad Cart real-time collaboration
 */

module.exports = function registerSockets(io) {
  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    // Join personal room (called right after login on frontend)
    socket.on('join:user', ({ userId }) => {
      socket.join(`user_${userId}`);
      console.log(`User ${userId} joined personal room`);
    });

    // Join cart room
    socket.on('join:cart', ({ cartId }) => {
      socket.join(`cart_${cartId}`);
    });

    // Join collab session room. `name` is who's looking — the shopper's own
    // view of a Squad Cart / Council listens for this to show "Mom is
    // looking..." live, instead of only finding out once a reaction lands.
    socket.on('join:collab', ({ shareToken, name }) => {
      socket.join(`collab_${shareToken}`);
      socket.data.collabName = name || null;
      socket.data.collabToken = shareToken;
      socket.to(`collab_${shareToken}`).emit('member:connected', { socketId: socket.id });
      socket.to(`collab_${shareToken}`).emit('presence:join', { socketId: socket.id, name: name || 'Someone' });
    });

    // Join a wedding mission room — everyone watching the matrix fill live
    socket.on('join:mission', ({ missionId }) => {
      socket.join(`mission_${missionId}`);
    });

    // CO-ATTENDEE mode — everyone in the party room sees clash alerts live
    // as carts are attached/updated (routes/party.js).
    socket.on('join:party', ({ shareToken }) => {
      socket.join(`party_${shareToken}`);
    });

    // Leave collab session
    socket.on('leave:collab', ({ shareToken }) => {
      socket.leave(`collab_${shareToken}`);
      socket.to(`collab_${shareToken}`).emit('presence:leave', { socketId: socket.id, name: socket.data.collabName });
    });

    // Typing indicator in collab (for comments)
    socket.on('collab:typing', ({ shareToken, userName }) => {
      socket.to(`collab_${shareToken}`).emit('collab:typing', { userName });
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected: ${socket.id}`);
      if (socket.data.collabToken) {
        socket.to(`collab_${socket.data.collabToken}`).emit('presence:leave', { socketId: socket.id, name: socket.data.collabName });
      }
    });
  });
};
