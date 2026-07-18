/**
 * Backwards-compatible shim.
 *
 * The real implementation lives under core/features/sms/. This file is
 * kept so existing imports (`@/core/actions/sms`) keep working while the
 * codebase migrates to the feature-first layout.
 */
export {
  checkSmppConnectionAction,
  sendSmsAction,
} from "@/core/features/sms/actions";
export type {
  CheckConnectionResult,
  SendSmsActionResult,
} from "@/core/features/sms/types";
