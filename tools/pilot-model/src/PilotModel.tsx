import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BPS_DENOMINATOR } from "@rido/pricing";
import {
  DEFAULT_MAPBOX_CENTS_PER_RIDE,
  DEFAULT_PROCESSING_PER_RIDE_CENTS,
  DEFAULT_PROCESSING_RATE_BPS,
  type ModelInputs,
  type ModelResult,
  runModel,
} from "./model.ts";
import { PUBLISHED_TIERS } from "./published-tiers.generated.ts";

/* ------------------------------------------------------------------ */
/*  RIDO — pilot economics model                                       */
/*  Directional planning tool, not accounting. Every input is editable.*/
/*                                                                     */
/*  The arithmetic lives in model.ts, which calls @rido/pricing. This  */
/*  file is sliders and charts — it does no money math of its own.     */
/*  Every amount in state is INTEGER CENTS; every rate is basis points.*/
/* ------------------------------------------------------------------ */

const C = {
  bg: "#FBFAF8",
  panel: "#FFFFFF",
  panelAlt: "#F4F2ED",
  border: "#E4E0D8",
  ink: "#16181D",
  inkSoft: "#5B5E66",
  inkFaint: "#9A9CA2",
  amber: "#E07B05",
  amberSoft: "#FBEBD3",
  teal: "#0F7A6B",
  red: "#C0413A",
};
const SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const MONO = "'SFMono-Regular', ui-monospace, Menlo, Consolas, 'DejaVu Sans Mono', monospace";

/** Formatting only — cents in, string out. No arithmetic on money happens in this file. */
const money = (c: number) => {
  const dollars = Math.round(c / 100);
  return (dollars < 0 ? "-$" : "$") + Math.abs(dollars).toLocaleString("en-US");
};
const moneyK = (c: number) => {
  const dollars = c / 100;
  if (Math.abs(dollars) >= 1000) {
    return (dollars < 0 ? "-$" : "$") + (Math.abs(dollars) / 1000).toFixed(0) + "k";
  }
  return (dollars < 0 ? "-$" : "$") + Math.abs(Math.round(dollars));
};
const moneyExact = (c: number) =>
  (c < 0 ? "-$" : "$") + (Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 });
const pctBps = (b: number, digits = 1) => ((b / BPS_DENOMINATOR) * 100).toFixed(digits) + "%";

/* ------------------------------------------------------------------ */
/*  Export — everything the model knows, in one CSV.                   */
/*                                                                     */
/*  Presentation, not money math: it formats values the model already */
/*  computed, the same way the chart labels above do. No arithmetic on */
/*  a fare happens here — see model.ts for that, and its tests for the */
/*  invariant this relies on (every cost line sums to costCents).      */
/* ------------------------------------------------------------------ */

const csvDollars = (c: number) => (c / 100).toFixed(2);
const csvPct = (b: number) => (b / BPS_DENOMINATOR) * 100;
/** Escapes a value for one CSV cell — only labels and booleans ever need it here. */
const csvCell = (v: string | number | boolean): string =>
  typeof v === "string" && /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : String(v);

function buildCsv(inputs: ModelInputs, result: ModelResult): string {
  const lines: string[] = [];
  const row = (...cells: (string | number | boolean)[]) => lines.push(cells.map(csvCell).join(","));

  row("RIDO pilot economics", `exported ${new Date().toISOString()}`);
  lines.push("");

  row("INPUTS");
  row("Horizon", inputs.horizonMonths, "months");
  row("Avg gross fare", csvDollars(inputs.fareCents));
  row("Drivers — start", inputs.driversStart);
  row(`Drivers — month ${inputs.horizonMonths}`, inputs.driversEnd);
  row("Riders — start", inputs.ridersStart);
  row(`Riders — month ${inputs.horizonMonths}`, inputs.ridersEnd);
  row("Rides/driver/mo — start", inputs.ridesPerDriverStart);
  row(`Rides/driver/mo — month ${inputs.horizonMonths}`, inputs.ridesPerDriverEnd);
  row("Flat fee turns on at (drivers)", inputs.feeOnAtDrivers);
  row("Steady-state flat fee", csvDollars(inputs.flatFeeCents));
  row("Waive commission before fee", inputs.waiveCommissionBeforeFee);
  inputs.tiers.forEach((t, i) => {
    const upper = t.upperBoundCents === null ? "no cap" : csvDollars(t.upperBoundCents);
    row(`Commission tier ${i + 1}`, `${csvPct(t.rateBps).toFixed(1)}% up to ${upper}`);
  });
  row("Insurance — fixed/mo", csvDollars(inputs.insuranceFixedCents));
  row("Insurance — per ride", csvDollars(inputs.insurancePerRideCents));
  row("Mapbox — per ride", csvDollars(inputs.mapboxCentsPerRide));
  row("Card processing rate", `${csvPct(inputs.processingRateBps).toFixed(2)}%`);
  row("Card processing — per ride", csvDollars(inputs.processingPerRideCents));
  row("Card processing passed to drivers", inputs.passProcessingToDrivers);
  row("Tech / hosting per mo", csvDollars(inputs.techCents));
  row("Acquisition cost / new driver", csvDollars(inputs.acquisitionPerDriverCents));
  row("Acquisition cost / new rider", csvDollars(inputs.acquisitionPerRiderCents));
  row("Team / payroll per mo", csvDollars(inputs.teamCents));
  row("Incumbent effective take", `${csvPct(inputs.incumbentTakeBps).toFixed(1)}%`);
  lines.push("");

  row("SUMMARY");
  row("Peak cash to fund", csvDollars(result.cashToFundCents), `month ${result.deepestMonth}`);
  row("Monthly break-even", result.breakEvenMonth ?? "not reached in horizon");
  row("Cash recouped", result.cashRecoupedMonth ?? "not reached in horizon");
  row("Flat fee starts", result.feeStartsMonth ?? "not reached in horizon");
  row("Steady-state blended take", `${csvPct(result.steady.blendedTakeBps).toFixed(1)}%`);
  row("Steady-state driver take-home/mo", csvDollars(result.steady.driverTakeHomeCents));
  row("Steady-state incumbent take-home/mo", csvDollars(result.steady.incumbentTakeHomeCents));
  row("Steady-state RIDO revenue/driver/mo", csvDollars(result.steady.revenuePerDriverCents));
  lines.push("");

  row("MONTHLY");
  row(
    "Month",
    "Phase",
    "Drivers",
    "Riders",
    "Rides",
    "GMV",
    "RIDO revenue",
    "Commission/driver",
    "Fee/driver",
    "Insurance",
    "Mapbox",
    "Card processing",
    "Tech/hosting",
    "Driver acquisition",
    "Rider acquisition",
    "Team",
    "Total cost",
    "Net",
    "Cumulative cash",
  );
  for (const r of result.rows) {
    row(
      r.month,
      r.phase,
      r.drivers,
      r.riders,
      r.rides,
      csvDollars(r.gmvCents),
      csvDollars(r.revenueCents),
      csvDollars(r.commissionPerDriverCents),
      csvDollars(r.feePerDriverCents),
      csvDollars(r.insuranceCents),
      csvDollars(r.mapboxCents),
      csvDollars(r.processingCents),
      csvDollars(r.techCents),
      csvDollars(r.driverAcquisitionCents),
      csvDollars(r.riderAcquisitionCents),
      csvDollars(r.teamCents),
      csvDollars(r.costCents),
      csvDollars(r.netCents),
      csvDollars(r.cumCents),
    );
  }

  return lines.join("\n");
}

function downloadModelCsv(inputs: ModelInputs, result: ModelResult): void {
  const blob = new Blob([buildCsv(inputs, result)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `rido-pilot-model-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/* ------- small UI atoms ------- */
function Eyebrow({ children, color = C.inkFaint }: { children: React.ReactNode; color?: string }) {
  return (
    <div
      style={{
        font: `600 10.5px/1.4 ${SANS}`,
        letterSpacing: "0.13em",
        textTransform: "uppercase",
        color,
      }}
    >
      {children}
    </div>
  );
}

function Slider({
  label,
  value,
  set,
  min,
  max,
  step = 1,
  fmt = (v: number) => String(v),
  unit,
}: {
  label: React.ReactNode;
  value: number;
  set: (n: number) => void;
  min: number;
  max: number;
  step?: number;
  fmt?: (v: number) => string;
  unit?: string;
}) {
  return (
    <label style={{ display: "block", marginBottom: 13 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 5,
        }}
      >
        <span style={{ font: `500 12.5px/1.3 ${SANS}`, color: C.inkSoft }}>{label}</span>
        <span
          style={{
            font: `600 13px/1 ${MONO}`,
            color: C.ink,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {fmt(value)}
          {unit ? <span style={{ color: C.inkFaint, fontWeight: 400 }}> {unit}</span> : null}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => set(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: C.amber, height: 4, cursor: "pointer" }}
      />
    </label>
  );
}

function Toggle({
  checked,
  set,
  children,
}: {
  checked: boolean;
  set: (b: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        marginBottom: 13,
        cursor: "pointer",
        font: `500 12.5px/1.3 ${SANS}`,
        color: C.inkSoft,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => set(e.target.checked)}
        style={{ accentColor: C.amber, width: 15, height: 15 }}
      />
      {children}
    </label>
  );
}

function Stat({
  label,
  value,
  sub,
  tone = "ink",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "ink" | "red" | "teal";
}) {
  const col = tone === "red" ? C.red : tone === "teal" ? C.teal : C.ink;
  return (
    <div style={{ flex: "1 1 0", minWidth: 130 }}>
      <Eyebrow>{label}</Eyebrow>
      <div
        style={{
          font: `700 27px/1.05 ${MONO}`,
          color: col,
          fontVariantNumeric: "tabular-nums",
          marginTop: 6,
          letterSpacing: "-0.01em",
        }}
      >
        {value}
      </div>
      {sub ? (
        <div style={{ font: `400 11.5px/1.35 ${SANS}`, color: C.inkFaint, marginTop: 4 }}>{sub}</div>
      ) : null}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          font: `700 12px/1 ${SANS}`,
          color: C.ink,
          marginBottom: 12,
          paddingBottom: 7,
          borderBottom: `1px solid ${C.border}`,
          letterSpacing: "0.01em",
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

interface TipProps {
  active?: boolean;
  label?: string | number;
  payload?: ReadonlyArray<{ name?: string; value?: number; color?: string }>;
}

function Tip({ active, payload, label }: TipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      style={{
        background: C.ink,
        color: "#fff",
        padding: "9px 11px",
        borderRadius: 7,
        font: `400 12px/1.5 ${SANS}`,
        boxShadow: "0 6px 18px rgba(0,0,0,.18)",
      }}
    >
      <div
        style={{
          font: `600 11px/1 ${SANS}`,
          opacity: 0.65,
          marginBottom: 5,
          letterSpacing: "0.04em",
        }}
      >
        MONTH {label}
      </div>
      {payload.map((p) => (
        <div
          key={p.name}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <span style={{ color: p.color }}>{p.name}</span>
          <span style={{ fontFamily: MONO }}>{money(p.value ?? 0)}</span>
        </div>
      ))}
    </div>
  );
}

function Legend({ c, t }: { c: string; t: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        font: `500 11.5px/1 ${SANS}`,
        color: C.inkSoft,
      }}
    >
      <span style={{ width: 11, height: 3, background: c, borderRadius: 2 }} />
      {t}
    </span>
  );
}

const btn: React.CSSProperties = {
  flex: 1,
  padding: "7px 8px",
  font: `600 11px/1.2 ${SANS}`,
  color: C.ink,
  background: C.panelAlt,
  border: `1px solid ${C.border}`,
  borderRadius: 7,
  cursor: "pointer",
};

export default function RidoPilotModel() {
  // Market ramp
  const [fareCents, setFareCents] = useState(1_800);
  const [horizonMonths, setHorizonMonths] = useState(12);
  const [driversStart, setDriversStart] = useState(25);
  const [driversEnd, setDriversEnd] = useState(200);
  const [ridesStart, setRidesStart] = useState(20);
  const [ridesEnd, setRidesEnd] = useState(120);
  // Riders don't feed revenue (that runs off driver-side fare volume) — this ramp exists only to
  // price rider acquisition below, the same way the driver ramp prices driver acquisition.
  const [ridersStart, setRidersStart] = useState(150);
  const [ridersEnd, setRidersEnd] = useState(2_500);

  // Take model. Tiers start at the seeded values and are then free to move — exploring rates is
  // the entire purpose of this tool. The starting positions are generated from the seed, so
  // "where we are today" is never a number typed into this file.
  const [flatFeeCents, setFlatFeeCents] = useState(5_000);
  const [feeOnAtDrivers, setFeeOnAtDrivers] = useState(150);
  const [waiveCommissionBeforeFee, setWaiveCommissionBeforeFee] = useState(false);
  const [rateBps, setRateBps] = useState<number[]>(() => PUBLISHED_TIERS.map((t) => t.rateBps));
  const [boundsCents, setBoundsCents] = useState<number[]>(() =>
    PUBLISHED_TIERS.slice(0, -1).map((t) => t.upperBoundCents ?? 0),
  );

  // Costs
  const [insuranceFixedCents, setInsuranceFixedCents] = useState(300_000);
  const [insurancePerRideCents, setInsurancePerRideCents] = useState(40);
  const [mapboxCentsPerRide, setMapboxCentsPerRide] = useState(DEFAULT_MAPBOX_CENTS_PER_RIDE);
  const [processingRateBps, setProcessingRateBps] = useState(DEFAULT_PROCESSING_RATE_BPS);
  const [processingPerRideCents, setProcessingPerRideCents] = useState(
    DEFAULT_PROCESSING_PER_RIDE_CENTS,
  );
  const [passProcessingToDrivers, setPassProcessing] = useState(false);
  const [techCents, setTechCents] = useState(100_000);
  const [acquisitionPerDriverCents, setAcquisitionCents] = useState(3_000);
  const [acquisitionPerRiderCents, setAcquisitionPerRiderCents] = useState(500);
  const [teamCents, setTeamCents] = useState(0);

  // Comparison
  const [incumbentTakeBps, setIncumbentTakeBps] = useState(3_000);

  const setAt = (setter: (u: (prev: number[]) => number[]) => void, i: number, v: number) =>
    setter((prev) => prev.map((x, j) => (j === i ? v : x)));

  // Rebuild the band set from the sliders. normalizeTiers (inside commissionForRide) rejects a
  // set that overlaps or leaves a gap, which is a real improvement: the old gradComm() would
  // silently return a wrong number if cap1 was dragged above cap2.
  const tiers = useMemo(
    () =>
      rateBps.map((bps, i) => ({
        tierOrder: i + 1,
        lowerBoundCents: i === 0 ? 0 : boundsCents[i - 1],
        upperBoundCents: i === boundsCents.length ? null : boundsCents[i],
        rateBps: bps,
      })),
    [rateBps, boundsCents],
  );

  const inputs: ModelInputs = {
    horizonMonths,
    fareCents,
    driversStart,
    driversEnd,
    ridesPerDriverStart: ridesStart,
    ridesPerDriverEnd: ridesEnd,
    ridersStart,
    ridersEnd,
    flatFeeCents,
    feeOnAtDrivers,
    waiveCommissionBeforeFee,
    tiers,
    insuranceFixedCents,
    insurancePerRideCents,
    mapboxCentsPerRide,
    processingRateBps,
    processingPerRideCents,
    passProcessingToDrivers,
    techCents,
    acquisitionPerDriverCents,
    acquisitionPerRiderCents,
    teamCents,
    incumbentTakeBps,
  };

  // A dragged-past-itself boundary makes the tier set invalid rather than quietly wrong. Show
  // the reason instead of a chart built on nonsense.
  let result: ReturnType<typeof runModel> | null = null;
  let modelError: string | null = null;
  try {
    result = runModel(inputs);
  } catch (cause) {
    modelError = cause instanceof Error ? cause.message : String(cause);
  }

  const presetVar = () => {
    setInsuranceFixedCents(50_000);
    setInsurancePerRideCents(40);
  };
  const presetFloor = () => {
    setInsuranceFixedCents(1_500_000);
    setInsurancePerRideCents(10);
  };

  return (
    <div
      style={{
        background: C.bg,
        color: C.ink,
        fontFamily: SANS,
        padding: "26px 22px",
        minHeight: "100%",
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <div
          style={{
            marginBottom: 18,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <span style={{ font: `800 21px/1 ${SANS}`, letterSpacing: "-0.02em" }}>RIDO</span>
            <span style={{ font: `500 13px/1 ${SANS}`, color: C.inkSoft }}>
              pilot economics — does the no-fee launch survive the fixed-cost wall?
            </span>
          </div>
          {result ? (
            <button
              type="button"
              onClick={() => downloadModelCsv(inputs, result)}
              style={{
                padding: "8px 14px",
                font: `600 12px/1 ${SANS}`,
                color: "#fff",
                background: C.ink,
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              Export CSV
            </button>
          ) : null}
        </div>

        {modelError ? (
          <div
            style={{
              background: "#F6E0DD",
              border: `1px solid ${C.red}55`,
              borderRadius: 10,
              padding: "13px 16px",
              font: `400 12.5px/1.55 ${SANS}`,
              color: "#7a1f19",
            }}
          >
            <strong>That tier set isn't valid.</strong> {modelError}
          </div>
        ) : result ? (
          <>
            <div
              style={{
                background: C.panel,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: "18px 20px",
                display: "flex",
                gap: 22,
                flexWrap: "wrap",
                marginBottom: 18,
                boxShadow: "0 1px 0 rgba(0,0,0,.02)",
              }}
            >
              <Stat
                label="Peak cash to fund"
                value={money(result.cashToFundCents)}
                sub={`deepest hole, month ${result.deepestMonth}`}
                tone={result.cashToFundCents > 0 ? "red" : "teal"}
              />
              <div style={{ width: 1, background: C.border, alignSelf: "stretch" }} />
              <Stat
                label="Monthly break-even"
                value={result.breakEvenMonth ? `Month ${result.breakEvenMonth}` : "—"}
                sub="revenue ≥ monthly cost"
                tone={result.breakEvenMonth ? "teal" : "red"}
              />
              <Stat
                label="Cash recouped"
                value={
                  result.cashRecoupedMonth ? `Month ${result.cashRecoupedMonth}` : "beyond horizon"
                }
                sub="cumulative back to $0"
                tone={result.cashRecoupedMonth ? "teal" : "red"}
              />
              <Stat
                label="Steady-state take"
                value={pctBps(result.steady.blendedTakeBps)}
                sub={`of GMV (vs incumbent ${pctBps(incumbentTakeBps, 0)})`}
              />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 340px) minmax(0, 1fr)",
                gap: 18,
                alignItems: "start",
              }}
            >
              {/* ---------------- controls ---------------- */}
              <div
                style={{
                  background: C.panel,
                  border: `1px solid ${C.border}`,
                  borderRadius: 12,
                  padding: "18px 18px 6px",
                }}
              >
                <Group title={`Market ramp (month 1 → ${horizonMonths})`}>
                  <Slider
                    label="Horizon"
                    value={horizonMonths}
                    set={(v) => setHorizonMonths(Math.round(v))}
                    min={3}
                    max={36}
                    unit="mo"
                  />
                  <Slider
                    label="Avg gross fare"
                    value={fareCents}
                    set={setFareCents}
                    min={800}
                    max={3500}
                    step={50}
                    fmt={moneyExact}
                  />
                  <Slider
                    label="Drivers — start"
                    value={driversStart}
                    set={setDriversStart}
                    min={5}
                    max={150}
                    unit="drv"
                  />
                  <Slider
                    label={`Drivers — month ${horizonMonths}`}
                    value={driversEnd}
                    set={setDriversEnd}
                    min={20}
                    max={1000}
                    step={10}
                    unit="drv"
                  />
                  <Slider
                    label="Riders — start"
                    value={ridersStart}
                    set={setRidersStart}
                    min={20}
                    max={2000}
                    step={10}
                    unit="rdr"
                  />
                  <Slider
                    label={`Riders — month ${horizonMonths}`}
                    value={ridersEnd}
                    set={setRidersEnd}
                    min={100}
                    max={20_000}
                    step={100}
                    unit="rdr"
                  />
                  <div
                    style={{
                      font: `400 11px/1.45 ${SANS}`,
                      color: C.inkFaint,
                      margin: "-6px 0 12px",
                    }}
                  >
                    Riders don't drive revenue here — that runs off driver-side fares regardless of
                    rider count. This ramp only prices rider acquisition, below.
                  </div>
                  <Slider
                    label="Rides/driver/mo — start"
                    value={ridesStart}
                    set={setRidesStart}
                    min={4}
                    max={120}
                  />
                  <Slider
                    label={`Rides/driver/mo — month ${horizonMonths}`}
                    value={ridesEnd}
                    set={setRidesEnd}
                    min={20}
                    max={320}
                    step={5}
                  />
                </Group>

                <Group title="Take model">
                  {/* ADR-0003: the fee turn-on is a traction signal, never a date. Dragging this
                      changes WHEN the fee starts only by changing when the business gets there. */}
                  <Slider
                    label="Flat fee turns on at"
                    value={feeOnAtDrivers}
                    set={setFeeOnAtDrivers}
                    min={10}
                    max={1000}
                    step={10}
                    unit="drv"
                  />
                  <div
                    style={{
                      font: `400 11px/1.45 ${SANS}`,
                      color: C.inkFaint,
                      margin: "-6px 0 12px",
                    }}
                  >
                    {result.feeStartsMonth
                      ? `Reached in month ${result.feeStartsMonth} on this ramp.`
                      : "Never reached on this ramp — the pilot runs the whole horizon."}
                  </div>
                  <Slider
                    label="Steady-state flat fee"
                    value={flatFeeCents}
                    set={setFlatFeeCents}
                    min={0}
                    max={15_000}
                    step={500}
                    fmt={money}
                    unit="/mo"
                  />
                  <Toggle checked={waiveCommissionBeforeFee} set={setWaiveCommissionBeforeFee}>
                    Waive commission too, until the fee starts
                  </Toggle>
                  <div
                    style={{
                      font: `400 11px/1.45 ${SANS}`,
                      color: C.inkFaint,
                      margin: "-8px 0 14px",
                    }}
                  >
                    Counterfactual — ADR-0003 charges commission through the pilot. Off by default.
                  </div>

                  <div
                    style={{
                      font: `600 10.5px/1.4 ${SANS}`,
                      color: C.inkFaint,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      margin: "4px 0 9px",
                    }}
                  >
                    Graduated commission (per driver / mo)
                  </div>
                  {rateBps.map((bps, i) => {
                    const lower = i === 0 ? 0 : boundsCents[i - 1];
                    const upper = i === boundsCents.length ? null : boundsCents[i];
                    const band =
                      upper === null
                        ? `above ${money(lower)}`
                        : i === 0
                          ? `first ${money(upper)}`
                          : `${money(lower)}–${money(upper)}`;
                    return (
                      <Slider
                        key={`rate-${i + 1}`}
                        label={`Rate on ${band}`}
                        value={bps}
                        set={(v) => setAt(setRateBps, i, v)}
                        min={0}
                        max={3_000}
                        step={50}
                        fmt={(v) => pctBps(v, 1)}
                      />
                    );
                  })}
                  {boundsCents.map((bound, i) => (
                    <Slider
                      key={`bound-${i + 1}`}
                      label={`Band ${i + 1} → ${i + 2} boundary`}
                      value={bound}
                      set={(v) => setAt(setBoundsCents, i, v)}
                      min={10_000}
                      max={1_000_000}
                      step={10_000}
                      fmt={money}
                      unit="/mo"
                    />
                  ))}
                </Group>

                <Group title="Costs">
                  <div style={{ display: "flex", gap: 7, marginBottom: 13 }}>
                    <button type="button" onClick={presetVar} style={btn}>
                      Variable insurance
                    </button>
                    <button type="button" onClick={presetFloor} style={btn}>
                      High fixed floor
                    </button>
                  </div>
                  <Slider
                    label="Insurance — fixed/mo (master policy)"
                    value={insuranceFixedCents}
                    set={setInsuranceFixedCents}
                    min={0}
                    max={2_500_000}
                    step={50_000}
                    fmt={moneyK}
                  />
                  <Slider
                    label="Insurance — per ride"
                    value={insurancePerRideCents}
                    set={setInsurancePerRideCents}
                    min={0}
                    max={200}
                    step={5}
                    fmt={moneyExact}
                  />
                  <Slider
                    label="Mapbox — per ride"
                    value={mapboxCentsPerRide}
                    set={setMapboxCentsPerRide}
                    min={0}
                    max={20}
                    step={1}
                    fmt={moneyExact}
                  />
                  <Slider
                    label="Card processing rate"
                    value={processingRateBps}
                    set={setProcessingRateBps}
                    min={0}
                    max={500}
                    step={10}
                    fmt={(v) => pctBps(v, 2)}
                  />
                  <Slider
                    label="Card processing — per ride"
                    value={processingPerRideCents}
                    set={setProcessingPerRideCents}
                    min={0}
                    max={100}
                    step={5}
                    fmt={moneyExact}
                  />
                  <Toggle checked={passProcessingToDrivers} set={setPassProcessing}>
                    Pass card-processing fees to drivers
                  </Toggle>
                  <Slider
                    label="Tech / hosting per mo"
                    value={techCents}
                    set={setTechCents}
                    min={0}
                    max={800_000}
                    step={25_000}
                    fmt={moneyK}
                  />
                  <Slider
                    label="Acquisition cost / new driver"
                    value={acquisitionPerDriverCents}
                    set={setAcquisitionCents}
                    min={0}
                    max={20_000}
                    step={500}
                    fmt={money}
                  />
                  <Slider
                    label="Acquisition cost / new rider"
                    value={acquisitionPerRiderCents}
                    set={setAcquisitionPerRiderCents}
                    min={0}
                    max={10_000}
                    step={250}
                    fmt={money}
                  />
                  <Slider
                    label="Team / payroll per mo"
                    value={teamCents}
                    set={setTeamCents}
                    min={0}
                    max={4_000_000}
                    step={100_000}
                    fmt={moneyK}
                  />
                </Group>

                <Group title="Driver comparison">
                  <Slider
                    label="Incumbent effective take"
                    value={incumbentTakeBps}
                    set={setIncumbentTakeBps}
                    min={1_500}
                    max={5_500}
                    step={50}
                    fmt={(v) => pctBps(v, 1)}
                  />
                </Group>
              </div>

              {/* ---------------- results ---------------- */}
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div
                  style={{
                    background: C.panel,
                    border: `1px solid ${C.border}`,
                    borderRadius: 12,
                    padding: "16px 16px 10px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      marginBottom: 4,
                      paddingLeft: 4,
                    }}
                  >
                    <Eyebrow color={C.ink}>Cumulative cash position</Eyebrow>
                    <span style={{ font: `400 11px/1 ${SANS}`, color: C.inkFaint }}>
                      below the line = burning your runway
                    </span>
                  </div>
                  <ResponsiveContainer width="100%" height={232}>
                    <ComposedChart data={result.rows} margin={{ top: 12, right: 8, left: 4, bottom: 2 }}>
                      <defs>
                        <linearGradient id="cumFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={C.amber} stopOpacity={0.22} />
                          <stop offset="100%" stopColor={C.amber} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      {result.cashToFundCents > 0 && (
                        <ReferenceArea
                          y1={-result.cashToFundCents * 1.05}
                          y2={0}
                          fill={C.red}
                          fillOpacity={0.05}
                        />
                      )}
                      {result.feeStartsMonth !== null && (
                        <ReferenceLine
                          x={result.feeStartsMonth}
                          stroke={C.inkSoft}
                          strokeDasharray="3 3"
                          label={{
                            value: "fee starts",
                            position: "top",
                            fill: C.inkSoft,
                            fontSize: 10,
                            fontFamily: SANS,
                          }}
                        />
                      )}
                      <CartesianGrid stroke={C.border} vertical={false} />
                      <XAxis
                        dataKey="month"
                        tick={{ fill: C.inkFaint, fontSize: 11, fontFamily: MONO }}
                        tickLine={false}
                        axisLine={{ stroke: C.border }}
                      />
                      <YAxis
                        tickFormatter={moneyK}
                        tick={{ fill: C.inkFaint, fontSize: 11, fontFamily: MONO }}
                        tickLine={false}
                        axisLine={false}
                        width={48}
                      />
                      <Tooltip content={<Tip />} />
                      <ReferenceLine y={0} stroke={C.ink} strokeWidth={1.4} />
                      <Area
                        type="monotone"
                        dataKey="cumCents"
                        name="Cumulative cash"
                        stroke={C.amber}
                        strokeWidth={2.4}
                        fill="url(#cumFill)"
                        dot={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                <div
                  style={{
                    background: C.panel,
                    border: `1px solid ${C.border}`,
                    borderRadius: 12,
                    padding: "16px 16px 10px",
                  }}
                >
                  <div style={{ paddingLeft: 4, marginBottom: 4 }}>
                    <Eyebrow color={C.ink}>Monthly revenue vs total cost</Eyebrow>
                  </div>
                  <ResponsiveContainer width="100%" height={186}>
                    <LineChart data={result.rows} margin={{ top: 10, right: 8, left: 4, bottom: 2 }}>
                      {result.feeStartsMonth !== null && (
                        <ReferenceLine
                          x={result.feeStartsMonth}
                          stroke={C.inkSoft}
                          strokeDasharray="3 3"
                        />
                      )}
                      <CartesianGrid stroke={C.border} vertical={false} />
                      <XAxis
                        dataKey="month"
                        tick={{ fill: C.inkFaint, fontSize: 11, fontFamily: MONO }}
                        tickLine={false}
                        axisLine={{ stroke: C.border }}
                      />
                      <YAxis
                        tickFormatter={moneyK}
                        tick={{ fill: C.inkFaint, fontSize: 11, fontFamily: MONO }}
                        tickLine={false}
                        axisLine={false}
                        width={48}
                      />
                      <Tooltip content={<Tip />} />
                      <Line
                        type="monotone"
                        dataKey="revenueCents"
                        name="RIDO revenue"
                        stroke={C.teal}
                        strokeWidth={2.4}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="costCents"
                        name="Total cost"
                        stroke={C.red}
                        strokeWidth={2.4}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  <div style={{ display: "flex", gap: 16, paddingLeft: 4, marginTop: 2 }}>
                    <Legend c={C.teal} t="RIDO revenue" />
                    <Legend c={C.red} t="Total cost" />
                  </div>
                </div>

                <div
                  style={{
                    background: C.panel,
                    border: `1px solid ${C.border}`,
                    borderRadius: 12,
                    padding: "18px 20px",
                  }}
                >
                  <div style={{ marginBottom: 14 }}>
                    <Eyebrow color={C.ink}>
                      Steady-state unit economics (month {horizonMonths} driver)
                    </Eyebrow>
                  </div>
                  <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
                    <Stat
                      label="Driver take-home"
                      value={money(result.steady.driverTakeHomeCents)}
                      sub={`on ${money(result.steady.grossPerDriverCents)} of fares, after commission and fee`}
                      tone="teal"
                    />
                    <Stat
                      label="vs incumbent driver"
                      value={
                        (result.steady.advantageCents >= 0 ? "+" : "") +
                        money(result.steady.advantageCents)
                      }
                      sub={`incumbent: ${money(result.steady.incumbentTakeHomeCents)}/mo`}
                      tone={result.steady.advantageCents >= 0 ? "teal" : "red"}
                    />
                    <Stat
                      label="RIDO / driver / mo"
                      value={money(result.steady.revenuePerDriverCents)}
                      sub={`${pctBps(result.steady.blendedTakeBps)} blended take`}
                    />
                  </div>
                  <div
                    style={{
                      marginTop: 14,
                      paddingTop: 13,
                      borderTop: `1px solid ${C.border}`,
                      font: `400 11.5px/1.55 ${SANS}`,
                      color: C.inkSoft,
                    }}
                  >
                    Modeled on the <em>average</em> driver, so the real blended take runs a touch
                    higher (more drivers sit in the high-rate low band). Directional, not your
                    books.
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : null}

        <div
          style={{
            marginTop: 16,
            padding: "13px 16px",
            background: C.amberSoft,
            border: `1px solid ${C.amber}33`,
            borderRadius: 10,
            font: `400 12px/1.55 ${SANS}`,
            color: "#7a4a08",
          }}
        >
          <strong>The master variable is insurance.</strong> Toggle <em>Variable insurance</em> vs{" "}
          <em>High fixed floor</em> and watch the cash hole change by an order of magnitude — same
          business, different insurer quote. That single number (a broker call) decides whether the
          pilot costs a few thousand or six figures. Everything else here is a slider; that one is
          a phone call you haven't made yet.
        </div>
      </div>
    </div>
  );
}
