import Link from "next/link";

/**
 * The in-app wordmark: lowercase "rido", Signal-blue i — the "voice" register (brand/CLAUDE.md
 * §2). Uppercase RIDO is reserved for the app icon/splash/favicon, not used in-page.
 */
export function Wordmark({ size = 26 }: { size?: number }) {
  return (
    <Link
      href="/"
      className="font-sora font-extrabold tracking-tight text-midnight no-underline"
      style={{ fontSize: size }}
    >
      r<span className="text-signal">i</span>do
    </Link>
  );
}
