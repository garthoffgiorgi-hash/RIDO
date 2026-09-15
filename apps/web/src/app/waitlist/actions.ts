"use server";

import * as waitlist from "@/lib/waitlist/server";

/** Thin Server Action bridge over `src/lib/waitlist/server.ts` — matching `(rider)/request/actions.ts`'s pattern. */
export async function joinWaitlist(email: string, interest: string) {
  return waitlist.joinWaitlist(email, interest);
}
