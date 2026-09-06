"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import type { RiderProfile } from "@/lib/riders/server.ts";
import { setDisplayName } from "./actions";

/**
 * The name a driver sees during a live ride, and a rider's one place to set or change it.
 *
 * `profile` always has a row by the time this renders — `account/page.tsx` calls
 * `ensureRiderProfile()` before mounting this, so there is no "create it first" state here, only
 * "edit what exists." `display_name` can still be `null`: any account created before ADR-0022, or
 * a phone sign-up that skipped the name field before this shipped.
 */
export function RiderNameCard({ profile }: { profile: RiderProfile }) {
  const [editing, setEditing] = useState(profile.display_name === null);
  const [name, setName] = useState(profile.display_name ?? "");
  const [saved, setSaved] = useState(profile.display_name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setBusy(true);
    setError(null);
    const result = await setDisplayName(name);
    setBusy(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSaved(name.trim());
    setEditing(false);
  }

  return (
    <Card>
      <h2 className="mb-1 font-sora text-lg font-bold text-midnight">Your name</h2>
      <p className="mb-4 text-[13px] text-slate">
        What your driver sees on a ride, and what a driver you rate sees you as.
      </p>

      {editing ? (
        <div className="space-y-3">
          <Input
            label="Name"
            type="text"
            autoComplete="name"
            disabled={busy}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alex Rivera"
          />
          {error ? (
            <p role="alert" className="text-[13px] text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={handleSave}>
              {busy ? "Saving…" : "Save"}
            </Button>
            {saved ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setName(saved ?? "");
                  setEditing(false);
                  setError(null);
                }}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <p className="font-semibold text-ink">{saved}</p>
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </div>
      )}
    </Card>
  );
}
