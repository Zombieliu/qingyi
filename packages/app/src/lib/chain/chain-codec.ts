import { bcs } from "@mysten/sui/bcs";
import { normalizeSuiAddress, toHex } from "@mysten/sui/utils";

export type DecodedChainOrder = {
  orderId: string;
  user: string;
  companion: string;
  ruleSetId: string;
  serviceFee: string;
  deposit: string;
  platformFeeBps: string;
  status: number;
  createdAt: string;
  finishAt: string;
  disputeDeadline: string;
  vaultService: string;
  vaultDeposit: string;
  evidenceHash: string;
  disputeStatus: number;
  resolvedBy: string;
  resolvedAt: string;
  lastUpdatedMs?: number;
};

export type DecodedDuoChainOrder = {
  orderId: string;
  user: string;
  companionA: string;
  companionB: string;
  ruleSetId: string;
  serviceFee: string;
  depositPerCompanion: string;
  platformFeeBps: string;
  status: number;
  teamStatus: number;
  createdAt: string;
  finishAt: string;
  disputeDeadline: string;
  vaultService: string;
  vaultDepositA: string;
  vaultDepositB: string;
  evidenceHash: string;
  disputeStatus: number;
  resolvedBy: string;
  resolvedAt: string;
};

export function decodeU64(bytes: number[]): string {
  return String(bcs.u64().parse(Uint8Array.from(bytes)));
}

export function decodeU8(bytes: number[]): number {
  return Number(bcs.u8().parse(Uint8Array.from(bytes)));
}

export function decodeAddress(bytes: number[]): string {
  const hex = toHex(Uint8Array.from(bytes));
  return normalizeSuiAddress(`0x${hex}`);
}

export function decodeVecU8(bytes: number[]): string {
  const parsed = bcs.vector(bcs.u8()).parse(Uint8Array.from(bytes));
  const raw = Array.isArray(parsed) ? parsed : Array.from(parsed as Uint8Array);
  return `0x${toHex(Uint8Array.from(raw))}`;
}

export function decodeOrderFromTuple(
  keyTuple: number[][],
  valueTuple: number[][]
): DecodedChainOrder | null {
  if (!Array.isArray(keyTuple) || keyTuple.length < 1) return null;
  if (!Array.isArray(valueTuple) || valueTuple.length < 16) return null;
  const orderId = decodeU64(keyTuple[0]);
  return {
    orderId,
    user: decodeAddress(valueTuple[0]),
    companion: decodeAddress(valueTuple[1]),
    ruleSetId: decodeU64(valueTuple[2]),
    serviceFee: decodeU64(valueTuple[3]),
    deposit: decodeU64(valueTuple[4]),
    platformFeeBps: decodeU64(valueTuple[5]),
    status: decodeU8(valueTuple[6]),
    createdAt: decodeU64(valueTuple[7]),
    finishAt: decodeU64(valueTuple[8]),
    disputeDeadline: decodeU64(valueTuple[9]),
    vaultService: decodeU64(valueTuple[10]),
    vaultDeposit: decodeU64(valueTuple[11]),
    evidenceHash: decodeVecU8(valueTuple[12]),
    disputeStatus: decodeU8(valueTuple[13]),
    resolvedBy: decodeAddress(valueTuple[14]),
    resolvedAt: decodeU64(valueTuple[15]),
  };
}

export function decodeDuoOrderFromTuple(
  keyTuple: number[][],
  valueTuple: number[][]
): DecodedDuoChainOrder | null {
  if (!Array.isArray(keyTuple) || keyTuple.length < 1) return null;
  if (!Array.isArray(valueTuple) || valueTuple.length < 19) return null;
  const orderId = decodeU64(keyTuple[0]);
  return {
    orderId,
    user: decodeAddress(valueTuple[0]),
    companionA: decodeAddress(valueTuple[1]),
    companionB: decodeAddress(valueTuple[2]),
    ruleSetId: decodeU64(valueTuple[3]),
    serviceFee: decodeU64(valueTuple[4]),
    depositPerCompanion: decodeU64(valueTuple[5]),
    platformFeeBps: decodeU64(valueTuple[6]),
    status: decodeU8(valueTuple[7]),
    teamStatus: decodeU8(valueTuple[8]),
    createdAt: decodeU64(valueTuple[9]),
    finishAt: decodeU64(valueTuple[10]),
    disputeDeadline: decodeU64(valueTuple[11]),
    vaultService: decodeU64(valueTuple[12]),
    vaultDepositA: decodeU64(valueTuple[13]),
    vaultDepositB: decodeU64(valueTuple[14]),
    evidenceHash: decodeVecU8(valueTuple[15]),
    disputeStatus: decodeU8(valueTuple[16]),
    resolvedBy: decodeAddress(valueTuple[17]),
    resolvedAt: decodeU64(valueTuple[18]),
  };
}
