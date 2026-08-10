import { contact } from "@/lib/mock-data";
import { Wordmark } from "./Wordmark";

const COLUMNS = [
  {
    heading: "Rider",
    links: [
      { href: "/login", label: "Get a rido" },
      { href: "/", label: "Cities" },
      { href: "/", label: "Safety" },
    ],
  },
  {
    heading: "Driver",
    links: [
      { href: "/drivers", label: "Drive with rido" },
      { href: "/drivers", label: "Earnings" },
      { href: "/drivers", label: "Requirements" },
    ],
  },
  {
    heading: "Company",
    links: [
      { href: "/about", label: "Our promise" },
      { href: `mailto:${contact.general}`, label: "Contact" },
    ],
  },
] as const;

/** Shared 4-column footer for the three marketing pages. */
export function MarketingFooter() {
  return (
    <footer className="border-t border-mist bg-white pt-12 pb-9">
      <div className="mx-auto grid max-w-[1120px] grid-cols-2 gap-8 px-6 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="col-span-2 md:col-span-1">
          <Wordmark />
          <p className="mt-3 max-w-[240px] text-[13.5px] text-slate">
            The fair way to move. Cheaper for you, fair for your driver.
          </p>
        </div>
        {COLUMNS.map((column) => (
          <div key={column.heading}>
            <div className="eyebrow mb-3.5">{column.heading}</div>
            {column.links.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="mb-2.5 block text-sm text-ink no-underline hover:text-midnight"
              >
                {link.label}
              </a>
            ))}
          </div>
        ))}
      </div>
      <div className="mx-auto mt-9 flex max-w-[1120px] justify-between border-t border-mist px-6 pt-5 sm:px-8">
        <span className="text-[12.5px] text-slate">© 2026 RIDO. {contact.location}.</span>
        <span className="text-[12.5px] text-slate">Privacy · Terms</span>
      </div>
    </footer>
  );
}
