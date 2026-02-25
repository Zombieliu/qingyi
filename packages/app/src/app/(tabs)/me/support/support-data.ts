import { t } from "@/lib/i18n/t";

export type SupportRequest = {
  id: string;
  topic: string;
  message: string;
  contact?: string;
  status: string;
  reply?: string;
  createdAt: number;
};

export const STORAGE_KEY = "qy_support_requests_v1";

export const topics = [
  t("ui.support.668"),
  t("ui.support.619"),
  t("ui.support.685"),
  t("ui.support.696"),
  t("ui.support.542"),
];

export const channels = [
  { label: t("ui.support.565"), value: t("ui.support.515"), hint: "09:00-24:00" },
  { label: t("ui.support.574"), value: "400-882-1001", hint: t("ui.support.644") },
  { label: t("ui.support.559"), value: "support@qingyi.gg", hint: t("ui.support.503") },
];

export function loadLocalRequests(): SupportRequest[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SupportRequest[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function persistLocalRequests(list: SupportRequest[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 5)));
}
