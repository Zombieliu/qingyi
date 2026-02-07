"use client";
import { ChevronLeft, Moon, Globe2, ArrowDownUp, BookOpen, MessageSquare, ClipboardCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n-client";

interface Props {
  onBack: () => void;
  onLogout: () => void;
}

export default function SettingsPanel({ onBack, onLogout }: Props) {
  const { locale, setLocale, t } = useI18n();
  const nextLocale = locale === "en" ? "zh" : "en";

  const topRows = [
    { label: t("settings.row.general") },
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
    { label: t("settings.row.senior"), desc: t("settings.row.senior.desc"), toggle: true, icon: Moon },
    { label: t("settings.row.font"), icon: ArrowDownUp },
    { label: t("settings.row.reco") },
  ];

  const aboutRows = [
    { label: t("settings.row.about") },
    { label: t("settings.row.guide"), icon: BookOpen },
    { label: t("settings.row.feedback"), icon: MessageSquare },
    { label: t("settings.row.public"), icon: ClipboardCheck },
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
              <div className="settings-switch">
                <div className="settings-switch-knob" />
              </div>
            ) : (
              <span className="settings-chevron">›</span>
            )}
          </div>
        ))}
      </section>

      <section className="settings-block">
        <div className="settings-block-title">{t("settings.section.about")}</div>
        {aboutRows.map((row) => (
          <div key={row.label} className="settings-row">
            <div className="settings-row-label">
              {row.icon && <row.icon size={16} style={{ marginRight: 6 }} />}
              {row.label}
            </div>
            <span className="settings-chevron">›</span>
          </div>
        ))}
      </section>

      <div className="settings-footer">{t("settings.footer")}</div>

      <button className="settings-logout" onClick={onLogout}>
        {t("settings.logout")}
      </button>
    </div>
  );
}
