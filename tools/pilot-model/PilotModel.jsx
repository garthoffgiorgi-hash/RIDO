import React, { useState, useMemo } from "react";
import {
  ComposedChart, Area, Line, LineChart, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ReferenceArea, ResponsiveContainer,
} from "recharts";

/* ------------------------------------------------------------------ */
/*  RIDO — pilot economics model                                       */
/*  Directional planning tool, not accounting. Every input is editable.*/
/* ------------------------------------------------------------------ */

const C = {
  bg: "#FBFAF8", panel: "#FFFFFF", panelAlt: "#F4F2ED", border: "#E4E0D8",
  ink: "#16181D", inkSoft: "#5B5E66", inkFaint: "#9A9CA2",
  amber: "#E07B05", amberSoft: "#FBEBD3",
  teal: "#0F7A6B", tealSoft: "#DCEFEA",
  red: "#C0413A", redSoft: "#F6E0DD",
};
const SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const MONO = "'SFMono-Regular', ui-monospace, Menlo, Consolas, 'DejaVu Sans Mono', monospace";

const money = (n) => {
  const r = Math.round(n);
  return (r < 0 ? "-$" : "$") + Math.abs(r).toLocaleString("en-US");
};
const moneyK = (n) => {
  if (Math.abs(n) >= 1000) return (n < 0 ? "-$" : "$") + (Math.abs(n) / 1000).toFixed(0) + "k";
  return (n < 0 ? "-$" : "$") + Math.abs(Math.round(n));
};
const pct = (n) => (n * 100).toFixed(1) + "%";
const lerp = (a, b, t) => a + (b - a) * t;

/* graduated commission on one driver's monthly fare revenue */
function gradComm(g, t) {
  const c1 = Math.min(g, t.cap1) * t.r1;
  const c2 = Math.max(0, Math.min(g, t.cap2) - t.cap1) * t.r2;
  const c3 = Math.max(0, g - t.cap2) * t.r3;
  return c1 + c2 + c3;
}

/* ------- small UI atoms ------- */
function Eyebrow({ children, color = C.inkFaint }) {
  return (
    <div style={{ font: `600 10.5px/1.4 ${SANS}`, letterSpacing: "0.13em", textTransform: "uppercase", color }}>
      {children}
    </div>
  );
}
function Slider({ label, value, set, min, max, step = 1, fmt = (v) => v, unit }) {
  return (
    <label style={{ display: "block", marginBottom: 13 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
        <span style={{ font: `500 12.5px/1.3 ${SANS}`, color: C.inkSoft }}>{label}</span>
        <span style={{ font: `600 13px/1 ${MONO}`, color: C.ink, fontVariantNumeric: "tabular-nums" }}>
          {fmt(value)}{unit ? <span style={{ color: C.inkFaint, fontWeight: 400 }}> {unit}</span> : null}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => set(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: C.amber, height: 4, cursor: "pointer" }} />
    </label>
  );
}
function Stat({ label, value, sub, tone = "ink" }) {
  const col = tone === "red" ? C.red : tone === "teal" ? C.teal : C.ink;
  return (
    <div style={{ flex: "1 1 0", minWidth: 130 }}>
      <Eyebrow>{label}</Eyebrow>
      <div style={{ font: `700 27px/1.05 ${MONO}`, color: col, fontVariantNumeric: "tabular-nums", marginTop: 6, letterSpacing: "-0.01em" }}>
        {value}
      </div>
      {sub ? <div style={{ font: `400 11.5px/1.35 ${SANS}`, color: C.inkFaint, marginTop: 4 }}>{sub}</div> : null}
    </div>
  );
}
function Group({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ font: `700 12px/1 ${SANS}`, color: C.ink, marginBottom: 12, paddingBottom: 7, borderBottom: `1px solid ${C.border}`, letterSpacing: "0.01em" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

/* ------- tooltip ------- */
function Tip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{ background: C.ink, color: "#fff", padding: "9px 11px", borderRadius: 7, font: `400 12px/1.5 ${SANS}`, boxShadow: "0 6px 18px rgba(0,0,0,.18)" }}>
      <div style={{ font: `600 11px/1 ${SANS}`, opacity: 0.65, marginBottom: 5, letterSpacing: "0.04em" }}>MONTH {label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 16, fontVariantNumeric: "tabular-nums" }}>
          <span style={{ color: p.color }}>{p.name}</span>
          <span style={{ fontFamily: MONO }}>{money(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function RidoPilotModel() {
  // market ramp
  const [fare, setFare] = useState(18);
  const [pilotMonths, setPilotMonths] = useState(6);
  const [horizon] = useState(12);
  const [d0, setD0] = useState(25);
  const [d1, setD1] = useState(200);
  const [r0, setR0] = useState(20);
  const [r1, setR1] = useState(120);
  // take model
  const [flatFee, setFlatFee] = useState(50);
  const [pilotFee, setPilotFee] = useState(0);
  const [pilotComm, setPilotComm] = useState(true);
  const [r1rate, setR1rate] = useState(20);
  const [cap1, setCap1] = useState(1000);
  const [r2rate, setR2rate] = useState(12);
  const [cap2, setCap2] = useState(3000);
  const [r3rate, setR3rate] = useState(8);
  // costs
  const [insFixed, setInsFixed] = useState(3000);
  const [insPerRide, setInsPerRide] = useState(0.4);
  const [procPass, setProcPass] = useState(false);
  const [tech, setTech] = useState(1000);
  const [cac, setCac] = useState(30);
  const [team, setTeam] = useState(0);
  // comparison
  const [incTake, setIncTake] = useState(30);

  const tiers = { r1: r1rate / 100, cap1, r2: r2rate / 100, cap2, r3: r3rate / 100 };

  const { rows, peakCash, peakMonth, beMonth, cumBeMonth, steady } = useMemo(() => {
    const out = [];
    let cum = 0, prevD = 0;
    let peakCash = 0, peakMonth = 0, beMonth = null, cumBeMonth = null;
    for (let m = 1; m <= horizon; m++) {
      const t = horizon > 1 ? (m - 1) / (horizon - 1) : 0;
      const drivers = Math.round(lerp(d0, d1, t));
      const rpd = lerp(r0, r1, t);
      const rides = drivers * rpd;
      const gmv = rides * fare;
      const gPer = rpd * fare;
      const inPilot = m <= pilotMonths;

      const commPer = inPilot && !pilotComm ? 0 : gradComm(gPer, tiers);
      const feePer = inPilot ? pilotFee : flatFee;
      const revPer = commPer + feePer;
      const revenue = drivers * revPer;

      const insurance = insFixed + insPerRide * rides;
      const processing = procPass ? 0 : gmv * 0.029 + rides * 0.3;
      const newD = Math.max(0, drivers - prevD);
      const marketing = newD * cac;
      const cost = insurance + processing + tech + marketing + team;

      const net = revenue - cost;
      cum += net;
      if (cum < peakCash) { peakCash = cum; peakMonth = m; }
      if (beMonth === null && net >= 0) beMonth = m;
      if (cumBeMonth === null && cum >= 0 && m > 1) cumBeMonth = m;

      out.push({ month: m, drivers, rides: Math.round(rides), gmv, revenue, cost, net, cum,
        phase: inPilot ? "Pilot" : "Steady", gPer, revPer, commPer, feePer });
      prevD = drivers;
    }
    const last = out[out.length - 1];
    const steady = {
      gPer: last.gPer, revPer: last.revPer, blended: last.revPer / last.gPer,
      take: last.gPer - last.revPer, incHome: last.gPer * (1 - incTake / 100),
    };
    return { rows: out, peakCash, peakMonth, beMonth, cumBeMonth, steady };
  }, [fare, pilotMonths, horizon, d0, d1, r0, r1, flatFee, pilotFee, pilotComm,
      r1rate, cap1, r2rate, cap2, r3rate, insFixed, insPerRide, procPass, tech, cac, team, incTake]);

  const cashNeeded = -peakCash;
  const minCum = Math.min(0, ...rows.map((r) => r.cum));
  const driverAdv = steady.take !== undefined ? (steady.gPer - steady.take) - steady.incHome : 0;
  // driver take-home advantage vs incumbent (positive = RIDO driver keeps more)
  const advVsInc = (steady.gPer - steady.take) - steady.incHome;

  const presetVar = () => { setInsFixed(500); setInsPerRide(0.4); };
  const presetFloor = () => { setInsFixed(15000); setInsPerRide(0.1); };

  return (
    <div style={{ background: C.bg, color: C.ink, fontFamily: SANS, padding: "26px 22px", minHeight: "100%", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>

        {/* header */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <span style={{ font: `800 21px/1 ${SANS}`, letterSpacing: "-0.02em" }}>RIDO</span>
            <span style={{ font: `500 13px/1 ${SANS}`, color: C.inkSoft }}>pilot economics — does the no-fee launch survive the fixed-cost wall?</span>
          </div>
        </div>

        {/* verdict band */}
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: "18px 20px", display: "flex", gap: 22, flexWrap: "wrap", marginBottom: 18, boxShadow: "0 1px 0 rgba(0,0,0,.02)" }}>
          <Stat label="Peak cash to fund" value={money(cashNeeded)} sub={`deepest hole, month ${peakMonth}`} tone={cashNeeded > 0 ? "red" : "teal"} />
          <div style={{ width: 1, background: C.border, alignSelf: "stretch" }} />
          <Stat label="Monthly break-even" value={beMonth ? `Month ${beMonth}` : "—"} sub="revenue ≥ monthly cost" tone={beMonth ? "teal" : "red"} />
          <Stat label="Cash recouped" value={cumBeMonth ? `Month ${cumBeMonth}` : "beyond horizon"} sub="cumulative back to $0" tone={cumBeMonth ? "teal" : "red"} />
          <Stat label="Steady-state take" value={pct(steady.blended)} sub={`of GMV (vs incumbent ${incTake}%)`} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 340px) minmax(0, 1fr)", gap: 18, alignItems: "start" }}>

          {/* ---------------- controls ---------------- */}
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: "18px 18px 6px" }}>
            <Group title="Market ramp (month 1 → 12)">
              <Slider label="Avg gross fare" value={fare} set={setFare} min={8} max={35} step={0.5} fmt={(v) => "$" + v} />
              <Slider label="Drivers — start" value={d0} set={setD0} min={5} max={150} fmt={(v) => v} unit="drv" />
              <Slider label="Drivers — month 12" value={d1} set={setD1} min={20} max={1000} step={10} fmt={(v) => v} unit="drv" />
              <Slider label="Rides/driver/mo — start" value={r0} set={setR0} min={4} max={120} fmt={(v) => v} />
              <Slider label="Rides/driver/mo — month 12" value={r1} set={setR1} min={20} max={320} step={5} fmt={(v) => v} />
            </Group>

            <Group title="Take model">
              <Slider label="Pilot length (no flat fee)" value={pilotMonths} set={setPilotMonths} min={0} max={12} fmt={(v) => v} unit="mo" />
              <label style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 13, cursor: "pointer", font: `500 12.5px/1.3 ${SANS}`, color: C.inkSoft }}>
                <input type="checkbox" checked={pilotComm} onChange={(e) => setPilotComm(e.target.checked)} style={{ accentColor: C.amber, width: 15, height: 15 }} />
                Charge graduated commission during pilot
              </label>
              <Slider label="Pilot flat fee" value={pilotFee} set={setPilotFee} min={0} max={50} step={5} fmt={(v) => "$" + v} unit="/mo" />
              <Slider label="Steady-state flat fee" value={flatFee} set={setFlatFee} min={0} max={150} step={5} fmt={(v) => "$" + v} unit="/mo" />
              <div style={{ font: `600 10.5px/1.4 ${SANS}`, color: C.inkFaint, letterSpacing: "0.1em", textTransform: "uppercase", margin: "4px 0 9px" }}>Graduated commission (per driver / mo)</div>
              <Slider label={`Rate on first $${cap1.toLocaleString()}`} value={r1rate} set={setR1rate} min={0} max={30} step={0.5} fmt={(v) => v + "%"} />
              <Slider label={`Tier-2 rate ($${cap1.toLocaleString()}–$${cap2.toLocaleString()})`} value={r2rate} set={setR2rate} min={0} max={25} step={0.5} fmt={(v) => v + "%"} />
              <Slider label={`Tier-3 rate (above $${cap2.toLocaleString()})`} value={r3rate} set={setR3rate} min={0} max={20} step={0.5} fmt={(v) => v + "%"} />
            </Group>

            <Group title="Costs">
              <div style={{ display: "flex", gap: 7, marginBottom: 13 }}>
                <button onClick={presetVar} style={btn(C)}>Variable insurance</button>
                <button onClick={presetFloor} style={btn(C)}>High fixed floor</button>
              </div>
              <Slider label="Insurance — fixed/mo (master policy)" value={insFixed} set={setInsFixed} min={0} max={25000} step={500} fmt={moneyK} />
              <Slider label="Insurance — per ride" value={insPerRide} set={setInsPerRide} min={0} max={2} step={0.05} fmt={(v) => "$" + v.toFixed(2)} />
              <label style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 13, cursor: "pointer", font: `500 12.5px/1.3 ${SANS}`, color: C.inkSoft }}>
                <input type="checkbox" checked={procPass} onChange={(e) => setProcPass(e.target.checked)} style={{ accentColor: C.amber, width: 15, height: 15 }} />
                Pass card-processing fees to drivers
              </label>
              <Slider label="Tech / hosting per mo" value={tech} set={setTech} min={0} max={8000} step={250} fmt={moneyK} />
              <Slider label="Acquisition cost / new driver" value={cac} set={setCac} min={0} max={200} step={5} fmt={(v) => "$" + v} />
              <Slider label="Team / payroll per mo" value={team} set={setTeam} min={0} max={40000} step={1000} fmt={moneyK} />
            </Group>

            <Group title="Driver comparison">
              <Slider label="Incumbent effective take" value={incTake} set={setIncTake} min={15} max={55} fmt={(v) => v + "%"} />
            </Group>
          </div>

          {/* ---------------- results ---------------- */}
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

            {/* hero: cumulative cash */}
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 16px 10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4, paddingLeft: 4 }}>
                <Eyebrow color={C.ink}>Cumulative cash position</Eyebrow>
                <span style={{ font: `400 11px/1 ${SANS}`, color: C.inkFaint }}>below the line = burning your runway</span>
              </div>
              <ResponsiveContainer width="100%" height={232}>
                <ComposedChart data={rows} margin={{ top: 12, right: 8, left: 4, bottom: 2 }}>
                  <defs>
                    <linearGradient id="cumFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.amber} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={C.amber} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  {minCum < 0 && <ReferenceArea y1={minCum * 1.05} y2={0} fill={C.red} fillOpacity={0.05} />}
                  {pilotMonths > 0 && pilotMonths < horizon && (
                    <ReferenceLine x={pilotMonths} stroke={C.inkSoft} strokeDasharray="3 3"
                      label={{ value: "fee starts", position: "top", fill: C.inkSoft, fontSize: 10, fontFamily: SANS }} />
                  )}
                  <CartesianGrid stroke={C.border} vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: C.inkFaint, fontSize: 11, fontFamily: MONO }} tickLine={false} axisLine={{ stroke: C.border }} />
                  <YAxis tickFormatter={moneyK} tick={{ fill: C.inkFaint, fontSize: 11, fontFamily: MONO }} tickLine={false} axisLine={false} width={48} />
                  <Tooltip content={<Tip />} />
                  <ReferenceLine y={0} stroke={C.ink} strokeWidth={1.4} />
                  <Area type="monotone" dataKey="cum" name="Cumulative cash" stroke={C.amber} strokeWidth={2.4} fill="url(#cumFill)" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* revenue vs cost */}
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 16px 10px" }}>
              <div style={{ paddingLeft: 4, marginBottom: 4 }}><Eyebrow color={C.ink}>Monthly revenue vs total cost</Eyebrow></div>
              <ResponsiveContainer width="100%" height={186}>
                <LineChart data={rows} margin={{ top: 10, right: 8, left: 4, bottom: 2 }}>
                  {pilotMonths > 0 && pilotMonths < horizon && (
                    <ReferenceLine x={pilotMonths} stroke={C.inkSoft} strokeDasharray="3 3" />
                  )}
                  <CartesianGrid stroke={C.border} vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: C.inkFaint, fontSize: 11, fontFamily: MONO }} tickLine={false} axisLine={{ stroke: C.border }} />
                  <YAxis tickFormatter={moneyK} tick={{ fill: C.inkFaint, fontSize: 11, fontFamily: MONO }} tickLine={false} axisLine={false} width={48} />
                  <Tooltip content={<Tip />} />
                  <Line type="monotone" dataKey="revenue" name="RIDO revenue" stroke={C.teal} strokeWidth={2.4} dot={false} />
                  <Line type="monotone" dataKey="cost" name="Total cost" stroke={C.red} strokeWidth={2.4} dot={false} />
                </LineChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", gap: 16, paddingLeft: 4, marginTop: 2 }}>
                <Legend c={C.teal} t="RIDO revenue" /><Legend c={C.red} t="Total cost" />
              </div>
            </div>

            {/* unit economics */}
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: "18px 20px" }}>
              <div style={{ marginBottom: 14 }}><Eyebrow color={C.ink}>Steady-state unit economics (month 12 driver)</Eyebrow></div>
              <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
                <Stat label="Driver take-home" value={money(steady.gPer - steady.take)} sub={`on ${money(steady.gPer)} of fares`} tone="teal" />
                <Stat label="vs incumbent driver" value={(advVsInc >= 0 ? "+" : "") + money(advVsInc)} sub={`incumbent: ${money(steady.incHome)}/mo`} tone={advVsInc >= 0 ? "teal" : "red"} />
                <Stat label="RIDO / driver / mo" value={money(steady.revPer)} sub={`${pct(steady.blended)} blended take`} />
              </div>
              <div style={{ marginTop: 14, paddingTop: 13, borderTop: `1px solid ${C.border}`, font: `400 11.5px/1.55 ${SANS}`, color: C.inkSoft }}>
                Modeled on the <em>average</em> driver, so the real blended take runs a touch higher (more drivers sit in the high-rate low band). Directional, not your books.
              </div>
            </div>
          </div>
        </div>

        {/* footer caveat */}
        <div style={{ marginTop: 16, padding: "13px 16px", background: C.amberSoft, border: `1px solid ${C.amber}33`, borderRadius: 10, font: `400 12px/1.55 ${SANS}`, color: "#7a4a08" }}>
          <strong>The master variable is insurance.</strong> Toggle <em>Variable insurance</em> vs <em>High fixed floor</em> and watch the cash hole change by an order of magnitude — same business, different insurer quote. That single number (a broker call) decides whether the pilot costs a few thousand or six figures. Everything else here is a slider; that one is a phone call you haven't made yet.
        </div>
      </div>
    </div>
  );
}

function Legend({ c, t }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, font: `500 11.5px/1 ${SANS}`, color: C.inkSoft }}>
      <span style={{ width: 11, height: 3, background: c, borderRadius: 2 }} />{t}
    </span>
  );
}
function btn(C) {
  return {
    flex: 1, padding: "7px 8px", font: `600 11px/1.2 ${SANS}`, color: C.ink,
    background: C.panelAlt, border: `1px solid ${C.border}`, borderRadius: 7, cursor: "pointer",
  };
}
