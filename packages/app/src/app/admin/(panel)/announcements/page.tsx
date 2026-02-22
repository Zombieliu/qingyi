"use client";
import { t } from "@/lib/i18n/i18n-client";

import { useEffect, useState } from "react";
import { Megaphone, Pencil, PlusCircle, Trash2, Archive } from "lucide-react";
import type { AdminAnnouncement, AnnouncementStatus } from "@/lib/admin/admin-types";
import { ANNOUNCEMENT_STATUS_OPTIONS } from "@/lib/admin/admin-types";
import { readCache, writeCache } from "@/lib/shared/client-cache";
import { StateBlock } from "@/app/components/state-block";
import { roleRank, useAdminSession } from "../admin-session";

export default function AnnouncementsPage() {
  const { role } = useAdminSession();
  const canEdit = roleRank(role) >= roleRank("ops");
  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [form, setForm] = useState({
    title: "",
    tag: "公告",
    content: "",
    status: "draft" as AnnouncementStatus,
  });
  const cacheTtlMs = 60_000;

  const loadAnnouncements = async () => {
    setLoading(true);
    try {
      const cacheKey = "cache:admin:announcements";
      const cached = readCache<AdminAnnouncement[]>(cacheKey, cacheTtlMs, true);
      if (cached) {
        setAnnouncements(Array.isArray(cached.value) ? cached.value : []);
      }
      const res = await fetch("/api/admin/announcements");
      if (res.ok) {
        const data = await res.json();
        const next = Array.isArray(data) ? data : [];
        setAnnouncements(next);
        setSelectedIds([]);
        writeCache(cacheKey, next);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnnouncements();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setForm({ title: "", tag: "公告", content: "", status: "draft" });
  };

  const submitForm = async () => {
    if (!canEdit) return;
    if (!form.title.trim()) return;
    const payload = {
      title: form.title.trim(),
      tag: form.tag.trim() || "公告",
      content: form.content.trim(),
      status: form.status,
    };
    if (editingId) {
      const res = await fetch(`/api/admin/announcements/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        setAnnouncements((prev) => {
          const next = prev.map((item) => (item.id === editingId ? data : item));
          writeCache("cache:admin:announcements", next);
          return next;
        });
        resetForm();
      }
    } else {
      const res = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        setAnnouncements((prev) => {
          const next = [data, ...prev];
          writeCache("cache:admin:announcements", next);
          return next;
        });
        resetForm();
      }
    }
  };

  const handleEdit = (item: AdminAnnouncement) => {
    if (!canEdit) return;
    setEditingId(item.id);
    setForm({
      title: item.title,
      tag: item.tag,
      content: item.content,
      status: item.status,
    });
  };

  const updateStatus = async (id: string, status: AnnouncementStatus) => {
    if (!canEdit) return;
    const res = await fetch(`/api/admin/announcements/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const data = await res.json();
      setAnnouncements((prev) => {
        const next = prev.map((item) => (item.id === id ? data : item));
        writeCache("cache:admin:announcements", next);
        return next;
      });
    }
  };

  const removeItem = async (id: string) => {
    if (!canEdit) return;
    if (!confirm(t("admin.announcements.001"))) return;
    const res = await fetch(`/api/admin/announcements/${id}`, { method: "DELETE" });
    if (res.ok) {
      setAnnouncements((prev) => {
        const next = prev.filter((item) => item.id !== id);
        writeCache("cache:admin:announcements", next);
        return next;
      });
      setSelectedIds((prev) => prev.filter((itemId) => itemId !== id));
    }
  };

  const toggleSelect = (id: string) => {
    if (!canEdit) return;
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = (checked: boolean) => {
    if (!canEdit) return;
    setSelectedIds(checked ? announcements.map((item) => item.id) : []);
  };

  const bulkDelete = async () => {
    if (!canEdit) return;
    if (selectedIds.length === 0) return;
    if (!confirm(`确定要删除选中的 ${selectedIds.length} 条公告吗？`)) return;
    const res = await fetch("/api/admin/announcements/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selectedIds }),
    });
    if (res.ok) {
      setAnnouncements((prev) => {
        const next = prev.filter((item) => !selectedIds.includes(item.id));
        writeCache("cache:admin:announcements", next);
        return next;
      });
      setSelectedIds([]);
    }
  };

  return (
    <div className="admin-section">
      <div className="admin-card">
        <div className="admin-card-header">
          <div>
            <h3>{editingId ? "编辑公告" : t("admin.announcements.002")}</h3>
            <p>管理公告与资讯内容。</p>
          </div>
        </div>
        {canEdit ? (
          <>
            <div className="admin-form">
              <label className="admin-field">
                标题
                <input
                  className="admin-input"
                  placeholder={t("admin.announcements.003")}
                  value={form.title}
                  onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                />
              </label>
              <label className="admin-field">
                标签
                <input
                  className="admin-input"
                  placeholder={t("admin.announcements.004")}
                  value={form.tag}
                  onChange={(event) => setForm((prev) => ({ ...prev, tag: event.target.value }))}
                />
              </label>
              <label className="admin-field">
                内容
                <textarea
                  className="admin-textarea"
                  placeholder={t("admin.announcements.005")}
                  value={form.content}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, content: event.target.value }))
                  }
                />
              </label>
              <label className="admin-field">
                状态
                <select
                  className="admin-select"
                  value={form.status}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      status: event.target.value as AnnouncementStatus,
                    }))
                  }
                >
                  {ANNOUNCEMENT_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="admin-card-actions" style={{ marginTop: 14 }}>
              <button className="admin-btn primary" onClick={submitForm}>
                <PlusCircle size={16} style={{ marginRight: 6 }} />
                {editingId ? "保存修改" : t("admin.announcements.006")}
              </button>
              {editingId ? (
                <button className="admin-btn ghost" onClick={resetForm}>
                  取消编辑
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <div style={{ marginTop: 12 }}>
            <StateBlock
              tone="warning"
              size="compact"
              title={t("admin.announcements.007")}
              description={t("admin.announcements.008")}
            />
          </div>
        )}
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h3>公告列表</h3>
          <div className="admin-card-actions">
            {canEdit ? (
              <>
                <label className="admin-check">
                  <input
                    type="checkbox"
                    checked={
                      announcements.length > 0 && selectedIds.length === announcements.length
                    }
                    onChange={(event) => toggleSelectAll(event.target.checked)}
                    disabled={announcements.length === 0}
                  />
                  全选
                </label>
                <button
                  className="admin-btn ghost"
                  disabled={selectedIds.length === 0}
                  onClick={bulkDelete}
                >
                  <Trash2 size={14} style={{ marginRight: 4 }} />
                  批量删除{selectedIds.length > 0 ? `（${selectedIds.length}）` : ""}
                </button>
              </>
            ) : (
              <span className="admin-badge neutral">只读权限</span>
            )}
          </div>
        </div>
        {loading ? (
          <StateBlock
            tone="loading"
            size="compact"
            title={t("admin.announcements.010")}
            description={t("admin.announcements.009")}
          />
        ) : announcements.length === 0 ? (
          <StateBlock
            tone="empty"
            size="compact"
            title={t("admin.announcements.011")}
            description={t("admin.announcements.012")}
          />
        ) : (
          <div className="admin-stack">
            {announcements.map((item) => (
              <div key={item.id} className="admin-card admin-card--subtle">
                <div
                  className="admin-card-header"
                  style={{ alignItems: "flex-start", flexWrap: "wrap" }}
                >
                  <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {canEdit ? (
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(item.id)}
                          onChange={() => toggleSelect(item.id)}
                        />
                      ) : null}
                      <Megaphone size={16} />
                      <strong>{item.title}</strong>
                      <span
                        className={`admin-badge ${item.status === "published" ? "" : "neutral"}`}
                      >
                        {item.status}
                      </span>
                    </div>
                    <div className="admin-meta" style={{ marginTop: 4 }}>
                      {item.tag}
                    </div>
                    <div className="admin-text-body" style={{ marginTop: 10 }}>
                      {item.content || "（无正文）"}
                    </div>
                  </div>
                  {canEdit ? (
                    <div
                      className="admin-card-actions"
                      style={{ flexDirection: "column", alignItems: "stretch" }}
                    >
                      <button className="admin-btn ghost" onClick={() => handleEdit(item)}>
                        <Pencil size={14} style={{ marginRight: 4 }} />
                        编辑
                      </button>
                      {item.status !== "archived" ? (
                        <button
                          className="admin-btn ghost"
                          onClick={() => updateStatus(item.id, "archived")}
                        >
                          <Archive size={14} style={{ marginRight: 4 }} />
                          归档
                        </button>
                      ) : (
                        <button
                          className="admin-btn ghost"
                          onClick={() => updateStatus(item.id, "draft")}
                        >
                          <Archive size={14} style={{ marginRight: 4 }} />
                          取消归档
                        </button>
                      )}
                      <button className="admin-btn ghost" onClick={() => removeItem(item.id)}>
                        <Trash2 size={14} style={{ marginRight: 4 }} />
                        删除
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
