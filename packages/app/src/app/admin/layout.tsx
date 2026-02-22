import type { Metadata } from "next";
import { Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./admin.css";
import { t } from "@/lib/i18n/t";

const adminSans = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-admin-sans",
});

const adminMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-admin-mono",
});

export const metadata: Metadata = {
  title: t("admin.layout.i178"),
  description: t("admin.layout.i179"),
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <section className={`${adminSans.variable} ${adminMono.variable} admin-shell`}>
      {children}
    </section>
  );
}
