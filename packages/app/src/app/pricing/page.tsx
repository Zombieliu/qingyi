import Link from "next/link";

export const metadata = {
  title: "价格与服务 | 情谊电竞",
  description: "情谊电竞陪玩服务价格与规则说明。",
  alternates: { canonical: "/pricing" },
};

export const revalidate = 600;

const plans = [
  {
    name: "推荐单",
    price: "¥88 起",
    desc: "高优先级匹配，快速开局",
  },
  {
    name: "小时单",
    price: "¥30 / 小时",
    desc: "稳定陪玩，适合日常上分",
  },
  {
    name: "双护单",
    price: "¥60 / 小时",
    desc: "双人协同，提高胜率",
  },
];

export default function PricingPage() {
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
    <div style={{ minHeight: "100vh", background: "#f8fafc" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "40px 20px 64px" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#0f172a" }}>价格与服务</div>
            <div style={{ marginTop: 6, color: "#64748b" }}>透明价格，清晰规则</div>
          </div>
          <Link href="/" style={{ fontSize: 14, color: "#0f172a" }}>
            返回首页
          </Link>
        </header>

        <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
          {plans.map((plan) => (
            <div key={plan.name} style={{ padding: 18, borderRadius: 16, background: "#fff", border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>{plan.name}</div>
              <div style={{ marginTop: 6, color: "#0f172a", fontSize: 20, fontWeight: 700 }}>{plan.price}</div>
              <div style={{ marginTop: 8, color: "#64748b" }}>{plan.desc}</div>
            </div>
          ))}
        </div>

        <section style={{ marginTop: 32, padding: 18, borderRadius: 16, background: "#eef2ff", color: "#1e293b" }}>
          <div style={{ fontWeight: 700 }}>费用说明</div>
          <ul style={{ marginTop: 8, paddingLeft: 18, color: "#475569", lineHeight: 1.7 }}>
            <li>价格可能根据时段、需求波动。</li>
            <li>接单前需完成押金步骤以保障履约。</li>
            <li>如需退款或争议处理，请联系管理员。</li>
          </ul>
        </section>

        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </div>
    </div>
  );
}
