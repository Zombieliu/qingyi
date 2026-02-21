import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { removeAnnouncements } from "@/lib/admin/admin-store";
import { recordAudit } from "@/lib/admin/admin-audit";
import { parseBody } from "@/lib/shared/api-validation";

const schema = z.object({ ids: z.array(z.string().min(1)).min(1) });

export async function POST(req: Request) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(req, schema);
  if (!parsed.success) return parsed.response;
  const { ids } = parsed.data;

  const count = await removeAnnouncements(ids);
  await recordAudit(req, auth, "announcements.bulk_delete", "announcement", ids.join(","), {
    count,
    ids,
  });
  return NextResponse.json({ ok: true, count });
}
