import { getSignalingServer } from "../../signaling/signaling.server";

/**
 * Emit a socket event to one or more users' personal rooms (`user:<id>`), which
 * every connected socket already joins on connect (see chat.signaling.ts).
 * No-op if the signaling server isn't ready.
 */
export function emitToUsers(
  userIds: string[],
  event: string,
  payload: unknown
): void {
  const io = getSignalingServer();
  if (!io || userIds.length === 0) return;
  let emitter = io.to(`user:${userIds[0]}`);
  for (let i = 1; i < userIds.length; i++) {
    emitter = emitter.to(`user:${userIds[i]}`);
  }
  emitter.emit(event, payload);
}

/** Emit an event to a single user's personal room. */
export function emitToUser(userId: string, event: string, payload: unknown): void {
  emitToUsers([userId], event, payload);
}
