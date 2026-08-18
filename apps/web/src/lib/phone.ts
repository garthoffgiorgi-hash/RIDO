/**
 * Phone numbers go to Supabase in E.164 (`+15551234567`) — it rejects anything else, and the
 * error it returns for a malformed number is not one a user could act on.
 *
 * Normalising here rather than at each call site means the two auth surfaces (login, signup)
 * can't disagree about what a valid number looks like.
 */

/**
 * Returns the number in E.164, or `null` if it can't be read as one.
 *
 * A number typed without a country code is assumed to be US — the first market is San Diego
 * (root CLAUDE.md). Anyone outside it types a leading `+`, which is always honoured.
 */
export function toE164(input: string): string | null {
  const trimmed = input.trim();
  const explicitCountryCode = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");

  if (!digits) return null;

  if (explicitCountryCode) {
    // E.164 caps at 15 digits; nothing real is shorter than 8 including the country code.
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }

  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;

  return null;
}

/** Formats a US E.164 number back for display: `+15551234567` -> `(555) 123-4567`. */
export function formatPhoneForDisplay(e164: string): string {
  const match = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return match ? `(${match[1]}) ${match[2]}-${match[3]}` : e164;
}
