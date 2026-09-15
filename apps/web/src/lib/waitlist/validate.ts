/**
 * Normalises and validates a waitlist signup before it ever reaches the database. Pure — no
 * DOM, no network — so `server.ts`'s insert can trust its inputs without repeating this logic,
 * and `waitlist_signups`' unique constraint on `email` (schema-level) is comparing values that
 * are already trimmed and lowercased here, not depending on Postgres case-folding.
 */

export type WaitlistInterest = "rider" | "driver" | "both";

const INTERESTS: readonly WaitlistInterest[] = ["rider", "driver", "both"];

// Deliberately loose — this gates what reaches the database, not what counts as deliverable
// email. A stricter pattern rejects real addresses more often than it catches typos.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254; // RFC 5321's own limit — a longer input is never a real address.

/** Trims and lowercases; returns `null` if what's left isn't shaped like an email. */
export function normalizeWaitlistEmail(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || trimmed.length > MAX_EMAIL_LENGTH) return null;
  return EMAIL_PATTERN.test(trimmed) ? trimmed : null;
}

/**
 * Narrows an arbitrary string to `WaitlistInterest`, or `null`. The form only ever sends one of
 * the three literal values, but a Server Action is a public HTTP endpoint underneath — anything
 * reaching it from outside the compiled form has to be checked at runtime, not trusted from the
 * parameter's compile-time type.
 */
export function parseWaitlistInterest(raw: string): WaitlistInterest | null {
  return (INTERESTS as readonly string[]).includes(raw) ? (raw as WaitlistInterest) : null;
}
