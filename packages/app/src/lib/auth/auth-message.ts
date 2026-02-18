export const AUTH_MESSAGE_VERSION = "qy-auth-v2";

export type AuthMessageParams = {
  intent: string;
  address: string;
  timestamp: number;
  nonce: string;
  bodyHash?: string;
};

export function buildAuthMessage(params: AuthMessageParams) {
  const address = params.address.trim().toLowerCase();
  const bodyHash = (params.bodyHash || "").trim();
  return `${AUTH_MESSAGE_VERSION}|${params.intent}|${address}|${params.timestamp}|${params.nonce}|${bodyHash}`;
}
