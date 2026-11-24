import { useId } from "react";
import { cn } from "@/lib/format";

/** Mohalla mark: two rooftops forming an "M" over a shared street — many shops, one roof. */
export function LogoMark({ className, size = 28 }: { className?: string; size?: number }) {
  // Unique gradient id per instance: a shared id breaks when the first instance is display:none.
  const gid = `mohalla-g-${useId().replace(/:/g, "")}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <defs>
        <linearGradient id={gid} x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#22C6FF" />
          <stop offset="0.55" stopColor="#0A6BD6" />
          <stop offset="1" stopColor="#002E6E" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${gid})`} />
      <path
        d="M8.5 21.5V13.2L12.6 9.6L16 12.6L19.4 9.6L23.5 13.2V21.5"
        stroke="white"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12.6" cy="16.6" r="1.35" fill="white" />
      <circle cx="19.4" cy="16.6" r="1.35" fill="white" />
      <path d="M7 24.8H25" stroke="white" strokeOpacity="0.55" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className, size = 28, wordmark = true }: { className?: string; size?: number; wordmark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark size={size} />
      {wordmark && (
        <span className="text-[17px] font-semibold tracking-[-0.02em] text-ink" style={{ fontSize: size * 0.62 }}>
          Mohalla
        </span>
      )}
    </span>
  );
}
