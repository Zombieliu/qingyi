"use client";
import { useEffect, useRef, useState } from "react";
import { Clock3, Car } from "lucide-react";
import { addOrder, loadOrders, type LocalOrder } from "@/app/components/order-store";

type RideItem = {
  name: string;
  desc: string;
  eta: string;
  price: string;
  old?: string;
  tag?: string;
  bold?: boolean;
  info?: string;
  base?: number;
};

type RideSection = {
  title: string;
  badge?: string;
  highlight?: boolean;
  items: RideItem[];
};

type Mode = "select" | "notifying" | "enroute";

const sections: RideSection[] = [
  {
    title: "推荐单",
    highlight: true,
    items: [
      {
        name: "绝密体验单",
        desc: "15分钟上车",
        eta: "15分钟",
        price: "¥88",
        old: "¥128",
        tag: "已优惠40",
        bold: true,
        info: "保1000W",
      },
      {
        name: "绝密快单",
        desc: "10分钟上车",
        eta: "10分钟",
        price: "¥128",
        old: "¥158",
        info: "保1000W",
      },
    ],
  },
  {
    title: "特价单",
    items: [
      { name: "机密大坝", desc: "单护/双护随机", eta: "5分钟", price: "¥28", tag: "保188" },
      { name: "机密航天", desc: "单护/双护随机", eta: "7分钟", price: "¥38", tag: "保288" },
    ],
  },
  {
    title: "小时单",
    items: [
      { name: "机密单护", desc: "稳定护航", eta: "7分钟", price: "¥30" },
      { name: "机密双护", desc: "双人协同", eta: "8分钟", price: "¥60" },
      { name: "绝密单护", desc: "高强度护航", eta: "10分钟", price: "¥50" },
      { name: "绝密双护", desc: "双核保障", eta: "11分钟", price: "¥100" },
    ],
  },
  {
    title: "趣味单",
    items: [
      { name: "摸油", desc: "保证带油出局", eta: "9分钟", price: "¥588" },
      { name: "摸心", desc: "保证摸到心", eta: "12分钟", price: "¥1288" },
    ],
  },
];

export default function Schedule() {
  const [checked, setChecked] = useState<Record<string, boolean>>(() => ({}));
  const [active, setActive] = useState("推荐");
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [infoOpen, setInfoOpen] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [orders, setOrders] = useState<LocalOrder[]>(() => loadOrders());
  const [mode, setMode] = useState<Mode>("select");

  useEffect(() => {
    const handler = () => {
      const list = loadOrders();
      setOrders(list);
      const latest = list.find((o) => o.status !== "取消") || null;
      if (!latest) setMode("select");
      else if (latest.driver) setMode("enroute");
      else setMode("notifying");
    };
    handler();
    window.addEventListener("orders-updated", handler);
    return () => window.removeEventListener("orders-updated", handler);
  }, []);

  const toggle = (name: string) => setChecked((p) => ({ ...p, [name]: !p[name] }));
  const pickedNames = Object.entries(checked)
    .filter(([, v]) => v)
    .map(([k]) => k);
  const picked = pickedNames.length || 1;
  const pickedPrice = sections
    .flatMap((s) => s.items)
    .filter((i) => checked[i.name])
    .reduce((sum, item) => {
      const parsed = item.base ?? parseFloat(item.price.replace(/[^\d.]/g, ""));
      return sum + (Number.isFinite(parsed) ? parsed : 0);
    }, 0);

  const currentOrder = orders.find((o) => o.status !== "取消") || null;

  const cancelOrder = () => {
    if (!currentOrder) return;
    addOrder({
      ...currentOrder,
      status: "取消",
      driver: undefined,
      time: new Date().toISOString(),
    });
    setMode("select");
  };

  if (mode === "enroute" && currentOrder?.driver) {
    return (
      <div className="ride-shell">
        <div className="ride-map-large">地图加载中…</div>
        <div className="ride-driver-card dl-card">
          <div className="flex items-center gap-3">
            <div className="ride-driver-avatar" />
            <div>
              <div className="text-sm text-amber-600 font-semibold">司机正在赶来</div>
              <div className="text-lg font-bold text-gray-900">{currentOrder.driver.name}</div>
              <div className="text-xs text-gray-500">{currentOrder.driver.car}</div>
            </div>
            <div className="ml-auto text-right">
              <div className="text-emerald-600 font-semibold text-sm">{currentOrder.driver.eta}</div>
              {currentOrder.driver.price && <div className="text-xs text-gray-500">一口价 ¥{currentOrder.driver.price / 10}</div>}
            </div>
          </div>
          <div className="ride-driver-actions">
            <button className="dl-tab-btn" onClick={cancelOrder}>取消用车</button>
            <button className="dl-tab-btn">安全中心</button>
            <button className="dl-tab-btn" style={{ background: "#f97316", color: "#fff" }}>
              联系司机
            </button>
          </div>
          <div className="text-xs text-gray-500 mt-2">订单：{currentOrder.item}</div>
        </div>
      </div>
    );
  }

  if (mode === "notifying" && currentOrder) {
    return (
      <div className="ride-shell">
        <div className="ride-tip" style={{ marginTop: 0 }}>
          正在通知护航... 请耐心等待
        </div>
        <div className="ride-notify-illu" />
        <div className="dl-card" style={{ padding: 16 }}>
          <div className="text-sm font-semibold text-gray-900 mb-2">已选服务</div>
          <div className="flex justify-between text-sm">
            <span>{currentOrder.item}</span>
            <span className="text-amber-600 font-bold">¥{currentOrder.amount}</span>
          </div>
          <div className="text-xs text-gray-500 mt-2">{new Date(currentOrder.time).toLocaleString()}</div>
          <div className="text-xs text-gray-500 mt-3">如需加单，可返回继续选择。</div>
        </div>
      </div>
    );
  }

  const submit = async () => {
    if (pickedNames.length === 0) {
      setToast("请先选择服务");
      return;
    }
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user: "安排页面",
          item: pickedNames.join("、"),
          amount: pickedPrice || pickedNames.length,
          status: "安排",
          note: "来源：安排页呼叫服务",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.sent) {
        throw new Error(data.error || "推送失败");
      }
      addOrder({
        id: data.orderId || `${Date.now()}`,
        user: "安排页面",
        item: pickedNames.join("、"),
        amount: pickedPrice || pickedNames.length,
        status: "通知中",
        time: new Date().toISOString(),
      });
      setMode("notifying");
      setToast("已推送到企业微信群");
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setTimeout(() => setToast(null), 3000);
    }
  };

  return (
    <div className="ride-shell">
      <div className="ride-tip" style={{ marginTop: 0 }}>
        本单含多种特惠计价，点击查看详情
      </div>

      <div className="ride-content">
        <div className="ride-side">
          {sections.map((s) => (
            <button
              key={s.title}
              className={`ride-side-tab ${active === s.title ? "is-active" : ""}`}
              onClick={() => {
                setActive(s.title);
                sectionRefs.current[s.title]?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              {s.title}
            </button>
          ))}
        </div>

        <div className="ride-main">
          <div className="ride-sections">
            {sections.map((section) => (
              <div
                key={section.title}
                ref={(el) => {
                  sectionRefs.current[section.title] = el;
                }}
                className={`ride-block ${section.highlight ? "is-highlight" : ""}`}
              >
                <div className="ride-block-title">
                  <span>{section.title}</span>
                  {section.badge && <span className="ride-badge">{section.badge}</span>}
                </div>
                <div className="ride-items">
                  {section.items.map((item) => (
                    <div key={item.name} className="ride-row">
                      <div className="ride-row-main">
                        <div className="ride-row-title">
                          {item.name}
                          {item.tag && <span className="ride-tag">{item.tag}</span>}
                        </div>
                        <div className="ride-row-desc">{item.desc}</div>
                        <div className="ride-row-eta">
                          <Clock3 size={14} />
                          <span>{item.eta}</span>
                        </div>
                      </div>
                      <div className="ride-row-side">
                        <div className="ride-row-price">
                          <span className={item.bold ? "bold" : ""}>{item.price}</span>
                          {item.old && <span className="ride-old">{item.old}</span>}
                        </div>
                        {item.info && (
                          <div className="ride-info">
                            <button
                              type="button"
                              className="ride-info-dot"
                              onClick={() => setInfoOpen((prev) => (prev === item.name ? null : item.name))}
                              onMouseEnter={() => setInfoOpen(item.name)}
                              onMouseLeave={() => setInfoOpen(null)}
                              aria-label={item.info}
                            >
                              !
                            </button>
                            {infoOpen === item.name && <div className="ride-tooltip">{item.info}</div>}
                          </div>
                        )}
                        <label className="ride-checkbox">
                          <input type="checkbox" checked={!!checked[item.name]} onChange={() => toggle(item.name)} />
                          <span className="ride-checkbox-box" />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <footer className="ride-footer">
        <div className="ride-footer-left">
          <div className="ride-range">预估价 {pickedPrice ? pickedPrice.toFixed(0) : "4-9"}</div>
          <div className="ride-extra">动态调价</div>
        </div>
        <button className="ride-call" onClick={submit}>呼叫 {picked} 种服务</button>
      </footer>
      {toast && <div className="ride-toast">{toast}</div>}
    </div>
  );
}
