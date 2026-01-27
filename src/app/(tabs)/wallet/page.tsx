import Link from "next/link";
import { ArrowLeft } from "lucide-react";

const options = [
  { amount: 42, price: 6 },
  { amount: 210, price: 30 },
];

export default function Wallet() {
  return (
    <div className="pay-screen">
      <header className="pay-top">
        <Link href="/me" aria-label="返回我的">
          <ArrowLeft size={20} />
        </Link>
        <span className="pay-title">钻石充值</span>
        <Link href="#" className="pay-link">明细</Link>
      </header>

      <div className="pay-balance-card">
        <div className="pay-balance-label">我的钻石</div>
        <div className="pay-balance-value">0</div>
      </div>

      <div className="pay-options">
        <div className="pay-options-label">请选择充值数量</div>
        <div className="pay-option-grid">
          {options.map((opt) => (
            <button key={opt.amount} className={`pay-option ${opt.amount === 42 ? "is-active" : ""}`}>
              <div className="pay-option-amt">{opt.amount} 钻石</div>
              <div className="pay-option-price">¥{opt.price.toFixed(2)}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="pay-footer">
        <label className="pay-agree">
          <input type="checkbox" aria-label="同意充值协议" />
          <span>同意并阅读《充值服务协议》</span>
        </label>
        <button className="pay-submit">支付 ¥6.00</button>
      </div>
    </div>
  );
}
