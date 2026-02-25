"use client";
import { t } from "@/lib/i18n/t";

import Link from "next/link";
import { ArrowLeft, Headset } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PASSKEY_STORAGE_KEY } from "@/app/components/passkey-wallet";
import {
  type SupportRequest,
  topics,
  loadLocalRequests,
  persistLocalRequests,
} from "./support-data";
import { ChannelList } from "./channel-list";
import { TicketForm, type TicketFormData } from "./ticket-form";
import { TicketHistory } from "./ticket-history";

export default function SupportPage() {
  const [form, setForm] = useState<TicketFormData>({
    name: "",
    contact: "",
    topic: topics[0],
    message: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [requests, setRequests] = useState<SupportRequest[]>([]);
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [agreed, setAgreed] = useState(false);

  const walletAddress = useMemo(() => {
    if (typeof window === "undefined") return "";
    try {
      const raw = localStorage.getItem(PASSKEY_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as { address?: string }).address || "" : "";
    } catch {
      return "";
    }
  }, []);

  useEffect(() => {
    const local = loadLocalRequests();
    setRequests(local);
    if (walletAddress) {
      const controller = new AbortController();
      fetch(`/api/support/my-tickets?address=${encodeURIComponent(walletAddress)}`, {
        signal: controller.signal,
      })
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data?.items)) {
            setRequests(data.items);
          }
        })
        .catch(() => {});
      return () => controller.abort();
    }
  }, [walletAddress]);

  const submit = async () => {
    if (!form.message.trim()) {
      setHint(t("form.description_required"));
      return;
    }
    setSubmitting(true);
    setHint(null);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          contact: form.contact.trim(),
          topic: form.topic,
          message: form.message.trim(),
          userAddress: walletAddress,
          screenshots: screenshots.length ? screenshots : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setHint(data?.error || t("tabs.me.support.i095"));
        return;
      }
      const next: SupportRequest = {
        id: data?.id || `SUP-${Date.now()}`,
        topic: form.topic,
        message: form.message.trim(),
        contact: form.contact.trim() || undefined,
        status: t("tabs.me.support.i039"),
        createdAt: Date.now(),
      };
      const updated = [next, ...requests];
      setRequests(updated);
      persistLocalRequests(updated);
      setForm((prev) => ({ ...prev, message: "" }));
      setScreenshots([]);
      setHint(t("apply.support_ticket_submitted"));
    } catch {
      setHint(t("error.network"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dl-main">
      <header className="dl-topbar">
        <div className="dl-time">
          <Link href="/me" className="dl-icon-circle" aria-label={t("me.support.001")}>
            <ArrowLeft size={16} />
          </Link>
          <span className="dl-time-text">{t("ui.support.078")}</span>
          <span className="dl-chip">{t("ui.support.079")}</span>
        </div>
        <div className="dl-actions">
          <span className="dl-icon-circle">
            <Headset size={16} />
          </span>
        </div>
      </header>

      <ChannelList />

      <TicketForm
        form={form}
        setForm={setForm}
        screenshots={screenshots}
        setScreenshots={setScreenshots}
        agreed={agreed}
        setAgreed={setAgreed}
        submitting={submitting}
        hint={hint}
        setHint={setHint}
        onSubmit={submit}
      />

      <TicketHistory requests={requests} />
    </div>
  );
}
