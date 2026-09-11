import Link from "next/link";

/**
 * The in-app wordmark: lowercase "rido", Signal-blue i — the "voice" register (brand/CLAUDE.md
 * §2). The app icon/splash/favicon use this same mark on a solid Midnight tile, not uppercase
 * RIDO — see `brand/design-system.md` §2.
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
