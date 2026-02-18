"use client";
import { ChevronLeft, Moon, Globe2, BookOpen, MessageSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n-client";
import { useEffect, useState } from "react";
import { applySeniorMode, SENIOR_MODE_STORAGE_KEY } from "@/app/components/senior-mode";

interface Props {
  onBack: () => void;
  onLogout: () => void;
}

export default function SettingsPanel({ onBack, onLogout }: Props) {
  const router = useRouter();
  const { locale, setLocale, t } = useI18n();
  const nextLocale = locale === "en" ? "zh" : "en";
  const [seniorMode, setSeniorMode] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const read = () => {
      const stored = localStorage.getItem(SENIOR_MODE_STORAGE_KEY);
      setSeniorMode(stored === "1");
    };
    read();
    const handleStorage = (event: StorageEvent) => {
      if (event.key === SENIOR_MODE_STORAGE_KEY) {
        read();
      }
    };
    const handleCustom = () => {
      read();
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener("senior-mode-updated", handleCustom);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("senior-mode-updated", handleCustom);
    };
  }, []);

  const toggleSeniorMode = () => {
    const next = !seniorMode;
    setSeniorMode(next);
    if (typeof window === "undefined") return;
    if (next) {
      localStorage.setItem(SENIOR_MODE_STORAGE_KEY, "1");
    } else {
      localStorage.removeItem(SENIOR_MODE_STORAGE_KEY);
    }
    applySeniorMode(next);
    window.dispatchEvent(new Event("senior-mode-updated"));
  };

  const topRows = [
    {
      label: t("settings.row.language"),
      icon: Globe2,
      desc: locale === "en" ? t("settings.language.current") : t("settings.language.current"),
      action: () => {
        setLocale(nextLocale);
        window.location.reload();
      },
      actionLabel: t("settings.language.switch"),
    },
    {
      label: t("settings.row.senior"),
      desc: t("settings.row.senior.desc"),
      toggle: true,
      icon: Moon,
      active: seniorMode,
      onToggle: toggleSeniorMode,
    },
  ];

  const aboutRows = [
    { label: t("settings.row.about"), href: "/me/about" },
    { label: t("settings.row.guide"), icon: BookOpen, href: "/me/guide" },
    { label: t("settings.row.feedback"), icon: MessageSquare, href: "/me/support" },
  ];

  return (
    <div className="settings-shell">
      <header className="settings-top">
        <button className="settings-back" onClick={onBack} aria-label="返回">
          <ChevronLeft size={18} />
        </button>
        <span className="settings-title">{t("settings.title")}</span>
        <span className="settings-placeholder" />
      </header>

      <section className="settings-block">
        <div className="settings-block-title">{t("settings.section.appearance")}</div>
        {topRows.map((row) => (
          <div key={row.label} className="settings-row">
            <div className="settings-row-main">
              <div className="settings-row-label">
                {row.icon && <row.icon size={16} style={{ marginRight: 6 }} />}
                {row.label}
              </div>
              {row.desc && <div className="settings-row-desc">{row.desc}</div>}
            </div>
            {row.action ? (
              <button className="text-xs text-emerald-600" onClick={row.action}>
                {row.actionLabel}
              </button>
            ) : row.toggle ? (
              <button
                type="button"
                className="settings-switch"
                data-active={row.active ? "1" : "0"}
                aria-pressed={row.active ? "true" : "false"}
                onClick={row.onToggle}
              >
                <div className="settings-switch-knob" />
              </button>
            ) : (
              <span className="settings-chevron">›</span>
            )}
          </div>
        ))}
      </section>

      <section className="settings-block">
        <div className="settings-block-title">{t("settings.section.about")}</div>
        {aboutRows.map((row) => {
          const content = (
            <>
              <div className="settings-row-label">
                {row.icon && <row.icon size={16} style={{ marginRight: 6 }} />}
                {row.label}
              </div>
              {row.href ? <span className="settings-chevron">›</span> : null}
            </>
          );

          if (row.href) {
            return (
              <button
                key={row.label}
                type="button"
                className="settings-row settings-row-button"
                onClick={() => router.push(row.href)}
              >
                {content}
              </button>
            );
          }

          return (
            <div key={row.label} className="settings-row">
              {content}
            </div>
          );
        })}
      </section>

      <div className="settings-footer">{t("settings.footer")}</div>

      <button className="settings-logout" onClick={onLogout}>
        {t("settings.logout")}
      </button>
    </div>
  );
}
