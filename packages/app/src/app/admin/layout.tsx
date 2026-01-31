import type { Metadata } from "next";
import { Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./admin.css";

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
  title: "情谊电竞 · 运营管理后台",
  description: "情谊电竞运营管理后台",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <section className={`${adminSans.variable} ${adminMono.variable} admin-shell`}>
      {children}
    </section>
  );
}
