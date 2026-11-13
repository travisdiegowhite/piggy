"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Categorical slots 1+2 from the validated reference palette (CVD-safe pair).
const SERIES_1 = "#2a78d6";
const SERIES_2 = "#eb6834";
const GRID = "#ecebe8";
const AXIS = { fontSize: 11, fill: "#78716c" };

const usd0 = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const compact = (n: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact", style: "currency", currency: "USD", maximumFractionDigits: 1 }).format(n);
const monthLabel = (m: string) =>
  new Date(m + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
const dayLabel = (d: string) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function Tip({
  active,
  payload,
  label,
  labelFmt,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
  labelFmt: (l: string) => string;
}) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="rounded-md border border-[var(--line)] bg-white px-3 py-2 text-xs shadow-sm">
      <div className="mb-1 font-medium text-stone-900">{labelFmt(label)}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-stone-600">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}
          <span className="ml-auto pl-4 font-medium text-stone-900 num">{usd0(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function CashflowChart({ data }: { data: { month: string; income: number; spending: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} barGap={2} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="month" tickFormatter={monthLabel} tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={compact} tick={AXIS} axisLine={false} tickLine={false} width={56} />
        <Tooltip cursor={{ fill: "#f5f5f4" }} content={<Tip labelFmt={(l) => new Date(l + "T00:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })} />} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "#57534e" }} />
        <Bar dataKey="income" name="Income" fill={SERIES_1} radius={[4, 4, 0, 0]} maxBarSize={18} />
        <Bar dataKey="spending" name="Spending" fill={SERIES_2} radius={[4, 4, 0, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function NetWorthChart({ data, height = 260 }: { data: { date: string; net_worth: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="nw" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES_1} stopOpacity={0.18} />
            <stop offset="100%" stopColor={SERIES_1} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="date" tickFormatter={dayLabel} tick={AXIS} axisLine={false} tickLine={false} minTickGap={40} />
        <YAxis tickFormatter={compact} tick={AXIS} axisLine={false} tickLine={false} width={56} domain={["auto", "auto"]} />
        <Tooltip cursor={{ stroke: "#a8a29e", strokeDasharray: "3 3" }} content={<Tip labelFmt={dayLabel} />} />
        <Area type="monotone" dataKey="net_worth" name="Net worth" stroke={SERIES_1} strokeWidth={2} fill="url(#nw)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
