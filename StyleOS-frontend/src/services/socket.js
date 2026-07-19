import { io } from 'socket.io-client';

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000';

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: true,
      transports: ['websocket'],
    });
  }
  return socket;
}

export function connectSocket(userId) {
  const s = getSocket();
  if (!s.connected) {
    s.connect();
    s.emit('join:user', { userId });
  }
  return s;
}

export function joinCollab(shareToken, name) {
  const s = getSocket();
  s.emit('join:collab', { shareToken, name });
}

export function leaveCollab(shareToken) {
  const s = getSocket();
  s.emit('leave:collab', { shareToken });
}

export function joinMission(missionId) {
  const s = getSocket();
  s.emit('join:mission', { missionId });
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
