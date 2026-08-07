import { MarketingFooter } from "@/components/domain/MarketingFooter";
import { MarketingNav } from "@/components/domain/MarketingNav";

/** Shared chrome for the three marketing routes: /, /drivers, /about. */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-ivory text-ink">
      <MarketingNav />
      <main>{children}</main>
      <MarketingFooter />
    </div>
  );
}
