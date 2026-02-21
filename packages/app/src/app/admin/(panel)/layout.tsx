import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin/admin-auth";
import AdminShell from "./admin-shell";

export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  return <AdminShell>{children}</AdminShell>;
}
