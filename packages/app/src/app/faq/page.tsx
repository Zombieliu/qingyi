import Link from "next/link";

export const metadata = {
  title: "常见问题 | 情谊电竞",
  description: "情谊电竞常见问题与使用说明。",
  alternates: { canonical: "/faq" },
};

export const revalidate = 600;

const faqs = [
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
];

export default function FaqPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 20px 64px" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#0f172a" }}>常见问题</div>
            <div style={{ marginTop: 6, color: "#64748b" }}>快速了解规则与使用方式</div>
          </div>
          <Link href="/" style={{ fontSize: 14, color: "#0f172a" }}>
            返回首页
          </Link>
        </header>

        <div style={{ marginTop: 24, display: "grid", gap: 14 }}>
          {faqs.map((item) => (
            <div key={item.q} style={{ padding: 16, borderRadius: 16, background: "#fff", border: "1px solid #e2e8f0" }}>
              <div style={{ fontWeight: 700, color: "#0f172a" }}>{item.q}</div>
              <div style={{ marginTop: 8, color: "#475569", lineHeight: 1.7 }}>{item.a}</div>
            </div>
          ))}
        </div>

        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </div>
    </div>
  );
}
