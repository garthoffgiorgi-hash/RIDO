"use client";

import { type ReactNode, useEffect, useId, useRef } from "react";

export interface SheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Accessible name for the dialog. Rendered visually hidden — the visible heading, if any, is the caller's. */
  readonly title: string;
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * The bottom sheet `brand/design-system.md:80` describes as "the rideshare workhorse (request,
 * driver-matched, in-progress)" and nothing in this repo had built. White, top radius 18, slides
 * over a dimmed map. No dependency — no Radix, no vaul; this repo carries neither.
 *
 * Always mounted so the close transition can play — visibility and interactivity are driven by
 * `open` through CSS, not by conditionally rendering the DOM. `--shadow-sheet`, `--ease-sheet` and
 * `duration-sheet` are exactly the tokens `globals.css` already carries for this component; the
 * backdrop dim (`bg-ink/40`) had no value specified anywhere and is recorded here as the first one
 * — see `brand/design-system.md` section 6.
 *
 * Owns what a real dialog owns: `Escape` closes, `Tab` cycles within it while open, focus moves in
 * on open and back to whatever had it on close, and the page behind it can't scroll.
 */
export function Sheet({ open, onClose, title, children, className }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const labelId = useId();

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusable = (): HTMLElement[] =>
      Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        ),
      );

    (focusable()[0] ?? panel).focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    panel.addEventListener("keydown", onKeyDown);
    return () => {
      panel.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [open]);

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-ink/40 transition-opacity duration-sheet ease-sheet ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        tabIndex={-1}
        className={`fixed inset-x-0 bottom-0 z-50 rounded-t-card border-t border-mist bg-white shadow-[var(--shadow-sheet)] transition-transform duration-sheet ease-sheet ${
          open ? "translate-y-0" : "translate-y-full"
        } ${className ?? ""}`}
      >
        <h2 id={labelId} className="sr-only">
          {title}
        </h2>
        {children}
      </div>
    </>
  );
}
