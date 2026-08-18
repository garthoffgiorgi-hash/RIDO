"use client";

// The only place an account is created. Login can't do it (see @/lib/auth/browser) — an account
// exists because someone deliberately made one here, which matters for a product where drivers
// are compliance-gated (supabase/CLAUDE.md).
//
// Two ways in, both verified before the account is usable:
//   Email — email + password, then a 6-digit code (or the link in the same email, which
//           /auth/confirm handles, so either works and neither fails silently).
//   Phone — number only, then a 6-digit SMS code. Passwordless: the code is the credential.
//
// Presentation and form state only. Auth operations live in @/lib/auth/browser.

import { Loader2, MailCheck, MessageSquare } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Wordmark } from "@/components/domain/Wordmark";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import {
  resendEmailSignUpCode,
  resendPhoneCode,
  signUpWithEmail,
  signUpWithPhone,
  verifyEmailCode,
  verifyPhoneCode,
} from "@/lib/auth/browser";
import { formatPhoneForDisplay } from "@/lib/phone";

type Method = "email" | "phone";
type Step = "credentials" | "verify";

const METHODS = [
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
] as const satisfies readonly { value: Method; label: string }[];

export default function SignUpPage() {
  const router = useRouter();
  const [method, setMethod] = useState<Method>("email");
  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The E.164 number the code went to — verification uses this, not the raw input.
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);

  function resetFeedback() {
    setError(null);
    setNotice(null);
  }

  function switchMethod(next: Method) {
    setMethod(next);
    setStep("credentials");
    resetFeedback();
    setCode("");
    setCodeSentTo(null);
  }

  async function handleSignUp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    resetFeedback();
    setLoading(true);

    if (method === "email") {
      const result = await signUpWithEmail(email, password);
      if (!result.ok) setError(result.message);
      else setStep("verify");
      setLoading(false);
      return;
    }

    const result = await signUpWithPhone(phone);
    if (!result.ok) {
      setError(result.message);
    } else {
      setCodeSentTo(result.data.sentTo);
      setStep("verify");
    }
    setLoading(false);
  }

  async function handleVerify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    resetFeedback();
    setLoading(true);

    const result =
      method === "email"
        ? await verifyEmailCode(email, code)
        : await verifyPhoneCode(codeSentTo ?? "", code);

    if (!result.ok) {
      setError(result.message);
      setLoading(false);
      return;
    }

    router.push("/account");
    router.refresh();
  }

  async function handleResend() {
    resetFeedback();
    setLoading(true);

    const result =
      method === "email"
        ? await resendEmailSignUpCode(email)
        : // `true` — a resend here is still part of creating the account.
          await resendPhoneCode(codeSentTo ?? "", true);

    if (!result.ok) setError(result.message);
    else
      setNotice(
        method === "email" ? "Sent. Check your inbox again." : "Sent. Check your messages again.",
      );
    setLoading(false);
  }

  const sentTo =
    method === "email" ? email : codeSentTo ? formatPhoneForDisplay(codeSentTo) : phone;

  return (
    <main className="flex min-h-screen items-center justify-center bg-ivory p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Wordmark size={28} />
        </div>

        <Card>
          {step === "credentials" ? (
            <>
              <h1 className="mb-1 font-sora text-2xl font-bold text-midnight">Create an account</h1>
              <p className="mb-5 text-sm text-slate">
                One account for riding and driving. You pick which when you start.
              </p>

              <SegmentedControl
                label="Sign-up method"
                options={METHODS}
                value={method}
                onChange={switchMethod}
                className="mb-5"
              />

              <form onSubmit={handleSignUp} className="flex flex-col gap-4" noValidate>
                {method === "email" ? (
                  <>
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
                    <Input
                      label="Password"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={6}
                      disabled={loading}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
                    />
                  </>
                ) : (
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
                )}

                {error ? (
                  <p role="alert" className="text-[13px] text-danger">
                    {error}
                  </p>
                ) : null}

                <Button type="submit" fullWidth size="lg" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 size={18} className="animate-spin" strokeWidth={2.5} />
                      {method === "email" ? "Creating account…" : "Sending code…"}
                    </>
                  ) : method === "email" ? (
                    "Create account"
                  ) : (
                    "Text me a code"
                  )}
                </Button>
              </form>
            </>
          ) : (
            <>
              <div className="mb-4 flex justify-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-signal/8 text-signal">
                  {method === "email" ? (
                    <MailCheck size={22} strokeWidth={2} />
                  ) : (
                    <MessageSquare size={22} strokeWidth={2} />
                  )}
                </span>
              </div>
              <h1 className="mb-1 text-center font-sora text-2xl font-bold text-midnight">
                {method === "email" ? "Verify your email" : "Verify your number"}
              </h1>
              <p className="mb-6 text-center text-sm text-slate">
                We sent a code to <span className="font-semibold text-ink">{sentTo}</span>.
                {method === "email"
                  ? " Enter it below, or click the link in the email."
                  : " Enter it below."}
              </p>

              <form onSubmit={handleVerify} className="flex flex-col gap-4" noValidate>
                <Input
                  label="Verification code"
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
                    "Verify and continue"
                  )}
                </Button>
              </form>

              <div className="mt-4 flex justify-center gap-4 text-[13px]">
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={loading}
                  className="font-semibold text-signal hover:text-midnight disabled:opacity-50"
                >
                  Resend code
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStep("credentials");
                    resetFeedback();
                    setCode("");
                    setCodeSentTo(null);
                  }}
                  disabled={loading}
                  className="font-semibold text-slate hover:text-ink disabled:opacity-50"
                >
                  {method === "email" ? "Use a different email" : "Use a different number"}
                </button>
              </div>
            </>
          )}
        </Card>

        <p className="mt-6 text-center text-sm text-slate">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-signal no-underline hover:text-midnight"
          >
            Log in
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
