import type { Metadata } from "next";
import { Space_Grotesk, Space_Mono } from "next/font/google";
import RegisterPWA from "./register-pwa";
import PwaUpdateToast from "./components/pwa-update-toast";
import FetchThrottle from "./components/fetch-throttle";
import { BalanceProvider } from "./components/balance-provider";
import { MantouProvider } from "./components/mantou-provider";
import AnalyticsProvider from "./components/analytics-provider";
import SeniorModeProvider from "./components/senior-mode";
import { Suspense } from "react";
import { getServerLocale } from "@/lib/i18n";
import "./globals.css";

const brandSans = Space_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
});

const brandMono = Space_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getServerLocale();
  const htmlLang = locale === "en" ? "en" : "zh-CN";

  return (
    <html lang={htmlLang}>
      <body className={`${brandSans.variable} ${brandMono.variable} antialiased`}>
        <Suspense fallback={null}>
          <AnalyticsProvider />
        </Suspense>
        <SeniorModeProvider />
        <FetchThrottle />
        <RegisterPWA />
        <PwaUpdateToast />
        <BalanceProvider>
          <MantouProvider>{children}</MantouProvider>
        </BalanceProvider>
      </body>
    </html>
  );
}
