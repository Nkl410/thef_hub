// Query layer of the central data hub.
// Every screen of the app and every Copilot tool goes through these functions,
// so a figure has one definition wherever it is shown.

import {
  PUBS, PUB, STAFF, DATES, TODAY, TICKETS, NEPTING, SHIFTS, TARGETS, ORDERS, INVOICES,
  BREWS, LEDGER, BOOKINGS, WEB, CALLS, EVENTS, PAYMENT_MODES, CARD_MODES, SOURCE_MAP, MATCH_NIGHTS, dow,
  AHEAD, AI_PILOT, AI_CALLS, AD_SPEND, CLOSURES, CRM, MENU, VOUCHERS, inPilot,
  CHECKLISTS, WEEKLY_CLEANING, EQUIPMENT, WASTE_REASONS, WASTE_ITEMS, CHECKS, TEMPS, WASTE, TRACEABILITY,
} from "./data.mjs";
import * as actions from "./actions.mjs";

export const DEFINITIONS = {
  revenue: "Sum of closed Zelty tickets (TTC), dated by business day (service after midnight counts for the day before).",
  milestone: "Revenue per hour attributed by item time (spread between ticket opening and closing), not at table closing as in Zelty reports.",
  clubFrogRate: "Share of tickets linked to a Club Frog member: successful OBY scans + manual 'Club Frog' discounts, divided by all tickets. Group target: 20 %.",
  staffAttribution: "A card payment belongs to the staff who cashed it (Nepting payment matched to its Zelty ticket), not to the staff who opened the table.",
  labourCost: "Worked hours from Combo × loaded hourly rate, divided by revenue HT (TTC / 1.2, simplified).",
  channel: "Booking channel normalised from the raw Zenchef source field: Website, Reserve with Google, Phone, Walk-in, Groups (BookingShake), Darts (SimplyBook).",
  managerOnShift: "The shift manager (SM) in the Combo rota that day. With two SMs, lunch goes to the first and the evening to the second until Combo shift times are read; with none, the GM.",
  clubFrogVisit: "A member visit is a business day with at least one bill linked to the member: two bills on the same night count once, so splitting a bill does not earn a reward.",
  closedOnline: "An evening when the pub closed online bookings in Zenchef. Booking clicks and ad spend during that window reach a closed calendar.",
};

const r2 = (x) => Math.round(x * 100) / 100;
const sum = (a, f = (x) => x) => a.reduce((s, x) => s + f(x), 0);
const pct = (a, b) => (b ? r2((100 * a) / b) : 0);
const inRange = (d, from, to) => d >= from && d <= to;
export const addDays = (date, n) => { const t = new Date(date + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const staffName = (pub, code) => (STAFF[pub].find((s) => s.code === code) || { name: code }).name;
const hourLabel = (h) => `${String(h % 24).padStart(2, "0")}:00`;

export function checkPub(pub, { optional = false } = {}) {
  if (!pub && optional) return null;
  if (!PUB[pub]) throw new Error(`Unknown pub "${pub}". Valid ids: ${PUBS.map((p) => p.id).join(", ")}`);
  return PUB[pub];
}
export function checkDate(date) {
  if (!DATES.includes(date)) throw new Error(`No data for ${date}. The demo hub holds ${DATES[0]} to ${DATES.at(-1)}.`);
  return date;
}
const pubsOf = (pub) => (pub ? [checkPub(pub)] : PUBS);

export function listPubs() {
  return { today: TODAY, period: { from: DATES[0], to: DATES.at(-1) }, pubs: PUBS.map((p) => ({ id: p.id, name: p.name, gm: p.gm, style: p.style, darts: p.darts, brews: p.brews })) };
}

/* ---------- KPIs ---------- */

export function kpis({ pub, from = DATES[0], to = TODAY } = {}) {
  return pubsOf(pub).map((p) => {
    const t = TICKETS.filter((x) => x.pub === p.id && inRange(x.date, from, to));
    const revenue = sum(t, (x) => x.total);
    const target = sum(DATES.filter((d) => inRange(d, from, to)), (d) => TARGETS[`${p.id}|${d}`]);
    const hours = SHIFTS.filter((s) => s.pub === p.id && inRange(s.date, from, to));
    const cost = sum(hours, (s) => s.worked * s.rate);
    const members = t.filter((x) => x.member);
    return {
      pub: p.id, name: p.name, from, to, revenue: r2(revenue), target: r2(target), vsTargetPct: pct(revenue - target, target),
      tickets: t.length, covers: sum(t, (x) => x.covers), avgTicket: r2(revenue / (t.length || 1)),
      clubFrogRatePct: pct(members.length, t.length), labourCostPct: pct(cost, revenue / 1.2),
    };
  });
}

/* ---------- Manager Report ---------- */

function spreadByHour(tickets, field = "total") {
  const out = {};
  for (const t of tickets) {
    const a = t.open, b = Math.max(t.close, t.open + 1);
    for (let h = Math.floor(a / 60); h <= Math.floor((b - 1) / 60); h++) {
      const overlap = Math.min(b, (h + 1) * 60) - Math.max(a, h * 60);
      if (overlap > 0) out[h] = (out[h] || 0) + (t[field] * overlap) / (b - a);
    }
  }
  return out;
}
function atClose(tickets) {
  const out = {};
  for (const t of tickets) { const h = Math.floor(t.close / 60); out[h] = (out[h] || 0) + t.total; }
  return out;
}

export function managerReport({ pub, date = TODAY }) {
  const p = checkPub(pub); checkDate(date);
  const t = TICKETS.filter((x) => x.pub === p.id && x.date === date);
  const prevDate = addDays(date, -7);
  const tPrev = DATES.includes(prevDate) ? TICKETS.filter((x) => x.pub === p.id && x.date === prevDate) : [];
  const beer = spreadByHour(t, "beer"), wet = spreadByHour(t, "wet"), food = spreadByHour(t, "food");
  const hub = spreadByHour(t), zelty = atClose(t), prev = spreadByHour(tPrev);
  const target = TARGETS[`${p.id}|${date}`];
  const prevTotal = sum(tPrev, (x) => x.total) || 1;
  const hours = [];
  let cHub = 0, cZelty = 0, cPrev = 0;
  for (let h = 11; h <= 26; h++) {
    cHub += hub[h] || 0; cZelty += zelty[h] || 0; cPrev += prev[h] || 0;
    hours.push({
      hour: hourLabel(h), beer: r2(beer[h] || 0), wet: r2(wet[h] || 0), food: r2(food[h] || 0), total: r2(hub[h] || 0),
      cumulative: r2(cHub), zeltyCumulative: r2(cZelty), lastWeekCumulative: r2(cPrev),
      targetCumulative: r2(tPrev.length ? (target * cPrev) / prevTotal : (target * (h - 10)) / 16),
    });
  }
  const shifts = SHIFTS.filter((s) => s.pub === p.id && s.date === date);
  const revenue = sum(t, (x) => x.total);
  const cost = sum(shifts, (s) => s.worked * s.rate);
  const pay = {};
  for (const x of t) for (const y of x.payments) pay[y.mode] = (pay[y.mode] || 0) + y.amount;
  const calls = CALLS.find((c) => c.pub === p.id && c.date === date);
  return {
    pub: p.id, name: p.name, date, weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dow(date)], matchNight: MATCH_NIGHTS.has(date),
    totals: {
      revenue: r2(revenue), target: r2(target), vsTargetPct: pct(revenue - target, target),
      lastWeek: r2(sum(tPrev, (x) => x.total)), vsLastWeekPct: pct(revenue - sum(tPrev, (x) => x.total), sum(tPrev, (x) => x.total)),
      lastYear: null, lastYearNote: "N-1 needs the Apitic history (Zelty only since end Dec 2025): to import into the hub.",
      beer: r2(sum(t, (x) => x.beer)), wet: r2(sum(t, (x) => x.wet)), food: r2(sum(t, (x) => x.food)),
      tickets: t.length, covers: sum(t, (x) => x.covers), avgTicket: r2(revenue / (t.length || 1)),
      clubFrogRatePct: pct(t.filter((x) => x.member).length, t.length),
    },
    hours,
    staff: shifts.map((s) => ({ staff: s.staff, name: staffName(p.id, s.staff), planned: s.planned, worked: s.worked, cost: r2(s.worked * s.rate) })),
    labour: { planned: sum(shifts, (s) => s.planned), worked: sum(shifts, (s) => s.worked), cost: r2(cost), costPct: pct(cost, revenue / 1.2) },
    payments: Object.fromEntries(Object.entries(pay).map(([k, v]) => [PAYMENT_MODES[k], r2(v)])),
    calls: calls ? { calls: calls.calls, missed: calls.missed, missedBeforeOpening: calls.missedBeforeOpening } : null,
    leftToSM: ["Individual feedback (SMART)", "Incidents and equipment", "Comments for head office"],
  };
}

/* ---------- Cash-up: Zelty × Nepting per staff ---------- */

export function cashup({ pub, date = TODAY }) {
  const p = checkPub(pub); checkDate(date);
  const t = TICKETS.filter((x) => x.pub === p.id && x.date === date);
  const byTicket = Object.fromEntries(t.map((x) => [x.id, x]));
  const n = NEPTING.filter((x) => x.pub === p.id && x.date === date);
  const rows = {};
  const row = (code) => (rows[code] ||= { staff: code, name: staffName(p.id, code), zeltyByOpener: 0, neptingByTypedCode: 0, hubByCasher: 0, cash: 0, issues: 0 });
  for (const x of t) {
    for (const z of x.zeltyPayments) if (CARD_MODES.includes(z.mode)) row(x.opener).zeltyByOpener += z.amount;
    for (const y of x.payments) if (y.mode === "cash") row(x.casher).cash += y.amount;
  }
  const exceptions = [];
  for (const y of n) {
    row(y.serverCode).neptingByTypedCode += y.amount;
    const tk = y.ticket && byTicket[y.ticket];
    if (!tk) { exceptions.push({ id: y.id, code: "unmatched", kind: y.refused ? "Refused payment retried" : "Terminal payment with no Zelty ticket", staff: y.serverCode, amount: y.amount, time: hourLabel(Math.floor(y.time / 60)).slice(0, 2) + ":" + String(y.time % 60).padStart(2, "0"), detail: `Nepting ${y.id}` }); continue; }
    row(tk.casher).hubByCasher += y.amount;
    if (y.serverCode !== tk.casher) exceptions.push({ id: y.id, code: "wrongCode", kind: "Wrong server code typed on the terminal", staff: tk.casher, amount: y.amount, time: `${String(Math.floor(tk.close / 60) % 24).padStart(2, "0")}:${String(tk.close % 60).padStart(2, "0")}`, detail: `Typed ${y.serverCode} (${staffName(p.id, y.serverCode)}), cashed by ${tk.casher} · table ${tk.table ?? "bar"}` });
  }
  for (const x of t) {
    const real = x.payments.map((y) => y.mode).sort().join("+"), clicked = x.zeltyPayments.map((y) => y.mode).sort().join("+");
    if (x.payments.length !== x.zeltyPayments.length && CARD_MODES.includes(x.payments[0].mode)) exceptions.push({ id: x.id, code: "split", kind: "Split card payments closed as one payment in Zelty", staff: x.casher, amount: x.total, time: "", detail: `${x.payments.length} terminal payments of ~€${x.payments[0].amount} · table ${x.table ?? "bar"}` });
    else if (real !== clicked) exceptions.push({ id: x.id, code: "mode", kind: "Payment mode clicked wrong in Zelty", staff: x.casher, amount: x.total, time: "", detail: `Zelty: ${x.zeltyPayments.map((y) => PAYMENT_MODES[y.mode]).join(", ")} · terminal/real: ${x.payments.map((y) => PAYMENT_MODES[y.mode]).join(", ")}` });
  }
  const list = Object.values(rows).map((r) => ({ ...r, zeltyByOpener: r2(r.zeltyByOpener), neptingByTypedCode: r2(r.neptingByTypedCode), hubByCasher: r2(r.hubByCasher), cash: r2(r.cash), gapZeltyVsTerminal: r2(r.zeltyByOpener - r.neptingByTypedCode) }));
  exceptions.forEach((e) => { const r = list.find((x) => x.staff === e.staff); if (r) r.issues++; });
  const onShift = new Set(SHIFTS.filter((x) => x.pub === p.id && x.date === date).map((x) => x.staff)).size;
  return {
    pub: p.id, name: p.name, date, staffCount: list.length, staffOnShift: onShift,
    manualTimeMin: { low: onShift * 5, high: onShift * 12, basis: `5–12 min per staff on shift (${onShift}, audit: XVI)` },
    totals: { zeltyCard: r2(sum(list, (r) => r.zeltyByOpener)), terminal: r2(sum(n, (x) => x.amount)), matched: r2(sum(list, (r) => r.hubByCasher)) },
    staff: list.sort((a, b) => b.hubByCasher - a.hubByCasher), exceptions,
  };
}

/* ---------- Weekly banking / payment modes (tilrec + Sage) ---------- */

export function weeks() {
  const out = [];
  for (const d of DATES) if (dow(d) === 1) out.push({ start: d, end: addDays(d, 6) > DATES.at(-1) ? DATES.at(-1) : addDays(d, 6) });
  return out;
}
export function banking({ pub, weekStart }) {
  const w = weeks().find((x) => x.start === weekStart) || weeks().at(-1);
  return {
    week: w,
    pubs: pubsOf(pub).map((p) => {
      const t = TICKETS.filter((x) => x.pub === p.id && inRange(x.date, w.start, w.end));
      const real = {}, zelty = {};
      for (const x of t) {
        for (const y of x.payments) real[y.mode] = (real[y.mode] || 0) + y.amount;
        for (const y of x.zeltyPayments) zelty[y.mode] = (zelty[y.mode] || 0) + y.amount;
      }
      const modes = Object.keys(PAYMENT_MODES).map((m) => ({ mode: PAYMENT_MODES[m], code: m, hub: r2(real[m] || 0), zelty: r2(zelty[m] || 0), gap: r2((zelty[m] || 0) - (real[m] || 0)) }));
      return { pub: p.id, name: p.name, total: r2(sum(t, (x) => x.total)), modes, absGap: r2(sum(modes, (m) => Math.abs(m.gap)) / 2) };
    }),
  };
}
export function sageExport({ pub, weekStart }) {
  const b = banking({ pub, weekStart });
  const lines = [["date", "pub", "journal", "account", "label", "debit", "credit"]];
  const ACC = { cb: "511200", amex: "511210", tr_card: "511300", tr_paper: "511310", ancv: "511320", cash: "530000" };
  for (const p of b.pubs) for (const d of DATES.filter((x) => inRange(x, b.week.start, b.week.end))) {
    const t = TICKETS.filter((x) => x.pub === p.pub && x.date === d);
    const per = {};
    for (const x of t) for (const y of x.payments) per[y.mode] = (per[y.mode] || 0) + y.amount;
    let total = 0;
    for (const [m, v] of Object.entries(per)) { lines.push([d, p.name, "VE", ACC[m], `Takings ${PAYMENT_MODES[m]}`, r2(v).toFixed(2), ""]); total += v; }
    lines.push([d, p.name, "VE", "706000", "Sales TTC (demo: VAT split to map)", "", r2(total).toFixed(2)]);
  }
  return lines.map((l) => l.join(";")).join("\n");
}

/* ---------- Club Frog ---------- */

const shiftOf = (t) => (t.open < 17 * 60 ? "Lunch (before 17:00)" : t.open < 23 * 60 ? "Evening (17:00–23:00)" : "Late (after 23:00)");

// Shift managers on the Combo rota of a day (see DEFINITIONS.managerOnShift)
const smCache = new Map();
export function managersOnShift(pub, date) {
  const k = `${pub}|${date}`;
  if (!smCache.has(k)) smCache.set(k, SHIFTS.filter((s) => s.pub === pub && s.date === date).map((s) => STAFF[pub].find((x) => x.code === s.staff)).filter((s) => s && s.role === "SM"));
  return smCache.get(k);
}
function managerOf(t) {
  const ms = managersOnShift(t.pub, t.date);
  if (!ms.length) return `${PUB[t.pub].gm} (GM)`;
  const m = ms.length === 1 || t.open < 17 * 60 ? ms[0] : ms.at(-1);
  return `${m.name} (${m.code})`;
}

export function clubFrog({ pub, from = addDays(TODAY, -6), to = TODAY, by = "pub" } = {}) {
  const t = TICKETS.filter((x) => (!pub || x.pub === checkPub(pub).id) && inRange(x.date, from, to));
  const keyOf = { pub: (x) => PUB[x.pub].name, shift: shiftOf, staff: (x) => `${staffName(x.pub, x.casher)} (${x.casher})`, manager: managerOf, day: (x) => x.date }[by];
  if (!keyOf) throw new Error('by must be one of "pub", "shift", "staff", "manager", "day"');
  const groups = {};
  for (const x of t) (groups[keyOf(x)] ||= []).push(x);
  const rows = Object.entries(groups).map(([k, g]) => {
    const m = g.filter((x) => x.member), nm = g.filter((x) => !x.member);
    return {
      key: k, pub: by === "pub" ? null : PUB[g[0].pub].name, tickets: g.length, memberTickets: m.length, ratePct: pct(m.length, g.length),
      obyScans: g.filter((x) => x.scanned).length, manualDiscounts: g.filter((x) => x.manualClubFrog).length,
      membersPerBill: r2(sum(m, (x) => x.membersOnTicket || 1) / (m.length || 1)),
      memberAvg: r2(sum(m, (x) => x.total) / (m.length || 1)), nonMemberAvg: r2(sum(nm, (x) => x.total) / (nm.length || 1)),
    };
  }).sort((a, b) => b.ratePct - a.ratePct);
  const all = t.filter((x) => x.member);
  return {
    from, to, by, target: 20, definition: DEFINITIONS.clubFrogRate,
    total: { tickets: t.length, memberTickets: all.length, ratePct: pct(all.length, t.length), obyScans: t.filter((x) => x.scanned).length, zeltyClubFrogLines: all.length, manualDiscounts: t.filter((x) => x.manualClubFrog).length, membersPerBill: r2(sum(all, (x) => x.membersOnTicket || 1) / (all.length || 1)) },
    rows,
  };
}

/* ---------- Invoices: Yooz × Yokitup × agreed prices ---------- */

const AGREED = Object.fromEntries(ORDERS.flatMap((o) => o.lines.map((l) => [l.sku, l.price])));
export function invoiceCheck({ pub } = {}) {
  const orders = Object.fromEntries(ORDERS.map((o) => [o.id, o]));
  const res = INVOICES.filter((f) => !pub || f.pub === checkPub(pub).id).map((f) => {
    const o = orders[f.order];
    const issues = [];
    if (f.duplicateOf) issues.push({ kind: "Duplicate invoice", atStake: f.total, detail: `Same as ${f.duplicateOf}` });
    else for (const l of f.lines) {
      const ol = o.lines.find((x) => x.sku === l.sku);
      if (l.price > AGREED[l.sku] * 1.02) issues.push({ kind: l.price >= AGREED[l.sku] * 1.9 ? "Billed at double price" : "Price above agreed price", atStake: r2((l.price - AGREED[l.sku]) * l.qty), detail: `${l.item}: €${l.price} vs agreed €${AGREED[l.sku]} (+${Math.round((100 * (l.price - AGREED[l.sku])) / AGREED[l.sku])} %)` });
      if (ol && l.qty > ol.qty) issues.push({ kind: "Billed more than ordered/received", atStake: r2((l.qty - ol.qty) * l.price), detail: `${l.item}: billed ${l.qty}, received ${ol.qty}` });
    }
    const lines = f.lines.map((l) => ({ item: l.item, billed: l.qty, received: o.lines.find((x) => x.sku === l.sku)?.qty ?? 0, price: l.price, agreed: AGREED[l.sku] }));
    return { id: f.id, pub: f.pub, name: PUB[f.pub].name, date: f.date, supplier: f.supplier, order: f.order, total: f.total, status: issues.length ? "To validate" : "Auto-matched", issues, lines };
  });
  const ex = res.filter((x) => x.issues.length);
  return {
    invoices: res.length, autoMatched: res.length - ex.length, toValidate: ex.length,
    atStake: r2(sum(ex, (x) => sum(x.issues, (i) => i.atStake))),
    exceptions: ex.sort((a, b) => sum(b.issues, (i) => i.atStake) - sum(a.issues, (i) => i.atStake)),
    byPub: PUBS.map((p) => ({ name: p.name, invoices: res.filter((x) => x.pub === p.id).length, toValidate: ex.filter((x) => x.pub === p.id).length })),
  };
}

/* ---------- Comptabilité matière ---------- */

export function beerDuty({ pub } = {}) {
  return pubsOf(pub).filter((p) => p.brews).map((p) => {
    const brews = BREWS.filter((b) => b.pub === p.id);
    const missing = brews.filter((b) => !LEDGER.some((l) => l.pub === b.pub && l.date === b.date && l.beer === b.beer));
    const beerSales = sum(TICKETS.filter((x) => x.pub === p.id), (x) => x.beer);
    return {
      pub: p.id, name: p.name, brews: brews.length, brewedHl: r2(sum(brews, (b) => b.hl)),
      soldHlEstimate: r2((beerSales / 7.5) * 0.5 / 100), ledgerLines: brews.length - missing.length,
      missingLines: missing.map((b) => ({ date: b.date, beer: b.beer, hl: b.hl })), riskEur: missing.length * 1500,
    };
  });
}

/* ---------- Bookings, channels, calls ---------- */

export function bookings({ pub, from = DATES[0], to = TODAY } = {}) {
  const channels = [...new Set(Object.values(SOURCE_MAP))];
  const rows = pubsOf(pub).map((p) => {
    const b = BOOKINGS.filter((x) => x.pub === p.id && inRange(x.date, from, to));
    const per = Object.fromEntries(channels.map((c) => [c, b.filter((x) => x.channel === c).length]));
    const web = sum(WEB.filter((x) => x.pub === p.id && inRange(x.date, from, to)), (x) => x.bookingClicks);
    const calls = CALLS.filter((x) => x.pub === p.id && inRange(x.date, from, to));
    return {
      pub: p.id, name: p.name, bookings: b.length, covers: sum(b, (x) => x.covers), byChannel: per,
      reserveWithGooglePct: pct(per["Reserve with Google"], b.length), websiteClicks: web,
      clickToBookingPct: pct(per.Website, web), calls: sum(calls, (x) => x.calls), missedCalls: sum(calls, (x) => x.missed),
      missedBeforeOpening: sum(calls, (x) => x.missedBeforeOpening),
    };
  });
  const raw = {};
  for (const x of BOOKINGS.filter((b) => (!pub || b.pub === pub) && inRange(b.date, from, to))) raw[x.rawSource] = (raw[x.rawSource] || 0) + 1;
  return { from, to, channels, rows, rawSources: Object.entries(raw).map(([source, count]) => ({ source, normalised: SOURCE_MAP[source], count })).sort((a, b) => a.normalised.localeCompare(b.normalised)) };
}

/* ---------- Corporate payments ---------- */

export function corporate({ pub } = {}) {
  return EVENTS.filter((e) => !pub || e.pub === checkPub(pub).id).map((e) => {
    let status = "OK", action = "";
    if (!e.depositInBank && e.date > TODAY) { status = "Deposit missing"; action = "Send payment reminder before the event"; }
    else if (!e.depositInBank) { status = "Deposit never received"; action = "Chase client / check Chorus Pro"; }
    else if (!e.depositInExcel) { status = "Paid, tracker not updated"; action = "No action: status now comes from the bank"; }
    if (e.date <= TODAY && !e.finalPaid) { status = "Final bill unpaid"; action = "Chase final payment"; }
    return { ...e, name: PUB[e.pub].name, status, action };
  }).sort((a, b) => a.date.localeCompare(b.date));
}

/* ---------- Alerts of the day ---------- */

export function alerts({ date = TODAY } = {}) {
  checkDate(date);
  const out = [];
  for (const p of PUBS) {
    const mr = managerReport({ pub: p.id, date });
    if (mr.totals.vsTargetPct < -15) out.push({ level: 2, pub: p.name, module: "mr", text: `Revenue ${mr.totals.vsTargetPct} % vs target (€${Math.round(mr.totals.revenue)} for €${Math.round(mr.totals.target)}).` });
    const c = cashup({ pub: p.id, date });
    if (c.exceptions.length) out.push({ level: c.exceptions.length > 15 ? 2 : 1, pub: p.name, module: "cashup", text: `${c.exceptions.length} cash-up lines to check (instead of ${c.manualTimeMin.low}–${c.manualTimeMin.high} min of manual checks).` });
    if (mr.calls && mr.calls.missed > 15) out.push({ level: 1, pub: p.name, module: "bookings", text: `${mr.calls.missed} missed calls, ${mr.calls.missedBeforeOpening} before opening.` });
  }
  const month = bookings({});
  for (const r of month.rows) if (PUB[r.pub].rwg === false) out.push({ level: 2, pub: r.name, module: "bookings", text: `0 Reserve with Google bookings this month: check the Zenchef Partners tab.` });
  for (const d of beerDuty({})) if (d.missingLines.length) out.push({ level: 2, pub: d.name, module: "duty", text: `${d.missingLines.length} brew(s) missing in the comptabilité matière: €${d.riskEur.toLocaleString("en")} at risk at a customs control.` });
  const inv = invoiceCheck({});
  const top = inv.exceptions.slice(0, 3);
  for (const f of top) out.push({ level: 1, pub: f.name, module: "invoices", text: `${f.supplier} invoice ${f.id}: ${f.issues[0].kind.toLowerCase()} (€${f.issues.reduce((s, i) => s + i.atStake, 0).toFixed(0)}).` });
  const cf = clubFrog({ by: "pub", from: addDays(date, -6), to: date });
  for (const r of cf.rows.filter((x) => x.ratePct < 10)) out.push({ level: 1, pub: r.key, module: "clubfrog", text: `Club Frog rate ${r.ratePct} % over 7 days (${r.manualDiscounts} manual discounts after failed scans).` });
  for (const e of corporate({}).filter((x) => x.status === "Deposit missing" && x.date <= addDays(date, 10))) out.push({ level: 1, pub: e.name, module: "corporate", text: `${e.client}: deposit of €${e.deposit} not received, event on ${e.date}.` });
  for (const c of closures({ from: date, to: addDays(date, 1) })) out.push({ level: 1, pub: c.name, module: "bookings", text: `Online bookings closed in Zenchef on ${c.date} from ${c.from} (${c.by}) while ads keep running.` });
  return out.sort((a, b) => b.level - a.level);
}

/* ---------- Guests: spend and habits per customer ---------- */

export const PINT_PRICE = 7.5; // average draught price used to turn beer sales into pints

function guestStats(t) {
  const covers = t.reduce((a, x) => a + x.covers, 0) || 1;
  const revenue = t.reduce((a, x) => a + x.total, 0);
  const beer = t.reduce((a, x) => a + x.beer, 0);
  const members = t.filter((x) => x.member), others = t.filter((x) => !x.member);
  const mCovers = members.reduce((a, x) => a + x.covers, 0) || 1, oCovers = others.reduce((a, x) => a + x.covers, 0) || 1;
  return {
    tickets: t.length, covers, revenue: r2(revenue),
    spendPerHead: r2(revenue / covers), pintsPerHead: r2(beer / PINT_PRICE / covers),
    foodAttachPct: pct(t.filter((x) => x.food > 0.5).length, t.length), partySize: r2(covers / (t.length || 1)),
    memberSpendPerHead: r2(members.reduce((a, x) => a + x.total, 0) / mCovers), otherSpendPerHead: r2(others.reduce((a, x) => a + x.total, 0) / oCovers),
    memberPct: pct(members.length, t.length),
  };
}

export function guests({ pub, from = addDays(TODAY, -27), to = TODAY } = {}) {
  const p = pub ? checkPub(pub) : null;
  const t = TICKETS.filter((x) => (!p || x.pub === p.id) && inRange(x.date, from, to));
  // regulars: Club Frog members are the customers we can follow visit after visit
  const visits = {};
  for (const x of t) if (x.member) (visits[x.member] ||= []).push(x);
  const members = Object.values(visits);
  const repeat = members.filter((v) => new Set(v.map((x) => x.date)).size >= 2);
  const gaps = [];
  for (const v of repeat) {
    const days = [...new Set(v.map((x) => x.date))].sort();
    for (let i = 1; i < days.length; i++) gaps.push((new Date(days[i]) - new Date(days[i - 1])) / 864e5);
  }
  const top = members.map((v) => ({ member: v[0].member, visits: new Set(v.map((x) => x.date)).size, spend: r2(v.reduce((a, x) => a + x.total, 0)), lastVisit: v.map((x) => x.date).sort().at(-1) }))
    .sort((a, b) => b.spend - a.spend).slice(0, 10);
  const group = (keyOf) => {
    const g = {};
    for (const x of t) (g[keyOf(x)] ||= []).push(x);
    return Object.entries(g).map(([key, v]) => ({ key, ...guestStats(v) }));
  };
  const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return {
    pub: p?.id ?? null, from, to, pintPrice: PINT_PRICE, ...guestStats(t),
    regulars: {
      members: members.length, repeatMembers: repeat.length, repeatPct: pct(repeat.length, members.length),
      avgVisits: r2(members.reduce((a, v) => a + new Set(v.map((x) => x.date)).size, 0) / (members.length || 1)),
      daysBetweenVisits: gaps.length ? r2(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null, top,
    },
    byShift: group(shiftOf).map((r) => ({ ...r, key: r.key.split(" (")[0] })),
    byWeekday: group((x) => dow(x.date)).sort((a, b) => ((+a.key + 6) % 7) - ((+b.key + 6) % 7)).map((r) => ({ ...r, key: DOW[+r.key] })),
    byServer: p ? group((x) => x.casher).map((r) => ({ ...r, name: staffName(p.id, r.key) })).sort((a, b) => b.spendPerHead - a.spendPerHead) : null,
    byPub: p ? null : group((x) => x.pub).map((r) => ({ ...r, key: PUB[r.key].name })),
  };
}

/* ---------- Bookings of one service: tables, darts and groups in one list ---------- */

export const BOOKABLE = [...DATES, ...AHEAD];
export function checkDay(date) {
  if (!BOOKABLE.includes(date)) throw new Error(`No bookings for ${date}. The hub holds ${BOOKABLE[0]} to ${BOOKABLE.at(-1)}.`);
  return date;
}
export const clock = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const serviceOf = (m) => (m < 17 * 60 ? "Lunch" : "Evening");

export function bookingDay({ pub, date = addDays(TODAY, 1) }) {
  const p = checkPub(pub); checkDay(date);
  const items = [
    ...BOOKINGS.filter((b) => b.pub === p.id && b.date === date && b.channel !== "Walk-in").map((b) => ({
      id: b.id, time: clock(b.time), minutes: b.time, service: serviceOf(b.time), kind: b.kind, guest: b.guest, covers: b.covers,
      channel: b.channel, system: b.system, via: b.via, member: b.member, needsValidation: b.needsValidation, confirm: b.confirm, outcome: b.outcome,
    })),
    ...EVENTS.filter((e) => e.pub === p.id && e.date === date).map((e) => ({
      id: e.id, time: clock(e.time), minutes: e.time, service: serviceOf(e.time), kind: "group", guest: e.client, covers: e.guests,
      channel: "Groups (BookingShake)", system: "BookingShake", via: null, member: false, needsValidation: false, confirm: null, outcome: null,
      deposit: e.depositInBank ? "Deposit received" : "Deposit missing",
    })),
  ].sort((a, b) => a.minutes - b.minutes);
  const closed = CLOSURES.filter((c) => c.pub === p.id && c.date === date).map((c) => ({ from: clock(c.from), to: clock(c.to), by: c.by }));
  const of = (f) => items.filter(f);
  return {
    pub: p.id, name: p.name, date, items, closed, matchNight: MATCH_NIGHTS.has(date),
    totals: {
      bookings: items.length, covers: sum(items, (x) => x.covers), lunch: sum(of((x) => x.service === "Lunch"), (x) => x.covers), evening: sum(of((x) => x.service === "Evening"), (x) => x.covers),
      toValidate: of((x) => x.needsValidation).length, darts: of((x) => x.kind === "darts").length, groups: of((x) => x.kind === "group").length,
      members: of((x) => x.member).length, viaAI: of((x) => x.via).length,
    },
  };
}

/* ---------- Online bookings closed in Zenchef while ads run ---------- */

export function closures({ pub, from = DATES[0], to = BOOKABLE.at(-1) } = {}) {
  return CLOSURES.filter((c) => (!pub || c.pub === checkPub(pub).id) && inRange(c.date, from, to)).map((c) => {
    const share = Math.min(0.6, ((c.to - c.from) / 60) * 0.09); // ~9 % of the day's booking clicks per evening hour (GA4)
    const web = WEB.find((w) => w.pub === c.pub && w.date === c.date);
    const ad = AD_SPEND.find((a) => a.pub === c.pub && a.date === c.date);
    return { pub: c.pub, name: PUB[c.pub].name, date: c.date, from: clock(c.from), to: clock(c.to), by: c.by, clicks: web ? Math.round(web.bookingClicks * share) : null, adSpend: r2((ad.google + ad.meta) * share) };
  }).sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}
export function adSpend({ pub, from = DATES[0], to = TODAY } = {}) {
  return pubsOf(pub).map((p) => {
    const a = AD_SPEND.filter((x) => x.pub === p.id && inRange(x.date, from, to));
    return { pub: p.id, name: p.name, google: r2(sum(a, (x) => x.google)), meta: r2(sum(a, (x) => x.meta)), total: r2(sum(a, (x) => x.google + x.meta)) };
  });
}

/* ---------- Phone: OVH calls and the AI receptionist pilot ---------- */

export function phone({ pub, from = addDays(TODAY, -6), to = TODAY } = {}) {
  const rows = pubsOf(pub).map((p) => {
    const c = CALLS.filter((x) => x.pub === p.id && inRange(x.date, from, to));
    const calls = sum(c, (x) => x.calls), missed = sum(c, (x) => x.missed), ai = sum(c, (x) => x.aiAnswered || 0);
    return { pub: p.id, name: p.name, pilot: AI_PILOT.pubs.includes(p.id), calls, answeredByStaff: calls - missed, missedByStaff: missed, aiAnswered: ai, lost: missed - ai, beforeOpening: sum(c, (x) => x.missedBeforeOpening) };
  });
  const ai = AI_CALLS.filter((x) => (!pub || x.pub === pub) && inRange(x.date, from, to));
  const outcomes = {};
  for (const x of ai) outcomes[x.outcome] = (outcomes[x.outcome] || 0) + 1;
  // confirmation calls are made the day before the booking
  const confirmed = BOOKINGS.filter((b) => (!pub || b.pub === pub) && b.confirm && inRange(addDays(b.date, -1), from, to));
  const results = {};
  for (const b of confirmed) results[b.confirm] = (results[b.confirm] || 0) + 1;
  const big = (f) => BOOKINGS.filter((b) => b.kind === "table" && b.covers >= 4 && b.date <= TODAY && inRange(b.date, from, to) && f(b));
  const noShow = (a) => pct(a.filter((b) => b.outcome === "no-show").length, a.length);
  return {
    from, to, pilot: AI_PILOT, rows,
    calls: ai.sort((a, b) => b.date.localeCompare(a.date) || b.time - a.time).map((x) => ({ ...x, time: clock(x.time), name: PUB[x.pub].name })),
    outcomes,
    confirmations: { calls: confirmed.length, results, noShowWithCall: noShow(big((b) => !!b.confirm)), noShowWithout: noShow(big((b) => !inPilot(b.pub, addDays(b.date, -1)))) },
  };
}
export function transcript(call) {
  const pub = PUB[call.pub].name;
  const lines = [["AI", `Hello, ${pub}, Frog Pubs. How can I help?`]];
  if (call.intent === "Booking request") {
    lines.push(["Guest", `Hi, I'd like a table for ${call.covers || 4}${call.bookedFor ? ` on ${call.bookedFor}` : " tonight"}.`]);
    if (call.booking) lines.push(["AI", "Of course. Can I have a name and a mobile number?"], ["Guest", `${call.guest}.`], ["AI", "Your booking is noted. The team confirms it by SMS shortly. Would you like to join Club Frog for a pint on your first visit?"]);
    else if (/another time/.test(call.outcome)) lines.push(["AI", "We are full at that time. I can offer an hour earlier, or the same time tomorrow."], ["Guest", "I'll think about it, thanks."]);
    else lines.push(["AI", "Let me put you through to the team."]);
  } else if (call.intent === "Opening hours, menu, matches") lines.push(["Guest", "Are you showing the match tonight, and until when is the kitchen open?"], ["AI", "Yes, on all screens. The kitchen serves until 22:30."]);
  else if (call.intent === "Group or event enquiry") lines.push(["Guest", "We are about 30 for a work party next month."], ["AI", "I'll pass your request to Tory, who handles groups. She will call you back within a day."]);
  else if (call.intent === "Change or cancel a booking") lines.push(["Guest", "I need to move my booking to 21:00."], ["AI", "Noted. The team confirms the change in Zenchef."]);
  else if (call.intent === "Lost property") lines.push(["Guest", "I left a jacket last night."], ["AI", "I've sent a note to the manager, who will check this afternoon."]);
  else lines.push(["Guest", "Can I speak to someone, please?"], ["AI", call.outcome === "Transferred to staff" ? "Of course, I'm putting you through." : "The team is busy right now. I've taken your message for the GM."]);
  return lines;
}

/* ---------- Club Frog: visits, rewards and member spending ---------- */

// "Buy 5, get 1": a reward on every 5th visit (DEFINITIONS.clubFrogVisit)
export function visits({ pub, from = DATES[0], to = TODAY, every = 5 } = {}) {
  const days = {};
  for (const x of TICKETS) if (x.member && x.date <= to && (!pub || x.pub === checkPub(pub).id)) (days[x.member] ||= new Set()).add(x.date);
  const members = Object.entries(days).map(([member, s]) => { const all = [...s].sort(); return { member, pub: member.split("-M")[0], visits: all.length, last: all.at(-1), all }; });
  const rewards = members.flatMap((m) => m.all.map((d, i) => ({ member: m.member, pub: m.pub, name: PUB[m.pub].name, date: d, visit: i + 1 })).filter((x) => x.visit % every === 0 && inRange(x.date, from, to)));
  const bucket = (v) => (v >= 8 ? "8+" : v >= 5 ? "5–7" : String(v));
  const distribution = {};
  for (const m of members) distribution[bucket(m.visits)] = (distribution[bucket(m.visits)] || 0) + 1;
  return {
    from, to, every, members: members.length, avgVisits: r2(sum(members, (m) => m.visits) / (members.length || 1)),
    rewards: rewards.length, rewardList: rewards.sort((a, b) => b.date.localeCompare(a.date)),
    oneAway: members.filter((m) => m.visits % every === every - 1).length,
    distribution: ["1", "2", "3", "4", "5–7", "8+"].map((k) => ({ visits: k, members: distribution[k] || 0 })),
  };
}

export function memberSpend({ pub, from = DATES[0], to = TODAY } = {}) {
  const t = TICKETS.filter((x) => (!pub || x.pub === checkPub(pub).id) && inRange(x.date, from, to));
  const per = {};
  for (const x of t) if (x.member) per[x.member] = (per[x.member] || 0) + x.total;
  const spends = Object.values(per);
  const revenue = sum(t, (x) => x.total), memberRevenue = sum(spends, (x) => x);
  const BANDS = [["Under €25", 0, 25], ["€25–50", 25, 50], ["€50–100", 50, 100], ["€100–200", 100, 200], ["€200 and more", 200, Infinity]];
  return {
    from, to, members: spends.length, memberRevenue: r2(memberRevenue), sharePct: pct(memberRevenue, revenue), avgPerMember: r2(memberRevenue / (spends.length || 1)),
    bands: BANDS.map(([label, lo, hi]) => { const s = spends.filter((x) => x >= lo && x < hi); return { label, members: s.length, spend: r2(sum(s, (x) => x)) }; }),
  };
}

export const contacts = () => ({ ...CRM, unlinked: CRM.contacts - CRM.linkedToPub, linkedPct: pct(CRM.linkedToPub, CRM.contacts) });

/* ---------- Beer menu: one entry point for Zelty and Frog Space ---------- */

export function menu({ pub }) {
  const p = checkPub(pub);
  const lines = MENU.filter((l) => l.pub === p.id).map((l) => ({
    ...l, status: !l.zelty ? "Missing in Zelty" : l.zelty.pint !== l.frogSpace.pint || l.zelty.half !== l.frogSpace.half ? "Price differs in Zelty" : "In sync",
  }));
  return { pub: p.id, name: p.name, lines, outOfSync: lines.filter((l) => l.status !== "In sync").length };
}
export function setMenuPrice({ pub, tap, pint, half }) {
  const l = MENU.find((x) => x.pub === pub && x.tap === Number(tap));
  if (!l) throw new Error("Unknown menu line");
  const P = Number(pint), H = Number(half);
  if (![P, H].every((x) => Number.isFinite(x) && x >= 2 && x <= 20)) throw new Error("Prices must be between €2 and €20");
  const before = { frogSpace: { ...l.frogSpace }, zelty: l.zelty ? { ...l.zelty } : null };
  l.frogSpace = { pint: r2(P), half: r2(H) }; l.zelty = { pint: r2(P), half: r2(H) };
  return { pub, name: PUB[pub].name, beer: l.beer, tap: l.tap, before, after: { pint: l.frogSpace.pint, half: l.frogSpace.half } };
}

/* ---------- Paper meal vouchers ---------- */

export function vouchers({ pub, from = DATES[0], to = TODAY } = {}) {
  const v = VOUCHERS.filter((x) => (!pub || x.pub === checkPub(pub).id) && inRange(x.date, from, to));
  const issuers = {};
  for (const x of v) for (const [k, n] of Object.entries(x.byIssuer)) issuers[k] = (issuers[k] || 0) + n;
  return {
    from, to, batches: v.length, count: sum(v, (x) => x.count), amount: r2(sum(v, (x) => x.amount)),
    unreadable: sum(v, (x) => x.unreadable), unreadableAmount: r2(sum(v, (x) => x.unreadableAmount)), notScanned: v.filter((x) => !x.scanned).length,
    issuers: Object.entries(issuers).map(([issuer, count]) => ({ issuer, count })).sort((a, b) => b.count - a.count),
    byPub: pubsOf(pub).map((p) => { const w = v.filter((x) => x.pub === p.id); return { pub: p.id, name: p.name, count: sum(w, (x) => x.count), amount: r2(sum(w, (x) => x.amount)), unreadable: sum(w, (x) => x.unreadable), notScanned: w.filter((x) => !x.scanned).length }; }),
    review: v.filter((x) => x.unreadable || !x.scanned).map((x) => ({ ...x, name: PUB[x.pub].name })).sort((a, b) => b.date.localeCompare(a.date)),
  };
}

/* ---------- Checklists (what Trail does today), waste to Yokitup ---------- */

// An item is done when ticked in the history (demo) or ticked in Frog Hub (actions store).
function tick(pub, date, item) {
  const live = actions.get("check", `${pub}|${date}|${item}`);
  if (live) return { by: live.by || null, time: live.time, live: true };
  const h = CHECKS[`${pub}|${date}|${item}`];
  return h ? { by: h.by, name: staffName(pub, h.by), time: h.time } : null;
}
const itemsFor = (p, list) => CHECKLISTS[list].items.filter(([, , side]) => !(p.style === "bar" && side === "kitchen"));
const weeklyOf = (date) => WEEKLY_CLEANING.find(([d]) => d === dow(date));
const ITEM = Object.fromEntries(WASTE_ITEMS.map((i) => [i.id, i]));

export function checklists({ pub, date = TODAY }) {
  const p = checkPub(pub); checkDate(date);
  const lists = Object.entries(CHECKLISTS).map(([id, l]) => {
    const items = itemsFor(p, id).map(([key, label, side]) => ({ id: key, label, side, done: tick(p.id, date, key) }));
    return { id, label: l.label, when: l.when, owner: l.owner, items, done: items.filter((i) => i.done).length, total: items.length };
  });
  // weekly cleaning: this week's seven tasks, Monday to Sunday
  const monday = addDays(date, -((dow(date) + 6) % 7));
  const weekly = Array.from({ length: 7 }, (_, i) => addDays(monday, i)).map((d) => {
    const [, label, side] = weeklyOf(d);
    const skip = p.style === "bar" && side === "kitchen";
    return { date: d, label, side, skip, due: d <= date, done: skip ? null : DATES.includes(d) ? tick(p.id, d, "weekly") : null };
  });
  const temps = EQUIPMENT.filter((e) => !e.kitchen || p.style !== "bar").map((e) => {
    const r = TEMPS.filter((t) => t.pub === p.id && t.date === date && t.equipment === e.id).map((t) => ({ ...t, name: staffName(p.id, t.by), ok: t.value >= e.min && t.value <= e.max }));
    return { ...e, readings: r, missing: 2 - r.length, outOfRange: r.filter((x) => !x.ok).length };
  });
  const waste = WASTE.filter((w) => w.pub === p.id && w.date === date).map((w) => ({ ...w, name: staffName(p.id, w.by), itemName: ITEM[w.item].name, unit: ITEM[w.item].unit, yokitup: ITEM[w.item].yokitup }));
  const trace = TRACEABILITY.filter((t) => t.pub === p.id && t.date === date).map((t) => ({ ...t, name: staffName(p.id, t.by), state: t.useBy < date ? "Past use-by" : t.useBy === date ? "Use today" : "OK" }));
  // who ticks what over the last 7 days (Trail only gives a % per pub)
  const days = DATES.filter((d) => d > addDays(date, -7) && d <= date);
  const people = {};
  for (const d of days) {
    for (const [l] of Object.entries(CHECKLISTS)) for (const [key] of itemsFor(p, l)) { const t = tick(p.id, d, key); if (t?.by) (people[t.by] ||= { items: 0, temps: 0, waste: 0 }).items++; }
    const w = tick(p.id, d, "weekly"); if (w?.by) (people[w.by] ||= { items: 0, temps: 0, waste: 0 }).items++;
    for (const t of TEMPS.filter((x) => x.pub === p.id && x.date === d)) (people[t.by] ||= { items: 0, temps: 0, waste: 0 }).temps++;
    for (const x of WASTE.filter((y) => y.pub === p.id && y.date === d)) (people[x.by] ||= { items: 0, temps: 0, waste: 0 }).waste++;
  }
  const all = lists.flatMap((l) => l.items);
  return {
    pub: p.id, name: p.name, date, lists, weekly, temps, waste, trace,
    totals: {
      done: all.filter((i) => i.done).length, total: all.length, pct: pct(all.filter((i) => i.done).length, all.length),
      weeklyDone: weekly.filter((w) => w.due && !w.skip && w.done).length, weeklyDue: weekly.filter((w) => w.due && !w.skip).length,
      tempsOut: sum(temps, (t) => t.outOfRange), tempsMissing: sum(temps, (t) => t.missing),
      wasteCost: r2(sum(waste, (w) => w.cost)), wasteLines: waste.length, traceAlerts: trace.filter((t) => t.state !== "OK").length,
    },
    people: Object.entries(people).map(([code, v]) => ({ code, name: staffName(p.id, code), role: STAFF[p.id].find((s) => s.code === code)?.role, ...v })).sort((a, b) => b.items + b.temps + b.waste - (a.items + a.temps + a.waste)),
    options: { items: WASTE_ITEMS.filter((i) => !i.kitchen || p.style !== "bar").map((i) => [i.id, `${i.name} (${i.unit})`]), reasons: WASTE_REASONS },
  };
}

// group view for head office: completion by pub over the last 7 days
export function checklistsGroup({ date = TODAY } = {}) {
  const days = DATES.filter((d) => d > addDays(date, -7) && d <= date);
  return PUBS.map((p) => {
    let done = 0, total = 0, wDone = 0, wDue = 0, out = 0;
    for (const d of days) {
      for (const l of Object.keys(CHECKLISTS)) for (const [key] of itemsFor(p, l)) { total++; if (tick(p.id, d, key)) done++; }
      const [, , side] = weeklyOf(d);
      if (!(p.style === "bar" && side === "kitchen")) { wDue++; if (tick(p.id, d, "weekly")) wDone++; }
    }
    for (const t of TEMPS.filter((x) => x.pub === p.id && days.includes(x.date))) { const e = EQUIPMENT.find((q) => q.id === t.equipment); if (t.value < e.min || t.value > e.max) out++; }
    const w = WASTE.filter((x) => x.pub === p.id && days.includes(x.date));
    return { pub: p.id, name: p.name, checklistPct: pct(done, total), weeklyPct: pct(wDone, wDue), tempsOut: out, wasteCost: r2(sum(w, (x) => x.cost)), wasteLines: w.length };
  });
}

export function addWaste({ pub, date = TODAY, item, qty, reason, by }) {
  const p = checkPub(pub); checkDate(date);
  const it = ITEM[item];
  if (!it) throw new Error("Unknown waste item");
  if (!WASTE_REASONS.includes(reason)) throw new Error("Unknown waste reason");
  const q = Number(qty);
  if (!Number.isInteger(q) || q < 1 || q > 200) throw new Error("Quantity must be a whole number between 1 and 200");
  const now = new Date();
  const w = { id: `W${WASTE.length + 1}-live`, pub: p.id, date, time: now.toTimeString().slice(0, 5), item, qty: q, reason, by: by || null, cost: r2(q * it.cost), live: true };
  WASTE.push(w);
  return { ...w, name: p.name, itemName: it.name, unit: it.unit, yokitup: it.yokitup };
}
