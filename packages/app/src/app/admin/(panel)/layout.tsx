import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAdminSecret, isAdminTokenValid } from "@/lib/admin-auth";
import AdminShell from "./admin-shell";

export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value || "";
  const secret = getAdminSecret();

  if (!secret || !isAdminTokenValid(token)) {
    redirect("/admin/login");
  }

  return <AdminShell>{children}</AdminShell>;
}
