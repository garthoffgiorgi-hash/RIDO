/**
 * Supabase auth errors, restated in RIDO's voice: what happened and how to fix it, no apology
 * and no blame (brand/brand-guide.md).
 *
 * Unrecognised errors fall back to a generic line rather than surfacing the raw server message —
 * those are inconsistent in tone and can say more about account existence than a login form
 * should. In development the raw message is appended to that fallback and logged, because a
 * generic string with no way back to the cause costs more debugging time than it saves.
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

  // Project-configuration failures. These are ours, not the user's — say so plainly rather than
  // implying they typed something wrong, and let the dev-only detail below carry the specifics.
  if (m.includes("not authorized")) {
    return "We can't send to that address yet. Try the address on the RIDO Supabase account, or set up custom SMTP.";
  }
  if (m.includes("error sending") || m.includes("failed to send")) {
    return "We couldn't send that message. Check the email or SMS provider settings.";
  }
  if (m.includes("database error")) {
    return "We couldn't finish creating the account. Try again in a moment.";
  }
  if (m.includes("sms") || m.includes("phone provider") || m.includes("unsupported phone")) {
    return "Text messages aren't set up yet. Use email for now.";
  }
  if (m.includes("invalid api key") || m.includes("no api key")) {
    return "This app isn't configured correctly. Check the Supabase keys in .env.local.";
  }

  if (m.includes("not found") || m.includes("no user")) {
    return "No account with those details. Sign up to get started.";
  }

  const generic = "Something went wrong on our end. Try again in a moment.";
  return process.env.NODE_ENV === "production" ? generic : `${generic} (dev: ${raw})`;
}
