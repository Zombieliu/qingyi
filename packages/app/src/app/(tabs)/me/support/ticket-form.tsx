"use client";
import { t } from "@/lib/i18n/t";
import Image from "next/image";
import { Send, ImagePlus, X } from "lucide-react";
import { topics } from "./support-data";

export type TicketFormData = {
  name: string;
  contact: string;
  topic: string;
  message: string;
};

export function TicketForm({
  form,
  setForm,
  screenshots,
  setScreenshots,
  agreed,
  setAgreed,
  submitting,
  hint,
  setHint,
  onSubmit,
}: {
  form: TicketFormData;
  setForm: React.Dispatch<React.SetStateAction<TicketFormData>>;
  screenshots: string[];
  setScreenshots: React.Dispatch<React.SetStateAction<string[]>>;
  agreed: boolean;
  setAgreed: (v: boolean) => void;
  submitting: boolean;
  hint: string | null;
  setHint: (v: string | null) => void;
  onSubmit: () => void;
}) {
  return (
    <section className="dl-card" style={{ padding: 16 }}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-900">{t("ui.support.081")}</div>
        <span className="text-xs text-slate-500">{t("ui.support.082")}</span>
      </div>
      <div className="mt-3 grid gap-3">
        <div className="grid gap-2">
          <label className="text-xs text-slate-500">{t("ui.support.083")}</label>
          <input
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
            placeholder={t("me.support.002")}
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          />
        </div>
        <div className="grid gap-2">
          <label className="text-xs text-slate-500">{t("ui.support.084")}</label>
          <input
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
            placeholder={t("me.support.003")}
            value={form.contact}
            onChange={(event) => setForm((prev) => ({ ...prev, contact: event.target.value }))}
          />
        </div>
        <div className="grid gap-2">
          <label className="text-xs text-slate-500">{t("ui.support.085")}</label>
          <div className="flex flex-wrap gap-2">
            {topics.map((topic) => (
              <button
                type="button"
                key={topic}
                onClick={() => setForm((prev) => ({ ...prev, topic }))}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                  form.topic === topic
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                {topic}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-2">
          <label className="text-xs text-slate-500">{t("ui.support.086")}</label>
          <textarea
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm min-h-[120px]"
            placeholder={t("me.support.004")}
            value={form.message}
            onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value }))}
          />
        </div>
        <div className="grid gap-2">
          <label className="text-xs text-slate-500">{t("me.support.010")}</label>
          <div className="flex flex-wrap gap-2">
            {screenshots.map((src, i) => (
              <div
                key={i}
                className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200"
              >
                <Image src={src} alt="" fill unoptimized sizes="80px" className="object-cover" />
                <button
                  type="button"
                  onClick={() => setScreenshots((prev) => prev.filter((_, idx) => idx !== i))}
                  className="absolute top-0.5 right-0.5 bg-black/50 text-white rounded-full p-0.5"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            {screenshots.length < 3 && (
              <label className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center cursor-pointer hover:border-slate-400">
                <ImagePlus size={20} className="text-slate-400" />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    if (file.size > 500 * 1024) {
                      setHint(t("me.support.011"));
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      const base64 = reader.result as string;
                      setScreenshots((prev) => [...prev, base64]);
                    };
                    reader.readAsDataURL(file);
                    event.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
        </div>
      </div>
      <label className="mt-3 flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(event) => setAgreed(event.target.checked)}
          className="rounded border-slate-300"
        />
        <span>
          {t("me.support.008")}
          <a href="/terms" target="_blank" className="text-blue-600 underline">
            {t("me.support.009")}
          </a>
        </span>
      </label>
      <button
        type="button"
        onClick={onSubmit}
        disabled={submitting || !agreed}
        className="mt-4 w-full rounded-2xl bg-slate-900 text-white py-2 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <Send size={16} />
        {submitting ? t("ui.support.606") : t("me.support.005")}
      </button>
      {hint && <div className="mt-3 text-xs text-amber-600">{hint}</div>}
    </section>
  );
}
