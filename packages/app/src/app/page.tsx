import TrackedLink from "@/app/components/tracked-link";
import { createTranslator, getMessages, getServerLocale } from "@/lib/i18n";

export default async function LandingPage() {
  const locale = await getServerLocale();
  const t = createTranslator(getMessages(locale));

  return (
    <div className="public-shell">
      <div className="public-wrap">
        <header className="public-nav">
          <div className="public-logo">
            <span className="public-logo-badge">QY</span>
            {t("app.name")}
          </div>
          <div className="public-nav-links">
            <TrackedLink
              href="/login"
              className="public-btn primary"
              event="cta_click"
              meta={{ section: "nav", label: t("nav.login") }}
            >
              {t("nav.login")}
            </TrackedLink>
            <TrackedLink
              href="/updates"
              className="public-btn ghost"
              event="cta_click"
              meta={{ section: "nav", label: t("nav.updates") }}
            >
              {t("nav.updates")}
            </TrackedLink>
            <TrackedLink
              href="/faq"
              className="public-btn ghost"
              event="cta_click"
              meta={{ section: "nav", label: t("nav.faq") }}
            >
              {t("nav.faq")}
            </TrackedLink>
            <TrackedLink
              href="/pricing"
              className="public-btn ghost"
              event="cta_click"
              meta={{ section: "nav", label: t("nav.pricing") }}
            >
              {t("nav.pricing")}
            </TrackedLink>
            <TrackedLink
              href="/home"
              className="public-btn"
              event="cta_click"
              meta={{ section: "nav", label: t("nav.home") }}
            >
              {t("nav.home")}
            </TrackedLink>
          </div>
        </header>

        <section className="public-hero">
          <div>
            <div className="public-kicker">{t("landing.kicker")}</div>
            <h1 className="public-title">
              {t("landing.title.line1")}
              <br />
              {t("landing.title.line2")}
            </h1>
            <p className="public-subtitle">{t("landing.subtitle")}</p>
            <div className="public-cta">
              <TrackedLink
                href="/login"
                className="public-btn primary"
                event="cta_click"
                meta={{ section: "hero", label: t("landing.cta.start") }}
              >
                {t("landing.cta.start")}
              </TrackedLink>
              <TrackedLink
                href="/updates"
                className="public-btn"
                event="cta_click"
                meta={{ section: "hero", label: t("landing.cta.updates") }}
              >
                {t("landing.cta.updates")}
              </TrackedLink>
              <TrackedLink
                href="/faq"
                className="public-btn"
                event="cta_click"
                meta={{ section: "hero", label: t("landing.cta.faq") }}
              >
                {t("landing.cta.faq")}
              </TrackedLink>
              <TrackedLink
                href="/pricing"
                className="public-btn"
                event="cta_click"
                meta={{ section: "hero", label: t("landing.cta.pricing") }}
              >
                {t("landing.cta.pricing")}
              </TrackedLink>
              <a href="#features" className="public-btn ghost">
                {t("landing.cta.features")}
              </a>
            </div>
          </div>

          <div className="public-grid">
            {[
              { title: t("landing.feature.fast.title"), desc: t("landing.feature.fast.desc") },
              { title: t("landing.feature.deposit.title"), desc: t("landing.feature.deposit.desc") },
              { title: t("landing.feature.flow.title"), desc: t("landing.feature.flow.desc") },
            ].map((item) => (
              <div key={item.title} className="public-card">
                <div className="public-card-title">{item.title}</div>
                <div className="public-card-desc">{item.desc}</div>
              </div>
            ))}
          </div>
        </section>

        <section id="features">
          <div className="public-section-title">{t("landing.section.core.title")}</div>
          <div className="public-section-sub">{t("landing.section.core.sub")}</div>
          <div className="public-grid" style={{ marginTop: 16 }}>
            {[
              { title: t("landing.core.pool.title"), desc: t("landing.core.pool.desc") },
              { title: t("landing.core.secure.title"), desc: t("landing.core.secure.desc") },
              { title: t("landing.core.manager.title"), desc: t("landing.core.manager.desc") },
              { title: t("landing.core.admin.title"), desc: t("landing.core.admin.desc") },
            ].map((item) => (
              <div key={item.title} className="public-card highlight">
                <div className="public-card-title">{item.title}</div>
                <div className="public-card-desc">{item.desc}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="public-footer">
          <div>
            <div className="public-footer-title">{t("landing.footer.title")}</div>
            <div className="public-footer-sub">{t("landing.footer.sub")}</div>
          </div>
          <div className="public-footer-actions">
            <TrackedLink
              href="/login"
              className="public-btn primary"
              event="cta_click"
              meta={{ section: "footer", label: t("nav.login") }}
            >
              {t("nav.login")}
            </TrackedLink>
            <TrackedLink
              href="/home"
              className="public-btn"
              event="cta_click"
              meta={{ section: "footer", label: t("nav.home") }}
            >
              {t("nav.home")}
            </TrackedLink>
          </div>
        </section>
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "情谊电竞",
            url: "/",
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "情谊电竞",
            url: "/",
            logo: "/icon-192.png",
          }),
        }}
      />
    </div>
  );
}
