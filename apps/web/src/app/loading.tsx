import { Loader2 } from "lucide-react";

/**
 * Shown while a dynamic route resolves on the server — today that's `/account`, which has to
 * read the session before it can render anything.
 *
 * Deliberately quiet: a spinner on the canvas, no skeleton. A skeleton that doesn't match the
 * page it precedes is worse than none, and these routes don't have a stable enough shape yet.
 */
export default function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ivory p-6">
      <Loader2 size={26} strokeWidth={2.5} className="animate-spin text-signal" />
      <span className="sr-only">Loading</span>
    </main>
  );
}
