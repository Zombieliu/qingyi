"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { useMemo, useState } from "react";

type Option = { amount: number; price: number };

const options: Option[] = [
  { amount: 42, price: 6 },
  { amount: 210, price: 30 },
];

const qrTargets = [
  {
    key: "companion",
    label: "陪玩收款码",
    share: 0.5,
    url: process.env.NEXT_PUBLIC_QR_COMPANION || "/qr/companion-qr.svg",
    note: "先支付给陪玩达人，平台暂未自动分账",
  },
  {
    key: "esports",
    label: "电竞服务收款码",
    share: 0.5,
    url: process.env.NEXT_PUBLIC_QR_ESPORTS || "/qr/esports-qr.svg",
    note: "再支付赛事服务费，确保双方都到账",
  },
];

export default function Wallet() {
  const [selected, setSelected] = useState<Option>(options[0]);
  const [agree, setAgree] = useState(false);
  const [paid, setPaid] = useState<Record<string, boolean>>(
    () => Object.fromEntries(qrTargets.map((t) => [t.key, false])) as Record<string, boolean>,
  );
  const [msg, setMsg] = useState<string | null>(null);

  const totalShare = useMemo(() => qrTargets.reduce((sum, t) => sum + t.share, 0), []);
  const allPaid = useMemo(() => qrTargets.every((t) => paid[t.key]), [paid]);

  const handleTogglePaid = (key: string) => {
    setPaid((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      return next;
    });
  };

  const handleConfirm = () => {
    if (!agree) {
      setMsg("请先勾选同意充值协议");
      return;
    }
    if (!allPaid) {
      setMsg("请完成两笔付款后再提交");
      return;
    }
    setMsg("已标记完成，请上传截图或支付凭证给客服以便核验。");
  };

  return (
    <div className="pay-screen">
      <header className="pay-top">
        <Link href="/me" aria-label="返回我的">
          <ArrowLeft size={20} />
        </Link>
        <span className="pay-title">钻石充值</span>
        <Link href="#" className="pay-link">
          明细
        </Link>
      </header>

      <div className="pay-balance-card">
        <div className="pay-balance-label">我的钻石</div>
        <div className="pay-balance-value">0</div>
      </div>

      <div className="pay-options">
        <div className="pay-options-label">请选择充值数量</div>
        <div className="pay-option-grid">
          {options.map((opt) => (
            <button
              type="button"
              key={opt.amount}
              className={`pay-option ${opt.amount === selected.amount ? "is-active" : ""}`}
              onClick={() => setSelected(opt)}
            >
              <div className="pay-option-amt">{opt.amount} 钻石</div>
              <div className="pay-option-price">¥{opt.price.toFixed(2)}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="pay-qr-section">
        <div className="pay-options-label">
          暂未开通自动分账，请依次完成以下两笔支付（合计 ¥{selected.price.toFixed(2)}）
        </div>
        {qrTargets.map((target) => {
          const part = ((selected.price * target.share) / totalShare).toFixed(2);
          return (
            <div key={target.key} className="pay-qr-card">
              <div className="pay-qr-img" aria-hidden>
                <img src={target.url} alt={target.label} />
              </div>
              <div className="pay-qr-info">
                <div className="pay-qr-title">
                  <span>{target.label}</span>
                  <span className="pay-badge">{Math.round((target.share / totalShare) * 100)}%</span>
                </div>
                <div className="pay-qr-amount">¥{part}</div>
                <div className="pay-qr-note">
                  金额按钻石套餐自动拆分，请付款后勾选完成。{target.note}
                </div>
                <label className="pay-status-toggle">
                  <input
                    type="checkbox"
                    checked={paid[target.key]}
                    onChange={() => handleTogglePaid(target.key)}
                    aria-label={`${target.label} 已支付`}
                  />
                  <span>已付款</span>
                  {paid[target.key] && <CheckCircle2 size={16} color="#22c55e" />}
                </label>
              </div>
            </div>
          );
        })}
      </div>

      <div className="pay-footer">
        <label className="pay-agree">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} aria-label="同意充值协议" />
          <span>同意并阅读《充值服务协议》</span>
        </label>
        <button type="button" className="pay-submit" disabled={!agree} onClick={handleConfirm}>
          {allPaid ? "已完成双码支付" : `支付 ¥${selected.price.toFixed(2)}`}
        </button>
        {msg && <div className="pay-hint">{msg}</div>}
      </div>
    </div>
  );
}
