"use client";
import { t } from "@/lib/i18n/i18n-client";

import Image, { type ImageLoader } from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getCurrentAddress } from "@/lib/chain/qy-chain-lite";
import { useBalance } from "@/app/components/balance-provider";
import { StateBlock } from "@/app/components/state-block";
import { formatErrorMessage } from "@/lib/shared/error-utils";
import { fetchWithUserAuth } from "@/lib/auth/user-auth-client";

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
type StatusTone = "info" | "success" | "warning" | "danger" | "loading";
type StatusMessage = { tone: StatusTone; title: string; description?: string };

const options: Option[] = [
  { amount: 42, price: 6 },
  { amount: 210, price: 30 },
];

const channels: { key: PayChannel; label: string; note: string }[] = [
  { key: "alipay", label: "支付宝", note: t("ui.wallet.689") },
  { key: "wechat_pay", label: "微信支付", note: t("ui.wallet.602") },
];

const qrImageLoader: ImageLoader = ({ src }) => src;

export default function Wallet() {
  const [selected, setSelected] = useState<Option>(options[0]);
  const [customAmount, setCustomAmount] = useState("");
  const [customTouched, setCustomTouched] = useState(false);
  const [agree, setAgree] = useState(false);
  const [channel, setChannel] = useState<PayChannel>("alipay");
  const [payInfo, setPayInfo] = useState<PayResponse | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const { balance, refresh } = useBalance();

  const unitPrice = useMemo(() => options[0].price / options[0].amount, []);
  const customOption = useMemo<Option | null>(() => {
    const raw = Number(customAmount);
    if (!Number.isFinite(raw)) return null;
    const amount = Math.floor(raw);
    if (amount <= 0) return null;
    const price = Number((amount * unitPrice).toFixed(2));
    return { amount, price };
  }, [customAmount, unitPrice]);
  const isCustomSelected =
    !!customOption &&
    selected.amount === customOption.amount &&
    selected.price === customOption.price;

  useEffect(() => {
    if (isCustomSelected && customOption) {
      setSelected(customOption);
    }
  }, [customOption, isCustomSelected]);

  const customError = useMemo(() => {
    if (!customTouched && !customAmount) return null;
    if (!customAmount) return t("ui.wallet.678");
    const raw = Number(customAmount);
    if (!Number.isFinite(raw)) return t("ui.wallet.679");
    if (!Number.isInteger(raw)) return t("ui.wallet.680");
    if (raw <= 0) return t("ui.wallet.648");
    return null;
  }, [customAmount, customTouched]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const redirectStatus = params.get("redirect_status");
    let attempts = redirectStatus === "succeeded" ? 6 : 1;
    if (redirectStatus === "succeeded") {
      setStatus({
        tone: "loading",
        title: t("ui.wallet.618"),
        description: "正在确认支付信息",
      });
      setPollCount(0);
    }
    const fetchBalance = async () => {
      try {
        const next = await refresh({ force: redirectStatus === "succeeded" });
        if (next !== null) {
          if (redirectStatus === "succeeded") {
            setStatus({
              tone: "success",
              title: "余额已更新",
              description: "可返回查看余额或继续充值",
            });
          }
        }
      } catch {
        // ignore balance errors
      } finally {
        attempts -= 1;
        if (attempts > 0) {
          if (redirectStatus === "succeeded") {
            setPollCount((count) => count + 1);
          }
          setTimeout(fetchBalance, 2000);
        } else if (redirectStatus === "succeeded") {
          setStatus({
            tone: "warning",
            title: "余额更新超时",
            description: "请稍后下拉刷新或重新进入页面。",
          });
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
    if (payInfo.qrCodeLink) return t("ui.wallet.568");
    if (payInfo.qrCodeText) return t("ui.wallet.569");
    return null;
  }, [payInfo, wechatQrSrc]);

  const statusDescription =
    status?.tone === "loading" && pollCount > 0 ? `已轮询 ${pollCount} 次…` : status?.description;

  const handleConfirm = async () => {
    if (!agree) {
      setStatus({ tone: "warning", title: t("ui.wallet.675") });
      return;
    }
    if (loading) return;
    setLoading(true);
    setStatus(null);
    setPayInfo(null);
    const address = getCurrentAddress();
    if (!address) {
      setStatus({ tone: "warning", title: t("ui.wallet.676") });
      setLoading(false);
      return;
    }

    const nextOrderId = `ORD-${Date.now()}`;
    setOrderId(nextOrderId);

    try {
      const res = await fetchWithUserAuth(
        "/api/pay",
        {
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
            returnUrl:
              typeof window !== "undefined" ? `${window.location.origin}/wallet` : undefined,
          }),
        },
        address
      );
      const data = (await res.json()) as PayResponse & { error?: string };
      if (!res.ok) {
        setStatus({ tone: "danger", title: data.error || "支付创建失败" });
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
            setStatus({ tone: "success", title: t("ui.wallet.617") });
          } else {
            const info = data.nextActionType ? `，动作：${data.nextActionType}` : "";
            setStatus({
              tone: "warning",
              title: `未获取到支付宝跳转链接（状态：${data.status || "unknown"}${info}），请稍后重试`,
            });
          }
        } else {
          const info = data.nextActionType ? `，动作：${data.nextActionType}` : "";
          setStatus({
            tone: "warning",
            title: `未获取到二维码（状态：${data.status || "unknown"}${info}），请稍后重试`,
          });
        }
      }
    } catch (error) {
      setStatus({ tone: "danger", title: formatErrorMessage(error, t("wallet.001")) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pay-screen">
      <header className="pay-top">
        <Link href="/me" aria-label={t("wallet.002")}>
          <ArrowLeft size={20} />
        </Link>
        <span className="pay-title">{t("ui.wallet.141")}</span>
        <Link href="/wallet/records" className="pay-link">
          明细
        </Link>
      </header>

      <div className="pay-balance-card">
        <div className="pay-balance-label">{t("ui.wallet.142")}</div>
        <div className="pay-balance-value">{balance}</div>
      </div>

      <div className="pay-options">
        <div className="pay-options-label">{t("ui.wallet.143")}</div>
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
          <div className={`pay-option pay-option-custom ${isCustomSelected ? "is-active" : ""}`}>
            <div className="pay-option-amt">{t("ui.wallet.144")}</div>
            <div className="pay-custom-row">
              <input
                className="admin-input pay-custom-input"
                type="number"
                min={1}
                step={1}
                placeholder={t("wallet.003")}
                value={customAmount}
                onChange={(event) => {
                  setCustomTouched(true);
                  setCustomAmount(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && customOption) {
                    setSelected(customOption);
                  }
                }}
              />
              <button
                type="button"
                className="dl-tab-btn pay-custom-btn"
                disabled={!customOption}
                onClick={() => {
                  if (customOption) setSelected(customOption);
                }}
              >
                使用
              </button>
            </div>
            <div className="pay-option-price" style={{ marginTop: 6 }}>
              预计 ¥{customOption ? customOption.price.toFixed(2) : "--"}（1 钻石 ≈ ¥
              {unitPrice.toFixed(2)}）
            </div>
            {customError ? (
              <div style={{ marginTop: 6, fontSize: 12, color: "#ef4444" }}>{customError}</div>
            ) : null}
          </div>
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
                <span>{t("ui.wallet.145")}</span>
                <span className="pay-badge">{t("ui.wallet.146")}</span>
              </div>
              <div className="pay-qr-amount">{orderId}</div>
              <div className="pay-qr-note">{t("ui.wallet.147")}</div>
            </div>
          </div>
        )}
        {payInfo?.redirectUrl && (
          <div className="pay-qr-card">
            <div className="pay-qr-info">
              <div className="pay-qr-title">
                <span>{t("ui.wallet.148")}</span>
                <span className="pay-badge">{t("ui.wallet.149")}</span>
              </div>
              <div className="pay-qr-note">{t("ui.wallet.150")}</div>
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
                  alt={t("wallet.004")}
                  width={120}
                  height={120}
                  loader={qrImageLoader}
                  unoptimized
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <div>{t("ui.wallet.151")}</div>
              )}
            </div>
            <div className="pay-qr-info">
              <div className="pay-qr-title">
                <span>{t("ui.wallet.152")}</span>
                <span className="pay-badge">{t("ui.wallet.153")}</span>
              </div>
              <div className="pay-qr-note">{t("ui.wallet.154")}</div>
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
          <input
            type="checkbox"
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
            aria-label={t("wallet.005")}
          />
          <span>{t("ui.wallet.155")}</span>
        </label>
        <button
          type="button"
          className="pay-submit"
          disabled={!agree || loading}
          onClick={handleConfirm}
        >
          {loading ? t("ui.wallet.547") : `支付 ¥${selected.price.toFixed(2)}`}
        </button>
        {status && (
          <StateBlock
            tone={status.tone}
            size="compact"
            align="center"
            title={status.title}
            description={statusDescription}
          />
        )}
      </div>
    </div>
  );
}
