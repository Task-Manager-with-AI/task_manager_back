/**
 * Global online-presence tracker shared across socket features.
 * Tracks how many live sockets each user has so presence survives
 * multiple tabs / devices.
 */

const onlineUsers = new Map<string, Set<string>>();

/** Returns true if the user just transitioned offline → online. */
export function addPresence(userId: string, socketId: string): boolean {
  let sockets = onlineUsers.get(userId);
  const wasOffline = !sockets || sockets.size === 0;
  if (!sockets) {
    sockets = new Set();
    onlineUsers.set(userId, sockets);
  }
  sockets.add(socketId);
  return wasOffline;
}

/** Returns true if the user just transitioned online → offline. */
export function removePresence(userId: string, socketId: string): boolean {
  const sockets = onlineUsers.get(userId);
  if (!sockets) return false;
  sockets.delete(socketId);
  if (sockets.size === 0) {
    onlineUsers.delete(userId);
    return true;
  }
  return false;
}

export function isUserOnline(userId: string): boolean {
  return (onlineUsers.get(userId)?.size ?? 0) > 0;
}

export function getOnlineUserIds(): string[] {
  return Array.from(onlineUsers.keys());
}
