import { cents } from "@rido/pricing";

// Placeholder — ride request flow. Scaffolding only; real content is built directly in code
// against brand/design-system.md section 6's blueprint (map-first, bottom sheet, fare/ETA up
// front), not a Design mockup — see the design-vs-code split discussed for this surface.
//
// The `cents()` call below is a deliberate integration check, not real behavior: it proves
// @rido/pricing resolves and type-checks through the Next.js bundler (transpilePackages in
// next.config.ts), the same way the Deno spike proved it for Edge Functions. Delete once a real
// fare is wired up.
export default function RequestPage() {
  const exampleFareCents = cents(840);

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-sm rounded-card border border-mist bg-white p-6">
        <p className="tabular font-sora text-2xl font-bold text-ink">
          ${(exampleFareCents / 100).toFixed(2)}
        </p>
      </div>
    </main>
  );
}
