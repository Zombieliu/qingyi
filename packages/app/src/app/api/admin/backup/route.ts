import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { getBackupStats } from "@/lib/shared/backup-utils";
import { getCacheAsync } from "@/lib/server-cache";

export const dynamic = "force-dynamic";

/**
 * 管理员查看备份状态
 *
 * GET: 返回最近备份摘要 + 当前各表记录数
 */
export async function GET(req: Request) {
  const auth = await requireAdmin(req, { role: "viewer" });
  if (!auth.ok) return auth.response;

  try {
    const cached = await getCacheAsync<{
      exportedAt: string;
      stats: Record<string, number>;
      counts: Record<string, number>;
    }>("backup:summary");

    const currentStats = await getBackupStats();

    return NextResponse.json({
      ok: true,
      lastBackup: cached?.value ?? null,
      currentStats,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "backup_status_failed", message: (error as Error).message },
      { status: 500 }
    );
  }
}
