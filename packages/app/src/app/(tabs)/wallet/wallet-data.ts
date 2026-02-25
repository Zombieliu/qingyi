import { t } from "@/lib/i18n/t";
import type { ImageLoader } from "next/image";

export type Option = { amount: number; price: number };
export type PayChannel = "alipay" | "wechat_pay";
export type PayResponse = {
  paymentIntentId?: string;
  clientSecret?: string | null;
  status?: string;
  nextActionType?: string | null;
  redirectUrl?: string | null;
  qrCodeUrl?: string | null;
  qrCodeData?: string | null;
  qrCodeLink?: string | null;
  qrCodeText?: string | null;
};
export type StatusTone = "info" | "success" | "warning" | "danger" | "loading";
export type StatusMessage = { tone: StatusTone; title: string; description?: string };

export const options: Option[] = [
  { amount: 42, price: 6 },
  { amount: 210, price: 30 },
];

export const payChannels: { key: PayChannel; label: string; note: string }[] = [
  { key: "alipay", label: t("tabs.wallet.i136"), note: t("ui.wallet.689") },
  { key: "wechat_pay", label: t("tabs.wallet.i137"), note: t("ui.wallet.602") },
];

export const qrImageLoader: ImageLoader = ({ src }) => src;
