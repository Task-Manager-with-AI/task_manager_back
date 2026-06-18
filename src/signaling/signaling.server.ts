import type { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { jwtVerify } from "jose";
import cookie from "cookie";
import { env } from "../config/env";
import { prisma } from "../prisma/client";
import {
  markParticipantJoined,
  markParticipantLeft,
} from "../modules/meetings/meetings.service";
import { registerChatHandlers } from "./chat.signaling";

const secret = new TextEncoder().encode(env.JWT_SECRET);

type SocketData = {
  userId: string;
  email: string;
  name: string;
};

interface Participant {
  userId: string;
  socketId: string;
  name: string;
}

const rooms = new Map<string, Map<string, Participant>>();

let ioInstance: Server | null = null;

export function getSignalingServer() {
  return ioInstance;
}

function getRoom(meetingId: string) {
  let room = rooms.get(meetingId);
  if (!room) {
    room = new Map();
    rooms.set(meetingId, room);
  }
  return room;
}

async function verifyMembership(userId: string, meetingId: string) {
  const meeting = await prisma.meeting.findFirst({
    where: {
      id: meetingId,
      project: { members: { some: { userId, isActive: true } } },
    },
    select: { id: true },
  });
  return Boolean(meeting);
}

export function setupSignaling(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: env.FRONTEND_URL,
      credentials: true,
    },
    path: "/socket.io",
  });

  io.use(async (socket, next) => {
    try {
      const token = resolveHandshakeToken(socket);
      if (!token) return next(new Error("Authentication required"));

      const { payload } = await jwtVerify(token, secret);
      const user = await prisma.user.findUnique({
        where: { id: payload.id as string },
        select: { id: true, email: true, name: true },
      });
      if (!user) return next(new Error("User not found"));

      (socket.data as SocketData) = {
        userId: user.id,
        email: user.email,
        name: user.name,
      };
      next();
    } catch (err) {
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const data = socket.data as SocketData;
    console.log(`[signaling] connected: user=${data.userId} socket=${socket.id}`);

    socket.on("meeting:join", async ({ meetingId }: { meetingId: string }) => {
      if (!meetingId) return;
      const allowed = await verifyMembership(data.userId, meetingId);
      if (!allowed) {
        socket.emit("meeting:error", { message: "Access denied" });
        return;
      }

      const roomName = `meeting:${meetingId}`;
      const room = getRoom(meetingId);

      socket.join(roomName);
      const existing = Array.from(room.values()).filter(
        (p) => p.userId !== data.userId
      );

      room.set(data.userId, {
        userId: data.userId,
        socketId: socket.id,
        name: data.name,
      });

      socket.emit("meeting:room-state", { participants: existing });
      socket.to(roomName).emit("meeting:participant-joined", {
        userId: data.userId,
        socketId: socket.id,
        name: data.name,
      });

      await markParticipantJoined(meetingId, data.userId);
    });

    socket.on("meeting:leave", async ({ meetingId }: { meetingId: string }) => {
      leaveRoom(socket, meetingId, data);
    });

    socket.on(
      "webrtc:offer",
      ({
        meetingId,
        targetUserId,
        sdp,
      }: {
        meetingId: string;
        targetUserId: string;
        sdp: unknown;
      }) => relayTo(meetingId, targetUserId, "webrtc:offer", {
        fromUserId: data.userId,
        sdp,
      })
    );

    socket.on(
      "webrtc:answer",
      ({
        meetingId,
        targetUserId,
        sdp,
      }: {
        meetingId: string;
        targetUserId: string;
        sdp: unknown;
      }) => relayTo(meetingId, targetUserId, "webrtc:answer", {
        fromUserId: data.userId,
        sdp,
      })
    );

    socket.on(
      "webrtc:ice-candidate",
      ({
        meetingId,
        targetUserId,
        candidate,
      }: {
        meetingId: string;
        targetUserId: string;
        candidate: unknown;
      }) => relayTo(meetingId, targetUserId, "webrtc:ice-candidate", {
        fromUserId: data.userId,
        candidate,
      })
    );

    socket.on("disconnect", () => {
      console.log(`[signaling] disconnect: user=${data.userId}`);
      for (const [meetingId, room] of rooms.entries()) {
        if (room.has(data.userId) && room.get(data.userId)?.socketId === socket.id) {
          leaveRoom(socket, meetingId, data);
        }
      }
    });
  });

  function relayTo(
    meetingId: string,
    targetUserId: string,
    event: string,
    payload: unknown
  ) {
    const room = rooms.get(meetingId);
    const target = room?.get(targetUserId);
    if (target) {
      io.to(target.socketId).emit(event, payload);
    }
  }

  function leaveRoom(socket: Socket, meetingId: string, data: SocketData) {
    const roomName = `meeting:${meetingId}`;
    const room = rooms.get(meetingId);
    if (room?.has(data.userId)) {
      room.delete(data.userId);
      if (room.size === 0) rooms.delete(meetingId);
    }
    socket.leave(roomName);
    socket.to(roomName).emit("meeting:participant-left", {
      userId: data.userId,
    });
    void markParticipantLeft(meetingId, data.userId);
  }

  ioInstance = io;

  // Register chat handlers on the same authenticated server.
  registerChatHandlers(io);

  return io;
}

function resolveHandshakeToken(socket: Socket): string | undefined {
  const authToken = socket.handshake.auth?.token;
  if (typeof authToken === "string" && authToken.trim()) {
    return authToken.trim();
  }

  const queryToken = socket.handshake.query?.token;
  if (typeof queryToken === "string" && queryToken.trim()) {
    return queryToken.trim();
  }

  const rawCookie = socket.handshake.headers.cookie ?? "";
  const parsed = cookie.parse(rawCookie);
  const cookieToken = parsed[env.COOKIE_NAME];
  return typeof cookieToken === "string" && cookieToken.trim()
    ? cookieToken.trim()
    : undefined;
}
