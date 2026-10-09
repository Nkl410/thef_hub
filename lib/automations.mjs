// Automation engine: the hub does not only show data, it sends the right data to the right tool.
//
// An automation = WHEN (schedule or event) → WHAT (data computed by the hub) → WHERE (Combo, Sage,
// Yooz, OBY Pay, Zenchef, P2M, email, SMS…). It runs on its own ("auto") or waits for a person's OK
// ("approval"). Every run is logged, and every message sent is kept in the outbox with its payload.
//
// Prototype: connectors are simulated (the outbox shows exactly what would be sent); state is kept in
// memory and rebuilt when the server restarts.

import * as hub from "./hub.mjs";
import { PUB, PUBS, TODAY, DATES, TICKETS, SHIFTS, TARGETS, INVOICES, BREWS, CALLS, EVENTS, STAFF, PAYMENT_MODES, BOOKINGS, AI_PILOT, dow } from "./data.mjs";

const r2 = (x) => Math.round(x * 100) / 100;
const eur = (x) => `€${Math.round(x).toLocaleString("en-GB")}`;
const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const label = (d) => `${DAY[dow(d)]} ${+d.slice(8)}/${+d.slice(5, 7)}`;
const next7 = (date) => Array.from({ length: 7 }, (_, i) => hub.addDays(date, i + 1));
const LAST4 = (date) => DATES.filter((d) => d <= date && d > hub.addDays(date, -28));

// Matches already picked by the GMs in Fanzo for the coming days (demo).
export const UPCOMING_MATCHES = { "2026-10-03": "Rugby · evening match", "2026-10-06": "Football · Champions League", "2026-10-07": "Football · Champions League" };

/* ---------- forecasting helpers ---------- */

function targetFor(pub, d) {
  if (TARGETS[`${pub}|${d}`] != null) return TARGETS[`${pub}|${d}`];
  const same = DATES.filter((x) => dow(x) === dow(d)).map((x) => TARGETS[`${pub}|${x}`]);
  return r2(same.reduce((a, b) => a + b, 0) / same.length);
}
const coversCache = new Map();
function avgCovers(pub, weekday, date) {
  const k = `${pub}|${weekday}|${date}`;
  if (!coversCache.has(k)) {
    const days = LAST4(date).filter((d) => dow(d) === weekday);
    const total = TICKETS.filter((t) => t.pub === pub && days.includes(t.date)).reduce((a, t) => a + t.covers, 0);
    coversCache.set(k, total / (days.length || 1));
  }
  return coversCache.get(k);
}
function usualHours(pub, weekday, date) {
  const days = LAST4(date).filter((d) => dow(d) === weekday);
  return SHIFTS.filter((s) => s.pub === pub && days.includes(s.date)).reduce((a, s) => a + s.worked, 0) / (days.length || 1);
}
// Hours follow expected guests, damped: part of the team is there whatever the trade (exponent 0.6).
export function staffingForecast(pub, date) {
  return next7(date).map((d) => {
    const base = avgCovers(pub, dow(d), date);
    let covers = base;
    const why = [];
    if (UPCOMING_MATCHES[d]) { covers *= 1.25; why.push(UPCOMING_MATCHES[d]); }
    for (const e of EVENTS.filter((x) => x.pub === pub && x.date === d)) { covers += e.guests; why.push(`group of ${e.guests}`); }
    const usual = Math.round(usualHours(pub, dow(d), date) * 2) / 2;
    const recommended = Math.round(usual * Math.pow(covers / (base || 1), 0.6) * 2) / 2;
    return { date: d, covers: Math.round(covers), recommended, usual, delta: r2(recommended - usual), why: why.join(", ") || "usual for this weekday" };
  });
}

/* ---------- catalogue ---------- */
// plan(ctx) returns operations: { key, pub?, title, detail, payload }

const SYSTEMS = { combo: "Combo", sage: "Sage", yooz: "Yooz", p2m: "P2M (Silae)", oby: "OBY Pay", zenchef: "Zenchef", bookingshake: "BookingShake", email: "Email", sms: "OVH SMS", ledger: "Beer duty ledger", hub: "Frog Hub", menu: "Zelty + Frog Space", retell: "Retell AI", yokitup: "Yokitup" };

const CATALOG = [
  {
    id: "targets-combo", name: "Daily targets to Combo", system: "combo", owners: ["ceo", "manager", "finance"],
    trigger: { kind: "schedule", label: "Every day at 06:00", time: "06:00" }, mode: "auto",
    why: "Combo compares staff cost with revenue. Targets arrive already in HT for the next 7 days, for every pub.",
    plan: ({ date }) => PUBS.map((p) => ({
      key: p.id, pub: p.id, title: `${p.name}: targets for the next 7 days`, detail: next7(date).map((d) => `${label(d)} ${eur(targetFor(p.id, d) / 1.2)}`).join(" · "),
      payload: { location: p.name, revenue_targets_ht: next7(date).map((d) => ({ date: d, amount: r2(targetFor(p.id, d) / 1.2) })) },
    })),
  },
  {
    id: "staffing-combo", name: "Recommended rota to Combo", system: "combo", owners: ["manager"],
    trigger: { kind: "schedule", label: "Every day at 07:00 · next 7 days", time: "07:00" }, mode: "approval", approver: "GM",
    why: "Hours needed are computed from expected guests: same weekday over the last 4 weeks, matches picked in Fanzo and group bookings. The GM approves, Combo receives the draft rota.",
    plan: ({ date }) => PUBS.map((p) => {
      const f = staffingForecast(p.id, date);
      const delta = r2(f.reduce((a, x) => a + x.delta, 0));
      const notable = f.filter((x) => Math.abs(x.delta) >= 4);
      return {
        key: p.id, pub: p.id, title: `${p.name}: ${f.reduce((a, x) => a + x.recommended, 0)} h recommended next week (${delta >= 0 ? "+" : ""}${delta} h vs usual)`,
        detail: notable.length ? notable.map((x) => `${label(x.date)} ${x.delta > 0 ? "+" : ""}${x.delta} h (${x.why})`).join(" · ") : "In line with the usual rota.",
        payload: { location: p.name, draft_rota: f.map((x) => ({ date: x.date, expected_guests: x.covers, hours: x.recommended, reason: x.why })) },
        table: { cols: ["Day", "Expected guests", "Usual hours", "Recommended", "Why"], rows: f.map((x) => [label(x.date), x.covers, `${x.usual} h`, { v: `${x.recommended} h`, tone: x.delta >= 4 ? "attention" : "" }, x.why]) },
      };
    }),
  },
  {
    id: "match-zenchef", name: "Match nights: Zenchef slots and staff", system: "zenchef", owners: ["manager", "ops"],
    trigger: { kind: "event", label: "When a GM picks a match in Fanzo", time: "on selection" }, mode: "approval", approver: "GM",
    why: "On match nights, table bookings are capped at 70 % between 19:30 and 22:30 to keep room for walk-ins, and the rota gets the extra hours.",
    plan: ({ date }) => {
      const matches = Object.entries(UPCOMING_MATCHES).filter(([d]) => d > date && d <= hub.addDays(date, 7));
      if (!matches.length) return [];
      return PUBS.filter((p) => p.style === "table").map((p) => ({
        key: p.id, pub: p.id, title: `${p.name}: ${matches.length} match night${matches.length > 1 ? "s" : ""} this week`,
        detail: `${matches.map(([d, m]) => `${label(d)} ${m.split(" · ")[1] || m}`).join(" · ")} — table bookings capped at 70 % from 19:30 to 22:30, room kept for walk-ins.`,
        payload: { restaurant: p.name, slots: matches.map(([d, m]) => ({ date: d, from: "19:30", to: "22:30", max_capacity_pct: 70, note: m })) },
      }));
    },
  },
  {
    id: "takings-sage", name: "Takings to Sage", system: "sage", owners: ["finance"],
    trigger: { kind: "schedule", label: "Every day at 05:00", time: "05:00" }, mode: "auto",
    why: "Takings are posted by pub and payment mode from terminal data, so the Zelty import no longer needs fixing.",
    plan: ({ date }) => PUBS.map((p) => {
      const per = {};
      for (const t of TICKETS.filter((x) => x.pub === p.id && x.date === date)) for (const y of t.payments) per[y.mode] = (per[y.mode] || 0) + y.amount;
      const total = Object.values(per).reduce((a, b) => a + b, 0);
      return { key: p.id, pub: p.id, title: `${p.name}: ${eur(total)} posted`, detail: Object.entries(per).map(([m, v]) => `${PAYMENT_MODES[m]} ${eur(v)}`).join(" · "),
        payload: { journal: "VE", date, location: p.name, lines: Object.entries(per).map(([m, v]) => ({ label: `Takings ${PAYMENT_MODES[m]}`, debit: r2(v) })) } };
    }),
  },
  {
    id: "invoices-yooz", name: "Matching invoices approved in Yooz", system: "yooz", owners: ["finance", "manager"],
    trigger: { kind: "event", label: "When an invoice arrives in Yooz", time: "on arrival" }, mode: "auto",
    why: "An invoice that matches its Yokitup order and the agreed price is approved without anyone opening it. The others go to the GM.",
    plan: ({ date }) => {
      const ok = hub.invoiceCheck({}).exceptions.map((x) => x.id);
      return INVOICES.filter((f) => f.date === date && !ok.includes(f.id) && !f.duplicateOf).map((f) => ({
        key: f.id, pub: f.pub, title: `${PUB[f.pub].name}: ${f.supplier} invoice ${f.id} approved`, detail: `${eur(f.total)} · matches order and agreed prices`,
        payload: { invoice: f.id, supplier: f.supplier, status: "approved", approved_by: "Frog Hub (order and price match)" },
      }));
    },
  },
  {
    id: "dispute-email", name: "Credit-note request to supplier", system: "email", owners: ["finance", "manager"],
    trigger: { kind: "event", label: "When an invoice is disputed", time: "on dispute" }, mode: "auto", live: true,
    why: "The email to the supplier is written from the invoice and the agreed price, and sent as soon as someone clicks Dispute.",
    plan: () => [],
  },
  {
    id: "mr-paul", name: "Manager Report to head office", system: "email", owners: ["manager", "ceo"],
    trigger: { kind: "event", label: "When the SM sends the Manager Report", time: "on send" }, mode: "auto", live: true,
    why: "The report goes to Paul with the figures and the SM's notes, in the same format for every pub.",
    plan: () => [],
  },
  {
    id: "hours-p2m", name: "Monthly hours to P2M (Silae)", system: "p2m", owners: ["finance"],
    trigger: { kind: "schedule", label: "Last day of the month at 23:00", time: "23:00" }, mode: "auto",
    why: "Validated Combo hours are sent to the payroll firm in its import format, without Jean-Bernard in the middle.",
    plan: ({ date }) => (hub.addDays(date, 1).slice(8) !== "01" ? [] : PUBS.map((p) => {
      const s = SHIFTS.filter((x) => x.pub === p.id && x.date.slice(0, 7) === date.slice(0, 7));
      return { key: p.id, pub: p.id, title: `${p.name}: ${Math.round(s.reduce((a, x) => a + x.worked, 0))} h for ${new Set(s.map((x) => x.staff)).size} staff`, detail: "September hours, validated in Combo",
        payload: { company: "Frog Pubs", location: p.name, period: date.slice(0, 7), employees: [...new Set(s.map((x) => x.staff))].map((code) => ({ code, hours: s.filter((x) => x.staff === code).reduce((a, x) => a + x.worked, 0) })) } };
    })),
  },
  {
    id: "duty-ledger", name: "Brews written to the beer duty ledger", system: "ledger", owners: ["finance"],
    trigger: { kind: "event", label: "When a brew sheet is saved", time: "on brew" }, mode: "auto",
    why: "Each brew is written to the customs ledger the moment its sheet is saved: no line is ever missing.",
    plan: ({ date }) => BREWS.filter((b) => b.date === date).map((b) => ({ key: `${b.pub}-${b.beer}`, pub: b.pub, title: `${PUB[b.pub].name}: ${b.beer}, ${b.hl} hl`, detail: "Line added to the comptabilité matière", payload: { location: PUB[b.pub].name, date: b.date, beer: b.beer, volume_hl: b.hl } })),
  },
  {
    id: "deposit-reminder", name: "Deposit reminders", system: "bookingshake", owners: ["ops", "finance"],
    trigger: { kind: "schedule", label: "Every day at 09:00 · events within 10 days", time: "09:00" }, mode: "auto",
    why: "When a group deposit has not reached the bank 10 days before the event, the client gets the payment link again.",
    plan: ({ date }) => EVENTS.filter((e) => !e.depositInBank && e.date > date && e.date <= hub.addDays(date, 10)).map((e) => ({
      key: e.id, pub: e.pub, title: `${e.client} · ${PUB[e.pub].name} ${label(e.date)}`, detail: `Payment link for the ${eur(e.deposit)} deposit sent again`,
      payload: { event: e.id, client: e.client, amount: e.deposit, channel: e.channel === "Chorus Pro" ? "Chorus Pro" : "payment link" },
    })),
  },
  {
    id: "winback-oby", name: "Win back regulars (Club Frog)", system: "oby", owners: ["marketing"],
    trigger: { kind: "schedule", label: "Every day at 10:00 · regulars unseen for 21 days", time: "10:00" }, mode: "approval", approver: "Emma",
    why: "Members who came at least twice but not in the last 21 days get a pint on the house in their next OBY Pay message.",
    plan: ({ date }) => PUBS.map((p) => {
      const visits = {};
      for (const t of TICKETS.filter((x) => x.pub === p.id && x.member && x.date <= date)) (visits[t.member] ||= new Set()).add(t.date);
      const lapsed = Object.entries(visits).filter(([, s]) => s.size >= 2 && [...s].sort().at(-1) < hub.addDays(date, -21)).map(([m]) => m);
      return { key: p.id, pub: p.id, title: `${p.name}: ${lapsed.length} regulars to win back`, detail: "Offer: a pint on the house, valid 14 days", payload: { segment: `${p.name} · lapsed regulars`, members: lapsed.length, offer: "free_pint", valid_days: 14 }, count: lapsed.length };
    }).filter((o) => o.count),
  },
  {
    id: "missed-call-sms", name: "Missed call → SMS with booking link", system: "sms", owners: ["manager", "ops"],
    trigger: { kind: "event", label: "When a call is missed", time: "on missed call" }, mode: "auto",
    why: "A guest who could not get through receives the pub's booking link a minute later.",
    // where the AI receptionist runs, only the calls it could not take are left without an answer
    plan: ({ date }) => CALLS.filter((c) => c.date === date && c.missed - (c.aiAnswered || 0) > 0).map((c) => {
      const n = c.missed - (c.aiAnswered || 0);
      return { key: c.pub, pub: c.pub, title: `${PUB[c.pub].name}: ${n} SMS sent`, detail: c.aiAnswered ? `${c.aiAnswered} other calls answered by the AI receptionist` : `${c.missedBeforeOpening} before opening`, payload: { sender: PUB[c.pub].name, template: "Sorry we missed you. Book your table: frogpubs.com", messages: n } };
    }),
  },
  {
    id: "lead-oby", name: "New leads into Club Frog", system: "oby", owners: ["marketing"],
    trigger: { kind: "event", label: "When a Meta lead or Typeform answer arrives", time: "on lead" }, mode: "auto",
    why: "Every email captured by an ad or a survey becomes a Club Frog contact with its welcome offer, without exports.",
    plan: ({ date }) => {
      const n = 6 + ((+date.slice(8) * 7) % 11);
      return [{ key: "all", title: `${n} new contacts created`, detail: "Source: Meta lead ads and Typeform · welcome offer attached", payload: { source: ["meta_lead_ads", "typeform"], contacts: n, offer: "welcome_pint" } }];
    },
  },
  // ----- from the process notes (knowledge/pain-process.md) -----
  {
    id: "booking-invite", name: "Club Frog invitation before the visit", system: "email", owners: ["marketing", "ops"],
    trigger: { kind: "schedule", label: "Every day at 10:00 · bookings of the next day", time: "10:00" }, mode: "auto",
    why: "A guest who books is not a member yet. The day before the visit they get an email to join Club Frog, so they can scan their code at the till. The account is created only when they accept.",
    plan: ({ date }) => PUBS.map((p) => {
      const b = BOOKINGS.filter((x) => x.pub === p.id && x.date === hub.addDays(date, 1) && !x.member && x.email && x.kind === "table");
      return { key: p.id, pub: p.id, title: `${p.name}: ${b.length} bookers invited`, detail: "Join link with the welcome offer chosen by Emma", payload: { template: "club_frog_invite", location: p.name, visit_date: hub.addDays(date, 1), recipients: b.length, consent: "account created on click only" }, count: b.length };
    }).filter((o) => o.count),
  },
  {
    id: "visit-reward", name: "Visit rewards: every 5th visit", system: "oby", owners: ["marketing"],
    trigger: { kind: "schedule", label: "Every day at 10:30 · 5th, 10th… visit reached yesterday", time: "10:30" }, mode: "approval", approver: "Emma",
    why: "OBY Pay only knows points and cannot count visits. The hub counts visits from the bills linked to each member and credits the reward in points.",
    plan: ({ date }) => {
      const r = hub.visits({ from: date, to: date }).rewardList;
      return PUBS.map((p) => ({ p, list: r.filter((x) => x.pub === p.id) })).filter((x) => x.list.length).map(({ p, list }) => ({
        key: p.id, pub: p.id, title: `${p.name}: ${list.length} member${list.length > 1 ? "s" : ""} reached a reward`, detail: list.map((x) => `Member #${x.member.split("-M")[1]} · visit ${x.visit}`).join(" · "),
        payload: { location: p.name, reward: "free_pint", credit_points: 75, members: list.map((x) => ({ member: x.member, visit: x.visit })) },
      }));
    },
  },
  {
    id: "clubfrog-weekly", name: "Club Frog weekly report to the GMs", system: "email", owners: ["marketing", "manager"],
    trigger: { kind: "schedule", label: "Every Monday at 08:00 · last week", time: "08:00" }, mode: "auto",
    why: "Emma no longer builds the Monday report by hand: each GM receives the participation of their pub by day, shift, server and shift manager.",
    plan: ({ date }) => (dow(date) !== 0 ? [] : PUBS.map((p) => {
      const c = hub.clubFrog({ pub: p.id, from: hub.addDays(date, -6), to: date, by: "manager" });
      return { key: p.id, pub: p.id, title: `${p.name}: ${c.total.ratePct} % participation last week`, detail: c.rows.map((r) => `${r.key.replace(/ \(.+\)$/, "")} ${r.ratePct} %`).join(" · "),
        payload: { to: `GM ${p.gm}`, location: p.name, week_ending: date, participation_pct: c.total.ratePct, by_manager: c.rows.map((r) => ({ manager: r.key, rate_pct: r.ratePct })) } };
    })),
  },
  {
    id: "closure-alert", name: "Online bookings closed while ads run", system: "email", owners: ["marketing", "ceo", "ops"],
    trigger: { kind: "event", label: "When a pub closes online bookings in Zenchef", time: "on closing" }, mode: "auto",
    why: "When a GM closes online bookings to keep tables for walk-ins, Liz and Paul are told at once: ads keep sending guests to a closed calendar.",
    plan: ({ date }) => hub.closures({ from: date, to: date }).map((c) => ({
      key: c.pub, pub: c.pub, title: `${c.name}: online bookings closed from ${c.from}`, detail: `${c.by} · ${c.clicks ?? "?"} booking clicks and about €${Math.round(c.adSpend)} of ads during the closure`,
      payload: { to: ["Liz", "Paul", c.by], location: c.name, date: c.date, closed_from: c.from, closed_to: c.to, booking_clicks: c.clicks, ad_spend_eur: c.adSpend },
    })),
  },
  {
    id: "confirm-calls", name: "Confirmation calls the day before", system: "retell", owners: ["manager", "ops"],
    trigger: { kind: "schedule", label: "Every day at 11:00 · tables of 4 or more tomorrow", time: "11:00" }, mode: "auto",
    why: "The AI receptionist calls guests the day before to confirm they are coming and how many, so the tables of no-shows can be given again. Pilot pubs only.",
    plan: ({ date }) => AI_PILOT.pubs.map((id) => {
      const b = BOOKINGS.filter((x) => x.pub === id && x.date === hub.addDays(date, 1) && x.kind === "table" && x.covers >= 4);
      return { key: id, pub: id, title: `${PUB[id].name}: ${b.length} guests to call`, detail: `Tables of 4 or more on ${label(hub.addDays(date, 1))}`, payload: { agent: "frog-receptionist", location: PUB[id].name, calls: b.map((x) => ({ booking: x.id, time: hub.clock(x.time), covers: x.covers })) }, count: b.length };
    }).filter((o) => o.count),
  },
  {
    id: "waste-yokitup", name: "Waste and breakage to the Yokitup stock", system: "yokitup", owners: ["manager", "finance", "ops"],
    trigger: { kind: "schedule", label: "Every night at 02:00 · waste of the service", time: "02:00" }, mode: "auto",
    why: "Waste is typed once, in the Frog Hub checklist at the end of the shift, and posted as a stock adjustment in Yokitup. Nobody retypes it and the inventory stays right.",
    plan: ({ date }) => PUBS.map((p) => {
      const w = hub.checklists({ pub: p.id, date }).waste;
      return { key: p.id, pub: p.id, title: `${p.name}: ${w.length} waste lines · €${w.reduce((a, x) => a + x.cost, 0).toFixed(2)} at cost`, detail: w.slice(0, 4).map((x) => `${x.qty} ${x.unit} ${x.itemName} (${x.reason.toLowerCase()})`).join(" · "),
        payload: { location: p.name, date, movement: "waste", lines: w.map((x) => ({ product: x.yokitup, qty: x.qty, reason: x.reason, by: x.by })) }, count: w.length };
    }).filter((o) => o.count),
  },
  {
    id: "menu-push", name: "Beer menu to Zelty and Frog Space", system: "menu", owners: ["manager", "ops"], live: true,
    trigger: { kind: "event", label: "When the beer menu is changed in Frog Hub", time: "on change" }, mode: "auto",
    why: "The beer list is typed once, in Frog Hub, and reaches the tills (Zelty) and Frog Space at the same time. No more retyping.",
    plan: () => [],
  },
  {
    id: "booking-zenchef", name: "Validated bookings back to Zenchef", system: "zenchef", owners: ["manager", "ops"], live: true,
    trigger: { kind: "event", label: "When a GM validates a booking in Frog Hub", time: "on validation" }, mode: "auto",
    why: "Bookings from the website, Google and the AI receptionist are validated in one list; the decision is written back to Zenchef, which sends the SMS to the guest.",
    plan: () => [],
  },
];

/* ---------- state ---------- */

const settings = new Map(); // id -> { enabled, mode }
const custom = [];          // automations created in the builder
const runsDone = new Set(); // `${id}|${date}` already executed
const pending = new Map();  // op id -> { auto, op, date }
const decided = new Map();  // op id -> { status, by, time }
export const LOG = [];      // newest first
export const OUTBOX = [];

const all = () => [...CATALOG, ...custom];
const find = (id) => { const a = all().find((x) => x.id === id); if (!a) throw new Error(`Unknown automation ${id}`); return a; };
const conf = (a) => ({ enabled: true, mode: a.mode, ...(settings.get(a.id) || {}) });
const clock = () => new Date().toTimeString().slice(0, 5);

// time shown for a run: the scheduled hour, "During the day" for data events, the real time for live actions
const when = (a, how) => (how === "scheduled" ? (/^\d\d:\d\d$/.test(a.trigger.time) ? a.trigger.time : "During the day") : clock());

function deliver(a, op, date, how) {
  OUTBOX.unshift({ system: SYSTEMS[a.system], automation: a.id, name: a.name, date, time: when(a, how), title: op.title, payload: op.payload, how });
}
function log(a, date, entry) {
  LOG.unshift({ automation: a.id, name: a.name, system: SYSTEMS[a.system], date, time: entry.time || clock(), trigger: a.trigger.label, ...entry });
}

export function run(id, date = TODAY, { how = "manual" } = {}) {
  const a = find(id), c = conf(a);
  hub.checkDate(date);
  const ops = a.plan({ date }).map((o) => ({ ...o, id: `${a.id}|${date}|${o.key}` }));
  const time = when(a, how);
  if (!ops.length) { log(a, date, { status: "nothing", count: 0, text: "Nothing to send", time }); return { sent: 0, waiting: 0 }; }
  if (c.mode === "approval") {
    let waiting = 0;
    for (const op of ops) if (!decided.has(op.id)) { pending.set(op.id, { auto: a.id, op, date }); waiting++; }
    log(a, date, { status: "waiting", count: waiting, text: `${waiting} waiting for ${a.approver || "approval"}`, time });
    return { sent: 0, waiting };
  }
  for (const op of ops) deliver(a, op, date, how);
  log(a, date, { status: "sent", count: ops.length, text: `${ops.length} sent to ${SYSTEMS[a.system]}`, time });
  return { sent: ops.length, waiting: 0 };
}

// Overnight and during-the-day runs of the selected business day.
export function ensureDay(date = TODAY) {
  for (const a of all()) {
    const k = `${a.id}|${date}`;
    if (runsDone.has(k) || a.live || !conf(a).enabled) continue;
    runsDone.add(k);
    run(a.id, date, { how: "scheduled" });
  }
}

// Live events raised by people in the app.
export function fire(event, data) {
  const date = data.date || TODAY;
  if (event === "mr.sent") {
    const a = find("mr-paul");
    if (!conf(a).enabled) return;
    const op = { title: `${PUB[data.pub].name}: Manager Report sent to Paul`, payload: { to: "paul@frogpubs.com", subject: `Manager Report · ${PUB[data.pub].name} · ${date}`, notes: data.notes || "" } };
    deliver(a, op, date, "event"); log(a, date, { status: "sent", count: 1, text: op.title });
  }
  if (event === "invoice.disputed") {
    const a = find("dispute-email");
    if (!conf(a).enabled) return;
    const f = hub.invoiceCheck({}).exceptions.find((x) => x.id === data.id);
    if (!f) return;
    const op = { title: `${f.supplier}: credit note requested for invoice ${f.id}`, payload: { to: `${f.supplier.toLowerCase().replace(/\W+/g, ".")}@supplier.example`, subject: `Invoice ${f.id} · credit note request`, body: f.issues.map((i) => i.detail).join("\n") } };
    deliver(a, op, date, "event"); log(a, date, { status: "sent", count: 1, text: op.title });
  }
  if (event === "menu.changed") {
    const a = find("menu-push");
    if (!conf(a).enabled) return;
    const op = { pub: data.pub, title: `${data.name}: ${data.beer} at €${data.after.pint.toFixed(2)} a pint`, payload: { location: data.name, tap: data.tap, beer: data.beer, pint: data.after.pint, half: data.after.half, to: ["Zelty", "Frog Space"] } };
    deliver(a, op, date, "event"); log(a, date, { status: "sent", count: 1, text: op.title });
  }
  if (event === "waste.added") {
    const a = find("waste-yokitup");
    if (!conf(a).enabled) return;
    const w = data.waste;
    const op = { pub: w.pub, title: `${w.name}: ${w.qty} ${w.unit} ${w.itemName} out of stock (${w.reason.toLowerCase()})`, payload: { location: w.name, date, movement: "waste", lines: [{ product: w.yokitup, qty: w.qty, reason: w.reason }] } };
    deliver(a, op, date, "event"); log(a, date, { status: "sent", count: 1, text: op.title });
  }
  if (event === "booking.decided") {
    const a = find("booking-zenchef");
    if (!conf(a).enabled) return;
    const op = { title: `Booking ${data.id} ${data.status} · SMS sent to the guest`, payload: { booking: data.id, status: data.status === "validated" ? "confirmed" : "refused", notify_guest: true } };
    deliver(a, op, date, "event"); log(a, date, { status: "sent", count: 1, text: op.title });
  }
  if (event === "invoice.approved") {
    const a = find("invoices-yooz");
    const op = { title: `Invoice ${data.id} approved by a person`, payload: { invoice: data.id, status: "approved", approved_by: data.by || "GM" } };
    deliver(a, op, date, "event"); log(a, date, { status: "sent", count: 1, text: op.title });
  }
}

export function decide(opId, status, by = "you") {
  const p = pending.get(opId);
  if (!p) throw new Error("Unknown operation");
  if (!["approved", "rejected"].includes(status)) throw new Error("Decision must be approved or rejected");
  pending.delete(opId);
  decided.set(opId, { status, by, time: clock(), auto: p.auto, op: p.op, date: p.date });
  const a = find(p.auto);
  if (status === "approved") { deliver(a, p.op, p.date, "approved"); log(a, p.date, { status: "sent", count: 1, text: `${p.op.title} · approved` }); }
  else log(a, p.date, { status: "skipped", count: 0, text: `${p.op.title} · not sent` });
  return { ok: true };
}

export function setConfig(id, { enabled, mode }) {
  const a = find(id), c = conf(a);
  if (enabled != null) c.enabled = !!enabled;
  if (mode && ["auto", "approval"].includes(mode)) c.mode = mode;
  settings.set(id, { enabled: c.enabled, mode: c.mode });
  return c;
}

/* ---------- views ---------- */

export function list({ date = TODAY, owner } = {}) {
  ensureDay(date);
  return all().filter((a) => !owner || a.owners.includes(owner)).map((a) => {
    const c = conf(a);
    const last = LOG.find((l) => l.automation === a.id && l.date === date);
    const sentToday = OUTBOX.filter((o) => o.automation === a.id && o.date === date).length;
    return { id: a.id, name: a.name, system: SYSTEMS[a.system], trigger: a.trigger, why: a.why, enabled: c.enabled, mode: c.mode, approver: a.approver, custom: !!a.custom, owners: a.owners,
      last: last ? `${last.time} · ${last.text}` : c.enabled ? (a.live ? "Runs when it happens" : "Not run yet") : "Off", sentToday, waiting: [...pending.values()].filter((p) => p.auto === a.id && p.date === date).length };
  });
}

export function preview(id, date = TODAY) {
  const a = find(id);
  const ops = a.plan({ date });
  return { id, name: a.name, system: SYSTEMS[a.system], trigger: a.trigger.label, why: a.why, ops: ops.map(({ title, detail, payload, table }) => ({ title, detail, payload, table })) };
}

// operations waiting for a person, plus the ones already decided that day (shown as done)
export function approvals({ date = TODAY, owner, pub } = {}) {
  ensureDay(date);
  const keep = (p) => p.date === date && (!owner || find(p.auto).owners.includes(owner)) && (!pub || p.op.pub === pub);
  const row = (id, p, decidedAs) => ({ id, automation: p.auto, name: find(p.auto).name, system: SYSTEMS[find(p.auto).system], approver: find(p.auto).approver, ...p.op, decided: decidedAs });
  return [
    ...[...pending.entries()].filter(([, p]) => keep(p)).map(([id, p]) => row(id, p, null)),
    ...[...decided.entries()].filter(([, d]) => keep(d)).map(([id, d]) => row(id, d, { status: d.status, time: d.time })),
  ];
}

export const activity = ({ date = TODAY, system } = {}) => { ensureDay(date); return LOG.filter((l) => l.date === date && (!system || l.system === system)); };
export const outbox = ({ date = TODAY, system } = {}) => { ensureDay(date); return OUTBOX.filter((o) => o.date === date && (!system || o.system === system)); };

/* ---------- builder ---------- */

export const BUILDER = {
  triggers: [
    { id: "revenue-below", label: "Revenue below target", unit: "%", default: 10, help: "A pub's revenue on the day is more than X % below target" },
    { id: "labour-above", label: "Labour cost above", unit: "% of revenue", default: 32, help: "Labour cost on the day above X % of revenue HT" },
    { id: "clubfrog-below", label: "Club Frog rate below", unit: "%", default: 12, help: "Participation over 7 days below X %" },
    { id: "missed-calls", label: "Missed calls above", unit: "calls", default: 10, help: "More than X missed calls on the day" },
    { id: "covers-above", label: "Guests above", unit: "guests", default: 400, help: "More than X guests on the day" },
  ],
  actions: [
    { id: "email", label: "Send an email", targets: ["The pub's GM", "Paul", "Tory", "Accounting"] },
    { id: "task", label: "Create a task in Frog Hub", targets: ["Pub managers", "Paul", "Operations & events", "Finance"] },
    { id: "combo", label: "Add a note to the Combo rota", targets: ["Next day's rota"] },
  ],
};

function customPlan(spec) {
  return ({ date }) => PUBS.filter((p) => !spec.pub || spec.pub === p.id).flatMap((p) => {
    const k = hub.kpis({ pub: p.id, from: date, to: date })[0];
    let hit = null;
    if (spec.trigger === "revenue-below" && k.vsTargetPct < -spec.value) hit = `revenue ${k.vsTargetPct} % vs target`;
    if (spec.trigger === "labour-above" && k.labourCostPct > spec.value) hit = `labour cost ${k.labourCostPct} %`;
    if (spec.trigger === "covers-above" && k.covers > spec.value) hit = `${k.covers} guests`;
    if (spec.trigger === "missed-calls") { const c = CALLS.find((x) => x.pub === p.id && x.date === date); if (c && c.missed > spec.value) hit = `${c.missed} missed calls`; }
    if (spec.trigger === "clubfrog-below") { const r = hub.clubFrog({ pub: p.id, from: hub.addDays(date, -6), to: date }).total.ratePct; if (r < spec.value) hit = `Club Frog ${r} %`; }
    if (!hit) return [];
    const to = spec.target === "The pub's GM" ? `GM ${p.gm}` : spec.target;
    return [{ key: p.id, pub: p.id, title: `${p.name}: ${hit}`, detail: `${BUILDER.actions.find((x) => x.id === spec.action).label} → ${to}`, payload: { rule: spec.name, location: p.name, date, finding: hit, action: spec.action, to } }];
  });
}

export function create(spec) {
  const t = BUILDER.triggers.find((x) => x.id === spec.trigger), act = BUILDER.actions.find((x) => x.id === spec.action);
  if (!t || !act) throw new Error("Unknown trigger or action");
  if (spec.pub && !PUB[spec.pub]) throw new Error("Unknown pub");
  const value = Number(spec.value ?? t.default);
  if (!Number.isFinite(value)) throw new Error("Threshold must be a number");
  const name = String(spec.name || `${t.label} ${value} ${t.unit}`).slice(0, 80);
  const a = {
    id: `custom-${custom.length + 1}`, name, custom: true, system: act.id === "email" ? "email" : act.id === "combo" ? "combo" : "hub",
    owners: ["ceo", "manager", "finance", "ops", "marketing", "data"], mode: spec.mode === "approval" ? "approval" : "auto", approver: "you",
    trigger: { kind: "rule", label: `Every morning · ${t.label.toLowerCase()} ${value} ${t.unit}${spec.pub ? ` · ${PUB[spec.pub].name}` : " · all pubs"}`, time: "06:30" },
    why: `Created in Frog Hub: ${t.help.replace("X", value)}, then ${act.label.toLowerCase()} (${spec.target || act.targets[0]}).`,
    plan: customPlan({ ...spec, value, name, target: spec.target || act.targets[0] }),
  };
  custom.push(a);
  return a.id;
}
// run once for a day (used right after an automation is created or switched on)
export function runOnce(id, date = TODAY) {
  const k = `${id}|${date}`;
  if (runsDone.has(k)) return { sent: 0, waiting: 0 };
  runsDone.add(k);
  return run(id, date, { how: "scheduled" });
}

export const SYSTEM_NAMES = SYSTEMS;
