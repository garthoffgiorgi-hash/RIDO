"use client";

// Standalone — no shared marketing nav/footer, same treatment as /login and /signup. This is a
// functional placeholder: the real visual design is being built in Claude Design separately and
// will replace this page's JSX in a follow-up PR without touching joinWaitlist() or its action
// bridge (actions.ts) — this file exists so the feature works end-to-end before that lands.

import { CheckCircle2, Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { joinWaitlist } from "./actions";
import { Wordmark } from "@/components/domain/Wordmark";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { WaitlistInterest } from "@/lib/waitlist/validate";

const INTERESTS = [
  { value: "rider", label: "Ride" },
  { value: "driver", label: "Drive" },
  { value: "both", label: "Both" },
] as const satisfies readonly { value: WaitlistInterest; label: string }[];

export default function WaitlistPage() {
  const [email, setEmail] = useState("");
  const [interest, setInterest] = useState<WaitlistInterest>("both");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await joinWaitlist(email, interest);
    setLoading(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }
    setJoined(true);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-ivory p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Wordmark size={28} />
        </div>

        <Card>
          {joined ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-signal/8 text-signal">
                <CheckCircle2 size={22} strokeWidth={2} />
              </span>
              <p className="text-sm text-ink">
                You&apos;re on the list. We&apos;ll email you when rido opens near you.
              </p>
            </div>
          ) : (
            <>
              <h1 className="mb-1 font-sora text-2xl font-bold text-midnight">
                Be first, when we open in San Diego
              </h1>
              <p className="mb-6 text-sm text-slate">
                Cheaper rides, fairer pay for drivers — we&apos;re not live yet, but you can be
                first to know when we are.
              </p>

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

                <SegmentedControl
                  label="I'm interested as a"
                  options={INTERESTS}
                  value={interest}
                  onChange={setInterest}
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
                      Joining…
                    </>
                  ) : (
                    "Join the waitlist"
                  )}
                </Button>
              </form>
            </>
          )}
        </Card>
      </div>
    </main>
  );
}
