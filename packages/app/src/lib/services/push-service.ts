import "server-only";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_EMAIL = process.env.VAPID_EMAIL || "mailto:admin@qingyi.gg";

type WebPushClient = {
  setVapidDetails(contactEmail: string, publicKey: string, privateKey: string): void;
  sendNotification(
    subscription: PushSubscriptionData,
    payload: string,
    options?: { TTL?: number }
  ): Promise<unknown>;
};

let webPushClientPromise: Promise<WebPushClient | null> | null = null;

async function loadWebPushClient(): Promise<WebPushClient | null> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return null;
  }

  if (!webPushClientPromise) {
    const modulePath = "web-push";
    webPushClientPromise = import(modulePath)
      .then((mod) => {
        const candidate = mod as { default?: WebPushClient };
        const client =
          candidate.default || (mod as unknown as WebPushClient | undefined) || undefined;
        if (!client) return null;
        client.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);
        return client;
      })
      .catch((error) => {
        console.error("[Push] Failed to load web-push", error);
        return null;
      });
  }

  return webPushClientPromise;
}

export type PushSubscriptionData = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

type StoredSub = {
  userAddress: string;
  subscription: PushSubscriptionData;
  createdAt: number;
};

const REDIS_KEY_PREFIX = "push:sub:";

/** Store a push subscription for a user */
export async function savePushSubscription(
  userAddress: string,
  subscription: PushSubscriptionData
): Promise<void> {
  const { setCache } = await import("@/lib/server-cache");
  const key = `${REDIS_KEY_PREFIX}${userAddress}`;
  const data: StoredSub = { userAddress, subscription, createdAt: Date.now() };
  setCache(key, JSON.stringify(data), 30 * 86400_000); // 30 days TTL
}

/** Remove a push subscription */
export async function removePushSubscription(endpoint: string): Promise<void> {
  // We'd need to scan Redis keys — for now, log the removal
  console.log(JSON.stringify({ type: "push_unsubscribe", endpoint, timestamp: Date.now() }));
}

/** Get push subscription for a user */
export async function getPushSubscription(userAddress: string): Promise<StoredSub | null> {
  const { getCache } = await import("@/lib/server-cache");
  const key = `${REDIS_KEY_PREFIX}${userAddress}`;
  const entry = getCache<string>(key);
  if (!entry) return null;
  try {
    return JSON.parse(entry.value);
  } catch {
    return null;
  }
}

/** Send a push notification to a user */
export async function sendPushNotification(
  userAddress: string,
  payload: { title: string; body: string; url?: string; icon?: string }
): Promise<boolean> {
  const webpush = await loadWebPushClient();
  if (!webpush) {
    console.warn("[Push] VAPID keys not configured, skipping push");
    return false;
  }

  const stored = await getPushSubscription(userAddress);
  if (!stored) return false;

  try {
    await webpush.sendNotification(
      {
        endpoint: stored.subscription.endpoint,
        keys: stored.subscription.keys,
      },
      JSON.stringify(payload),
      { TTL: 3600 }
    );
    return true;
  } catch (error: unknown) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    // 410 Gone = subscription expired
    if (statusCode === 410 || statusCode === 404) {
      await removePushSubscription(stored.subscription.endpoint);
    }
    console.error("[Push] Send failed:", error);
    return false;
  }
}
