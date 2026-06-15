import type { Server, Socket } from "socket.io";
import { getSignalingServer } from "./signaling.server";
import { addPresence, removePresence } from "./presence";
import { findParticipant } from "../modules/chats/chats.repository";

type SocketData = {
  userId: string;
  email: string;
  name: string;
};

/**
 * Registers chat-specific Socket.IO handlers on the existing signaling server.
 * Reuses the same authenticated `io` instance (cookie JWT) created in
 * `setupSignaling`. Each connected user joins a personal `user:<id>` room for
 * out-of-chat notifications, plus `chat:<id>` rooms for opened conversations.
 */
export function registerChatHandlers(io: Server) {
  io.on("connection", (socket: Socket) => {
    const data = socket.data as SocketData;
    if (!data?.userId) return;

    // Personal room for notifications + global presence tracking.
    socket.join(`user:${data.userId}`);
    const wasOffline = addPresence(data.userId, socket.id);
    if (wasOffline) {
      io.emit("chat:presence", { userId: data.userId, isOnline: true });
    }
    // Bring the new socket up to date on who is online.
    socket.emit("chat:presence-sync", {
      online: Array.from(getOnline()),
    });

    socket.on("chat:join", async ({ chatId }: { chatId: string }) => {
      if (!chatId) return;
      const participant = await findParticipant(chatId, data.userId);
      if (!participant || !participant.isActive) {
        socket.emit("chat:error", { message: "Access denied" });
        return;
      }
      socket.join(`chat:${chatId}`);
    });

    socket.on("chat:leave", ({ chatId }: { chatId: string }) => {
      if (chatId) socket.leave(`chat:${chatId}`);
    });

    socket.on(
      "chat:typing",
      ({ chatId, isTyping }: { chatId: string; isTyping: boolean }) => {
        if (!chatId) return;
        socket.to(`chat:${chatId}`).emit("chat:typing", {
          chatId,
          userId: data.userId,
          name: data.name,
          isTyping: Boolean(isTyping),
        });
      }
    );

    socket.on("disconnect", () => {
      const nowOffline = removePresence(data.userId, socket.id);
      if (nowOffline) {
        io.emit("chat:presence", { userId: data.userId, isOnline: false });
      }
    });
  });
}

function getOnline(): Set<string> {
  // Lazy import avoids a hard dependency cycle at module load.
  const { getOnlineUserIds } = require("./presence") as {
    getOnlineUserIds: () => string[];
  };
  return new Set(getOnlineUserIds());
}

/**
 * Emits an event once to every socket in the chat room and in each
 * participant's personal room (socket.io dedupes the room union, so a socket
 * present in several of those rooms still receives it a single time).
 */
export function emitChatEvent(
  event: string,
  chatId: string,
  participantUserIds: string[],
  payload: unknown
) {
  const io = getSignalingServer();
  if (!io) return;
  let emitter = io.to(`chat:${chatId}`);
  for (const userId of participantUserIds) {
    emitter = emitter.to(`user:${userId}`);
  }
  emitter.emit(event, payload);
}
