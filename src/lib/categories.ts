// Default category set + built-in keyword matching. User rules always win.

export type CategoryGroup = "income" | "essentials" | "lifestyle" | "savings" | "transfer";

export const DEFAULT_CATEGORIES: { name: string; group: CategoryGroup; color: string }[] = [
  { name: "Paycheck", group: "income", color: "#16a34a" },
  { name: "Other Income", group: "income", color: "#4ade80" },
  { name: "Rent & Mortgage", group: "essentials", color: "#0f766e" },
  { name: "Utilities", group: "essentials", color: "#0891b2" },
  { name: "Groceries", group: "essentials", color: "#65a30d" },
  { name: "Insurance", group: "essentials", color: "#475569" },
  { name: "Healthcare", group: "essentials", color: "#e11d48" },
  { name: "Auto & Gas", group: "essentials", color: "#ea580c" },
  { name: "Phone & Internet", group: "essentials", color: "#0284c7" },
  { name: "Restaurants", group: "lifestyle", color: "#f59e0b" },
  { name: "Coffee", group: "lifestyle", color: "#92400e" },
  { name: "Shopping", group: "lifestyle", color: "#a855f7" },
  { name: "Cycling", group: "lifestyle", color: "#2563eb" },
  { name: "Subscriptions", group: "lifestyle", color: "#7c3aed" },
  { name: "Travel", group: "lifestyle", color: "#06b6d4" },
  { name: "Entertainment", group: "lifestyle", color: "#db2777" },
  { name: "Home", group: "lifestyle", color: "#78716c" },
  { name: "Gifts & Donations", group: "lifestyle", color: "#f43f5e" },
  { name: "Business", group: "lifestyle", color: "#334155" },
  { name: "Fees", group: "lifestyle", color: "#dc2626" },
  { name: "Taxes", group: "essentials", color: "#525252" },
  { name: "Investments", group: "savings", color: "#059669" },
  { name: "Transfer", group: "transfer", color: "#94a3b8" },
  { name: "Credit Card Payment", group: "transfer", color: "#94a3b8" },
];

// Ordered: first match wins. Patterns are tested against "description payee".
const KEYWORDS: [RegExp, string][] = [
  [/payroll|direct dep|salary|paycheck/i, "Paycheck"],
  [/interest paid|dividend|refund|cashback|cash back/i, "Other Income"],
  [/autopay|payment thank you|card payment|crd pmt|credit card pmt|epay|applecard gsbank/i, "Credit Card Payment"],
  [/transfer|xfer|zelle|venmo|cash app|paypal transfer|online banking/i, "Transfer"],
  [/vanguard|fidelity|schwab|robinhood|betterment|wealthfront|coinbase/i, "Investments"],
  [/mortgage|\brent\b|apartment|property mgmt/i, "Rent & Mortgage"],
  [/xcel|energy|water|utility|waste mgmt|republic services/i, "Utilities"],
  [/comcast|xfinity|verizon|t-mobile|at&t|spectrum|google fi|mint mobile/i, "Phone & Internet"],
  [/king soopers|safeway|whole foods|trader joe|sprouts|costco|natural grocers|grocery|kroger|aldi/i, "Groceries"],
  [/geico|state farm|progressive|allstate|insurance/i, "Insurance"],
  [/pharmacy|cvs|walgreens|medical|dental|clinic|hospital|kaiser|uchealth/i, "Healthcare"],
  [/shell|exxon|chevron|conoco|phillips 66|sinclair|loaf n jug|\bgas\b|fuel|jiffy|auto parts|car wash|parking|toll/i, "Auto & Gas"],
  [/starbucks|dutch bros|coffee|espresso|peet/i, "Coffee"],
  [/doordash|uber eats|grubhub|restaurant|cafe|grill|pizza|taco|burger|chipotle|kitchen|brew|tavern|bar /i, "Restaurants"],
  [/bike|cycl|rei |strava|zwift|trainerroad|wahoo|garmin|competitive cyclist|jenson/i, "Cycling"],
  [/netflix|spotify|hulu|disney|youtube|apple\.com\/bill|icloud|patreon|substack|openai|anthropic|claude\.ai|github|vercel|supabase/i, "Subscriptions"],
  [/airline|united air|southwest|delta|frontier|airbnb|hotel|marriott|hilton|expedia/i, "Travel"],
  [/amazon|amzn|target|walmart|best buy|etsy|ebay/i, "Shopping"],
  [/home depot|lowe|ikea|ace hardware/i, "Home"],
  [/\birs\b|\btax(es)?\b|dept of revenue/i, "Taxes"],
  [/\bfees?\b|overdraft|finance charge/i, "Fees"],
];

export type Rule = { pattern: string; category_id: string; priority: number };

/** Returns { categoryId, source } or null. */
export function categorize(
  text: string,
  rules: Rule[],
  categoryIdByName: Map<string, string>,
): { categoryId: string; source: "rule" | "default" } | null {
  const hay = text.toLowerCase();
  for (const r of [...rules].sort((a, b) => a.priority - b.priority)) {
    if (r.pattern && hay.includes(r.pattern.toLowerCase())) {
      return { categoryId: r.category_id, source: "rule" };
    }
  }
  for (const [re, name] of KEYWORDS) {
    if (re.test(text)) {
      const id = categoryIdByName.get(name);
      if (id) return { categoryId: id, source: "default" };
    }
  }
  return null;
}
