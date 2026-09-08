/**
 * `next` is attacker-controllable — it arrives in a URL anyone can craft and send, so every
 * consumer (this app's `/login`, `/signup`, `/auth/confirm`, `/auth/landing`) runs it through this
 * one module rather than re-deriving the rules. Pure, no I/O — importable from a Client Component
 * and a Route Handler alike, which is exactly why it can't live in `server.ts`.
 *
 * Only a same-origin relative path is ever honoured:
 * - Absent, or not starting with `/` at all (`https://evil.example`, `mailto:...`) → invalid.
 * - A leading `//` reads as protocol-relative and absolute to a browser → invalid.
 * - A leading `/\` is not caught by the `//` check, but Chrome and Safari normalise a backslash
 *   to a forward slash in a `Location` header, turning `/\evil.example` into the same
 *   protocol-relative hazard by the time the browser acts on it → invalid.
 * - A control character (a raw newline can smuggle a second header into some proxies/clients)
 *   anywhere in the string → invalid.
 * - `/login` or `/signup` — landing an already-authenticated visitor back on a sign-in form is
 *   pointless, so these are rejected on hygiene grounds. Compared on the path alone, ignoring any
 *   query or hash it carries.
 *
 * **`/auth/landing` is deliberately NOT on that list**, despite being where every consumer above
 * eventually sends a browser. It's the landing rule's own default (ADR-0023) — `lib/auth/browser.ts`
 * builds an email-confirmation link carrying exactly `next=/auth/landing` when nothing more
 * specific was requested — so rejecting it here would make that default inert, silently
 * coercing every email-link sign-in back to a hardcoded page. It was never actually loop-dangerous
 * to allow: a redirect target here never carries the query it was reached with onward, so the
 * worst case is one harmless extra hop before the chain terminates, not a cycle.
 */
const SELF_REFERENTIAL = ["/login", "/signup"];

/**
 * The validator with no fallback baked in — `null` means "there is no usable explicit
 * destination," which matters to a caller like `landingPath()` that needs to tell "nothing was
 * requested" apart from "the caller's own default was requested," two states `safeNext`'s
 * fallback-replacing API collapses into one. `safeNext` below is this function with a fallback.
 */
export function validNext(requested: string | null | undefined): string | null {
  if (!requested) return null;
  if (!requested.startsWith("/")) return null;
  if (requested.startsWith("//")) return null;
  if (requested.startsWith("/\\")) return null;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: exactly what this line checks for.
  if (/[\x00-\x1f]/.test(requested)) return null;

  const path = requested.split(/[?#]/)[0] ?? requested;
  if (SELF_REFERENTIAL.includes(path)) return null;

  return requested;
}

export function safeNext(requested: string | null | undefined, fallback = "/account"): string {
  return validNext(requested) ?? fallback;
}
