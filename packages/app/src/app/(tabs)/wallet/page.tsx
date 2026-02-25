"use client";
import { t } from "@/lib/i18n/t";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { StateBlock } from "@/app/components/state-block";
import { options, payChannels, qrImageLoader } from "./wallet-data";
import { useWalletState } from "./use-wallet-state";

export default function Wallet() {
  const {
    selected,
    setSelected,
    customAmount,
    setCustomAmount,
    setCustomTouched,
    agree,
    setAgree,
    channel,
    setChannel,
    payInfo,
    orderId,
    loading,
    status,
    balance,
    unitPrice,
    customOption,
    isCustomSelected,
    customError,
    wechatQrSrc,
    wechatQrHint,
    statusDescription,
    handleConfirm,
  } = useWalletState();

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
                  const raw = Number(event.target.value);
                  if (Number.isFinite(raw) && Number.isInteger(raw) && raw > 0) {
                    const price = Number((Math.floor(raw) * unitPrice).toFixed(2));
                    setSelected({ amount: Math.floor(raw), price });
                  }
                }}
              />
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
          {payChannels.map((item) => (
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
