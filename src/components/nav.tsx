"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/transactions", label: "Transactions" },
  { href: "/budgets", label: "Budgets" },
  { href: "/net-worth", label: "Net worth" },
  { href: "/chat", label: "Ask" },
  { href: "/settings", label: "Settings" },
] as const;

export function Nav() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col">
      {LINKS.map((l) => {
        const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`whitespace-nowrap rounded-md px-2 py-1.5 text-sm ${
              active ? "bg-stone-100 font-medium text-stone-900" : "text-stone-600 hover:bg-stone-50"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
