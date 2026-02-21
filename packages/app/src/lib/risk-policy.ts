import { env } from "@/lib/env";

export type DisputePolicy = {
  hours: number;
  ruleSetId: string;
};

const DEFAULT_RULESET_ID = env.NEXT_PUBLIC_QY_RULESET_ID || "1";

function normalizeRuleSet(value?: string): string {
  if (!value) return DEFAULT_RULESET_ID;
  return /^[0-9]+$/.test(value) ? value : DEFAULT_RULESET_ID;
}

export function resolveDisputePolicy(tierLevel?: number): DisputePolicy {
  const level = typeof tierLevel === "number" ? tierLevel : 0;

  if (level >= 4) {
    return {
      hours: 72,
      ruleSetId: normalizeRuleSet(env.NEXT_PUBLIC_QY_RULESET_ID_L4),
    };
  }
  if (level >= 3) {
    return {
      hours: 48,
      ruleSetId: normalizeRuleSet(env.NEXT_PUBLIC_QY_RULESET_ID_L3),
    };
  }
  if (level >= 2) {
    return {
      hours: 36,
      ruleSetId: normalizeRuleSet(env.NEXT_PUBLIC_QY_RULESET_ID_L2),
    };
  }
  return {
    hours: 24,
    ruleSetId: normalizeRuleSet(env.NEXT_PUBLIC_QY_RULESET_ID_L1),
  };
}
