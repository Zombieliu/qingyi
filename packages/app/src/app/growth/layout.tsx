import { requireAdmin } from "@/lib/admin/admin-auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

export default async function GrowthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-6">
            <a href="/growth/dashboard" className="text-lg font-bold text-gray-900">
              📈 Growth OS
            </a>
            <div className="flex gap-1 text-sm">
              <a
                href="/growth/dashboard"
                className="px-3 py-1.5 rounded-lg hover:bg-gray-100 text-gray-600"
              >
                总览
              </a>
              <a
                href="/growth/contacts"
                className="px-3 py-1.5 rounded-lg hover:bg-gray-100 text-gray-600"
              >
                用户池
              </a>
              <a
                href="/growth/channels"
                className="px-3 py-1.5 rounded-lg hover:bg-gray-100 text-gray-600"
              >
                渠道
              </a>
              <a
                href="/growth/campaigns"
                className="px-3 py-1.5 rounded-lg hover:bg-gray-100 text-gray-600"
              >
                活动
              </a>
              <a
                href="/growth/links"
                className="px-3 py-1.5 rounded-lg hover:bg-gray-100 text-gray-600"
              >
                推广链接
              </a>
              <a
                href="/growth/attribution"
                className="px-3 py-1.5 rounded-lg hover:bg-gray-100 text-gray-600"
              >
                归因
              </a>
              <a
                href="/growth/automation"
                className="px-3 py-1.5 rounded-lg hover:bg-gray-100 text-gray-600"
              >
                自动化
              </a>
            </div>
          </div>
          <a href="/admin" className="text-xs text-gray-400 hover:text-gray-600">
            ← 返回后台
          </a>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
