import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "登录 | 情谊电竞",
  description: "情谊电竞登录与身份验证。",
  robots: {
    index: false,
    follow: false,
  },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
