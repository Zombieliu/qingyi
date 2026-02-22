import { t } from "@/lib/i18n/i18n-client";
import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
  children?: ReactNode;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "确认",
  cancelLabel = "取消",
  busy,
  onConfirm,
  onClose,
  children,
}: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <div className="ride-modal-mask" role="dialog" aria-modal="true" aria-label={title}>
      <div className="ride-modal">
        <div className="ride-modal-head">
          <div>
            <div className="ride-modal-title">{title}</div>
            {description ? <div className="ride-modal-sub">{description}</div> : null}
          </div>
          <div className="ride-modal-amount">{t("ui.confirm-dialog.481")}</div>
        </div>
        {children ? <div className="ride-modal-body">{children}</div> : null}
        <div className="ride-modal-actions">
          <button className="dl-tab-btn" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </button>
          <button className="dl-tab-btn primary" onClick={onConfirm} disabled={busy}>
            {busy ? <Loader2 size={16} className="spin" /> : null}
            <span style={{ marginLeft: busy ? 6 : 0 }}>{confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

type PromptDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  placeholder?: string;
  value: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onChange: (value: string) => void;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
};

export function PromptDialog({
  open,
  title,
  description,
  placeholder,
  value,
  confirmLabel = "提交",
  cancelLabel = "取消",
  busy,
  onChange,
  onConfirm,
  onClose,
}: PromptDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      busy={busy}
      onConfirm={onConfirm}
      onClose={onClose}
    >
      <textarea
        className="dl-textarea"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </ConfirmDialog>
  );
}
