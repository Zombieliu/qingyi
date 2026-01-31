import "server-only";
import fs from "fs";
import path from "path";
import { promises as fsp } from "fs";
import type { AdminAnnouncement, AdminOrder, AdminPlayer, AdminStore } from "./admin-types";

const DEFAULT_STORE: AdminStore = {
  orders: [],
  players: [],
  announcements: [],
};

function resolveAppRoot() {
  const cwd = process.cwd();
  const workspaceApp = path.join(cwd, "packages", "app");
  if (fs.existsSync(workspaceApp)) {
    return workspaceApp;
  }
  return cwd;
}

function resolveDataFile() {
  const base = process.env.ADMIN_DATA_DIR || path.join(resolveAppRoot(), ".data");
  return {
    dir: base,
    file: path.join(base, "admin-store.json"),
  };
}

async function readStore(): Promise<AdminStore> {
  const { file } = resolveDataFile();
  try {
    const raw = await fsp.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as Partial<AdminStore>;
    return {
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
      players: Array.isArray(parsed.players) ? parsed.players : [],
      announcements: Array.isArray(parsed.announcements) ? parsed.announcements : [],
    };
  } catch {
    return { ...DEFAULT_STORE };
  }
}

async function writeStore(store: AdminStore) {
  const { dir, file } = resolveDataFile();
  await fsp.mkdir(dir, { recursive: true });
  const temp = `${file}.tmp`;
  await fsp.writeFile(temp, JSON.stringify(store, null, 2), "utf8");
  await fsp.rename(temp, file);
}

export async function listOrders() {
  const store = await readStore();
  return store.orders.sort((a, b) => b.createdAt - a.createdAt);
}

export async function addOrder(order: AdminOrder) {
  const store = await readStore();
  store.orders = [order, ...store.orders];
  await writeStore(store);
  return order;
}

export async function updateOrder(orderId: string, patch: Partial<AdminOrder>) {
  const store = await readStore();
  const index = store.orders.findIndex((order) => order.id === orderId);
  if (index === -1) return null;
  const current = store.orders[index];
  const next = { ...current, ...patch, updatedAt: Date.now() };
  store.orders[index] = next;
  await writeStore(store);
  return next;
}

export async function listPlayers() {
  const store = await readStore();
  return store.players.sort((a, b) => b.createdAt - a.createdAt);
}

export async function addPlayer(player: AdminPlayer) {
  const store = await readStore();
  store.players = [player, ...store.players];
  await writeStore(store);
  return player;
}

export async function updatePlayer(playerId: string, patch: Partial<AdminPlayer>) {
  const store = await readStore();
  const index = store.players.findIndex((player) => player.id === playerId);
  if (index === -1) return null;
  const current = store.players[index];
  const next = { ...current, ...patch, updatedAt: Date.now() };
  store.players[index] = next;
  await writeStore(store);
  return next;
}

export async function removePlayer(playerId: string) {
  const store = await readStore();
  const nextPlayers = store.players.filter((player) => player.id !== playerId);
  if (nextPlayers.length === store.players.length) return false;
  store.players = nextPlayers;
  await writeStore(store);
  return true;
}

export async function listAnnouncements() {
  const store = await readStore();
  return store.announcements.sort((a, b) => b.createdAt - a.createdAt);
}

export async function addAnnouncement(announcement: AdminAnnouncement) {
  const store = await readStore();
  store.announcements = [announcement, ...store.announcements];
  await writeStore(store);
  return announcement;
}

export async function updateAnnouncement(announcementId: string, patch: Partial<AdminAnnouncement>) {
  const store = await readStore();
  const index = store.announcements.findIndex((item) => item.id === announcementId);
  if (index === -1) return null;
  const current = store.announcements[index];
  const next = { ...current, ...patch, updatedAt: Date.now() };
  store.announcements[index] = next;
  await writeStore(store);
  return next;
}

export async function listPublicAnnouncements() {
  const store = await readStore();
  return store.announcements
    .filter((item) => item.status === "published")
    .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
}

export async function getAdminStats() {
  const store = await readStore();
  const totalOrders = store.orders.length;
  const pendingOrders = store.orders.filter((order) => order.stage !== "已完成" && order.stage !== "已取消").length;
  const activePlayers = store.players.filter((player) => player.status !== "停用").length;
  const publishedAnnouncements = store.announcements.filter((item) => item.status === "published").length;
  return {
    totalOrders,
    pendingOrders,
    activePlayers,
    publishedAnnouncements,
  };
}
