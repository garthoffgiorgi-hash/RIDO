import { ArrowRight, BadgeDollarSign, CarFront, Map, MapPin, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FareChip } from "@/components/ui/FareChip";
import { driverKeepsPct, incumbentEffectiveTakeRange, launchCity, pilotMonths } from "@/lib/mock-data";

const HOW_IT_WORKS = [
  {
    icon: MapPin,
    step: "01",
    title: "Tell us where to",
    body: "Type your destination and see the price up front — locked, no surge tricks.",
  },
  {
    icon: CarFront,
    step: "02",
    title: "Get matched fast",
    body: "A nearby driver accepts. Track them in on a clean, brand-blue map.",
  },
  {
    icon: BadgeDollarSign,
    step: "03",
    title: "Pay an honest price",
    body: "What you saw is what you pay. No hidden markup between you and your driver.",
  },
] as const;

// Placeholder — rider-facing landing (Design→Code handoff, brand/exports/2026-08-07-landing-pages-v1/).
export default function RiderLandingPage() {
  return (
    <>
      {/* HERO */}
      <header className="mx-auto grid max-w-[1120px] items-center gap-10 px-6 py-13 sm:px-8 md:grid-cols-[1.05fr_0.95fr] md:py-19">
        <div>
          <div className="mb-5">
            <Badge tone="accent">Now live in {launchCity}</Badge>
          </div>
          <h1 className="font-sora text-[42px] font-extrabold leading-[1.05] tracking-tight text-midnight sm:text-[52px] lg:text-[62px] lg:leading-[1.02]">
            Cheaper. Fairer.
            <br />
            Your r<span className="text-signal">i</span>do is waiting.
          </h1>
          <p className="mt-5 max-w-[470px] text-lg leading-relaxed text-slate">
            A fair price for you, a fair cut for your driver. The big apps quietly take up to
            half of every fare — we built the opposite.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button href="/login" size="lg">
              Get a rido
            </Button>
            <Button href="/drivers" variant="secondary" size="lg">
              Drive with rido
            </Button>
          </div>
          <div className="mt-9 flex flex-wrap gap-9">
            <Stat label="Drivers keep" value={driverKeepsPct} caption="of every fare, commission-only" />
            <Stat
              label="Incumbents take"
              value={`up to ${incumbentEffectiveTakeRange.split("–")[1]}`}
              caption="in effective commission"
            />
            <Stat label="Launch pilot" value="$0" caption={`driver fees for ${pilotMonths} months`} />
          </div>
        </div>

        <div className="relative min-h-[380px] sm:min-h-[430px]">
          <Card className="absolute top-0 right-0 w-[260px] shadow-[var(--shadow-float)] sm:right-1.5 sm:w-[294px]">
            <div className="eyebrow mb-3">Your ride</div>
            <div className="flex items-center justify-between">
              <span className="tabular font-sora text-[34px] font-bold text-ink">$8.40</span>
              <FareChip>4 min away</FareChip>
            </div>
            <div className="my-3.5 h-px bg-mist" />
            <div className="flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 rounded-full border-2 border-midnight" />
              <span className="text-[13px] text-slate">Your location</span>
            </div>
            <div className="mt-2 flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-midnight" />
              <span className="text-[13px] font-semibold text-ink">Your destination</span>
            </div>
            <div className="mt-4">
              <Button href="/login" fullWidth size="lg">
                Get a rido
              </Button>
            </div>
          </Card>

          <Card className="absolute top-[230px] right-6 w-[240px] shadow-[var(--shadow-float)] sm:top-[262px] sm:right-[100px] sm:w-[252px]">
            <div className="eyebrow mb-2.5">Drivers keep</div>
            <div className="flex items-baseline gap-2">
              <span className="tabular font-sora text-[34px] font-extrabold tracking-tight text-midnight">
                {driverKeepsPct}
              </span>
            </div>
            <p className="mt-1.5 text-[12.5px] text-slate">
              Commission-only blended average.{" "}
              <a href="/about" className="font-medium text-signal no-underline hover:text-midnight">
                See how the math works
              </a>
              .
            </p>
          </Card>
        </div>
      </header>

      {/* HOW IT WORKS */}
      <section className="border-y border-mist bg-white py-16 sm:py-19">
        <div className="mx-auto max-w-[1120px] px-6 sm:px-8">
          <div className="eyebrow">How it works</div>
          <h2 className="mt-2.5 mb-2 font-sora text-[28px] font-bold tracking-tight text-midnight sm:text-[36px]">
            Three taps to a fairer ride.
          </h2>
          <p className="mb-9 max-w-[520px] text-base text-slate">
            Type where to, see the honest price, get moving.
          </p>

          <div className="grid gap-5 md:grid-cols-3">
            {HOW_IT_WORKS.map(({ icon: Icon, step, title, body }) => (
              <Card key={step}>
                <div className="mb-4.5 flex items-center justify-between">
                  <span className="flex h-11.5 w-11.5 items-center justify-center rounded-2xl bg-signal/8 text-signal">
                    <Icon size={22} strokeWidth={2} />
                  </span>
                  <span className="tabular font-sora text-sm font-bold text-mist">{step}</span>
                </div>
                <h3 className="mb-2 font-sora text-[19px] font-bold text-ink">{title}</h3>
                <p className="text-[14.5px] leading-relaxed text-slate">{body}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* WHY FAIRER TEASER */}
      <section className="mx-auto max-w-[1120px] px-6 py-16 sm:px-8 sm:py-20">
        <div className="grid items-center gap-12 md:grid-cols-2">
          <div>
            <div className="eyebrow">Why it&apos;s cheaper</div>
            <h2 className="mt-2.5 mb-4 font-sora text-[26px] font-bold leading-[1.15] tracking-tight text-midnight sm:text-[34px]">
              We take less, so your fare stays low — and your driver&apos;s cut stays high.
            </h2>
            <p className="mb-6 max-w-[460px] text-base leading-relaxed text-slate">
              Other apps quietly take up to half of every fare. Our commission runs far lower,
              which means a lower price for you without shorting the person driving you there.
            </p>
            <a
              href="/about"
              className="inline-flex items-center gap-1.5 text-[14.5px] font-semibold text-signal no-underline hover:text-midnight"
            >
              Read our promise <ArrowRight size={16} />
            </a>
          </div>
          <Card className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-midnight/8 text-midnight">
                <ShieldCheck size={20} strokeWidth={2} />
              </span>
              <div>
                <div className="text-[14.5px] font-semibold text-ink">Locked, upfront pricing</div>
                <div className="text-[13px] text-slate">No surge surprises after you request.</div>
              </div>
            </div>
            <div className="h-px bg-mist" />
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-midnight/8 text-midnight">
                <Map size={20} strokeWidth={2} />
              </span>
              <div>
                <div className="text-[14.5px] font-semibold text-ink">Clean, live tracking</div>
                <div className="text-[13px] text-slate">Midnight route, Signal live-driver dot.</div>
              </div>
            </div>
          </Card>
        </div>
      </section>
    </>
  );
}

function Stat({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className="tabular mt-1 mb-0.5 font-sora text-[26px] font-bold text-midnight">{value}</div>
      <div className="text-[12.5px] text-slate">{caption}</div>
    </div>
  );
}
