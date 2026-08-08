"use client";

// Shared rider/driver login. Not placed in (rider)/ or (driver)/ since the same flow serves
// both — revisit if that stops being true. Real Supabase Auth: password sign-in redirects home,
// magic link shows a "check your email" state. Post-login destination is "/" for both
// roles for now — split rider/driver once there's a way to tell them apart (a `role` on the
// driver row, most likely) rather than guessing here.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Wordmark } from "@/components/domain/Wordmark";
import { createBrowserClient } from "@/lib/supabase/client";

type Mode = "password" | "magic-link";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createBrowserClient();

    if (mode === "password") {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }
      router.push("/");
      router.refresh();
      return;
    }

    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }
    setMagicLinkSent(true);
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

          <div className="mb-5 flex gap-1 rounded-input bg-ivory p-1">
            <ModeTab
              active={mode === "password"}
              onClick={() => {
                setMode("password");
                setError(null);
                setMagicLinkSent(false);
              }}
            >
              Password
            </ModeTab>
            <ModeTab
              active={mode === "magic-link"}
              onClick={() => {
                setMode("magic-link");
                setError(null);
                setMagicLinkSent(false);
              }}
            >
              Magic link
            </ModeTab>
          </div>

          {mode === "magic-link" && magicLinkSent ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-signal/8 text-signal">
                <MailCheck size={22} strokeWidth={2} />
              </span>
              <p className="text-sm text-ink">
                Check <span className="font-semibold">{email}</span> for your link.
              </p>
              <button
                type="button"
                onClick={() => setMagicLinkSent(false)}
                className="text-[13px] font-semibold text-signal no-underline hover:text-midnight"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
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

              {error ? (
                <p role="alert" className="text-[13px] text-danger">
                  {error}
                </p>
              ) : null}

              <Button type="submit" fullWidth size="lg" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" strokeWidth={2.5} />
                    {mode === "password" ? "Logging in…" : "Sending link…"}
                  </>
                ) : mode === "password" ? (
                  "Log in"
                ) : (
                  "Send magic link"
                )}
              </Button>
            </form>
          )}
        </Card>

        <p className="mt-6 text-center text-sm text-slate">
          New to rido?{" "}
          <Link href="/request" className="font-semibold text-signal no-underline hover:text-midnight">
            Get a rido
          </Link>{" "}
          or{" "}
          <Link href="/drivers" className="font-semibold text-signal no-underline hover:text-midnight">
            drive with rido
          </Link>
          .
        </p>
      </div>
    </main>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-9 flex-1 rounded-[8px] text-[13.5px] font-semibold transition-colors duration-150 ease-standard ${
        active ? "bg-white text-midnight shadow-[var(--shadow-float)]" : "text-slate hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
