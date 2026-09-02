"use client";

/**
 * Segmented control — a pill row where exactly one option is active. Used for the auth surfaces'
 * mode switches (password / email link / phone, and email / phone on sign-up).
 *
 * Generic over the option value so a caller's union type survives: `onChange` hands back the
 * caller's own `Mode`, not a bare `string`.
 */
interface SegmentedControlProps<T extends string> {
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  /** Accessible name for the group, e.g. "Log in method". */
  readonly label: string;
  /**
   * How the selected segment reads. `"default"` is the white lift the auth surfaces use — a mode
   * switch, where neither choice is a *state*. `"accent"` fills it Signal, for a control whose
   * selection means something is live: `brand/design-system.md` requires "online = Signal" for the
   * driver's availability toggle, and this is how that gets honoured without a second primitive.
   */
  readonly tone?: "default" | "accent";
  readonly className?: string;
}

const ACTIVE_CLASSES: Record<"default" | "accent", string> = {
  default: "bg-white text-midnight shadow-[var(--shadow-float)]",
  accent: "bg-signal text-white",
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  tone = "default",
  className = "",
}: SegmentedControlProps<T>) {
  return (
    // <fieldset> rather than a div with role="group" — same semantics, no ARIA needed. Its UA
    // border/padding are reset; the visible grouping is the ivory pill.
    <fieldset className={`m-0 flex gap-1 rounded-input border-0 bg-ivory p-1 ${className}`}>
      <legend className="sr-only">{label}</legend>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={`h-9 flex-1 rounded-[8px] text-[13.5px] font-semibold transition-colors duration-150 ease-standard ${
              active ? ACTIVE_CLASSES[tone] : "text-slate hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </fieldset>
  );
}
