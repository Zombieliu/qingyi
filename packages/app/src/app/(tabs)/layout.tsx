"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home as HomeIcon, Diamond, CalendarCheck, MessageCircle, User } from "lucide-react";
import PasskeyGate from "../components/passkey-gate";
import AutoTranslate from "../components/auto-translate";
import { useI18n } from "@/lib/i18n/i18n-client";
import { PageTransition } from "@/components/ui/motion";
import { useGuardianStatus } from "../components/guardian-role";

export default function TabsLayout({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const { isGuardian } = useGuardianStatus();
  const items = [
    { label: t("nav.home"), href: "/home", icon: HomeIcon },
    ...(isGuardian ? [{ label: t("nav.showcase"), href: "/showcase", icon: Diamond }] : []),
    { label: t("nav.schedule"), href: "/schedule", icon: CalendarCheck },
    { label: t("nav.news_alt"), href: "/news", icon: MessageCircle },
    { label: t("nav.me"), href: "/me", icon: User },
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
          <AutoTranslate>
            <PageTransition routeKey={pathname}>{children}</PageTransition>
          </AutoTranslate>
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
