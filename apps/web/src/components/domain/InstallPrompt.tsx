"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { detectPlatform, installPromptVariant, type Platform } from "@/lib/pwa/install-prompt";

/**
 * Chrome's non-standard extension to `Event` — never made it into `lib.dom.d.ts`. Named locally
 * rather than pulled from a vendor package, same habit `src/lib/rides/realtime-event.ts` uses for
 * Supabase's own channel-status vocabulary.
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

/**
 * Module-scope, not component state: `beforeinstallprompt` fires at most once per page load, and
 * `/login`/`/signup` share no layout with the marketing pages or each other (ADR-0027) — a normal
 * `<Link>` navigation between them unmounts whichever `InstallPrompt` instance caught the event.
 * Losing it in local state would silently strand it there forever; a module-level singleton
 * survives any number of mount/unmount cycles for the life of the tab.
 */
let capturedEvent: BeforeInstallPromptEvent | null = null;
let listenerAttached = false;
const listeners = new Set<(event: BeforeInstallPromptEvent) => void>();

function handleBeforeInstallPrompt(event: Event) {
  event.preventDefault(); // suppress Chrome's own mini-infobar — we render our own card instead
  capturedEvent = event as BeforeInstallPromptEvent;
  for (const listener of listeners) listener(capturedEvent);
}

function ensureListening(): void {
  if (listenerAttached || typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  listenerAttached = true;
}

const DISMISS_KEY = "rido:install-prompt-dismissed";

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "true";
  } catch {
    return false; // fails toward showing the banner again — low-stakes either way
  }
}

function writeDismissed(): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, "true");
  } catch {
    // Storage disabled or full — the banner just reappears next visit. Not worth surfacing.
  }
}

function detectIsStandalone(): boolean {
  const legacy = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return window.matchMedia("(display-mode: standalone)").matches || legacy === true;
}

/**
 * A small dismissible card offering to install rido as an app — the marketing pages and
 * login/signup, never the authenticated app pages. iOS gets instructions (Apple exposes no API
 * to trigger Add to Home Screen); Android gets a real one-tap button once the browser has fired
 * `beforeinstallprompt`. Renders nothing once already installed, once dismissed, or on any other
 * platform. First component in this codebase to touch `window`/`navigator`/`localStorage`
 * directly — `ready` starts `false` so the server render and the first client render agree
 * (neither can know the platform), same idiom `RatingPrompt`'s `phase === "loading"` already uses.
 */
export function InstallPrompt() {
  const [ready, setReady] = useState(false);
  const [platform, setPlatform] = useState<Platform>("other");
  const [isStandalone, setIsStandalone] = useState(false);
  const [hasInstallEvent, setHasInstallEvent] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setPlatform(
      detectPlatform({
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        maxTouchPoints: navigator.maxTouchPoints,
      }),
    );
    setIsStandalone(detectIsStandalone());
    setDismissed(readDismissed());
    setHasInstallEvent(capturedEvent !== null); // caught on an earlier, now-unmounted instance
    setReady(true);
  }, []);

  useEffect(() => {
    ensureListening();
    const onCapture = () => setHasInstallEvent(true);
    listeners.add(onCapture);
    return () => {
      listeners.delete(onCapture); // the window listener itself stays attached for the page's life
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);

  if (!ready) return null;
  const variant = installPromptVariant({ platform, isStandalone, hasInstallEvent, dismissed });
  if (variant === "none") return null;

  function dismiss() {
    writeDismissed();
    setDismissed(true);
  }

  async function handleInstallClick() {
    const event = capturedEvent;
    capturedEvent = null; // Chrome allows exactly one .prompt() call per captured event
    if (!event) return;
    await event.prompt();
    await event.userChoice;
    setHasInstallEvent(false);
  }

  return (
    <Card size="sm" className="relative mx-auto my-4 max-w-md">
      <button
        type="button"
        aria-label="Dismiss"
        onClick={dismiss}
        className="absolute right-3 top-3 text-slate hover:text-ink"
      >
        <X size={18} />
      </button>
      <p className="font-sora font-bold text-ink">Install rido</p>
      {variant === "ios-instructions" ? (
        <p className="mt-1 text-[14px] text-slate">
          Tap the Share icon, then &quot;Add to Home Screen.&quot;
        </p>
      ) : (
        <>
          <p className="mt-1 text-[14px] text-slate">
            Add rido to your home screen for one-tap access.
          </p>
          <Button variant="primary" size="sm" className="mt-3" onClick={handleInstallClick}>
            Install app
          </Button>
        </>
      )}
    </Card>
  );
}
