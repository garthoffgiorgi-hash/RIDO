"use client";

// Catches anything thrown while rendering a route below the root layout. Without this, a single
// unhandled error renders a blank page — no brand, no way back, no signal that anything is wrong.
//
// Must be a Client Component: React needs the reset handler on the client to re-render the
// boundary's children. Errors in the root layout itself are caught by global-error.tsx instead,
// which this boundary sits inside and therefore cannot handle.

import { useEffect } from "react";
import { Wordmark } from "@/components/domain/Wordmark";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Next.js strips the message in production and leaves a `digest` that correlates to the
    // server log. Until there's real error reporting, the console is the whole story.
    console.error("[route error]", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-ivory p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Wordmark size={28} />
        </div>

        <Card>
          <h1 className="mb-1 font-sora text-2xl font-bold text-midnight">That didn&apos;t load</h1>
          <p className="mb-6 text-sm text-slate">
            Something broke on our end. Try again — if it keeps happening, it&apos;s us, not you.
          </p>

          <div className="flex flex-col gap-2.5">
            <Button onClick={reset} fullWidth size="lg">
              Try again
            </Button>
            <Button href="/" variant="secondary" fullWidth size="lg">
              Back to home
            </Button>
          </div>

          {error.digest ? (
            <p className="mt-5 text-[12.5px] text-slate">
              Reference <span className="tabular font-semibold text-ink">{error.digest}</span>
            </p>
          ) : null}
        </Card>
      </div>
    </main>
  );
}
