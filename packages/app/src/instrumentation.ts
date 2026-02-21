import * as Sentry from "@sentry/nextjs";
import { env } from "@/lib/env";

const dsn = env.SENTRY_DSN;
const tracesSampleRate = env.SENTRY_TRACES_SAMPLE_RATE;
const environment = env.SENTRY_ENVIRONMENT || process.env.VERCEL_ENV || process.env.NODE_ENV;

function initSentry() {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment,
    tracesSampleRate,
    enabled: true,
  });
}

export async function register() {
  initSentry();
}
