"use client";

import { useEffect } from "react";
import { reportWebVitals } from "@/lib/web-vitals";

export default function WebVitalsReporter() {
  useEffect(() => {
    // Dynamic import to avoid bundling if not needed
    import("web-vitals")
      .then(({ onCLS, onLCP, onFCP, onTTFB, onINP }) => {
        onCLS(reportWebVitals);
        onLCP(reportWebVitals);
        onFCP(reportWebVitals);
        onTTFB(reportWebVitals);
        onINP(reportWebVitals);
      })
      .catch(() => {
        // web-vitals not available, skip
      });
  }, []);

  return null;
}
