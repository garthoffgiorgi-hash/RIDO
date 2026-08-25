import {
  CarFront,
  FileCheck,
  HandCoins,
  IdCard,
  Power,
  Quote,
  SearchCheck,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  commissionWorkedExample,
  tierProseSentence,
  tierProseShort,
} from "@/lib/marketing/figures";
import {
  driverRequirements,
  driverTestimonials,
  incumbentEffectiveTake,
  pilotMonths,
} from "@/lib/mock-data";

const REQUIREMENT_ICONS = {
  "id-card": IdCard,
  "car-front": CarFront,
  "shield-check": ShieldCheck,
  "search-check": SearchCheck,
  "file-check": FileCheck,
} as const;

const HOW_IT_WORKS = [
  {
    icon: Power,
    step: "01",
    title: "Go online when you want",
    body: "Flip on, drive on your terms. No quotas, no forced hours, no penalties.",
  },
  {
    icon: HandCoins,
    step: "02",
    title: "See your cut, every ride",
    body: 'Each card shows "you keep $X (Y%)." Commission drops as you drive more.',
  },
  {
    icon: TrendingUp,
    step: "03",
    title: `Keep ${commissionWorkedExample.monthlyAdvantage} more`,
    body: "A lower, fairer cut means more in your pocket at the end of every month.",
  },
] as const;

// Placeholder — driver-facing landing (Design→Code handoff, brand/exports/2026-08-07-landing-pages-v1/).
export default function DriverLandingPage() {
  return (
    <>
      {/* HERO */}
      <header className="mx-auto max-w-[1120px] px-6 pt-14 pb-12 sm:px-8 sm:pt-16 sm:pb-14">
        <div className="mb-5">
          <Badge tone="accent">$0 driver fees for the first {pilotMonths} months</Badge>
        </div>
        <h1 className="max-w-[780px] font-sora text-[38px] font-extrabold leading-[1.08] tracking-tight text-midnight sm:text-[46px] lg:text-[54px] lg:leading-[1.05]">
          Keep <span className="text-signal">{commissionWorkedExample.monthlyAdvantage}</span> more
          of what you earn, every month.
        </h1>
        <p className="mt-5 max-w-[560px] text-lg leading-relaxed text-slate">
          Incumbents take a flat, opaque cut that runs {incumbentEffectiveTake.range}. Ours drops as
          you drive — {tierProseShort}.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Button href="/signup" size="lg">
            Drive with rido
          </Button>
          <Button href="#requirements" variant="secondary" size="lg">
            See requirements
          </Button>
        </div>
      </header>

      {/* ECONOMICS */}
      <section className="border-y border-mist bg-white py-16 sm:py-19">
        <div className="mx-auto grid max-w-[1120px] items-center gap-12 px-6 sm:px-8 md:grid-cols-2">
          <div>
            <div className="eyebrow">The driver economics</div>
            <h2 className="mt-2.5 mb-4 font-sora text-[26px] font-bold leading-[1.15] tracking-tight text-midnight sm:text-[34px]">
              Our commission falls as you drive more.
            </h2>
            <p className="max-w-[450px] text-base leading-relaxed text-slate">
              {tierProseSentence} No flat fee during the launch pilot.
            </p>
          </div>

          <Card>
            <div className="eyebrow mb-5">
              On {commissionWorkedExample.monthlyGmv} of fares this month
            </div>

            <EconomicsBar
              label="rido"
              accentClassName="text-signal"
              barClassName="bg-signal"
              width={commissionWorkedExample.ridoKeepPct}
              keptLabel={`${commissionWorkedExample.ridoDriverKeeps} kept`}
              pctLabel={commissionWorkedExample.ridoKeepPct}
            />
            <div className="h-3" />
            <EconomicsBar
              label="Other incumbents"
              accentClassName="text-slate"
              barClassName="bg-midnight"
              width={commissionWorkedExample.incumbentKeepPct}
              keptLabel={`${commissionWorkedExample.incumbentDriverKeeps} kept`}
              pctLabel={commissionWorkedExample.incumbentKeepPct}
            />

            <div className="mt-4.5 flex items-center gap-2 border-t border-mist pt-4.5">
              <span className="flex text-signal">
                <TrendingUp size={17} strokeWidth={2} />
              </span>
              <span className="text-[13.5px] text-midnight">
                That&apos;s <b>{commissionWorkedExample.monthlyAdvantage}</b> more in your pocket —
                every single month.
              </span>
            </div>
            <p className="mt-3 text-[12px] text-slate">
              Illustrative example at {commissionWorkedExample.monthlyGmv}/mo in fares, vs. a flat{" "}
              {commissionWorkedExample.incumbentFlatRate} incumbent cut — see
              docs/business/monetization.md for the worked math.
            </p>
          </Card>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="mx-auto max-w-[1120px] px-6 py-16 sm:px-8 sm:py-19">
        <div className="eyebrow">How it works</div>
        <h2 className="mt-2.5 mb-9 font-sora text-[26px] font-bold tracking-tight text-midnight sm:text-[34px]">
          Drive on your terms.
        </h2>
        <div className="grid gap-5 md:grid-cols-3">
          {HOW_IT_WORKS.map(({ icon: Icon, step, title, body }) => (
            <Card key={step}>
              <div className="mb-4.5 flex items-center justify-between">
                <span className="flex h-11.5 w-11.5 items-center justify-center rounded-2xl bg-midnight/8 text-midnight">
                  <Icon size={22} strokeWidth={2} />
                </span>
                <span className="tabular font-sora text-sm font-bold text-mist">{step}</span>
              </div>
              <h3 className="mb-2 font-sora text-[19px] font-bold text-ink">{title}</h3>
              <p className="text-[14.5px] leading-relaxed text-slate">{body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* REQUIREMENTS */}
      <section id="requirements" className="border-y border-mist bg-white py-16 sm:py-19">
        <div className="mx-auto max-w-[1120px] px-6 sm:px-8">
          <div className="eyebrow">What you need</div>
          <h2 className="mt-2.5 mb-9 font-sora text-[26px] font-bold tracking-tight text-midnight sm:text-[34px]">
            Requirements to drive.
          </h2>
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-5">
            {driverRequirements.map((req) => {
              const Icon = REQUIREMENT_ICONS[req.icon];
              return (
                <div key={req.label} className="text-center">
                  <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-signal/8 text-signal">
                    <Icon size={20} strokeWidth={2} />
                  </span>
                  <div className="text-sm font-semibold text-ink">{req.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="mx-auto max-w-[1120px] px-6 py-16 sm:px-8 sm:py-19">
        <div className="eyebrow">From drivers</div>
        <h2 className="mt-2.5 mb-9 font-sora text-[26px] font-bold tracking-tight text-midnight sm:text-[34px]">
          What driving with rido feels like.
        </h2>
        <div className="grid gap-5 md:grid-cols-3">
          {driverTestimonials.map((t) => (
            <Card key={t.name} className="flex flex-col gap-3.5">
              <Quote size={20} strokeWidth={2} className="text-signal" />
              <p className="text-[15px] leading-relaxed text-ink">&ldquo;{t.quote}&rdquo;</p>
              <div className="mt-auto flex items-center gap-2.5">
                <Avatar name={t.name} />
                <div>
                  <div className="text-[13.5px] font-semibold text-ink">{t.name}</div>
                  <div className="text-[12.5px] text-slate">{t.role}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate">
          Illustrative quotes from pilot conversations; not verbatim reviews.
        </p>
      </section>

      {/* CTA */}
      <section className="bg-midnight py-18">
        <div className="mx-auto max-w-[640px] px-6 text-center sm:px-8">
          <h2 className="font-sora text-[26px] font-bold leading-[1.25] tracking-tight text-white sm:text-[30px]">
            $0 flat fees for your first {pilotMonths} months. Commission only.
          </h2>
          <div className="mt-7">
            <Button href="/signup" variant="accent" size="lg">
              Drive with rido
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}

function EconomicsBar({
  label,
  accentClassName,
  barClassName,
  width,
  keptLabel,
  pctLabel,
}: {
  label: string;
  accentClassName: string;
  barClassName: string;
  width: string;
  keptLabel: string;
  pctLabel: string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[15px] font-semibold text-ink">{label}</span>
        <span className={`tabular font-sora text-[15px] font-bold ${accentClassName}`}>
          {keptLabel}
        </span>
      </div>
      <div className="relative h-8 overflow-hidden rounded-pill border border-mist bg-ivory">
        <div
          className={`absolute inset-y-0 left-0 flex items-center rounded-pill pl-3.5 ${barClassName}`}
          style={{ width }}
        >
          <span className="tabular font-sora text-[13px] font-bold whitespace-nowrap text-white">
            driver keeps {pctLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
