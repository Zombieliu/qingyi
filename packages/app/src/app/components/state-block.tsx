import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Inbox, Info, Loader2 } from "lucide-react";

type StateTone = "info" | "success" | "warning" | "danger" | "loading" | "empty";
type StateSize = "full" | "compact";
type StateAlign = "left" | "center";

const toneIcons: Record<StateTone, ReactNode> = {
  info: <Info size={18} />,
  success: <CheckCircle2 size={18} />,
  warning: <AlertTriangle size={18} />,
  danger: <AlertTriangle size={18} />,
  loading: <Loader2 size={18} className="spin" />,
  empty: <Inbox size={18} />,
};

type StateBlockProps = {
  title: string;
  description?: string;
  tone?: StateTone;
  size?: StateSize;
  align?: StateAlign;
  actions?: ReactNode;
  icon?: ReactNode;
  className?: string;
};

export function StateBlock({
  title,
  description,
  tone = "info",
  size = "full",
  align = "left",
  actions,
  icon,
  className,
}: StateBlockProps) {
  const classes = ["state-block", className].filter(Boolean).join(" ");
  return (
    <div className={classes} data-tone={tone} data-size={size} data-align={align}>
      <div className="state-icon">{icon ?? toneIcons[tone]}</div>
      <div className="state-content">
        <div className="state-title">{title}</div>
        {description ? <div className="state-copy">{description}</div> : null}
        {actions ? <div className="state-actions">{actions}</div> : null}
      </div>
    </div>
  );
}
