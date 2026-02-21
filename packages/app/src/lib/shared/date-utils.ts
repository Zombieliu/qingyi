import { format, formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { TZDate } from "@date-fns/tz";

const TZ = "Asia/Shanghai";

function toTZ(ts: number | Date): TZDate {
  return new TZDate(typeof ts === "number" ? ts : ts.getTime(), TZ);
}

/** "01/15 14:30" — 列表/表格用 */
export function formatShortDateTime(ts: number | Date): string {
  return format(toTZ(ts), "MM/dd HH:mm", { locale: zhCN });
}

/** "2025/01/15 14:30" — 详情页/webhook 用 */
export function formatFullDateTime(ts: number | Date): string {
  return format(toTZ(ts), "yyyy/MM/dd HH:mm", { locale: zhCN });
}

/** "2025-01-15" — 分析/分组用 */
export function formatDateISO(ts: number | Date): string {
  return format(toTZ(ts), "yyyy-MM-dd");
}

/** "3 分钟前" — 相对时间 */
export function formatRelativeTime(ts: number | Date): string {
  return formatDistanceToNow(toTZ(ts), { addSuffix: true, locale: zhCN });
}
