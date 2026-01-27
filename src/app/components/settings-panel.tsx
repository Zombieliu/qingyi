"use client";
import { ChevronLeft, Moon, Globe2, ArrowDownUp, BookOpen, MessageSquare, ClipboardCheck } from "lucide-react";

interface Props {
  onBack: () => void;
  onLogout: () => void;
}

const topRows = [
  { label: "通用" },
  { label: "多语言/Language", icon: Globe2 },
  { label: "长辈模式", desc: "开启长辈模式字体更大页面更清晰", toggle: true, icon: Moon },
  { label: "字体大小", icon: ArrowDownUp },
  { label: "个性化推荐管理" },
];

const aboutRows = [
  { label: "关于滴滴" },
  { label: "用户指南", icon: BookOpen },
  { label: "意见反馈", icon: MessageSquare },
  { label: "公众评议", icon: ClipboardCheck },
];

export default function SettingsPanel({ onBack, onLogout }: Props) {
  return (
    <div className="settings-shell">
      <header className="settings-top">
        <button className="settings-back" onClick={onBack} aria-label="返回">
          <ChevronLeft size={18} />
        </button>
        <span className="settings-title">设置</span>
        <span className="settings-placeholder" />
      </header>

      <section className="settings-block">
        <div className="settings-block-title">外观及个性化</div>
        {topRows.map((row) => (
          <div key={row.label} className="settings-row">
            <div className="settings-row-main">
              <div className="settings-row-label">
                {row.icon && <row.icon size={16} style={{ marginRight: 6 }} />}
                {row.label}
              </div>
              {row.desc && <div className="settings-row-desc">{row.desc}</div>}
            </div>
            {row.toggle ? (
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
        <div className="settings-block-title">关于</div>
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

      <div className="settings-footer">
        个人信息收集清单，第三方共享信息清单，个人信息处理规则，个人信息处理规则摘要
      </div>

      <button className="settings-logout" onClick={onLogout}>
        退出登录
      </button>
    </div>
  );
}
