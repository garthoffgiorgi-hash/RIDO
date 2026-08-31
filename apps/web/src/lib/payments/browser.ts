/**
 * Collecting a card, in the browser, without the card touching RIDO.
 *
 * **The only file permitted to import `@stripe/stripe-js`** — rule 7, the same standing
 * `src/lib/maps/map.ts` has for `mapbox-gl`, enforced by `scripts/check-context.mjs`'s
 * `VENDOR_SDKS` (`/^@stripe\//`).
 *
 * Modelled on `map.ts` deliberately: mount into a container, return an opaque handle, and let no
 * vendor type escape. That is why this uses `@stripe/stripe-js` and NOT `@stripe/react-stripe-js`
 * — the React bindings work by rendering vendor components (`<Elements>`, `<PaymentElement>`) in
 * JSX, which would put the SDK in a component file and break the boundary this repo enforces
 * everywhere else. A handle costs one indirection and keeps the rule intact.
 *
 * **The card number never reaches RIDO.** Stripe's iframe collects it, Stripe tokenises it, and
 * what comes back is a PaymentMethod reference. No server here, no database column, and no log
 * line ever sees a PAN — which is what keeps a whole PCI surface out of this codebase, the same
 * way Express onboarding keeps bank details out of it (ADR-0015).
 */

import { loadStripe, type Stripe, type StripeElements } from "@stripe/stripe-js";

/** Mirrors `map.ts`'s handling of its own public token. */
function publishableKey(): string {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key) {
    // Fail loudly rather than rendering a card form that cannot possibly work — the same
    // fail-closed posture `createRideMap` takes on a missing Mapbox token. A silent no-op here
    // would look like a broken button to a rider trying to pay.
    throw new Error(
      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set — a card cannot be collected without it.",
    );
  }
  return key;
}

/** What a mounted card form can do. Deliberately narrow; no Stripe type crosses this line. */
export interface CardFormHandle {
  /** Submits the card to Stripe and saves it. Resolves with the SetupIntent id on success. */
  confirmSetup(): Promise<CardSetupResult>;
  /** Tears down the iframe and its listeners. Call from a cleanup effect. */
  destroy(): void;
}

export type CardSetupResult =
  | { readonly ok: true; readonly setupIntentId: string }
  | { readonly ok: false; readonly message: string };

export interface MountCardFormOptions {
  readonly container: HTMLElement;
  /** From `startCardSetup()`. Single-use — mint a fresh one per attempt, never cache one. */
  readonly clientSecret: string;
}

/**
 * Mounts Stripe's card form into `container` and returns a handle for driving it.
 *
 * The appearance is passed RIDO's own tokens rather than Stripe's defaults, so the one piece of
 * third-party UI in the product does not look like a third party's. Those values are read off the
 * document rather than hardcoded — `map.ts` takes the same `--color-midnight` liberty, and for the
 * same reason: it is the one place a token has to become a string for a vendor that cannot read
 * CSS variables.
 */
export async function mountCardForm(options: MountCardFormOptions): Promise<CardFormHandle> {
  const stripe = await loadStripe(publishableKey());
  if (!stripe) {
    throw new Error("Stripe.js failed to load — a card cannot be collected.");
  }

  const styles = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) =>
    styles.getPropertyValue(name).trim() || fallback;

  const elements = stripe.elements({
    clientSecret: options.clientSecret,
    appearance: {
      theme: "flat",
      variables: {
        colorPrimary: token("--color-signal", "#2A5BFF"),
        colorText: token("--color-ink", "#14171F"),
        colorBackground: token("--color-white", "#FFFFFF"),
        borderRadius: "12px",
        fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
      },
    },
  });

  const payment = elements.create("payment", { layout: "tabs" });
  payment.mount(options.container);

  return {
    confirmSetup: () => confirmSetup(stripe, elements),
    destroy: () => {
      payment.unmount();
      payment.destroy();
    },
  };
}

/** Kept separate so the handle above stays a thin object literal rather than a closure of logic. */
async function confirmSetup(stripe: Stripe, elements: StripeElements): Promise<CardSetupResult> {
  const { error, setupIntent } = await stripe.confirmSetup({
    elements,
    // The rider stays in the sheet. A redirect would drop them out of a booking they are mid-way
    // through, and "if_required" means only a card whose bank actually demands one leaves the page.
    redirect: "if_required",
  });

  if (error) {
    return { ok: false, message: error.message ?? "That card couldn't be saved. Try another one." };
  }
  if (!setupIntent) {
    return { ok: false, message: "That card couldn't be saved. Try again in a moment." };
  }

  return { ok: true, setupIntentId: setupIntent.id };
}

export type AuthorizationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

/**
 * Finishes a 3DS challenge when an authorization comes back `requires_action`.
 *
 * This exists because RIDO authorizes ON-SESSION (ADR-0017): the rider is on screen, so a bank's
 * question is a dialog they answer in the moment rather than a failure they find out about later.
 */
export async function completeAuthorization(clientSecret: string): Promise<AuthorizationResult> {
  const stripe = await loadStripe(publishableKey());
  if (!stripe) return { ok: false, message: "Stripe.js failed to load." };

  const { error } = await stripe.handleNextAction({ clientSecret });

  if (error) {
    return {
      ok: false,
      message: error.message ?? "Your bank didn't confirm that payment. Try again.",
    };
  }
  return { ok: true };
}
