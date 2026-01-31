"use client";

import { useEffect, useState } from "react";
import { Megaphone, Pencil, PlusCircle } from "lucide-react";
import type { AdminAnnouncement, AnnouncementStatus } from "@/lib/admin-types";
import { ANNOUNCEMENT_STATUS_OPTIONS } from "@/lib/admin-types";

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    tag: "公告",
    content: "",
    status: "draft" as AnnouncementStatus,
  });

  const loadAnnouncements = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/announcements");
      if (res.ok) {
        const data = await res.json();
        setAnnouncements(Array.isArray(data) ? data : []);
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
        setAnnouncements((prev) => prev.map((item) => (item.id === editingId ? data : item)));
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
        setAnnouncements((prev) => [data, ...prev]);
        resetForm();
      }
    }
  };

  const handleEdit = (item: AdminAnnouncement) => {
    setEditingId(item.id);
    setForm({
      title: item.title,
      tag: item.tag,
      content: item.content,
      status: item.status,
    });
  };

  return (
    <div className="admin-section">
      <div className="admin-card">
        <h3>{editingId ? "编辑公告" : "发布新公告"}</h3>
        <div className="admin-form">
          <label className="admin-field">
            标题
            <input
              className="admin-input"
              placeholder="公告标题"
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            />
          </label>
          <label className="admin-field">
            标签
            <input
              className="admin-input"
              placeholder="公告 / 安全 / 活动"
              value={form.tag}
              onChange={(event) => setForm((prev) => ({ ...prev, tag: event.target.value }))}
            />
          </label>
          <label className="admin-field">
            内容
            <textarea
              className="admin-textarea"
              placeholder="公告正文内容"
              value={form.content}
              onChange={(event) => setForm((prev) => ({ ...prev, content: event.target.value }))}
            />
          </label>
          <label className="admin-field">
            状态
            <select
              className="admin-select"
              value={form.status}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, status: event.target.value as AnnouncementStatus }))
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
        <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
          <button className="admin-btn primary" onClick={submitForm}>
            <PlusCircle size={16} style={{ marginRight: 6 }} />
            {editingId ? "保存修改" : "发布公告"}
          </button>
          {editingId ? (
            <button className="admin-btn ghost" onClick={resetForm}>
              取消编辑
            </button>
          ) : null}
        </div>
      </div>

      <div className="admin-card">
        <h3>公告列表</h3>
        {loading ? (
          <p>加载中...</p>
        ) : announcements.length === 0 ? (
          <p>暂无公告记录</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {announcements.map((item) => (
              <div key={item.id} className="admin-card" style={{ boxShadow: "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <Megaphone size={16} />
                      <strong>{item.title}</strong>
                      <span className={`admin-badge ${item.status === "published" ? "" : "neutral"}`}>
                        {item.status}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                      {item.tag}
                    </div>
                    <div style={{ marginTop: 10, fontSize: 14, color: "#0f172a" }}>
                      {item.content || "（无正文）"}
                    </div>
                  </div>
                  <button className="admin-btn ghost" onClick={() => handleEdit(item)}>
                    <Pencil size={14} style={{ marginRight: 4 }} />
                    编辑
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
