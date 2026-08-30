/**
 * `complete-ride`'s HTTP responses, turned into what a driver should see and whether tapping
 * Complete ride again is safe. Same shape as `src/lib/maps/errors.ts` — a dedicated, tested
 * mapping file rather than inline `if` statements at the call site — but a different job: Mapbox
 * hands back vendor jargon that needs translating into RIDO's voice, while `complete-ride`'s own
 * `error` bodies are already written in it (`"You are not the driver on this ride."`, not an
 * error code). What this file actually decides is **retryability**, which the status code alone
 * doesn't carry.
 *
 * The one case worth getting exactly right: `complete-ride/index.ts` returns HTTP 409 for two
 * completely different reasons.
 *   - "Ride X is 'canceled' and cannot be completed." — a terminal refusal. The ride will never
 *     become completable by trying again.
 *   - "...could not be completed after 3 attempts — this driver has other completions landing
 *     concurrently. Retry." — every attempt lost the compare-and-swap race and nothing was
 *     written (`ride-completion.md`), so a retry is not just safe, it's the intended recovery.
 * Collapsing those into one "try again?" would either strand a driver on a refusal that will
 * never change, or invite them to hammer one that won't help.
 */

export interface CompletionErrorInput {
  /** The HTTP status, when a response came back at all. Absent for a network-level failure. */
  readonly status?: number;
  /** The function's `error` field, or the caught exception's message for a network failure. */
  readonly raw?: string;
}

export interface CompletionErrorResult {
  readonly message: string;
  readonly retryable: boolean;
}

const GENERIC = "We couldn't complete that ride. Try again in a moment.";

/** The exact wording is `supabase/functions/complete-ride/index.ts`'s — matched, not restated. */
function isRetryLimitConflict(raw: string): boolean {
  const m = raw.toLowerCase();
  return m.includes("attempts") && m.includes("concurrently");
}

export function completionErrorMessage(input: CompletionErrorInput): CompletionErrorResult {
  const { status, raw } = input;

  if (process.env.NODE_ENV !== "production") {
    console.warn("[complete-ride]", JSON.stringify({ status, raw }));
  }

  // No status at all: the request never got a response — a network failure, an abort, or a
  // timeout, not anything complete-ride itself said. Nothing was written in any of these cases
  // (the fetch didn't reach the server, or didn't come back), so a retry is always safe here.
  if (status === undefined) {
    const m = (raw ?? "").toLowerCase();
    if (m.includes("abort") || m.includes("timeout") || m.includes("timed out")) {
      return { message: "That took too long. Try again.", retryable: true };
    }
    return {
      message:
        "We couldn't reach the server to complete that ride. Check your connection and try again.",
      retryable: true,
    };
  }

  if (status === 409 && raw && isRetryLimitConflict(raw)) {
    return {
      message: "That took a moment too long to confirm. Try completing the ride again.",
      retryable: true,
    };
  }

  // Every other 409, plus 401/403/404: authorizeCompletion's own refusals, or the ride simply
  // doesn't exist. All terminal — the state that caused them doesn't change by retrying.
  if (status === 401 || status === 403 || status === 404 || status === 409) {
    return { message: raw ?? GENERIC, retryable: false };
  }

  // 5xx: complete-ride's own catch-all, or the platform gateway. Not a refusal about this ride —
  // worth trying again.
  if (status >= 500) {
    return { message: raw ?? GENERIC, retryable: true };
  }

  return { message: raw ?? GENERIC, retryable: false };
}
