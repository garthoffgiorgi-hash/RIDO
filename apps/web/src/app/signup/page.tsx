"use client";

// Explicit sign-up path. Login never creates accounts (shouldCreateUser: false there) — an
// account only exists because someone deliberately made one here, which matters for a product
// where drivers are compliance-gated (supabase/CLAUDE.md).
//
// Two-step: credentials, then verify the email. The verification email carries BOTH a 6-digit
// code and a link depending on the Supabase email template — the code box below handles the
// former, /auth/confirm handles the latter, so either works and neither fails silently.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Wordmark } from "@/components/domain/Wordmark";
import { createBrowserClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/auth-errors";

type Step = "credentials" | "verify";

export default function SignUpPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSignUp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createBrowserClient();
    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm?next=/account` },
    });

    setLoading(false);
    if (authError) {
      setError(authErrorMessage(authError.message));
      return;
    }
    setStep("verify");
  }

  async function handleVerify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);

    const supabase = createBrowserClient();
    const { error: authError } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "signup",
    });

    if (authError) {
      setError(authErrorMessage(authError.message));
      setLoading(false);
      return;
    }

    router.push("/account");
    router.refresh();
  }

  async function handleResend() {
    setError(null);
    setNotice(null);
    setLoading(true);

    const supabase = createBrowserClient();
    const { error: authError } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm?next=/account` },
    });

    setLoading(false);
    if (authError) {
      setError(authErrorMessage(authError.message));
      return;
    }
    setNotice("Sent. Check your inbox again.");
  }

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
              <p className="mb-6 text-sm text-slate">
                One account for riding and driving. You pick which when you start.
              </p>

              <form onSubmit={handleSignUp} className="flex flex-col gap-4" noValidate>
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

                {error ? (
                  <p role="alert" className="text-[13px] text-danger">
                    {error}
                  </p>
                ) : null}

                <Button type="submit" fullWidth size="lg" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 size={18} className="animate-spin" strokeWidth={2.5} />
                      Creating account…
                    </>
                  ) : (
                    "Create account"
                  )}
                </Button>
              </form>
            </>
          ) : (
            <>
              <div className="mb-4 flex justify-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-signal/8 text-signal">
                  <MailCheck size={22} strokeWidth={2} />
                </span>
              </div>
              <h1 className="mb-1 text-center font-sora text-2xl font-bold text-midnight">
                Verify your email
              </h1>
              <p className="mb-6 text-center text-sm text-slate">
                We sent a code to <span className="font-semibold text-ink">{email}</span>. Enter it
                below, or click the link in the email.
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
                    setError(null);
                    setNotice(null);
                    setCode("");
                  }}
                  disabled={loading}
                  className="font-semibold text-slate hover:text-ink disabled:opacity-50"
                >
                  Use a different email
                </button>
              </div>
            </>
          )}
        </Card>

        <p className="mt-6 text-center text-sm text-slate">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-signal no-underline hover:text-midnight">
            Log in
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
