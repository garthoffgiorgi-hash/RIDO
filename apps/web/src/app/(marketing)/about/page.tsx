import { Mail, MapPin, Newspaper } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { commissionTiers, commissionWorkedExample, contact, pilotMonths } from "@/lib/mock-data";

// Placeholder — about/mission page (Design→Code handoff, brand/exports/2026-08-07-landing-pages-v1/).
// Mission copy source: docs/business/overview.md's wedge + mission sections.
export default function AboutPage() {
  return (
    <>
      {/* MISSION HERO */}
      <section className="bg-midnight py-20 sm:py-23">
        <div className="mx-auto max-w-[760px] px-6 text-center sm:px-8">
          <div className="eyebrow text-white/60">Why we built rido</div>
          <p className="mt-5 font-sora text-[26px] font-bold leading-[1.35] tracking-tight text-white sm:text-[32px] sm:leading-[1.32]">
            A ride can be cheaper for you <span className="text-signal">and</span> fairer to your
            driver at the same time. The only thing standing in the way is how much the middle takes
            — so we took less.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button href="/login" variant="accent" size="lg">
              Get a rido
            </Button>
            <Button href="/drivers" variant="ghost" invert size="lg">
              Drive with rido
            </Button>
          </div>
        </div>
      </section>

      {/* ORIGIN */}
      <section className="mx-auto max-w-[820px] px-6 py-16 sm:px-8 sm:py-19">
        <div className="eyebrow">Where we started</div>
        <h2 className="mt-2.5 mb-4 font-sora text-[26px] font-bold tracking-tight text-midnight sm:text-[32px]">
          Launching at UC San Diego.
        </h2>
        <p className="text-base leading-relaxed text-slate">
          We&apos;re starting small and close to home: a {pilotMonths}-month pilot around UCSD and
          San Diego, with $0 flat driver fees for the whole run. Commission still applies — we
          wanted the graduated structure proven with real drivers before it goes anywhere else.
        </p>
      </section>

      {/* COMMISSION TIERS */}
      <section className="border-y border-mist bg-white py-16 sm:py-19">
        <div className="mx-auto max-w-[1120px] px-6 sm:px-8">
          <div className="eyebrow">The commission model</div>
          <h2 className="mt-2.5 mb-4 font-sora text-[26px] font-bold tracking-tight text-midnight sm:text-[34px]">
            Graduated, transparent, published.
          </h2>
          <p className="mb-9 max-w-[560px] text-base leading-relaxed text-slate">
            Like tax brackets — each band&apos;s rate applies only to the fares within it. No hidden
            math.
          </p>
          <div className="grid gap-5 md:grid-cols-3">
            {commissionTiers.map((tier, i) => {
              const isTopTier = i === commissionTiers.length - 1;
              return (
                <Card key={tier.band} tone={isTopTier ? "midnight" : "ivory"}>
                  <div className={`eyebrow mb-2.5 ${isTopTier ? "text-white/65" : ""}`}>
                    {tier.band}
                  </div>
                  <div
                    className={`tabular font-sora text-[40px] font-extrabold sm:text-[44px] ${
                      isTopTier ? "text-white" : "text-midnight"
                    }`}
                  >
                    {tier.rate}
                  </div>
                  <p className={`mt-2.5 text-sm ${isTopTier ? "text-white/75" : "text-slate"}`}>
                    {tier.description}
                  </p>
                </Card>
              );
            })}
          </div>
          <p className="mt-6 text-[13.5px] text-slate">
            Example at {commissionWorkedExample.monthlyGmv} in monthly fares: driver keeps{" "}
            {commissionWorkedExample.ridoDriverKeeps} with rido vs. ~
            {commissionWorkedExample.incumbentDriverKeeps} at a typical incumbent&apos;s{" "}
            {commissionWorkedExample.incumbentFlatRate} flat cut.
          </p>
        </div>
      </section>

      {/* CONTACT */}
      <section className="mx-auto max-w-[1120px] px-6 py-16 sm:px-8 sm:py-19">
        <div className="eyebrow">Get in touch</div>
        <h2 className="mt-2.5 mb-9 font-sora text-[26px] font-bold tracking-tight text-midnight sm:text-[34px]">
          Contact.
        </h2>
        <div className="grid gap-5 md:grid-cols-3">
          <Card>
            <span className="mb-3.5 flex h-11 w-11 items-center justify-center rounded-xl bg-signal/8 text-signal">
              <Mail size={20} strokeWidth={2} />
            </span>
            <div className="mb-1 text-[15px] font-semibold text-ink">General</div>
            <a
              href={`mailto:${contact.general}`}
              className="text-sm text-signal no-underline hover:text-midnight"
            >
              {contact.general}
            </a>
          </Card>
          <Card>
            <span className="mb-3.5 flex h-11 w-11 items-center justify-center rounded-xl bg-signal/8 text-signal">
              <Newspaper size={20} strokeWidth={2} />
            </span>
            <div className="mb-1 text-[15px] font-semibold text-ink">Press</div>
            <a
              href={`mailto:${contact.press}`}
              className="text-sm text-signal no-underline hover:text-midnight"
            >
              {contact.press}
            </a>
          </Card>
          <Card>
            <span className="mb-3.5 flex h-11 w-11 items-center justify-center rounded-xl bg-signal/8 text-signal">
              <MapPin size={20} strokeWidth={2} />
            </span>
            <div className="mb-1 text-[15px] font-semibold text-ink">Based in</div>
            <div className="text-sm text-slate">{contact.location}</div>
          </Card>
        </div>
      </section>
    </>
  );
}
