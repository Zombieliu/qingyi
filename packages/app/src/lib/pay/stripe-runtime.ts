import "server-only";

import { env } from "@/lib/env";

export type StripeRuntimePaymentIntent = {
  id?: string;
  status?: string;
  amount?: number;
  currency?: string;
  metadata?: Record<string, string>;
  payment_method_types?: string[];
  next_action?: Record<string, unknown> | null;
  client_secret?: string | null;
};

export type StripeRuntimeEvent = {
  id?: string;
  type?: string;
  data?: {
    object?: StripeRuntimePaymentIntent & Record<string, unknown>;
  };
};

export type StripeRuntimeClient = {
  webhooks: {
    constructEvent(payload: string, signature: string, secret: string): StripeRuntimeEvent;
  };
  paymentIntents: {
    list(
      params: Record<string, unknown>
    ): Promise<{ data: StripeRuntimePaymentIntent[]; has_more: boolean }>;
    create(
      params: Record<string, unknown>,
      options?: Record<string, unknown>
    ): Promise<StripeRuntimePaymentIntent>;
    retrieve(id: string): Promise<StripeRuntimePaymentIntent>;
  };
};

const stripeSecretKey = env.STRIPE_SECRET_KEY;
let stripeClientPromise: Promise<StripeRuntimeClient | null> | null = null;

export function isStripeConfigured() {
  return Boolean(stripeSecretKey);
}

export async function getStripeClient(): Promise<StripeRuntimeClient | null> {
  if (!stripeSecretKey) return null;

  if (!stripeClientPromise) {
    const modulePath = "stripe";
    stripeClientPromise = import(modulePath)
      .then((mod) => {
        const candidate = mod as {
          default?: new (secretKey: string) => StripeRuntimeClient;
        };
        const StripeCtor =
          candidate.default ||
          (mod as unknown as (new (secretKey: string) => StripeRuntimeClient) | undefined);
        if (!StripeCtor) return null;
        return new StripeCtor(stripeSecretKey);
      })
      .catch((error) => {
        console.error("[stripe-runtime] failed to load stripe", error);
        return null;
      });
  }

  return stripeClientPromise;
}
