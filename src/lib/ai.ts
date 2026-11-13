import "server-only";
import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;
/** Lazy so builds don't need ANTHROPIC_API_KEY. */
export function anthropic() {
  return (client ??= new Anthropic());
}
export const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
/** Optional free-text context about you, e.g. "Cyclist in Colorado; runs a small software LLC." */
export const USER_CONTEXT = process.env.FINANCE_USER_CONTEXT ?? "";
