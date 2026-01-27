"use client";
import { useRef, useState } from "react";
import { ChevronDown, Clock3 } from "lucide-react";

type RideItem = {
  name: string;
  desc: string;
  eta: string;
  price: string;
  old?: string;
  tag?: string;
  bold?: boolean;
  info?: string;
};

type RideSection = {
  title: string;
  badge?: string;
  highlight?: boolean;
  items: RideItem[];
};

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

  const toggle = (name: string) => setChecked((p) => ({ ...p, [name]: !p[name] }));
  const picked = Object.values(checked).filter(Boolean).length || 1;

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

      <div className="ride-bottom-menu">
        <span>预约出发</span>
        <span>帮人叫车</span>
        <span>偏好设置</span>
      </div>

      <footer className="ride-footer">
        <div className="ride-footer-left">
          <div className="ride-range">预估价 4-9</div>
          <div className="ride-extra">含道路/动态调价</div>
        </div>
        <button className="ride-call">呼叫 {picked} 种车型</button>
      </footer>
    </div>
  );
}
