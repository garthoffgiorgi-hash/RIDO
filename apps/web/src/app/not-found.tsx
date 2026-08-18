import { Wordmark } from "@/components/domain/Wordmark";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

/**
 * 404. Also what `notFound()` renders from a route handler or Server Component, so it's reached
 * deliberately as well as by mistyped URL.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ivory p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Wordmark size={28} />
        </div>

        <Card>
          <h1 className="mb-1 font-sora text-2xl font-bold text-midnight">No page here</h1>
          <p className="mb-6 text-sm text-slate">
            That link doesn&apos;t go anywhere. It may have moved, or never existed.
          </p>
          <Button href="/" fullWidth size="lg">
            Back to home
          </Button>
        </Card>
      </div>
    </main>
  );
}
