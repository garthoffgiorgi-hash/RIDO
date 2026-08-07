import type { ReactNode } from "react";

interface BadgeProps {
  tone?: "accent" | "neutral";
  children: ReactNode;
}

/** Small pill label — badges like "Now live in San Diego". Radius 999px per design-system.md. */
export function Badge({ tone = "accent", children }: BadgeProps) {
  const toneClasses =
    tone === "accent" ? "bg-signal/8 text-signal" : "bg-ink/5 text-slate";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-[13px] font-semibold ${toneClasses}`}
    >
      {children}
    </span>
  );
}
