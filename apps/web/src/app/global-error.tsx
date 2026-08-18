"use client";

// Last resort: catches errors thrown by the root layout itself, which error.tsx sits inside and
// so cannot catch. It *replaces* the root layout, which is why it renders its own <html>/<body>
// — and why the fonts and body classes set there don't apply here.
//
// Kept deliberately plain: if the token pipeline is part of what broke, this page still has to
// read as a sentence and offer a way out. Nothing here depends on a component that could throw.

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-ivory font-jakarta">
        <main className="flex min-h-screen items-center justify-center p-6">
          <div className="w-full max-w-sm rounded-card border border-mist bg-white p-6">
            <h1 className="mb-1 font-sora text-2xl font-bold text-midnight">
              Something went wrong
            </h1>
            <p className="mb-6 text-sm text-slate">
              The page couldn&apos;t load at all. Reloading usually fixes it.
            </p>
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-11 w-full items-center justify-center rounded-input bg-midnight px-5 text-[15px] font-bold text-white"
            >
              Reload
            </button>
            {error.digest ? (
              <p className="mt-5 text-[12.5px] text-slate">Reference {error.digest}</p>
            ) : null}
          </div>
        </main>
      </body>
    </html>
  );
}
