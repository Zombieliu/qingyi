import TrackedLink from "@/app/components/tracked-link";
import { createTranslator, getMessages, getServerLocale } from "@/lib/i18n/i18n";
import { t } from "@/lib/i18n/t";

export const metadata = {
  title: t("pricing.i117"),
  description: t("pricing.i118"),
  alternates: { canonical: "/pricing" },
};

export const revalidate = 600;

const plans = [
  {
    name: t("pricing.i119"),
    price: t("pricing.i120"),
    desc: t("pricing.i121"),
  },
  {
    name: t("pricing.i122"),
    price: t("pricing.i123"),
    desc: t("pricing.i124"),
  },
  {
    name: t("pricing.i125"),
    price: t("pricing.i126"),
    desc: t("pricing.i127"),
  },
];

export default async function PricingPage() {
  const locale = await getServerLocale();
  const t = createTranslator(getMessages(locale));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: plans.map((plan, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Service",
        name: plan.name,
        description: plan.desc,
        offers: {
          "@type": "Offer",
          price: plan.price.replace(/[^0-9.]/g, ""),
          priceCurrency: "CNY",
        },
      },
    })),
  };

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
              href="/"
              className="public-btn ghost"
              event="cta_click"
              meta={{ section: "nav", label: t("pricing.i215"), page: "pricing" }}
            >
              {t("nav.backHome")}
            </TrackedLink>
            <TrackedLink
              href="/faq"
              className="public-btn"
              event="cta_click"
              meta={{ section: "nav", label: t("pricing.i216"), page: "pricing" }}
            >
              {t("nav.faq")}
            </TrackedLink>
            <TrackedLink
              href="/updates"
              className="public-btn"
              event="cta_click"
              meta={{ section: "nav", label: t("pricing.i217"), page: "pricing" }}
            >
              {t("nav.updates")}
            </TrackedLink>
            <TrackedLink
              href="/home"
              className="public-btn primary"
              event="cta_click"
              meta={{ section: "nav", label: t("pricing.i218"), page: "pricing" }}
            >
              {t("nav.home")}
            </TrackedLink>
          </div>
        </header>

        <section className="public-hero">
          <div>
            <div className="public-kicker">{t("pricing.kicker")}</div>
            <h1 className="public-title">{t("pricing.title")}</h1>
            <p className="public-subtitle">{t("pricing.subtitle")}</p>
            <div className="public-cta">
              <TrackedLink
                href="/home"
                className="public-btn primary"
                event="cta_click"
                meta={{ section: "hero", label: t("pricing.i219"), page: "pricing" }}
              >
                {t("pricing.cta.order")}
              </TrackedLink>
              <TrackedLink
                href="/faq"
                className="public-btn"
                event="cta_click"
                meta={{ section: "hero", label: t("pricing.i220"), page: "pricing" }}
              >
                {t("pricing.cta.rules")}
              </TrackedLink>
            </div>
          </div>
          <div className="public-card highlight">
            <div className="public-card-title">{t("pricing.promo.title")}</div>
            <div className="public-card-desc">{t("pricing.promo.desc1")}</div>
            <div className="public-card-desc">{t("pricing.promo.desc2")}</div>
          </div>
        </section>

        <section>
          <div className="public-section-title">{t("pricing.section.title")}</div>
          <div className="public-section-sub">{t("pricing.section.sub")}</div>
          <div className="public-grid" style={{ marginTop: 16 }}>
            {plans.map((plan) => (
              <div key={plan.name} className="public-card">
                <div className="public-card-title">{plan.name}</div>
                <div className="public-price">{plan.price}</div>
                <div className="public-card-desc">{plan.desc}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="public-card">
          <div className="public-card-title">{t("pricing.note.title")}</div>
          <ul className="public-list">
            <li>{t("pricing.note.1")}</li>
            <li>{t("pricing.note.2")}</li>
            <li>{t("pricing.note.3")}</li>
          </ul>
        </section>

        <section className="public-footer">
          <div>
            <div className="public-footer-title">{t("pricing.footer.title")}</div>
            <div className="public-footer-sub">{t("pricing.footer.sub")}</div>
          </div>
          <div className="public-footer-actions">
            <TrackedLink
              href="/login"
              className="public-btn primary"
              event="cta_click"
              meta={{ section: "footer", label: t("pricing.i221"), page: "pricing" }}
            >
              {t("pricing.footer.login")}
            </TrackedLink>
            <TrackedLink
              href="/home"
              className="public-btn"
              event="cta_click"
              meta={{ section: "footer", label: t("pricing.i222"), page: "pricing" }}
            >
              {t("pricing.footer.home")}
            </TrackedLink>
          </div>
        </section>

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </div>
    </div>
  );
}
