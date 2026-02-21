import { z } from "zod";
import { normalizeSuiAddress, isValidSuiAddress } from "@mysten/sui/utils";

const SUI_ADDRESS_RE = /^0x[0-9a-fA-F]{1,64}$/;

export const suiAddress = z
  .string()
  .refine((v) => SUI_ADDRESS_RE.test(v), { message: "Invalid SUI address" })
  .transform((v) => normalizeSuiAddress(v))
  .refine((v) => isValidSuiAddress(v), { message: "Invalid SUI address" });

export const optionalSuiAddress = z
  .string()
  .optional()
  .transform((v) => {
    if (!v) return undefined;
    if (!SUI_ADDRESS_RE.test(v)) return "__invalid__";
    return normalizeSuiAddress(v);
  })
  .refine((v) => v === undefined || isValidSuiAddress(v), { message: "Invalid SUI address" });
