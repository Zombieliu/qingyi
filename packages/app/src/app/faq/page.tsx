import TrackedLink from "@/app/components/tracked-link";
import { createTranslator, getMessages, getServerLocale } from "@/lib/i18n/i18n";

export const metadata = {
  title: "常见问题 | 情谊电竞",
  description: "情谊电竞常见问题与使用说明。",
  alternates: { canonical: "/faq" },
};

export const revalidate = 600;

const faqs = {
  zh: [
    {
      q: "如何开始接单？",
      a: "使用 Passkey 登录后进入大厅，选择可接订单并按提示完成押金步骤即可。",
    },
    {
      q: "押金的作用是什么？",
      a: "押金用于保障履约与服务质量，订单完成后按规则结算或退回。",
    },
    {
      q: "我可以接自己的订单吗？",
      a: "不可以。系统已限制同一地址不能接自己发布的订单。",
    },
    {
      q: "订单状态有哪些？",
      a: "常见状态包括：待处理、已确认、进行中、已完成、已取消。",
    },
    {
      q: "接单失败或超时怎么办？",
      a: "请检查网络与账户状态，必要时联系管理员或客服处理。",
    },
    {
      q: "首单优惠如何使用？",
      a: "首单满 ¥99 自动减 ¥10，下单时系统会自动结算，无需额外操作。",
    },
  ],
  en: [
    {
      q: "How do I start accepting orders?",
      a: "Log in with Passkey, enter the lobby, choose an available order, and complete the deposit step.",
    },
    {
      q: "What is the deposit for?",
      a: "Deposits secure fulfillment and service quality. They are settled or refunded after completion.",
    },
    {
      q: "Can I accept my own order?",
      a: "No. The system prevents the same address from accepting its own order.",
    },
    {
      q: "What order statuses exist?",
      a: "Common statuses include: pending, confirmed, in progress, completed, cancelled.",
    },
    {
      q: "What if I fail to accept or time out?",
      a: "Check your network and account status, or contact admin/support if needed.",
    },
    {
      q: "How do I use the first-order discount?",
      a: "Spend ¥99 and save ¥10 automatically at checkout. No extra action required.",
    },
  ],
};

export default async function FaqPage() {
  const locale = await getServerLocale();
  const t = createTranslator(getMessages(locale));
  const list = faqs[locale] || faqs.zh;

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
              meta={{ section: "nav", label: "返回首页", page: "faq" }}
            >
              {t("nav.backHome")}
            </TrackedLink>
            <TrackedLink
              href="/pricing"
              className="public-btn"
              event="cta_click"
              meta={{ section: "nav", label: "价格与服务", page: "faq" }}
            >
              {t("nav.pricing")}
            </TrackedLink>
            <TrackedLink
              href="/updates"
              className="public-btn"
              event="cta_click"
              meta={{ section: "nav", label: "公告更新", page: "faq" }}
            >
              {t("nav.updates")}
            </TrackedLink>
            <TrackedLink
              href="/home"
              className="public-btn primary"
              event="cta_click"
              meta={{ section: "nav", label: "进入大厅", page: "faq" }}
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
                meta={{ section: "hero", label: "立即下单", page: "faq" }}
              >
                {t("faq.cta.order")}
              </TrackedLink>
              <TrackedLink
                href="/pricing"
                className="public-btn"
                event="cta_click"
                meta={{ section: "hero", label: "价格与服务", page: "faq" }}
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
              meta={{ section: "footer", label: "前往大厅", page: "faq" }}
            >
              {t("faq.footer.home")}
            </TrackedLink>
            <TrackedLink
              href="/updates"
              className="public-btn"
              event="cta_click"
              meta={{ section: "footer", label: "查看公告", page: "faq" }}
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
