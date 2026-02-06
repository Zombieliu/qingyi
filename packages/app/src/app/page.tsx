import Link from "next/link";

export default function LandingPage() {
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 20px 64px" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#0f172a" }}>情谊电竞</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/login" style={{ padding: "8px 14px", borderRadius: 999, background: "#0f172a", color: "#fff", fontSize: 14 }}>
              立即登录
            </Link>
            <Link href="/updates" style={{ padding: "8px 14px", borderRadius: 999, border: "1px solid #cbd5f5", color: "#1e293b", fontSize: 14 }}>
              公告更新
            </Link>
            <Link href="/faq" style={{ padding: "8px 14px", borderRadius: 999, border: "1px solid #cbd5f5", color: "#1e293b", fontSize: 14 }}>
              常见问题
            </Link>
            <Link href="/pricing" style={{ padding: "8px 14px", borderRadius: 999, border: "1px solid #cbd5f5", color: "#1e293b", fontSize: 14 }}>
              价格与服务
            </Link>
            <Link href="/home" style={{ padding: "8px 14px", borderRadius: 999, border: "1px solid #cbd5f5", color: "#1e293b", fontSize: 14 }}>
              进入大厅
            </Link>
          </div>
        </header>

        <section style={{ marginTop: 56, display: "grid", gap: 28 }}>
          <div style={{ maxWidth: 720 }}>
            <div style={{ fontSize: 14, color: "#6366f1", fontWeight: 600 }}>电竞陪玩调度平台</div>
            <h1 style={{ fontSize: 40, lineHeight: 1.15, color: "#0f172a", marginTop: 12 }}>
              更快匹配高素质队友，
              <br />
              更稳交付陪玩体验
            </h1>
            <p style={{ marginTop: 16, fontSize: 16, color: "#475569" }}>
              面向三角洲行动的陪玩协作平台，支持实时撮合、押金保障、订单全程可追踪。
            </p>
            <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
              <Link href="/login" style={{ padding: "12px 18px", borderRadius: 12, background: "#0f172a", color: "#fff", fontSize: 15 }}>
                开始使用
              </Link>
              <Link href="/updates" style={{ padding: "12px 18px", borderRadius: 12, border: "1px solid #cbd5f5", color: "#1e293b", fontSize: 15 }}>
                查看公告
              </Link>
              <Link href="/faq" style={{ padding: "12px 18px", borderRadius: 12, border: "1px solid #cbd5f5", color: "#1e293b", fontSize: 15 }}>
                常见问题
              </Link>
              <Link href="/pricing" style={{ padding: "12px 18px", borderRadius: 12, border: "1px solid #cbd5f5", color: "#1e293b", fontSize: 15 }}>
                价格与服务
              </Link>
              <a href="#features" style={{ padding: "12px 18px", borderRadius: 12, border: "1px solid #cbd5f5", color: "#1e293b", fontSize: 15 }}>
                了解功能
              </a>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
            {[
              { title: "极速撮合", desc: "按段位与偏好匹配，减少等待" },
              { title: "押金保障", desc: "订单前置押金，保障履约" },
              { title: "流程可视", desc: "支付、接单、交付全链路可追踪" },
            ].map((item) => (
              <div key={item.title} style={{ padding: 16, borderRadius: 16, background: "#fff", boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>{item.title}</div>
                <div style={{ marginTop: 6, fontSize: 14, color: "#64748b" }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </section>

        <section id="features" style={{ marginTop: 64 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>核心能力</div>
          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
            {[
              { title: "订单池运营", desc: "公开接单池，动态展示待接订单" },
              { title: "安全登录", desc: "Passkey 登录，减少账号风险" },
              { title: "陪玩管理", desc: "打手档案、状态与可接额度统一管理" },
              { title: "管理后台", desc: "公告、订单、打手、风控一站式" },
            ].map((item) => (
              <div key={item.title} style={{ padding: 16, borderRadius: 16, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>{item.title}</div>
                <div style={{ marginTop: 6, fontSize: 14, color: "#64748b" }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ marginTop: 72, padding: 24, borderRadius: 20, background: "#0f172a", color: "#fff" }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>准备开始？</div>
          <div style={{ marginTop: 6, color: "#cbd5f5" }}>创建 Passkey 后即可进入大厅完成订单撮合。</div>
          <div style={{ marginTop: 16 }}>
            <Link href="/login" style={{ padding: "10px 16px", borderRadius: 10, background: "#22d3ee", color: "#0f172a", fontWeight: 600 }}>
              立即登录
            </Link>
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
