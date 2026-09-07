/**
 * `next` is attacker-controllable — it arrives in a URL anyone can craft and send, so every
 * consumer (this app's `/login`, `/signup`, `/auth/confirm`, `/auth/landing`) runs it through this
 * one function rather than re-deriving the rules. Pure, no I/O — importable from a Client
 * Component and a Route Handler alike, which is exactly why it can't live in `server.ts`.
 *
 * Only a same-origin relative path is ever honoured:
 * - Absent, or not starting with `/` at all (`https://evil.example`, `mailto:...`) → fallback.
 * - A leading `//` reads as protocol-relative and absolute to a browser → fallback.
 * - A leading `/\` is not caught by the `//` check, but Chrome and Safari normalise a backslash
 *   to a forward slash in a `Location` header, turning `/\evil.example` into the same
 *   protocol-relative hazard by the time the browser acts on it → fallback.
 * - A control character (a raw newline can smuggle a second header into some proxies/clients)
 *   anywhere in the string → fallback.
 * - A path whose own route would immediately produce another `next` redirect back through this
 *   same machinery — `/login`, `/signup`, `/auth/landing` — is rejected so a crafted `next` can't
 *   build a redirect loop. Compared on the path alone, ignoring any query or hash it carries.
 */
const SELF_REFERENTIAL = ["/login", "/signup", "/auth/landing"];

export function safeNext(requested: string | null | undefined, fallback = "/account"): string {
  if (!requested) return fallback;
  if (!requested.startsWith("/")) return fallback;
  if (requested.startsWith("//")) return fallback;
  if (requested.startsWith("/\\")) return fallback;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: exactly what this line checks for.
  if (/[\x00-\x1f]/.test(requested)) return fallback;

  const path = requested.split(/[?#]/)[0] ?? requested;
  if (SELF_REFERENTIAL.includes(path)) return fallback;

  return requested;
}
