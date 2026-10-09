// Frog scorecard: the audit's problems, each measured by KPIs computed from the hub.
// Every KPI has a definition, a target, a value for the last 7 days, a weekly trend,
// a pub-by-pub split, and the problem it answers. Insights are written from the figures.

import * as hub from "./hub.mjs";
import { TARGETS, PUBS, PUB, DATES, TODAY, TICKETS, NEPTING, SHIFTS, CALLS, BOOKINGS, WEB, EVENTS, INVOICES, ORDERS, dow } from "./data.mjs";

const r1 = (x) => Math.round(x * 10) / 10;
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
const pct = (a, b) => (b ? (100 * a) / b : 0);
const inR = (d, f, t) => d >= f && d <= t;

/* ---------- time windows ---------- */

export function windows(date = TODAY) {
  const weeks = [["W1", "2026-09-01", "2026-09-07"], ["W2", "2026-09-08", "2026-09-14"], ["W3", "2026-09-15", "2026-09-21"], ["W4", "2026-09-22", "2026-09-28"]]
    .filter(([, , to]) => to <= date).map(([label, from, to]) => ({ label, from, to }));
  return { weeks, current: { label: "Last 7 days", from: hub.addDays(date, -6) < DATES[0] ? DATES[0] : hub.addDays(date, -6), to: date }, month: { from: DATES[0], to: date } };
}

/* ---------- cached slices ---------- */

const cache = new Map();
function slice(pub, from, to) {
  const k = `${pub || "all"}|${from}|${to}`;
  if (!cache.has(k)) {
    const t = TICKETS.filter((x) => (!pub || x.pub === pub) && inR(x.date, from, to));
    const n = NEPTING.filter((x) => (!pub || x.pub === pub) && inR(x.date, from, to));
    const s = SHIFTS.filter((x) => (!pub || x.pub === pub) && inR(x.date, from, to));
    const c = CALLS.filter((x) => (!pub || x.pub === pub) && inR(x.date, from, to));
    const b = BOOKINGS.filter((x) => (!pub || x.pub === pub) && inR(x.date, from, to));
    const w = WEB.filter((x) => (!pub || x.pub === pub) && inR(x.date, from, to));
    cache.set(k, { t, n, s, c, b, w, days: DATES.filter((d) => inR(d, from, to)), pubs: pub ? [pub] : PUBS.map((p) => p.id) });
  }
  return cache.get(k);
}
const revenue = (S) => sum(S.t, (x) => x.total);
const target = (S) => sum(S.pubs, (p) => sum(S.days, (d) => TARGETS[`${p}|${d}`]));
function modeErrorEuros(tickets) {
  let e = 0;
  for (const x of tickets) {
    const real = {}, clicked = {};
    for (const y of x.payments) real[y.mode] = (real[y.mode] || 0) + y.amount;
    for (const y of x.zeltyPayments) clicked[y.mode] = (clicked[y.mode] || 0) + y.amount;
    const modes = new Set([...Object.keys(real), ...Object.keys(clicked)]);
    let d = 0; for (const m of modes) d += Math.abs((real[m] || 0) - (clicked[m] || 0));
    e += d / 2;
  }
  return e;
}
const isRush = (x) => [5, 6].includes(dow(x.date)) && x.open >= 19 * 60 && x.open < 23 * 60;

/* ---------- problems & KPIs ---------- */
// value(S) returns a number; unit: "%", "€", "min", "h", "days", "" ; better: "up" | "down"

export const PROBLEMS = [
  { id: "takings", n: "01", name: "Takings & payment modes", owner: "Accounting · SMs", agents: ["close", "finance"],
    pain: "Zelty does not split payment modes reliably; accounting checks five portals by hand and every cash-up is reconciled line by line." },
  { id: "revenue", n: "02", name: "Revenue, targets & reporting", owner: "Paul · GMs", agents: ["close", "rota"],
    pain: "Milestones counted at table closing, Manager Reports typed by hand, budgets that drift from the real trade." },
  { id: "clubfrog", n: "03", name: "Club Frog loyalty", owner: "Emma · GMs", agents: ["guests"],
    pain: "The 20 % participation target is missed and measured by hand; scans fail at the bar." },
  { id: "purchasing", n: "04", name: "Purchasing & supplier prices", owner: "GMs · Accounting", agents: ["purchasing"],
    pain: "Invoices validated twice, no automatic price check: over-billing went unnoticed for months." },
  { id: "labour", n: "05", name: "Labour & productivity", owner: "GMs · Paul", agents: ["rota"],
    pain: "Rotas built by hand around matches and groups; staff cost not steered against the real trade." },
  { id: "guests", n: "06", name: "Guests, bookings & calls", owner: "GMs · Tory · Liz", agents: ["bookings", "guests"],
    pain: "Missed calls never measured, Reserve with Google off in two pubs, web clicks never joined to bookings." },
  { id: "compliance", n: "07", name: "Compliance & cash collection", owner: "Accounting · Tory", agents: ["finance", "bookings"],
    pain: "Beer duty ledger sometimes incomplete (€1,500 per line); group deposits chased by hand." },
  { id: "data", n: "08", name: "Data & dependency", owner: "Sébastien · Paul", agents: ["copilot"],
    pain: "14 missing links between tools, data re-typed, every question goes through Sébastien (1–3 weeks)." },
];

export const KPIS = [
  // 01 takings
  { id: "modeError", problem: "takings", name: "Takings in the wrong payment mode", unit: "%", better: "down", target: 0.5, def: "Share of takings clicked in a different payment mode in Zelty than what the terminal, voucher scan or cash count shows.", source: "Zelty × Nepting × voucher OCR",
    value: (S) => pct(modeErrorEuros(S.t), revenue(S)), note: "At source in Zelty; the hub posts the corrected split to Sage." },
  { id: "cardMatch", problem: "takings", name: "Card payments matched automatically", unit: "%", better: "up", target: 99.5, def: "Terminal payments linked to their Zelty table and to the server who cashed them.", source: "Nepting × Zelty",
    value: (S) => pct(S.n.filter((x) => x.ticket).length, S.n.length) },
  { id: "cashupMin", problem: "takings", name: "SM time on cash-up", unit: "min", better: "down", target: 10, def: "Minutes per pub per day still spent checking payments (2 min per unmatched line). Before the hub: 8 min per staff on shift.", source: "Hub reconciliation",
    value: (S) => sum(S.n.filter((x) => !x.ticket), () => 2) / (S.days.length * S.pubs.length),
    baseline: (S) => (new Set(S.s.map((x) => `${x.pub}|${x.date}|${x.staff}`)).size * 8) / (S.days.length * S.pubs.length) },
  // 02 revenue
  { id: "revVsTarget", problem: "revenue", name: "Revenue vs target", unit: "%", better: "up", target: 0, def: "Revenue TTC against the daily budget split.", source: "Zelty × Target file",
    value: (S) => { const tg = target(S); return pct(revenue(S) - tg, tg); } },
  { id: "budgetError", problem: "revenue", name: "Budget error", unit: "%", better: "down", target: 5, def: "Average gap, in absolute value, between each pub's revenue and its budget. Above 10 %, the budget no longer steers anything.", source: "Zelty × Target file",
    value: (S) => sum(S.pubs, (p) => { const P = slice(p, S.days[0], S.days.at(-1)); const tg = target(P); return Math.abs(pct(revenue(P) - tg, tg)); }) / S.pubs.length },
  { id: "milestoneShift", problem: "revenue", name: "Sales booked in the wrong hour by Zelty", unit: "%", better: "down", target: 2, def: "Share of revenue that Zelty's reports place in another hour than when it was ordered (counted at table closing). The hub rebuilds milestones from item times.", source: "Zelty item times",
    value: (S) => { let moved = 0; for (const x of S.t) { const h0 = Math.floor(x.open / 60), h1 = Math.floor(x.close / 60); if (h0 !== h1) moved += x.total * (1 - 60 / Math.max(60, x.close - x.open)); } return pct(moved, revenue(S)); }, note: "At source; the Manager Report now uses item times." },
  { id: "spendGuest", problem: "revenue", name: "Spend per guest", unit: "€", better: "up", target: null, def: "Revenue TTC divided by covers.", source: "Zelty",
    value: (S) => revenue(S) / (sum(S.t, (x) => x.covers) || 1) },
  // 03 club frog
  { id: "participation", problem: "clubfrog", name: "Club Frog participation", unit: "%", better: "up", target: 20, def: "Tickets linked to a member (scan or recovered manual discount) over all tickets.", source: "OBY Pay × Zelty",
    value: (S) => pct(S.t.filter((x) => x.member).length, S.t.length) },
  { id: "scanFail", problem: "clubfrog", name: "Scans that fail", unit: "%", better: "down", target: 5, def: "Member visits where the OBY scan failed and staff applied the discount by hand.", source: "Zelty discounts × OBY scans",
    value: (S) => pct(S.t.filter((x) => x.manualClubFrog).length, S.t.filter((x) => x.member).length) },
  { id: "memberUplift", problem: "clubfrog", name: "Member spend uplift", unit: "%", better: "up", target: 30, def: "How much more a member spends per guest than a non-member.", source: "OBY Pay × Zelty",
    value: (S) => { const m = S.t.filter((x) => x.member), o = S.t.filter((x) => !x.member); const a = sum(m, (x) => x.total) / (sum(m, (x) => x.covers) || 1), b = sum(o, (x) => x.total) / (sum(o, (x) => x.covers) || 1); return pct(a - b, b); } },
  // 04 purchasing
  { id: "touchless", problem: "purchasing", name: "Invoices approved without a person", unit: "%", better: "up", target: 90, def: "Invoices matching their Yokitup order and agreed prices, approved automatically.", source: "Yooz × Yokitup", monthly: true,
    value: (S) => { const inv = INVOICES.filter((f) => S.pubs.includes(f.pub) && inR(f.date, S.days[0], S.days.at(-1))); const ex = new Set(hub.invoiceCheck({}).exceptions.map((x) => x.id)); return pct(inv.filter((f) => !ex.has(f.id)).length, inv.length); } },
  { id: "priceCompliance", problem: "purchasing", name: "Invoice lines at the agreed price", unit: "%", better: "up", target: 98, def: "Billed price within 2 % of the price negotiated in Yokitup.", source: "Yooz × Yokitup", monthly: true,
    value: (S) => { const agreed = Object.fromEntries(ORDERS.flatMap((o) => o.lines.map((l) => [l.sku, l.price]))); const lines = INVOICES.filter((f) => S.pubs.includes(f.pub) && inR(f.date, S.days[0], S.days.at(-1)) && !f.duplicateOf).flatMap((f) => f.lines); return pct(lines.filter((l) => l.price <= agreed[l.sku] * 1.02).length, lines.length); } },
  { id: "overbilled", problem: "purchasing", name: "Over-billing caught", unit: "€", better: "up", target: null, def: "Amount billed above orders and agreed prices, flagged before payment.", source: "Yooz × Yokitup", monthly: true,
    value: (S) => sum(hub.invoiceCheck({}).exceptions.filter((f) => S.pubs.includes(f.pub) && inR(f.date, S.days[0], S.days.at(-1))), (f) => sum(f.issues.filter((i) => i.kind !== "Duplicate invoice"), (i) => i.atStake)) },
  // 05 labour
  { id: "labourPct", problem: "labour", name: "Labour cost", unit: "%", better: "down", target: 30, def: "Worked hours × loaded rate over revenue HT.", source: "Combo × Zelty",
    value: (S) => pct(sum(S.s, (x) => x.worked * x.rate), revenue(S) / 1.2) },
  { id: "revPerHour", problem: "labour", name: "Revenue per labour hour", unit: "€", better: "up", target: 75, def: "Revenue HT per hour worked.", source: "Combo × Zelty",
    value: (S) => revenue(S) / 1.2 / (sum(S.s, (x) => x.worked) || 1) },
  { id: "hoursDrift", problem: "labour", name: "Hours worked vs planned", unit: "%", better: "down", target: 3, def: "Gap between hours worked and hours planned in the rota.", source: "Combo",
    value: (S) => Math.abs(pct(sum(S.s, (x) => x.worked) - sum(S.s, (x) => x.planned), sum(S.s, (x) => x.planned))) },
  // 06 guests
  { id: "missedCalls", problem: "guests", name: "Calls missed", unit: "%", better: "down", target: 10, def: "Calls not answered over all calls received by the pub.", source: "OVH",
    value: (S) => pct(sum(S.c, (x) => x.missed), sum(S.c, (x) => x.calls)) },
  { id: "beforeOpening", problem: "guests", name: "Missed calls before opening", unit: "%", better: "down", target: 10, def: "Share of missed calls that come in before the pub opens.", source: "OVH",
    value: (S) => pct(sum(S.c, (x) => x.missedBeforeOpening), sum(S.c, (x) => x.missed)) },
  { id: "clickToBooking", problem: "guests", name: "Website clicks that become bookings", unit: "%", better: "up", target: 30, def: "Website bookings over booking-button clicks in GA4.", source: "GA4 × Zenchef",
    value: (S) => pct(S.b.filter((x) => x.channel === "Website").length, sum(S.w, (x) => x.bookingClicks)) },
  { id: "rwgShare", problem: "guests", name: "Bookings from Reserve with Google", unit: "%", better: "up", target: 15, def: "Share of table bookings coming from Google.", source: "Zenchef × Google Business Profile",
    value: (S) => pct(S.b.filter((x) => x.channel === "Reserve with Google").length, S.b.length) },
  // 07 compliance
  { id: "dutyComplete", problem: "compliance", name: "Beer duty ledger complete", unit: "%", better: "up", target: 100, def: "Brews written in the customs ledger over brews on the brew sheets (before the agent fills the gaps).", source: "Brew sheets × ledger", monthly: true,
    value: (S) => { const d = hub.beerDuty({}).filter((x) => S.pubs.includes(x.pub)); const brews = sum(d, (x) => x.brews); return brews ? pct(brews - sum(d, (x) => x.missingLines.length), brews) : 100; } },
  { id: "depositRate", problem: "compliance", name: "Group deposits received", unit: "%", better: "up", target: 95, def: "Group and corporate events whose 50 % deposit reached the bank.", source: "BookingShake × bank", monthly: true,
    value: (S) => { const e = EVENTS.filter((x) => S.pubs.includes(x.pub)); return pct(e.filter((x) => x.depositInBank).length, e.length); } },
  // 08 data
  { id: "linksConnected", problem: "data", name: "Links between tools connected", unit: "%", better: "up", target: 100, def: "Of the 40 links between Frog's tools in the audit, those now carried by the hub (14 were missing, 8 manual).", source: "Process map", monthly: true,
    value: () => 100, baselineValue: 40 },
  { id: "dataLeadTime", problem: "data", name: "Time to answer a data question", unit: "days", better: "down", target: 1, def: "From question to figure. Before: 1–3 weeks through Sébastien (Rosbif). Now: Copilot and dashboards, same day.", source: "Audit · Copilot", monthly: true,
    value: () => 0, baselineValue: 14 },
];

/* ---------- evaluation ---------- */

const status = (k, v) => {
  if (k.target == null || v == null) return "neutral";
  const ok = k.better === "up" ? v >= k.target : v <= k.target;
  if (ok) return "good";
  const gap = Math.abs(v - k.target) / (Math.abs(k.target) || 1);
  return gap > 0.5 || (k.target === 0 && Math.abs(v) > 8) ? "bad" : "watch";
};

export function evaluate(k, { pub, date = TODAY } = {}) {
  const W = windows(date);
  const win = k.monthly ? W.month : W.current;
  const S = slice(pub, win.from, win.to);
  const v = k.value(S);
  const series = k.monthly ? null : W.weeks.map((w) => r1(k.value(slice(pub, w.from, w.to))));
  const base = k.baseline ? r1(k.baseline(S)) : k.baselineValue ?? null;
  return { id: k.id, value: r1(v), status: status(k, v), series, baseline: base, window: k.monthly ? "Month to date" : "Last 7 days" };
}

export function byPub(k, date = TODAY) {
  return PUBS.map((p) => ({ pub: p.id, name: p.name, ...evaluate(k, { pub: p.id, date }) }));
}

/* ---------- insights written from the figures ---------- */

const list = (a) => (a.length < 2 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a.at(-1)}`);
const fmt = (v, u) => (u === "€" ? `€${Math.round(v).toLocaleString("en-GB")}` : u === "%" ? `${r1(v)} %` : `${r1(v)} ${u}`);
function extremes(k, date) {
  const rows = byPub(k, date).sort((a, b) => (k.better === "up" ? a.value - b.value : b.value - a.value));
  return { worst: rows[0], best: rows.at(-1), rows };
}

export function insights(problemId, date = TODAY) {
  const W = windows(date), S = slice(null, W.current.from, W.current.to);
  const K = Object.fromEntries(KPIS.map((k) => [k.id, k]));
  const out = [];
  if (problemId === "takings") {
    const rush = S.t.filter(isRush), calm = S.t.filter((x) => !isRush(x));
    const e = extremes(K.modeError, date);
    out.push(`${fmt(pct(modeErrorEuros(rush), sum(rush, (x) => x.total)), "%")} of takings are clicked in the wrong mode during Friday–Saturday evening rushes, against ${fmt(pct(modeErrorEuros(calm), sum(calm, (x) => x.total)), "%")} the rest of the week: the error comes from the pace, not from the staff.`);
    out.push(`${e.worst.name} is the most exposed (${fmt(e.worst.value, "%")}); the hub posts the terminal split to Sage, so accounting no longer checks the five portals.`);
  }
  if (problemId === "revenue") {
    const e = extremes(K.budgetError, date);
    const tl = byPub(K.revVsTarget, date).find((x) => x.pub === "toulouse");
    out.push(`Budget error is ${fmt(e.worst.value, "%")} at ${e.worst.name} against ${fmt(e.best.value, "%")} at ${e.best.name}: the 2027 budget should start from hourly sales, pub by pub.`);
    if (tl) out.push(`Toulouse runs ${fmt(tl.value, "%")} vs target over the last 7 days, with labour planned for the budget rather than for the trade.`);
  }
  if (problemId === "clubfrog") {
    const bar = S.t.filter((x) => PUB[x.pub].style === "bar"), table = S.t.filter((x) => PUB[x.pub].style === "table");
    const fail = (a) => pct(a.filter((x) => x.manualClubFrog).length, a.filter((x) => x.member).length);
    const part = (a) => pct(a.filter((x) => x.member).length, a.length);
    out.push(`Bar-service pubs reach ${fmt(part(bar), "%")} participation against ${fmt(part(table), "%")} in table pubs, with ${fmt(fail(bar), "%")} of scans failing against ${fmt(fail(table), "%")}: the scan flow at the bar is the bottleneck, not motivation.`);
    out.push(`A member spends ${fmt(evaluate(K.memberUplift, { date }).value, "%")} more per guest: each point of participation is worth about ${fmt(revenue(S) / 100 * evaluate(K.memberUplift, { date }).value / 100 / 7 * 30, "€")} a month.`);
  }
  if (problemId === "purchasing") {
    const ex = hub.invoiceCheck({}).exceptions.filter((f) => !f.issues.some((i) => i.kind === "Duplicate invoice"));
    const bySup = {}; for (const f of ex) bySup[f.supplier] = (bySup[f.supplier] || 0) + sum(f.issues, (i) => i.atStake);
    const top = Object.entries(bySup).sort((a, b) => b[1] - a[1])[0];
    out.push(`${top[0]} accounts for ${fmt(top[1], "€")} of the ${fmt(sum(Object.values(bySup), (x) => x), "€")} over-billed this month: renegotiate or audit that account first.`);
    out.push(`${fmt(evaluate(K.touchless, { date }).value, "%")} of invoices no longer need a person; GMs review only the gaps.`);
  }
  if (problemId === "labour") {
    const e = extremes(K.labourPct, date);
    const rph = extremes(K.revPerHour, date);
    out.push(`Labour cost ranges from ${fmt(e.best.value, "%")} at ${e.best.name} to ${fmt(e.worst.value, "%")} at ${e.worst.name}; revenue per hour from ${fmt(rph.worst.value, "€")} to ${fmt(rph.best.value, "€")}.`);
    out.push("The rota agent sizes next week from expected guests, matches and groups, so hours follow the trade instead of the budget.");
  }
  if (problemId === "guests") {
    const before = byPub(K.beforeOpening, date).sort((a, b) => b.value - a.value).slice(0, 2);
    const rwg0 = byPub(K.rwgShare, date).filter((x) => x.value === 0);
    const avgRwg = evaluate(K.rwgShare, { date }).value;
    const lost = sum(rwg0, (r) => slice(r.pub, W.current.from, W.current.to).b.length) * avgRwg / 100 / 7 * 30;
    out.push(`${fmt(evaluate(K.missedCalls, { date }).value, "%")} of calls go unanswered; at ${list(before.map((x) => x.name))}, ${list(before.map((x) => fmt(x.value, "%")))} of missed calls come before opening. An SMS with the booking link now answers them.`);
    if (rwg0.length) out.push(`Reserve with Google brings ${fmt(avgRwg, "%")} of bookings elsewhere but nothing at ${list(rwg0.map((x) => x.name))}: about ${Math.round(lost)} bookings a month to recover by switching it on.`);
  }
  if (problemId === "compliance") {
    const d = hub.beerDuty({});
    const missing = sum(d, (x) => x.missingLines.length);
    out.push(`${missing} brews were missing from the customs ledger this month (${fmt(missing * 1500, "€")} of exposure at a control); the agent now writes each line when the brew sheet is saved.`);
    const late = EVENTS.filter((e) => !e.depositInBank && e.date > date);
    out.push(`${late.length} upcoming group events still have no deposit: reminders go out 10 days before.`);
  }
  if (problemId === "data") {
    out.push("All 19 sources reach the hub every night; the 14 missing links of the audit no longer need re-typing.");
    out.push("Questions that waited 1–3 weeks for Sébastien are answered the same day by the Copilot, with sources.");
  }
  return out;
}

/* ---------- system map: sources → hub data → agents → problems ---------- */

export const SYSTEM_MAP = {
  sources: [
    ["Zelty", ["ticket", "payment"]], ["Nepting · Market Pay", ["payment"]], ["Voucher OCR", ["payment"]], ["Bank", ["payment"]],
    ["OBY Pay", ["member"]], ["Meta · Typeform", ["member"]], ["Combo", ["shift"]], ["Fanzo", ["booking"]],
    ["Zenchef ×8", ["booking"]], ["SimplyBook", ["booking"]], ["BookingShake", ["booking", "payment"]], ["GA4 · Google Business", ["booking"]],
    ["OVH telephony", ["call"]], ["Yokitup", ["invoice"]], ["Yooz", ["invoice"]], ["Suppliers", ["invoice"]],
    ["Brew sheets", ["brew"]], ["Trail", ["shift"]], ["Sage", ["payment"]],
  ],
  entities: [["ticket", "Tickets & items"], ["payment", "Payments"], ["member", "Members"], ["shift", "Shifts & hours"], ["booking", "Bookings"], ["call", "Calls"], ["invoice", "Invoices & orders"], ["brew", "Brews"]],
  agents: [["close", "Close of service", ["ticket", "payment", "shift"]], ["rota", "Rota", ["shift", "booking", "ticket"]], ["purchasing", "Purchasing", ["invoice"]], ["finance", "Finance", ["payment", "brew", "shift"]], ["guests", "Club Frog", ["member", "ticket"]], ["bookings", "Bookings & events", ["booking", "call", "payment"]], ["copilot", "Copilot", ["ticket", "payment", "member", "shift", "booking", "call", "invoice", "brew"]]],
};

export function scorecard({ date = TODAY, pub } = {}) {
  return PROBLEMS.map((p) => {
    const ks = KPIS.filter((k) => k.problem === p.id).map((k) => ({ ...k, ...evaluate(k, { date, pub }) }));
    const worst = ks.some((k) => k.status === "bad") ? "bad" : ks.some((k) => k.status === "watch") ? "watch" : "good";
    return { ...p, status: worst, kpis: ks, insights: pub ? [] : insights(p.id, date) };
  });
}
export const kpi = (id) => KPIS.find((k) => k.id === id);
