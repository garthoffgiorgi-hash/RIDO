import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { contact, driverRequirements } from "@/lib/mock-data";

// No Design mockup for this one — brand/design-system.md's components are enough on their own.
// Copy is a first draft, written to describe what RIDO actually does today (see the draft notice
// below), not a reviewed legal document. Mirrors /privacy's structure exactly.
export default function TermsPage() {
  return (
    <>
      <header className="mx-auto max-w-[820px] px-6 pt-16 pb-10 sm:px-8 sm:pt-19">
        <div className="eyebrow">Legal</div>
        <h1 className="mt-2.5 mb-4 font-sora text-[32px] font-bold tracking-tight text-midnight sm:text-[40px]">
          Terms of service
        </h1>
        <p className="text-base leading-relaxed text-slate">
          What you're agreeing to when you use RIDO. Last edited September 2026.
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
          <h2 className="mb-3 font-sora text-xl font-bold text-midnight">Using RIDO</h2>
          <p className="text-base leading-relaxed text-slate">
            You need an account to book a ride or drive. You're responsible for what happens under
            it — keep your sign-in to yourself, and tell us if you think someone else has access.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-sora text-xl font-bold text-midnight">Riders</h2>
          <ul className="list-disc space-y-2 pl-5 text-base leading-relaxed text-slate">
            <li>
              We show you the price before you confirm it, and it's what you pay unless the route
              changes before you request — if it does, we ask you to confirm the new price rather
              than charging you a number you never saw.
            </li>
            <li>
              We authorize a hold on your card when you book and charge it when your trip ends.
            </li>
            <li>
              Canceling after your driver is already on the way may include a cancellation fee,
              which goes to your driver for the time they've already spent. We'll always tell you
              the amount before you confirm canceling.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-sora text-xl font-bold text-midnight">Drivers</h2>
          <p className="mb-3 text-base leading-relaxed text-slate">Driving with RIDO requires:</p>
          <ul className="list-disc space-y-1.5 pl-5 text-base leading-relaxed text-slate">
            {driverRequirements.map((req) => (
              <li key={req.label}>{req.label}</li>
            ))}
          </ul>
          <p className="mt-3 text-base leading-relaxed text-slate">
            RIDO won't let you accept rides until all of them clear, and you're paid out through the
            bank account you connect via Stripe.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-sora text-xl font-bold text-midnight">Prohibited conduct</h2>
          <p className="text-base leading-relaxed text-slate">
            No fraud, no falsified documents, no using RIDO to break the law, and no harassment of a
            rider or driver.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-sora text-xl font-bold text-midnight">Disclaimers</h2>
          <p className="text-base leading-relaxed text-slate">
            This section — the liability language that actually protects RIDO and its drivers and
            riders — is exactly the kind of thing that needs a real attorney's language, not ours.
            Placeholder until that review happens.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-sora text-xl font-bold text-midnight">Ending an account</h2>
          <p className="text-base leading-relaxed text-slate">
            We can suspend or close an account that breaks these terms. You can stop using RIDO any
            time.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-sora text-xl font-bold text-midnight">Governing law</h2>
          <p className="text-base leading-relaxed text-slate">
            These terms are meant to be governed by California law — the final wording is pending
            legal review, same as Disclaimers above.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-sora text-xl font-bold text-midnight">Changes to these terms</h2>
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
