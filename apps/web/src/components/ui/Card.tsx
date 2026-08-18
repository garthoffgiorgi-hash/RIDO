import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "md";
  tone?: "white" | "ivory" | "midnight";
  children: ReactNode;
}

const TONE_CLASSES: Record<NonNullable<CardProps["tone"]>, string> = {
  white: "bg-white border-mist",
  ivory: "bg-ivory border-mist",
  midnight: "bg-midnight border-midnight",
};

/**
 * The signature surface — white (or ivory/midnight) card, 1px Mist border, tonal lift.
 * Borders and lift, never shadows, per brand/design-system.md.
 */
export function Card({
  size = "md",
  tone = "white",
  className = "",
  children,
  ...rest
}: CardProps) {
  const radius = size === "sm" ? "rounded-card-sm" : "rounded-card";
  const padding = size === "sm" ? "p-5" : "p-6";

  return (
    <div className={`border ${TONE_CLASSES[tone]} ${radius} ${padding} ${className}`} {...rest}>
      {children}
    </div>
  );
}
