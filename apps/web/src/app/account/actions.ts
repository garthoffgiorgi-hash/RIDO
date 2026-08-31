"use server";

import * as payments from "@/lib/payments/server";

/**
 * Thin Server Action bridge over `src/lib/payments/server.ts`, matching
 * `(rider)/request/actions.ts` and `(driver)/drive/actions.ts`. That module carries
 * `import "server-only"` and is not itself `"use server"`, so `PaymentCard` — a Client Component —
 * cannot reach it directly. This file is the only way across.
 *
 * `getPaymentProfile` needs no wrapper: `account/page.tsx` is a Server Component and reads it.
 */

export async function startCardSetup() {
  return payments.startCardSetup();
}

export async function saveCard(setupIntentId: string) {
  return payments.recordCardFromSetup(setupIntentId);
}
