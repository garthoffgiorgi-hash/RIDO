"use server";

import * as payments from "@/lib/payments/server";
import * as riders from "@/lib/riders/server.ts";

/**
 * Thin Server Action bridge over `src/lib/payments/server.ts` and `src/lib/riders/server.ts`,
 * matching `(rider)/request/actions.ts` and `(driver)/drive/actions.ts`. Both modules carry
 * `import "server-only"` and are not themselves `"use server"`, so a Client Component — `PaymentCard`,
 * `RiderNameCard` — cannot reach either directly. This file is the only way across.
 *
 * `getPaymentProfile`/`ensureRiderProfile` need no wrapper for their own reads: `account/page.tsx`
 * is a Server Component and calls them directly.
 */

export async function startCardSetup() {
  return payments.startCardSetup();
}

export async function saveCard(setupIntentId: string) {
  return payments.recordCardFromSetup(setupIntentId);
}

export async function setDisplayName(name: string) {
  return riders.setDisplayName(name);
}
