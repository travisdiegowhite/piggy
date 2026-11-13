import "server-only";

// SimpleFIN protocol client. https://www.simplefin.org/protocol.html
// Supports both v2 (connections[] + account.conn_id) and v1 (account.org) shapes.

export type SfinTransaction = {
  id: string;
  posted: number; // epoch seconds; 0 if pending
  amount: string;
  description: string;
  payee?: string;
  memo?: string;
  transacted_at?: number;
  pending?: boolean;
};

export type SfinHolding = {
  id: string;
  symbol?: string;
  description?: string;
  shares?: string;
  market_value?: string;
  cost_basis?: string;
  currency?: string;
};

export type SfinAccount = {
  id: string;
  name: string;
  conn_id?: string;
  org?: { name?: string; domain?: string };
  currency: string;
  balance: string;
  "available-balance"?: string;
  "balance-date": number;
  transactions?: SfinTransaction[];
  holdings?: SfinHolding[];
  extra?: Record<string, unknown>;
};

export type SfinAccountSet = {
  errlist?: { code: string; msg: string; conn_id?: string; account_id?: string }[];
  errors?: string[];
  connections?: { conn_id: string; name: string; org_id: string; org_name?: string }[];
  accounts: SfinAccount[];
};

/** Exchange a one-time setup token for a permanent access URL. */
export async function claimSetupToken(setupToken: string): Promise<string> {
  let claimUrl: string;
  try {
    claimUrl = Buffer.from(setupToken.trim(), "base64").toString("utf8");
    new URL(claimUrl);
  } catch {
    throw new Error("That doesn't look like a SimpleFIN setup token.");
  }
  const res = await fetch(claimUrl, { method: "POST", headers: { "Content-Length": "0" } });
  if (res.status === 403) {
    throw new Error(
      "Token was already claimed or doesn't exist. If you didn't claim it, disable it in SimpleFIN Bridge.",
    );
  }
  if (!res.ok) throw new Error(`Claim failed (${res.status})`);
  const accessUrl = (await res.text()).trim();
  new URL(accessUrl); // validate
  return accessUrl;
}

/** Fetch accounts (+ transactions) for a date window. */
export async function fetchAccounts(
  accessUrl: string,
  opts: { start?: Date; end?: Date; balancesOnly?: boolean } = {},
): Promise<SfinAccountSet> {
  const u = new URL(accessUrl);
  const auth = Buffer.from(
    `${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`,
  ).toString("base64");
  u.username = "";
  u.password = "";
  const url = new URL(u.toString().replace(/\/$/, "") + "/accounts");
  url.searchParams.set("version", "2");
  url.searchParams.set("pending", "1");
  if (opts.start) url.searchParams.set("start-date", String(Math.floor(+opts.start / 1000)));
  if (opts.end) url.searchParams.set("end-date", String(Math.floor(+opts.end / 1000)));
  if (opts.balancesOnly) url.searchParams.set("balances-only", "1");

  const res = await fetch(url, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (res.status === 402) throw new Error("SimpleFIN subscription payment required.");
  if (res.status === 403) throw new Error("SimpleFIN access was revoked — reconnect in Settings.");
  if (!res.ok) throw new Error(`SimpleFIN request failed (${res.status})`);
  return (await res.json()) as SfinAccountSet;
}

export function sfinErrors(set: SfinAccountSet): string[] {
  return [...(set.errlist ?? []).map((e) => `${e.code}: ${e.msg}`), ...(set.errors ?? [])];
}

/** Org/institution name regardless of protocol version. */
export function orgName(set: SfinAccountSet, a: SfinAccount): string | null {
  if (a.org?.name) return a.org.name;
  const c = set.connections?.find((c) => c.conn_id === a.conn_id);
  return c?.org_name ?? c?.name ?? null;
}

/** Best-effort account type from name + balance sign. User can override. */
export function guessAccountType(a: SfinAccount): string {
  const n = a.name.toLowerCase();
  if (a.holdings?.length) return /ira|401|403|roth|retire|hsa/.test(n) ? "retirement" : "investment";
  if (/ira|401\(?k|403\(?b|roth|retire/.test(n)) return "retirement";
  if (/brokerage|invest|individual|stock|crypto/.test(n)) return "investment";
  if (/credit|card|visa|amex|mastercard|sapphire|freedom|venture/.test(n)) return "credit";
  if (/mortgage|loan|auto|student|heloc/.test(n)) return "loan";
  if (/saving|money market|hysa|reserve/.test(n)) return "savings";
  if (/checking|chk|spend/.test(n)) return "checking";
  return Number(a.balance) < 0 ? "credit" : "other";
}
