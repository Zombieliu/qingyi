"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home as HomeIcon,
  Diamond,
  CalendarCheck,
  MessageCircle,
  User,
} from "lucide-react";
import PasskeyGate from "../components/passkey-gate";
import AutoTranslate from "../components/auto-translate";
import { useI18n } from "@/lib/i18n-client";

export default function TabsLayout({ children }: { children: React.ReactNode }) {
  const { tr } = useI18n();
  const pathname = usePathname();
  const items = [
    { label: tr("首页"), href: "/home", icon: HomeIcon },
    { label: tr("展示"), href: "/showcase", icon: Diamond },
    { label: tr("安排"), href: "/schedule", icon: CalendarCheck },
    { label: tr("资讯"), href: "/news", icon: MessageCircle },
    { label: tr("我的"), href: "/me", icon: User },
  ];

  return (
    <div className="dl-shell">
      <nav className="dl-tabbar dl-tabbar-desktop">
        {items.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`dl-tab ${active ? "is-active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              {active ? (
                <span className="dl-tab-center">
                  <Icon size={20} />
                </span>
              ) : (
                <Icon size={18} />
              )}
              <span className="dl-tab-label">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <main className="dl-main">
        <PasskeyGate>
          <AutoTranslate>{children}</AutoTranslate>
        </PasskeyGate>
      </main>

      <nav className="dl-tabbar dl-tabbar-mobile">
        {items.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`dl-tab ${active ? "is-active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              {active ? (
                <span className="dl-tab-center">
                  <Icon size={22} />
                </span>
              ) : (
                <Icon size={20} />
              )}
              <span className="dl-tab-label">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
