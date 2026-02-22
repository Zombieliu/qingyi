import TrackedLink from "@/app/components/tracked-link";
import { createTranslator, getMessages, getServerLocale } from "@/lib/i18n/i18n";

export async function generateMetadata() {
  const locale = await getServerLocale();
  const t = createTranslator(getMessages(locale));
  return {
    title: t("faq.i103"),
    description: t("faq.i104"),
    alternates: { canonical: "/faq" },
  };
}

export const revalidate = 600;

function buildFaqs(t: (key: string) => string) {
  return [
    { q: t("faq.i105"), a: t("faq.i106") },
    { q: t("faq.i107"), a: t("faq.i108") },
    { q: t("faq.i109"), a: t("faq.i110") },
    { q: t("faq.i111"), a: t("faq.i112") },
    { q: t("faq.i113"), a: t("faq.i114") },
    { q: t("faq.i115"), a: t("faq.i116") },
  ];
}

export default async function FaqPage() {
  const locale = await getServerLocale();
  const t = createTranslator(getMessages(locale));
  const list = buildFaqs(t);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: list.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
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
              meta={{ section: "nav", label: t("faq.i207"), page: "faq" }}
            >
              {t("nav.backHome")}
            </TrackedLink>
            <TrackedLink
              href="/pricing"
              className="public-btn"
              event="cta_click"
              meta={{ section: "nav", label: t("faq.i208"), page: "faq" }}
            >
              {t("nav.pricing")}
            </TrackedLink>
            <TrackedLink
              href="/updates"
              className="public-btn"
              event="cta_click"
              meta={{ section: "nav", label: t("faq.i209"), page: "faq" }}
            >
              {t("nav.updates")}
            </TrackedLink>
            <TrackedLink
              href="/home"
              className="public-btn primary"
              event="cta_click"
              meta={{ section: "nav", label: t("faq.i210"), page: "faq" }}
            >
              {t("nav.home")}
            </TrackedLink>
          </div>
        </header>

        <section className="public-hero">
          <div>
            <div className="public-kicker">{t("faq.kicker")}</div>
            <h1 className="public-title">{t("faq.title")}</h1>
            <p className="public-subtitle">{t("faq.subtitle")}</p>
            <div className="public-cta">
              <TrackedLink
                href="/home"
                className="public-btn primary"
                event="cta_click"
                meta={{ section: "hero", label: t("faq.i211"), page: "faq" }}
              >
                {t("faq.cta.order")}
              </TrackedLink>
              <TrackedLink
                href="/pricing"
                className="public-btn"
                event="cta_click"
                meta={{ section: "hero", label: t("faq.i212"), page: "faq" }}
              >
                {t("faq.cta.pricing")}
              </TrackedLink>
            </div>
          </div>
          <div className="public-card highlight">
            <div className="public-card-title">{t("faq.promise.title")}</div>
            <div className="public-card-desc">{t("faq.promise.desc1")}</div>
            <div className="public-card-desc">{t("faq.promise.desc2")}</div>
          </div>
        </section>

        <section>
          <div className="public-section-title">{t("faq.section.title")}</div>
          <div className="public-section-sub">{t("faq.section.sub")}</div>
          <div className="public-grid" style={{ marginTop: 16 }}>
            {list.map((item) => (
              <div key={item.q} className="public-card public-faq-item">
                <div className="public-faq-q">{item.q}</div>
                <div className="public-faq-a">{item.a}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="public-footer">
          <div>
            <div className="public-footer-title">{t("faq.footer.title")}</div>
            <div className="public-footer-sub">{t("faq.footer.sub")}</div>
          </div>
          <div className="public-footer-actions">
            <TrackedLink
              href="/home"
              className="public-btn primary"
              event="cta_click"
              meta={{ section: "footer", label: t("faq.i213"), page: "faq" }}
            >
              {t("faq.footer.home")}
            </TrackedLink>
            <TrackedLink
              href="/updates"
              className="public-btn"
              event="cta_click"
              meta={{ section: "footer", label: t("faq.i214"), page: "faq" }}
            >
              {t("faq.footer.updates")}
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
