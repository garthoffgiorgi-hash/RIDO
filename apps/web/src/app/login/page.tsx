// Placeholder — shared rider/driver login. Scaffolding only.
// Not placed in (rider)/ or (driver)/ since the same flow serves both — revisit if that stops
// being true. Real auth wiring is Supabase Auth via src/lib/supabase/client.ts.
export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-sm rounded-card border border-mist bg-white p-6">
        <h1 className="font-sora text-2xl font-bold text-midnight">Log in</h1>
      </div>
    </main>
  );
}
