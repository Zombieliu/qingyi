"use client";

import { t } from "@/lib/i18n/t";

export function chainStatusLabel(status: number): string {
  switch (status) {
    case 0:
      return t("showcase.006");
    case 1:
      return t("showcase.007");
    case 2:
      return t("showcase.008");
    case 3:
      return t("showcase.009");
    case 4:
      return t("showcase.010");
    case 5:
      return t("showcase.011");
    case 6:
      return t("showcase.012");
    default:
      return `未知状态(${status})`;
  }
}

export function formatChainAmount(value: string): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return value;
  return (num / 100).toFixed(2);
}

export function formatChainTime(value: string): string {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return "-";
  return new Date(num).toLocaleString();
}

export function formatRemaining(value: string): string {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return "-";
  const diff = num - Date.now();
  if (diff <= 0) return t("ui.showcase.576");
  const mins = Math.ceil(diff / 60000);
  if (mins < 60) return `${mins} 分钟`;
  const hours = Math.floor(mins / 60);
  const remain = mins % 60;
  return remain ? `${hours} 小时 ${remain} 分钟` : `${hours} 小时`;
}

export function shortAddr(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function shortDigest(digest?: string | null): string {
  if (!digest) return "-";
  return `${digest.slice(0, 8)}…`;
}
