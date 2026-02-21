"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { syncAttributionFromLocation, trackEvent } from "@/lib/services/analytics";

export default function AnalyticsProvider() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (pathname?.startsWith("/admin")) return;
    syncAttributionFromLocation();
    trackEvent("page_view", {
      path: pathname,
      query: searchParams?.toString() || "",
    });
  }, [pathname, searchParams]);

  return null;
}
