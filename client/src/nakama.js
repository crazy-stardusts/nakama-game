import { Client } from "@heroiclabs/nakama-js";

const NAKAMA_SERVER = process.env.REACT_APP_NAKAMA_HOST || "127.0.0.1";
const NAKAMA_PORT = process.env.REACT_APP_NAKAMA_PORT || "7350";
const NAKAMA_KEY = "defaultkey";
const USE_SSL = false;

let client = null;
let session = null;
let socket = null;

function getDeviceId() {
  let id = localStorage.getItem("nakama_device_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("nakama_device_id", id);
  }
  return id;
}

export function getClient() {
  if (!client) {
    client = new Client(NAKAMA_KEY, NAKAMA_SERVER, NAKAMA_PORT, USE_SSL);
  }
  return client;
}

// Try to log in with existing device ID (returning user)
export async function tryAutoLogin() {
  const id = localStorage.getItem("nakama_device_id");
  if (!id) return null;
  const c = getClient();
  try {
    session = await c.authenticateDevice(id, false);
    return session;
  } catch {
    return null;
  }
}

// First-time login: create account with nickname
export async function authenticate(nickname) {
  const c = getClient();
  const deviceId = getDeviceId();
  session = await c.authenticateDevice(deviceId, true, nickname);
  return session;
}

export function getSession() {
  return session;
}

export async function connectSocket() {
  if (socket) return socket;
  const c = getClient();
  socket = c.createSocket(USE_SSL, false);
  await socket.connect(session, false);
  return socket;
}

export function getSocket() {
  return socket;
}

export async function findMatch() {
  const c = getClient();
  const result = await c.rpc(session, "find_match", {});
  return result.payload;
}

export async function joinMatch(matchId) {
  const s = getSocket();
  const match = await s.joinMatch(matchId);
  return match;
}

export function sendMove(matchId, position) {
  const s = getSocket();
  s.sendMatchState(matchId, 1, JSON.stringify({ position }));
}

export function leaveMatch(matchId) {
  const s = getSocket();
  if (s && matchId) {
    s.leaveMatch(matchId);
  }
}

export async function getLeaderboard() {
  const c = getClient();
  const result = await c.rpc(session, "get_leaderboard", {});
  return result.payload;
}

export async function getMyStats() {
  const c = getClient();
  const result = await c.rpc(session, "get_stats", {});
  return result.payload;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect(false);
    socket = null;
  }
}
