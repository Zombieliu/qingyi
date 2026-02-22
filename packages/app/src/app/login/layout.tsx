import type { Metadata } from "next";
import { t } from "@/lib/i18n/i18n-client";

export const metadata: Metadata = {
  title: t("login.layout.i128"),
  description: t("login.layout.i129"),
  robots: {
    index: false,
    follow: false,
  },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
