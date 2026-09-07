import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { contact } from "@/lib/mock-data";

// No Design mockup for this one — brand/design-system.md's components are enough on their own.
// Copy is a first draft, written to describe what RIDO actually does today (see the draft notice
// below), not a reviewed legal document.
export default function PrivacyPage() {
  return (
    <>
      <header className="mx-auto max-w-[820px] px-6 pt-16 pb-10 sm:px-8 sm:pt-19">
        <div className="eyebrow">Legal</div>
        <h1 className="mt-2.5 mb-4 font-sora text-[32px] font-bold tracking-tight text-midnight sm:text-[40px]">
          Privacy policy
        </h1>
        <p className="text-base leading-relaxed text-slate">
          What we collect, why, and how to reach us about it. Last edited September 2026.
        </p>
      </header>

      <div className="mx-auto max-w-[820px] px-6 pb-8 sm:px-8">
        <Card tone="ivory" className="flex items-start gap-3">
          <Badge tone="neutral">Draft</Badge>
          <p className="text-[14px] leading-relaxed text-slate">
            This is a draft, written before a lawyer has reviewed it. It describes what RIDO
            actually does today, honestly — but treat it as a placeholder, not a final legal
            document, until real legal review is done before launch.
          </p>
        </Card>
      </div>

      <div className="mx-auto max-w-[820px] space-y-10 px-6 pb-20 sm:px-8">
        <section>
          <h2 className="mb-3 font-sora text-xl font-bold text-midnight">Information we collect</h2>
          <ul className="list-disc space-y-2 pl-5 text-base leading-relaxed text-slate">
            <li>
              <span className="text-ink">Account info</span> — your name and an email or phone
              number. For drivers, the vehicle and license details a background check and vehicle
              inspection require.
            </li>
            <li>
              <span className="text-ink">Location</span> — the pickup and dropoff addresses you
              search for, and a driver's live location for the length of an active ride, so a map
              and an ETA mean something.
            </li>
            <li>
              <span className="text-ink">Payment info</span> — your card is held by Stripe, our
              payment processor. RIDO never sees or stores your full card number.
            </li>
            <li>
              <span className="text-ink">Ride history</span> — your past trips, fares, and ratings.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-sora text-xl font-bold text-midnight">How we use it</h2>
          <ul className="list-disc space-y-2 pl-5 text-base leading-relaxed text-slate">
            <li>To match a rider with a driver, price a ride honestly, and complete it.</li>
            <li>
              To run the background check and vehicle inspection California requires before someone
              can drive.
            </li>
            <li>To process payments and driver payouts through Stripe.</li>
            <li>
              To keep a rider and driver informed about each other — name, vehicle, and rating —
              only for the length of a ride they actually share.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-sora text-xl font-bold text-midnight">Who we share it with</h2>
          <p className="text-base leading-relaxed text-slate">
            Stripe (payments), Mapbox (maps and location search), and Supabase (where our database
            and accounts live) — each gets only what it needs to do its own job. A mapping provider
            never sees your card; a payment processor never sees your route. We don't sell your
            personal information.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-sora text-xl font-bold text-midnight">Data retention</h2>
          <p className="text-base leading-relaxed text-slate">
            We keep ride and payment records for as long as taxes, disputes, and safety
            investigations reasonably require — typically several years. The exact schedule is still
            being finalized with counsel.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-sora text-xl font-bold text-midnight">Your choices</h2>
          <p className="text-base leading-relaxed text-slate">
            You can update your name and payment method any time from your account. To close your
            account or ask what we hold about you, email us below.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-sora text-xl font-bold text-midnight">Children</h2>
          <p className="text-base leading-relaxed text-slate">RIDO isn't for anyone under 18.</p>
        </section>

        <section>
          <h2 className="mb-3 font-sora text-xl font-bold text-midnight">Changes to this policy</h2>
          <p className="text-base leading-relaxed text-slate">
            If this changes, we'll post the update here and move the date at the top.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-sora text-xl font-bold text-midnight">Contact</h2>
          <p className="text-base leading-relaxed text-slate">
            <a
              href={`mailto:${contact.general}`}
              className="text-signal no-underline hover:text-midnight"
            >
              {contact.general}
            </a>{" "}
            · {contact.location}
          </p>
        </section>
      </div>
    </>
  );
}
