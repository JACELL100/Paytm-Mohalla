"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { Home, Mic, ScanLine, ShieldCheck } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/format";

const tabs = [
  { href: "/m", key: "home", icon: Home },
  { href: "/m/talk", key: "talk", icon: Mic },
  { href: "/m/scan", key: "scan", icon: ScanLine },
  { href: "/m/trust", key: "trust", icon: ShieldCheck },
] as const;

export function TabBar() {
  const pathname = usePathname();
  const { t } = useLang();
  const active = tabs.find((x) => (x.href === "/m" ? pathname === "/m" || pathname.startsWith("/m/pools") : pathname.startsWith(x.href)))?.href;
  return (
    <nav
      aria-label="Merchant"
      className="glass absolute inset-x-3 bottom-3 z-40 rounded-[26px] px-2 pb-[max(env(safe-area-inset-bottom),0px)] shadow-[var(--shadow-lift)] hairline md:bottom-5 md:inset-x-4"
    >
      <ul className="grid grid-cols-4">
        {tabs.map((tab) => {
          const on = active === tab.href;
          const Icon = tab.icon;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "relative flex h-[60px] flex-col items-center justify-center gap-0.5 rounded-[20px] text-[11px] font-medium transition-colors",
                  on ? "text-navy dark:text-brand" : "text-ink-3 hover:text-ink-2",
                )}
              >
                {on && (
                  <motion.span
                    layoutId="tab-pill"
                    className="absolute inset-x-1.5 inset-y-1.5 -z-10 rounded-[18px] bg-brand-soft"
                    transition={{ type: "spring", stiffness: 500, damping: 38 }}
                  />
                )}
                <motion.span animate={{ scale: on ? 1.08 : 1, y: on ? -1 : 0 }} transition={{ type: "spring", stiffness: 500, damping: 26 }}>
                  <Icon className="size-[22px]" strokeWidth={on ? 2.3 : 1.9} />
                </motion.span>
                <span>{t(tab.key)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
