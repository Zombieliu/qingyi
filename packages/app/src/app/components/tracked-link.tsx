"use client";

import Link from "next/link";
import { type ReactNode } from "react";
import { trackEvent } from "@/app/components/analytics";

type TrackedLinkProps = {
  href: string;
  className?: string;
  event: string;
  meta?: Record<string, unknown>;
  children: ReactNode;
};

export default function TrackedLink({ href, className, event, meta, children }: TrackedLinkProps) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        trackEvent(event, { href, ...(meta || {}) });
      }}
    >
      {children}
    </Link>
  );
}
