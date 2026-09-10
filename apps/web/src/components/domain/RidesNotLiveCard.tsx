import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

/**
 * What a rider or driver sees in place of the booking sheet or dispatch board while `RIDES_LIVE`
 * is unset (ADR-0026). An engineering gate, not a claim about compliance — the copy says "not yet
 * available", never "coming soon to comply with regulations" or anything a rider/driver would read
 * as a promise about when that changes.
 *
 * Built from the two existing brand primitives rather than a new one — a plain `Card` with a
 * neutral `Badge`, matching every other status surface in the app.
 */
export function RidesNotLiveCard({ variant }: { variant: "rider" | "driver" }) {
  const body =
    variant === "rider"
      ? "We're not booking rides here yet. Check back soon."
      : "We're not dispatching rides here yet. Check back soon.";

  return (
    <Card className="space-y-3 text-center">
      <Badge tone="neutral">Not yet available</Badge>
      <p className="text-[14px] text-slate">{body}</p>
    </Card>
  );
}
