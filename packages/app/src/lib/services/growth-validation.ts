import { z } from "zod";

// ============================================================
// Contact
// ============================================================

export const createContactSchema = z.object({
  action: z.literal("create"),
  userAddress: z.string().optional(),
  phone: z.string().optional(),
  wechat: z.string().optional(),
  name: z.string().optional(),
  source: z.string().optional(),
});

export const assignContactSchema = z.object({
  action: z.literal("assign"),
  contactId: z.string().min(1),
  assignedTo: z.string().min(1),
});

export const tagContactSchema = z.object({
  action: z.literal("tag"),
  contactId: z.string().min(1),
  tags: z.array(z.string()),
});

export const scoreContactSchema = z.object({
  action: z.literal("score"),
  contactId: z.string().min(1),
  score: z.number().int().min(0).max(100),
});

export const lifecycleContactSchema = z.object({
  action: z.literal("lifecycle"),
  contactId: z.string().min(1),
  lifecycle: z.enum(["stranger", "visitor", "lead", "customer", "promoter"]),
});

export const contactActionSchema = z.discriminatedUnion("action", [
  createContactSchema,
  assignContactSchema,
  tagContactSchema,
  scoreContactSchema,
  lifecycleContactSchema,
]);

// ============================================================
// Campaign
// ============================================================

export const createCampaignSchema = z.object({
  channelId: z.string().min(1),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  budget: z.number().positive().optional(),
  targetKpi: z.string().max(200).optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  utmCampaign: z.string().max(100).optional(),
  landingPage: z.string().max(200).optional(),
});

export const updateCampaignSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  status: z.enum(["draft", "active", "paused", "completed"]).optional(),
  budget: z.number().positive().optional(),
  spent: z.number().min(0).optional(),
});

// ============================================================
// Asset
// ============================================================

export const createAssetSchema = z.object({
  campaignId: z.string().min(1),
  type: z.enum(["image", "video", "text", "link", "qrcode"]),
  title: z.string().max(200).optional(),
  url: z.string().url().optional(),
  content: z.string().max(2000).optional(),
});

// ============================================================
// Follow-up
// ============================================================

export const addFollowUpSchema = z.object({
  action: z.enum(["call", "wechat", "sms", "note", "status_change"]),
  content: z.string().min(1).max(2000),
  result: z
    .enum(["interested", "not_interested", "no_answer", "converted", "follow_later"])
    .optional(),
  nextFollowAt: z.string().datetime().optional(),
  operatorId: z.string().optional(),
});

// ============================================================
// Channel
// ============================================================

export const upsertChannelSchema = z.object({
  code: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9_]+$/),
  name: z.string().min(1).max(50),
  icon: z.string().max(10).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  monthlyBudget: z.number().positive().optional(),
});

// ============================================================
// Automation
// ============================================================

export const createAutomationSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  trigger: z.record(z.unknown()),
  action: z.record(z.unknown()),
  priority: z.number().int().min(0).max(100).optional(),
});

export const toggleAutomationSchema = z.object({
  id: z.string().min(1),
  active: z.boolean(),
});

// ============================================================
// Track (public endpoint)
// ============================================================

export const trackEventSchema = z.object({
  contactId: z.string().optional(),
  userAddress: z.string().optional(),
  channelCode: z.string().min(1).max(50),
  touchType: z.enum(["visit", "click", "register", "order", "referral", "return"]).optional(),
  campaignId: z.string().optional(),
  orderId: z.string().optional(),
  orderAmount: z.number().positive().optional(),
});
