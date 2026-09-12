import type { Metadata, Viewport } from "next";
import { Sora, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora-loader",
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta-loader",
  display: "swap",
});

export const metadata: Metadata = {
  // Required once any page uses a relative og:image URL (opengraph-image.tsx does) — without it
  // Next can't resolve one to an absolute URL, which every social platform requires.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "RIDO",
  description: "The fair way to move.",
  openGraph: {
    siteName: "rido",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "rido",
  },
  other: {
    // Next's `appleWebApp.capable` only emits the modern unprefixed `mobile-web-app-capable` tag
    // in this version — some iOS/WebKit releases still key standalone mode off the classic name.
    "apple-mobile-web-app-capable": "yes",
  },
};

// themeColor/colorScheme moved out of Metadata into their own export as of Next 14+.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b2a5b", // Midnight — see manifest.ts's comment on this same exception.
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sora.variable} ${jakarta.variable}`}>
      <body className="font-jakarta">{children}</body>
    </html>
  );
}
