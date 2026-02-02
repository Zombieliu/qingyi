import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import RegisterPWA from "./register-pwa";
import PwaUpdateToast from "./components/pwa-update-toast";
import { BalanceProvider } from "./components/balance-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "情谊电竞 | 三角洲行动陪玩",
  description: "情谊电竞：跨平台陪玩调度，匹配高素质队友与教练。",
  applicationName: "情谊电竞",
  manifest: "/manifest.json",
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
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <RegisterPWA />
        <PwaUpdateToast />
        <BalanceProvider>{children}</BalanceProvider>
      </body>
    </html>
  );
}
