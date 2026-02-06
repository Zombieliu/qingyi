"use client";

import Image, { type ImageLoader } from "next/image";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getCurrentAddress } from "@/lib/qy-chain";
import { useBalance } from "@/app/components/balance-provider";

type Option = { amount: number; price: number };
type PayChannel = "alipay" | "wechat_pay";
type PayResponse = {
  paymentIntentId?: string;
  clientSecret?: string | null;
  status?: string;
  nextActionType?: string | null;
  redirectUrl?: string | null;
  qrCodeUrl?: string | null;
  qrCodeData?: string | null;
  qrCodeLink?: string | null;
  qrCodeText?: string | null;
};

const options: Option[] = [
  { amount: 42, price: 6 },
  { amount: 210, price: 30 },
];

const channels: { key: PayChannel; label: string; note: string }[] = [
  { key: "alipay", label: "支付宝", note: "跳转支付完成后返回" },
  { key: "wechat_pay", label: "微信支付", note: "扫码完成付款" },
];

const qrImageLoader: ImageLoader = ({ src }) => src;

export default function Wallet() {
  const [selected, setSelected] = useState<Option>(options[0]);
  const [agree, setAgree] = useState(false);
  const [channel, setChannel] = useState<PayChannel>("alipay");
  const [payInfo, setPayInfo] = useState<PayResponse | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const { balance, refresh } = useBalance();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("redirect_status");
    let attempts = status === "succeeded" ? 6 : 1;
    if (status === "succeeded") {
      setMsg("支付成功，正在刷新余额...");
      setPolling(true);
      setPollCount(0);
    }
    const fetchBalance = async () => {
      try {
        const next = await refresh();
        if (next !== null) {
          if (status === "succeeded") {
            setMsg("余额已更新。");
            setPolling(false);
          }
        }
      } catch {
        // ignore balance errors
      } finally {
        attempts -= 1;
        if (attempts > 0) {
          if (status === "succeeded") {
            setPollCount((count) => count + 1);
          }
          setTimeout(fetchBalance, 2000);
        } else if (status === "succeeded") {
          setMsg("余额更新超时，请稍后下拉刷新或重新进入页面。");
          setPolling(false);
        }
      }
    };
    fetchBalance();
  }, [refresh]);

  const wechatQrSrc = useMemo(() => {
    if (!payInfo) return null;
    if (payInfo.qrCodeData) {
      return payInfo.qrCodeData.startsWith("data:")
        ? payInfo.qrCodeData
        : `data:image/png;base64,${payInfo.qrCodeData}`;
    }
    return payInfo.qrCodeUrl || null;
  }, [payInfo]);

  const wechatQrHint = useMemo(() => {
    if (!payInfo) return null;
    if (wechatQrSrc) return null;
    if (payInfo.qrCodeLink) return "如二维码未显示，可点击下方按钮打开支付指引页";
    if (payInfo.qrCodeText) return "如二维码未显示，请稍后重试或刷新二维码";
    return null;
  }, [payInfo, wechatQrSrc]);

  const handleConfirm = async () => {
    if (!agree) {
      setMsg("请先勾选同意充值协议");
      return;
    }
    if (loading) return;
    setLoading(true);
    setMsg(null);
    setPayInfo(null);
    const address = getCurrentAddress();
    if (!address) {
      setMsg("请先登录账号以便入账");
      setLoading(false);
      return;
    }

    const nextOrderId = `ORD-${Date.now()}`;
    setOrderId(nextOrderId);

    try {
      const res = await fetch("/api/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: selected.price,
          channel,
          orderId: nextOrderId,
          userAddress: address,
          diamondAmount: selected.amount,
          subject: "钻石充值",
          body: `钻石充值 ${selected.amount} 钻石`,
          returnUrl: typeof window !== "undefined" ? `${window.location.origin}/wallet` : undefined,
        }),
      });
      const data = (await res.json()) as PayResponse & { error?: string };
      if (!res.ok) {
        setMsg(data.error || "支付创建失败");
        return;
      }
      setPayInfo(data);
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }
      if (!data.qrCodeData && !data.qrCodeUrl && !data.qrCodeLink && !data.qrCodeText) {
        if (channel === "alipay") {
          if (data.status === "succeeded") {
            setMsg("支付已完成，可在明细中查看状态。");
          } else {
            const info = data.nextActionType ? `，动作：${data.nextActionType}` : "";
            setMsg(`未获取到支付宝跳转链接（状态：${data.status || "unknown"}${info}），请稍后重试`);
          }
        } else {
          const info = data.nextActionType ? `，动作：${data.nextActionType}` : "";
          setMsg(`未获取到二维码（状态：${data.status || "unknown"}${info}），请稍后重试`);
        }
      }
    } catch (error) {
      setMsg((error as Error).message || "网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
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
        <div className="pay-balance-value">{balance}</div>
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
        <div className="pay-options-label">请选择支付方式（合计 ¥{selected.price.toFixed(2)}）</div>
        <div className="pay-option-grid">
          {channels.map((item) => (
            <button
              type="button"
              key={item.key}
              className={`pay-option ${channel === item.key ? "is-active" : ""}`}
              onClick={() => setChannel(item.key)}
            >
              <div className="pay-option-amt">{item.label}</div>
              <div className="pay-option-price">{item.note}</div>
            </button>
          ))}
        </div>
        {orderId && (
          <div className="pay-qr-card">
            <div className="pay-qr-info">
              <div className="pay-qr-title">
                <span>订单号</span>
                <span className="pay-badge">待支付</span>
              </div>
              <div className="pay-qr-amount">{orderId}</div>
              <div className="pay-qr-note">请使用同一订单完成付款。</div>
            </div>
          </div>
        )}
        {payInfo?.redirectUrl && (
          <div className="pay-qr-card">
            <div className="pay-qr-info">
              <div className="pay-qr-title">
                <span>支付跳转</span>
                <span className="pay-badge">支付宝</span>
              </div>
              <div className="pay-qr-note">若未自动跳转，可点击下方按钮继续支付。</div>
              <div className="mt-2">
                <a className="pay-submit" href={payInfo.redirectUrl} rel="noreferrer">
                  打开支付页面
                </a>
              </div>
            </div>
          </div>
        )}
        {channel === "wechat_pay" && (
          <div className="pay-qr-card">
            <div className="pay-qr-img" aria-hidden>
              {wechatQrSrc ? (
                <Image
                  src={wechatQrSrc}
                  alt="微信支付二维码"
                  width={120}
                  height={120}
                  loader={qrImageLoader}
                  unoptimized
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <div>请点击下方按钮生成二维码</div>
              )}
            </div>
            <div className="pay-qr-info">
              <div className="pay-qr-title">
                <span>微信支付二维码</span>
                <span className="pay-badge">扫码支付</span>
              </div>
              <div className="pay-qr-note">完成支付后系统会自动更新订单状态。</div>
              {wechatQrHint && <div className="pay-qr-note">{wechatQrHint}</div>}
              {payInfo?.qrCodeLink && !wechatQrSrc && (
                <div className="mt-2">
                  <a className="pay-submit" href={payInfo.qrCodeLink} rel="noreferrer">
                    打开支付指引页
                  </a>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="pay-footer">
        <label className="pay-agree">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} aria-label="同意充值协议" />
          <span>同意并阅读《充值服务协议》</span>
        </label>
        <button type="button" className="pay-submit" disabled={!agree || loading} onClick={handleConfirm}>
          {loading ? "创建支付中..." : `支付 ¥${selected.price.toFixed(2)}`}
        </button>
        {msg && <div className="pay-hint">{msg}</div>}
        {polling && (
          <div className="pay-hint">
            <Loader2 size={14} className="spin" style={{ marginRight: 6 }} />
            支付确认中，已轮询 {pollCount} 次…
          </div>
        )}
      </div>
    </div>
  );
}
