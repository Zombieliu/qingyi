import "server-only";

import { listPublicAnnouncementsEdgeRead } from "@/lib/edge-db/public-read-store";
import { listPlayersPublicEdgeRead } from "@/lib/edge-db/user-read-store";
import { listActiveMembershipTiersEdgeRead } from "@/lib/edge-db/public-read-store";
import { addSupportTicketEdgeWrite } from "@/lib/edge-db/support-write-store";
import { upsertLedgerRecordEdgeWrite } from "@/lib/edge-db/payment-reconcile-store";
import { getEdgeDbConfig } from "@/lib/edge-db/client";

export type CursorPayload = { createdAt: number; id: string };
export type TransactionClient = unknown;

type UnsafeAny = ReturnType<typeof JSON.parse>;
type LegacyAdminStore = typeof import("./admin-store-legacy");
type LegacyFn = (...args: UnsafeAny[]) => UnsafeAny;
type LegacyFnName = {
  [K in keyof LegacyAdminStore]: LegacyAdminStore[K] extends LegacyFn ? K : never;
}[keyof LegacyAdminStore];
type LegacyFnResult<Name extends LegacyFnName> = LegacyAdminStore[Name] extends (
  ...args: UnsafeAny[]
) => infer R
  ? R
  : never;

let legacyStorePromise: Promise<LegacyAdminStore> | null = null;

async function loadLegacyStore(): Promise<LegacyAdminStore> {
  legacyStorePromise ??= import("./admin-store-legacy").then(
    (mod) => mod as unknown as LegacyAdminStore
  );
  return legacyStorePromise;
}

async function callLegacy<Name extends LegacyFnName>(
  name: Name,
  args: unknown[]
): Promise<Awaited<LegacyFnResult<Name>>> {
  const legacy = await loadLegacyStore();
  const fn = legacy[name] as unknown;
  if (typeof fn !== "function") {
    throw new Error(`legacy_admin_store_missing_export:${name}`);
  }
  return (await Promise.resolve((fn as LegacyFn)(...args))) as Awaited<LegacyFnResult<Name>>;
}

function hasEdgeReadConfig() {
  return Boolean(getEdgeDbConfig("read"));
}

function hasEdgeWriteConfig() {
  return Boolean(getEdgeDbConfig("write"));
}

// Hot-path edge overrides; all other exports use dynamic legacy fallback.
type ListPublicAnnouncementsFn = LegacyAdminStore["listPublicAnnouncements"];
export async function listPublicAnnouncements(
  ...args: Parameters<ListPublicAnnouncementsFn>
): Promise<Awaited<ReturnType<ListPublicAnnouncementsFn>>> {
  if (!hasEdgeReadConfig()) return callLegacy("listPublicAnnouncements", args);
  return (await listPublicAnnouncementsEdgeRead()) as Awaited<
    ReturnType<ListPublicAnnouncementsFn>
  >;
}

type ListPlayersPublicFn = LegacyAdminStore["listPlayersPublic"];
export async function listPlayersPublic(
  ...args: Parameters<ListPlayersPublicFn>
): Promise<Awaited<ReturnType<ListPlayersPublicFn>>> {
  if (!hasEdgeReadConfig()) return callLegacy("listPlayersPublic", args);
  return (await listPlayersPublicEdgeRead()) as Awaited<ReturnType<ListPlayersPublicFn>>;
}

type ListActiveMembershipTiersFn = LegacyAdminStore["listActiveMembershipTiers"];
export async function listActiveMembershipTiers(
  ...args: Parameters<ListActiveMembershipTiersFn>
): Promise<Awaited<ReturnType<ListActiveMembershipTiersFn>>> {
  if (!hasEdgeReadConfig()) return callLegacy("listActiveMembershipTiers", args);
  return (await listActiveMembershipTiersEdgeRead()) as Awaited<
    ReturnType<ListActiveMembershipTiersFn>
  >;
}

type AddSupportTicketFn = LegacyAdminStore["addSupportTicket"];
export async function addSupportTicket(
  ...args: Parameters<AddSupportTicketFn>
): Promise<Awaited<ReturnType<AddSupportTicketFn>>> {
  if (!hasEdgeWriteConfig()) return callLegacy("addSupportTicket", args);
  const [ticket] = args;
  if (!ticket) return callLegacy("addSupportTicket", args);
  await addSupportTicketEdgeWrite(ticket);
  return ticket as Awaited<ReturnType<AddSupportTicketFn>>;
}

type UpsertLedgerRecordFn = LegacyAdminStore["upsertLedgerRecord"];
export async function upsertLedgerRecord(
  ...args: Parameters<UpsertLedgerRecordFn>
): Promise<Awaited<ReturnType<UpsertLedgerRecordFn>>> {
  if (!hasEdgeWriteConfig()) return callLegacy("upsertLedgerRecord", args);
  const [entry] = args;
  if (!entry) return callLegacy("upsertLedgerRecord", args);
  await upsertLedgerRecordEdgeWrite(entry);
  return entry as Awaited<ReturnType<UpsertLedgerRecordFn>>;
}

export async function addAccessToken(...args: unknown[]) {
  return callLegacy("addAccessToken", args);
}
export async function addAnnouncement(...args: unknown[]) {
  return callLegacy("addAnnouncement", args);
}
export async function addAuditLog(...args: unknown[]) {
  return callLegacy("addAuditLog", args);
}
export async function addCoupon(...args: unknown[]) {
  return callLegacy("addCoupon", args);
}
export async function addExaminerApplication(...args: unknown[]) {
  return callLegacy("addExaminerApplication", args);
}
export async function addGuardianApplication(...args: unknown[]) {
  return callLegacy("addGuardianApplication", args);
}
export async function addInvoiceRequest(...args: unknown[]) {
  return callLegacy("addInvoiceRequest", args);
}
export async function addLiveApplication(...args: unknown[]) {
  return callLegacy("addLiveApplication", args);
}
export async function addMember(...args: unknown[]) {
  return callLegacy("addMember", args);
}
export async function addMembershipRequest(...args: unknown[]) {
  return callLegacy("addMembershipRequest", args);
}
export async function addMembershipTier(...args: unknown[]) {
  return callLegacy("addMembershipTier", args);
}
export async function addOrder(...args: unknown[]) {
  return callLegacy("addOrder", args);
}
export async function addPaymentEvent(...args: unknown[]) {
  return callLegacy("addPaymentEvent", args);
}
export async function addPlayer(...args: unknown[]) {
  return callLegacy("addPlayer", args);
}
export async function bindReferral(...args: unknown[]) {
  return callLegacy("bindReferral", args);
}
export async function createReview(...args: unknown[]) {
  return callLegacy("createReview", args);
}
export async function createSession(...args: unknown[]) {
  return callLegacy("createSession", args);
}
export async function creditMantou(...args: unknown[]) {
  return callLegacy("creditMantou", args);
}
export async function getAccessTokenByHash(...args: unknown[]) {
  return callLegacy("getAccessTokenByHash", args);
}
export async function getAdminStats(...args: unknown[]) {
  return callLegacy("getAdminStats", args);
}
export async function getCompanionEarnings(...args: unknown[]) {
  return callLegacy("getCompanionEarnings", args);
}
export async function getCouponByCode(...args: unknown[]) {
  return callLegacy("getCouponByCode", args);
}
export async function getCouponById(...args: unknown[]) {
  return callLegacy("getCouponById", args);
}
export async function getLeaderboard(...args: unknown[]) {
  return callLegacy("getLeaderboard", args);
}
export async function getMantouWallet(...args: unknown[]) {
  return callLegacy("getMantouWallet", args);
}
export async function getMemberByAddress(...args: unknown[]) {
  return callLegacy("getMemberByAddress", args);
}
export async function getMembershipTierById(...args: unknown[]) {
  return callLegacy("getMembershipTierById", args);
}
export async function getOrderById(...args: unknown[]) {
  return callLegacy("getOrderById", args);
}
export async function getPlayerByAddress(...args: unknown[]) {
  return callLegacy("getPlayerByAddress", args);
}
export async function getPlayerById(...args: unknown[]) {
  return callLegacy("getPlayerById", args);
}
export async function getReferralByInvitee(...args: unknown[]) {
  return callLegacy("getReferralByInvitee", args);
}
export async function getReferralConfig(...args: unknown[]) {
  return callLegacy("getReferralConfig", args);
}
export async function getReviewByOrderId(...args: unknown[]) {
  return callLegacy("getReviewByOrderId", args);
}
export async function getReviewsByCompanion(...args: unknown[]) {
  return callLegacy("getReviewsByCompanion", args);
}
export async function getSessionByHash(...args: unknown[]) {
  return callLegacy("getSessionByHash", args);
}
export async function hasOrdersForAddress(...args: unknown[]) {
  return callLegacy("hasOrdersForAddress", args);
}
export async function isApprovedGuardianAddress(...args: unknown[]) {
  return callLegacy("isApprovedGuardianAddress", args);
}
export async function listAccessTokens(...args: unknown[]) {
  return callLegacy("listAccessTokens", args);
}
export async function listActiveCoupons(...args: unknown[]) {
  return callLegacy("listActiveCoupons", args);
}
export async function listAnnouncements(...args: unknown[]) {
  return callLegacy("listAnnouncements", args);
}
export async function listChainOrdersForAdmin(...args: unknown[]) {
  return callLegacy("listChainOrdersForAdmin", args);
}
export async function listChainOrdersForAutoFinalize(...args: unknown[]) {
  return callLegacy("listChainOrdersForAutoFinalize", args);
}
export async function listChainOrdersForCleanup(...args: unknown[]) {
  return callLegacy("listChainOrdersForCleanup", args);
}
export async function listE2eOrderIds(...args: unknown[]) {
  return callLegacy("listE2eOrderIds", args);
}
export async function listOrders(...args: unknown[]) {
  return callLegacy("listOrders", args);
}
export async function listPlayers(...args: unknown[]) {
  return callLegacy("listPlayers", args);
}
export async function mapMantouTransaction(...args: unknown[]) {
  return callLegacy("mapMantouTransaction", args);
}
export async function mapMantouWallet(...args: unknown[]) {
  return callLegacy("mapMantouWallet", args);
}
export async function mapOrder(...args: unknown[]) {
  return callLegacy("mapOrder", args);
}
export async function processReferralReward(...args: unknown[]) {
  return callLegacy("processReferralReward", args);
}
export async function queryAuditLogs(...args: unknown[]) {
  return callLegacy("queryAuditLogs", args);
}
export async function queryAuditLogsCursor(...args: unknown[]) {
  return callLegacy("queryAuditLogsCursor", args);
}
export async function queryCoupons(...args: unknown[]) {
  return callLegacy("queryCoupons", args);
}
export async function queryCouponsCursor(...args: unknown[]) {
  return callLegacy("queryCouponsCursor", args);
}
export async function queryExaminerApplications(...args: unknown[]) {
  return callLegacy("queryExaminerApplications", args);
}
export async function queryExaminerApplicationsCursor(...args: unknown[]) {
  return callLegacy("queryExaminerApplicationsCursor", args);
}
export async function queryGuardianApplications(...args: unknown[]) {
  return callLegacy("queryGuardianApplications", args);
}
export async function queryGuardianApplicationsCursor(...args: unknown[]) {
  return callLegacy("queryGuardianApplicationsCursor", args);
}
export async function queryInvoiceRequests(...args: unknown[]) {
  return callLegacy("queryInvoiceRequests", args);
}
export async function queryInvoiceRequestsCursor(...args: unknown[]) {
  return callLegacy("queryInvoiceRequestsCursor", args);
}
export async function queryLedgerRecords(...args: unknown[]) {
  return callLegacy("queryLedgerRecords", args);
}
export async function queryLiveApplications(...args: unknown[]) {
  return callLegacy("queryLiveApplications", args);
}
export async function queryLiveApplicationsCursor(...args: unknown[]) {
  return callLegacy("queryLiveApplicationsCursor", args);
}
export async function queryMantouTransactions(...args: unknown[]) {
  return callLegacy("queryMantouTransactions", args);
}
export async function queryMantouWithdraws(...args: unknown[]) {
  return callLegacy("queryMantouWithdraws", args);
}
export async function queryMantouWithdrawsCursor(...args: unknown[]) {
  return callLegacy("queryMantouWithdrawsCursor", args);
}
export async function queryMembers(...args: unknown[]) {
  return callLegacy("queryMembers", args);
}
export async function queryMembersCursor(...args: unknown[]) {
  return callLegacy("queryMembersCursor", args);
}
export async function queryMembershipRequests(...args: unknown[]) {
  return callLegacy("queryMembershipRequests", args);
}
export async function queryMembershipRequestsCursor(...args: unknown[]) {
  return callLegacy("queryMembershipRequestsCursor", args);
}
export async function queryMembershipTiers(...args: unknown[]) {
  return callLegacy("queryMembershipTiers", args);
}
export async function queryMembershipTiersCursor(...args: unknown[]) {
  return callLegacy("queryMembershipTiersCursor", args);
}
export async function queryOrders(...args: unknown[]) {
  return callLegacy("queryOrders", args);
}
export async function queryOrdersCursor(...args: unknown[]) {
  return callLegacy("queryOrdersCursor", args);
}
export async function queryPaymentEvents(...args: unknown[]) {
  return callLegacy("queryPaymentEvents", args);
}
export async function queryPaymentEventsCursor(...args: unknown[]) {
  return callLegacy("queryPaymentEventsCursor", args);
}
export async function queryPublicOrdersCursor(...args: unknown[]) {
  return callLegacy("queryPublicOrdersCursor", args);
}
export async function queryReferrals(...args: unknown[]) {
  return callLegacy("queryReferrals", args);
}
export async function queryReferralsByInviter(...args: unknown[]) {
  return callLegacy("queryReferralsByInviter", args);
}
export async function querySupportTickets(...args: unknown[]) {
  return callLegacy("querySupportTickets", args);
}
export async function querySupportTicketsCursor(...args: unknown[]) {
  return callLegacy("querySupportTicketsCursor", args);
}
export async function removeAccessToken(...args: unknown[]) {
  return callLegacy("removeAccessToken", args);
}
export async function removeAnnouncement(...args: unknown[]) {
  return callLegacy("removeAnnouncement", args);
}
export async function removeAnnouncements(...args: unknown[]) {
  return callLegacy("removeAnnouncements", args);
}
export async function removeCoupon(...args: unknown[]) {
  return callLegacy("removeCoupon", args);
}
export async function removeExaminerApplication(...args: unknown[]) {
  return callLegacy("removeExaminerApplication", args);
}
export async function removeGuardianApplication(...args: unknown[]) {
  return callLegacy("removeGuardianApplication", args);
}
export async function removeInvoiceRequest(...args: unknown[]) {
  return callLegacy("removeInvoiceRequest", args);
}
export async function removeLiveApplication(...args: unknown[]) {
  return callLegacy("removeLiveApplication", args);
}
export async function removeMember(...args: unknown[]) {
  return callLegacy("removeMember", args);
}
export async function removeMembershipRequest(...args: unknown[]) {
  return callLegacy("removeMembershipRequest", args);
}
export async function removeMembershipTier(...args: unknown[]) {
  return callLegacy("removeMembershipTier", args);
}
export async function removeOrders(...args: unknown[]) {
  return callLegacy("removeOrders", args);
}
export async function removePlayer(...args: unknown[]) {
  return callLegacy("removePlayer", args);
}
export async function removePlayers(...args: unknown[]) {
  return callLegacy("removePlayers", args);
}
export async function removeSessionByHash(...args: unknown[]) {
  return callLegacy("removeSessionByHash", args);
}
export async function removeSupportTicket(...args: unknown[]) {
  return callLegacy("removeSupportTicket", args);
}
export async function requestMantouWithdraw(...args: unknown[]) {
  return callLegacy("requestMantouWithdraw", args);
}
export async function touchAccessTokenByHash(...args: unknown[]) {
  return callLegacy("touchAccessTokenByHash", args);
}
export async function updateAccessToken(...args: unknown[]) {
  return callLegacy("updateAccessToken", args);
}
export async function updateAnnouncement(...args: unknown[]) {
  return callLegacy("updateAnnouncement", args);
}
export async function updateCoupon(...args: unknown[]) {
  return callLegacy("updateCoupon", args);
}
export async function updateExaminerApplication(...args: unknown[]) {
  return callLegacy("updateExaminerApplication", args);
}
export async function updateGuardianApplication(...args: unknown[]) {
  return callLegacy("updateGuardianApplication", args);
}
export async function updateInvoiceRequest(...args: unknown[]) {
  return callLegacy("updateInvoiceRequest", args);
}
export async function updateLiveApplication(...args: unknown[]) {
  return callLegacy("updateLiveApplication", args);
}
export async function updateMantouWithdrawStatus(...args: unknown[]) {
  return callLegacy("updateMantouWithdrawStatus", args);
}
export async function updateMember(...args: unknown[]) {
  return callLegacy("updateMember", args);
}
export async function updateMembershipRequest(...args: unknown[]) {
  return callLegacy("updateMembershipRequest", args);
}
export async function updateMembershipTier(...args: unknown[]) {
  return callLegacy("updateMembershipTier", args);
}
export async function updateOrder(...args: unknown[]) {
  return callLegacy("updateOrder", args);
}
export async function updateOrderIfUnassigned(...args: unknown[]) {
  return callLegacy("updateOrderIfUnassigned", args);
}
export async function updatePlayer(...args: unknown[]) {
  return callLegacy("updatePlayer", args);
}
export async function updatePlayerStatusByAddress(...args: unknown[]) {
  return callLegacy("updatePlayerStatusByAddress", args);
}
export async function updateReferralConfig(...args: unknown[]) {
  return callLegacy("updateReferralConfig", args);
}
export async function updateSessionByHash(...args: unknown[]) {
  return callLegacy("updateSessionByHash", args);
}
export async function updateSupportTicket(...args: unknown[]) {
  return callLegacy("updateSupportTicket", args);
}
export async function upsertOrder(...args: unknown[]) {
  return callLegacy("upsertOrder", args);
}
