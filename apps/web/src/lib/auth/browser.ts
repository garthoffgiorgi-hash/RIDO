/**
 * Browser-side auth operations. **The only place a component's auth intent meets the Supabase
 * SDK.** Pages call these; pages never call `supabase.auth.*` directly.
 *
 * Three things live here so they can't drift apart across surfaces:
 *
 *   1. **Login never creates an account.** `shouldCreateUser: false` is set here, once, on every
 *      sign-in path. A new caller cannot forget it, because a new caller doesn't pass it.
 *      Account creation has exactly one entry point: `signUpWith*`.
 *   2. **Every emailed link routes through `/auth/confirm`.** Supabase's default destination is
 *      its own hosted page, which never establishes a session in this app.
 *   3. **Phone numbers are normalised to E.164 before they leave.** Supabase rejects any other
 *      shape with an error a user can't act on.
 *
 * Server-side operations (reading the session, verifying an email link, signing out) are in
 * ./server.ts, which is `server-only`.
 */

import { createBrowserClient } from "@/lib/supabase/client";
import { toE164 } from "@/lib/phone";
import { authErrorMessage } from "./errors";
import { type AuthResult, failed, succeeded } from "./result";

/** Where a verified email link should land. Relative, same-origin — `/auth/confirm` enforces it. */
const DEFAULT_NEXT = "/account";

const NOT_A_PHONE = "That doesn't look like a phone number. Include the area code.";

function confirmUrl(next: string = DEFAULT_NEXT): string {
  return `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}`;
}

// ---------------------------------------------------------------------------------------------
// Signing in. None of these can create an account.
// ---------------------------------------------------------------------------------------------

export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  const supabase = createBrowserClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error ? failed(authErrorMessage(error.message)) : succeeded;
}

/** Emails a sign-in link. An unknown address errors rather than quietly registering one. */
export async function sendSignInLink(email: string, next?: string): Promise<AuthResult> {
  const supabase = createBrowserClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: confirmUrl(next) },
  });
  return error ? failed(authErrorMessage(error.message)) : succeeded;
}

/**
 * Texts a sign-in code. Resolves with the E.164 number it actually went to — verification must
 * use that exact string, not whatever is still sitting in the input.
 */
export async function sendSignInCode(phone: string): Promise<AuthResult<{ sentTo: string }>> {
  const normalised = toE164(phone);
  if (!normalised) return failed(NOT_A_PHONE);

  const supabase = createBrowserClient();
  const { error } = await supabase.auth.signInWithOtp({
    phone: normalised,
    options: { shouldCreateUser: false },
  });
  return error
    ? failed(authErrorMessage(error.message))
    : { ok: true, data: { sentTo: normalised } };
}

// ---------------------------------------------------------------------------------------------
// Creating an account. The only two functions in the app that can.
// ---------------------------------------------------------------------------------------------

export async function signUpWithEmail(email: string, password: string): Promise<AuthResult> {
  const supabase = createBrowserClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: confirmUrl() },
  });
  return error ? failed(authErrorMessage(error.message)) : succeeded;
}

/** Texts a code that registers the number if it's new. Passwordless — the code is the credential. */
export async function signUpWithPhone(phone: string): Promise<AuthResult<{ sentTo: string }>> {
  const normalised = toE164(phone);
  if (!normalised) return failed(NOT_A_PHONE);

  const supabase = createBrowserClient();
  const { error } = await supabase.auth.signInWithOtp({
    phone: normalised,
    options: { shouldCreateUser: true },
  });
  return error
    ? failed(authErrorMessage(error.message))
    : { ok: true, data: { sentTo: normalised } };
}

// ---------------------------------------------------------------------------------------------
// Verifying a code. Shared by sign-in and sign-up — the code doesn't know which it came from.
// ---------------------------------------------------------------------------------------------

/** Verifies the code from a sign-up confirmation email. */
export async function verifyEmailCode(email: string, code: string): Promise<AuthResult> {
  const supabase = createBrowserClient();
  const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "signup" });
  return error ? failed(authErrorMessage(error.message)) : succeeded;
}

/** Verifies an SMS code. `phone` must be the E.164 string a send returned. */
export async function verifyPhoneCode(phone: string, code: string): Promise<AuthResult> {
  const supabase = createBrowserClient();
  const { error } = await supabase.auth.verifyOtp({ phone, token: code.trim(), type: "sms" });
  return error ? failed(authErrorMessage(error.message)) : succeeded;
}

// ---------------------------------------------------------------------------------------------
// Resending.
// ---------------------------------------------------------------------------------------------

export async function resendEmailSignUpCode(email: string): Promise<AuthResult> {
  const supabase = createBrowserClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: confirmUrl() },
  });
  return error ? failed(authErrorMessage(error.message)) : succeeded;
}

/**
 * Re-sends an SMS code to a number already in a verification flow. `createAccount` mirrors
 * whichever send started it, so a resend on /signup can still register and a resend on /login
 * still can't.
 */
export async function resendPhoneCode(
  e164Phone: string,
  createAccount: boolean,
): Promise<AuthResult> {
  const supabase = createBrowserClient();
  const { error } = await supabase.auth.signInWithOtp({
    phone: e164Phone,
    options: { shouldCreateUser: createAccount },
  });
  return error ? failed(authErrorMessage(error.message)) : succeeded;
}
