import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import RegisterPWA from "./register-pwa";
import PwaUpdateToast from "./components/pwa-update-toast";
import { BalanceProvider } from "./components/balance-provider";
import { MantouProvider } from "./components/mantou-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  title: "情谊电竞 | 三角洲行动陪玩",
  description: "情谊电竞：跨平台陪玩调度，匹配高素质队友与教练。",
  applicationName: "情谊电竞",
  manifest: "/manifest.json",
  metadataBase: new URL(siteUrl),
  alternates: { canonical: "/" },
  openGraph: {
    title: "情谊电竞 | 三角洲行动陪玩",
    description: "跨平台陪玩调度，匹配高素质队友与教练。",
    url: "/",
    siteName: "情谊电竞",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "情谊电竞 | 三角洲行动陪玩",
    description: "跨平台陪玩调度，匹配高素质队友与教练。",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport = {
  themeColor: "#22d3ee",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <RegisterPWA />
        <PwaUpdateToast />
        <BalanceProvider>
          <MantouProvider>{children}</MantouProvider>
        </BalanceProvider>
      </body>
    </html>
  );
}
