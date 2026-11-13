const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export const money = (n: number | string | null | undefined) => usd.format(Number(n ?? 0));
export const money0 = (n: number | string | null | undefined) => usd0.format(Number(n ?? 0));
export const compact = (n: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact", style: "currency", currency: "USD", maximumFractionDigits: 1 }).format(n);

/** "YYYY-MM-DD" for local-ish dates (server runs UTC; fine for a personal app). */
export const iso = (d: Date) => d.toISOString().slice(0, 10);

export function monthBounds(ym?: string) {
  const now = new Date();
  const [y, m] = ym && /^\d{4}-\d{2}$/.test(ym) ? ym.split("-").map(Number) : [now.getUTCFullYear(), now.getUTCMonth() + 1];
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  const prev = new Date(Date.UTC(y, m - 2, 1));
  return {
    ym: `${y}-${String(m).padStart(2, "0")}`,
    start: iso(start),
    end: iso(end),
    prevYm: iso(prev).slice(0, 7),
    nextYm: iso(end).slice(0, 7),
    label: start.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
    daysInMonth: new Date(Date.UTC(y, m, 0)).getUTCDate(),
    isCurrent: y === now.getUTCFullYear() && m === now.getUTCMonth() + 1,
    dayOfMonth: now.getUTCDate(),
  };
}

export const shortDate = (d: string) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export const ACCOUNT_TYPES = [
  "checking", "savings", "credit", "investment", "retirement", "loan", "property", "other",
] as const;

export const GROUPS = ["income", "essentials", "lifestyle", "savings", "transfer"] as const;
