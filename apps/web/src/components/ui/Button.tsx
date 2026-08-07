import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "accent" | "ghost";
type Size = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-midnight text-white hover:bg-midnight/90",
  accent: "bg-signal text-white hover:bg-signal/90",
  secondary: "bg-white text-ink border border-mist hover:bg-ivory",
  ghost: "bg-transparent text-slate hover:bg-ink/5",
};

// Same variants, tuned to sit on a Midnight surface (e.g. the About page's mission hero).
const VARIANT_CLASSES_INVERT: Record<Variant, string> = {
  primary: "bg-white text-midnight hover:bg-white/90",
  accent: "bg-signal text-white hover:bg-signal/90",
  secondary: "bg-transparent text-white border border-white/30 hover:bg-white/10",
  ghost: "bg-transparent text-white/80 hover:bg-white/10",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "h-10 px-4 text-sm gap-1.5",
  md: "h-11 px-5 text-[15px] gap-2",
  lg: "h-14 px-7 text-base gap-2",
};

interface CommonProps {
  variant?: Variant;
  size?: Size;
  invert?: boolean;
  fullWidth?: boolean;
  className?: string;
  children: ReactNode;
}

type ButtonAsButton = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof CommonProps> & {
    href?: undefined;
  };

type ButtonAsLink = CommonProps & {
  href: string;
};

type ButtonProps = ButtonAsButton | ButtonAsLink;

function classes({
  variant = "primary",
  size = "md",
  invert = false,
  fullWidth = false,
  className = "",
}: Omit<CommonProps, "children">) {
  const variantClasses = invert ? VARIANT_CLASSES_INVERT[variant] : VARIANT_CLASSES[variant];
  return [
    "inline-flex items-center justify-center rounded-input font-bold whitespace-nowrap",
    "transition-[transform,background-color] duration-150 ease-standard active:scale-[0.98]",
    "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-signal/50",
    "disabled:opacity-50 disabled:pointer-events-none",
    variantClasses,
    SIZE_CLASSES[size],
    fullWidth ? "w-full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Brand button primitive — primary/secondary/accent/ghost, per brand/design-system.md #3. */
export function Button(props: ButtonProps) {
  const { variant, size, invert, fullWidth, className, children, href, ...domProps } = props;
  const shared = { variant, size, invert, fullWidth, className };

  if (href !== undefined) {
    return (
      <Link href={href} className={classes(shared)}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes(shared)} {...(domProps as ButtonHTMLAttributes<HTMLButtonElement>)}>
      {children}
    </button>
  );
}
