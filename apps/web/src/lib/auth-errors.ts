/**
 * Supabase auth errors, restated in RIDO's voice: what happened and how to fix it, no apology
 * and no blame (brand/brand-guide.md).
 *
 * Unrecognised errors fall back to a generic line rather than surfacing the raw server message —
 * those are inconsistent in tone and can say more about account existence than a login form
 * should. The raw message still goes to the console so it's debuggable.
 */
export function authErrorMessage(raw: string): string {
  if (process.env.NODE_ENV !== "production") {
    console.warn("[auth]", raw);
  }

  const m = raw.toLowerCase();

  if (m.includes("invalid login credentials")) {
    return "That email and password don't match. Check both and try again.";
  }
  if (m.includes("email not confirmed")) {
    return "Confirm your email first — check your inbox for the link we sent.";
  }
  if (m.includes("already registered") || m.includes("already been registered")) {
    return "That email already has an account. Log in instead.";
  }
  if (m.includes("signups not allowed") || m.includes("signup is disabled")) {
    return "New accounts aren't open right now.";
  }
  if (m.includes("password should be") || m.includes("password must")) {
    return "Passwords need at least 6 characters.";
  }
  if (m.includes("expired")) {
    return "That code expired. Send a new one.";
  }
  if (m.includes("invalid") && (m.includes("token") || m.includes("otp"))) {
    return "That code isn't right. Check it and try again.";
  }
  if (m.includes("rate limit") || m.includes("too many") || m.includes("security purposes")) {
    return "Too many tries. Wait a minute, then try again.";
  }
  if (m.includes("not found") || m.includes("no user")) {
    return "No account with that email. Sign up to get started.";
  }

  return "Something went wrong on our end. Try again in a moment.";
}
