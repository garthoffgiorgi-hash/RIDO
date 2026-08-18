"use client";

// Shared rider/driver login. Not placed in (rider)/ or (driver)/ since the same flow serves
// both — revisit if that stops being true. Post-login destination is /account for both roles
// for now — split rider/driver once there's a way to tell them apart (a `role` on the driver
// row, most likely) rather than guessing here.
//
// This file owns presentation and form state only. Every auth operation goes through
// @/lib/auth/browser, which is where "sign-in never creates an account" is enforced.

import { Loader2, MailCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useState } from "react";
import { Wordmark } from "@/components/domain/Wordmark";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import {
  resendPhoneCode,
  sendSignInCode,
  sendSignInLink,
  signInWithPassword,
  verifyPhoneCode,
} from "@/lib/auth/browser";
import { formatPhoneForDisplay } from "@/lib/phone";

type Mode = "password" | "email-link" | "phone";

const MODES = [
  { value: "password", label: "Password" },
  { value: "email-link", label: "Email link" },
  { value: "phone", label: "Phone" },
] as const satisfies readonly { value: Mode; label: string }[];

const LINK_ERRORS: Record<string, string> = {
  link_invalid: "That link isn't valid. Request a new one below.",
  link_expired: "That link expired. Request a new one below.",
};

export default function LoginPage() {
  return (
    // useSearchParams needs a Suspense boundary to avoid opting the whole route into
    // client-side rendering.
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const linkError = LINK_ERRORS[searchParams.get("error") ?? ""] ?? null;

  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [emailLinkSent, setEmailLinkSent] = useState(false);
  // Set once the SMS is away — the E.164 number the code went to, which is what verification
  // must use rather than re-reading the input.
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);

  function resetFeedback() {
    setError(null);
    setNotice(null);
  }

  function switchMode(next: Mode) {
    setMode(next);
    resetFeedback();
    setEmailLinkSent(false);
    setCodeSentTo(null);
    setCode("");
  }

  function goToAccount() {
    router.push("/account");
    router.refresh();
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    resetFeedback();
    setLoading(true);

    if (mode === "password") {
      const result = await signInWithPassword(email, password);
      if (!result.ok) {
        setError(result.message);
        setLoading(false);
        return;
      }
      goToAccount();
      return;
    }

    if (mode === "email-link") {
      const result = await sendSignInLink(email);
      if (!result.ok) setError(result.message);
      else setEmailLinkSent(true);
      setLoading(false);
      return;
    }

    const result = await sendSignInCode(phone);
    if (!result.ok) setError(result.message);
    else setCodeSentTo(result.data.sentTo);
    setLoading(false);
  }

  async function handleVerifyCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!codeSentTo) return;
    resetFeedback();
    setLoading(true);

    const result = await verifyPhoneCode(codeSentTo, code);
    if (!result.ok) {
      setError(result.message);
      setLoading(false);
      return;
    }
    goToAccount();
  }

  async function handleResendCode() {
    if (!codeSentTo) return;
    resetFeedback();
    setLoading(true);

    // `false` — a resend on the login page still can't register a new number.
    const result = await resendPhoneCode(codeSentTo, false);
    if (!result.ok) setError(result.message);
    else setNotice("Sent. Check your messages again.");
    setLoading(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-ivory p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Wordmark size={28} />
        </div>

        <Card>
          <h1 className="mb-1 font-sora text-2xl font-bold text-midnight">Log in</h1>
          <p className="mb-6 text-sm text-slate">Riders and drivers use the same account.</p>

          <SegmentedControl
            label="Log in method"
            options={MODES}
            value={mode}
            onChange={switchMode}
            className="mb-5"
          />

          {mode === "email-link" && emailLinkSent ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-signal/8 text-signal">
                <MailCheck size={22} strokeWidth={2} />
              </span>
              <p className="text-sm text-ink">
                Check <span className="font-semibold">{email}</span> for your link.
              </p>
              <button
                type="button"
                onClick={() => setEmailLinkSent(false)}
                className="text-[13px] font-semibold text-signal no-underline hover:text-midnight"
              >
                Use a different email
              </button>
            </div>
          ) : mode === "phone" && codeSentTo ? (
            <>
              <p className="mb-5 text-sm text-slate">
                We texted a code to{" "}
                <span className="font-semibold text-ink">{formatPhoneForDisplay(codeSentTo)}</span>.
              </p>

              <form onSubmit={handleVerifyCode} className="flex flex-col gap-4" noValidate>
                <Input
                  label="Six-digit code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  disabled={loading}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="123456"
                  className="tabular tracking-[0.3em]"
                />

                {error ? (
                  <p role="alert" className="text-[13px] text-danger">
                    {error}
                  </p>
                ) : null}
                {notice ? <p className="text-[13px] text-slate">{notice}</p> : null}

                <Button type="submit" fullWidth size="lg" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 size={18} className="animate-spin" strokeWidth={2.5} />
                      Verifying…
                    </>
                  ) : (
                    "Log in"
                  )}
                </Button>
              </form>

              <div className="mt-4 flex justify-center gap-4 text-[13px]">
                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={loading}
                  className="font-semibold text-signal hover:text-midnight disabled:opacity-50"
                >
                  Resend code
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCodeSentTo(null);
                    setCode("");
                    resetFeedback();
                  }}
                  disabled={loading}
                  className="font-semibold text-slate hover:text-ink disabled:opacity-50"
                >
                  Use a different number
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
              {mode === "phone" ? (
                <Input
                  label="Phone number"
                  type="tel"
                  autoComplete="tel"
                  required
                  disabled={loading}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                />
              ) : (
                <Input
                  label="Email"
                  type="email"
                  autoComplete="email"
                  required
                  disabled={loading}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              )}

              {mode === "password" ? (
                <Input
                  label="Password"
                  type="password"
                  autoComplete="current-password"
                  required
                  disabled={loading}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              ) : null}

              {(error ?? linkError) ? (
                <p role="alert" className="text-[13px] text-danger">
                  {error ?? linkError}
                </p>
              ) : null}

              <Button type="submit" fullWidth size="lg" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" strokeWidth={2.5} />
                    {mode === "password"
                      ? "Logging in…"
                      : mode === "email-link"
                        ? "Sending link…"
                        : "Sending code…"}
                  </>
                ) : mode === "password" ? (
                  "Log in"
                ) : mode === "email-link" ? (
                  "Send magic link"
                ) : (
                  "Text me a code"
                )}
              </Button>
            </form>
          )}
        </Card>

        <p className="mt-6 text-center text-sm text-slate">
          New to rido?{" "}
          <Link
            href="/signup"
            className="font-semibold text-signal no-underline hover:text-midnight"
          >
            Create an account
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
