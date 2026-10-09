// Frog's AI agents: one job each, built on the hub's context and plugged into the tools Frog
// already uses. An agent bundles skills (hub capabilities + automations), works for named people,
// has an autonomy level and a delivery status, and its impact is counted every day.
//
// Impact units come from the audit when it gives a figure, otherwise they are estimates marked
// as such, to confirm with the teams (see UNITS).

import * as hub from "./hub.mjs";
import * as auto from "./automations.mjs";
import * as actions from "./actions.mjs";
import { stats as copilotStats } from "./copilot.mjs";
import { PUBS, DATES, TODAY, NEPTING, SHIFTS, INVOICES, CALLS, EVENTS, TICKETS, dow } from "./data.mjs";

const r1 = (x) => Math.round(x * 10) / 10;
const monthDays = (date) => DATES.filter((d) => d <= date);
const weeksIn = (date) => monthDays(date).length / 7;

/* ---------- how impact is counted ---------- */

export const UNITS = {
  mr: { value: 20, unit: "min per Manager Report", source: "Audit", basis: "15–30 min saved per service (SM Princess), at least 20 min (Hop House)" },
  cashup: { value: 8, unit: "min per staff on shift, per day", source: "Audit", basis: "5–12 min per staff per cash-up, 10 cash-ups a night at XVI" },
  cashLine: { value: 2, unit: "min per line still to check", source: "Estimate", basis: "time for the SM to confirm a flagged payment" },
  kpi: { value: 75, unit: "min per pub per week", source: "Audit", basis: "1h–1h30 per Club Frog KPI session with the ChatGPT prompt (Rosbif)" },
  invoice: { value: 6, unit: "min per invoice approved automatically", source: "Estimate", basis: "two validations of 3 min (Yooz and Yokitup), double validation confirmed by the audit" },
  portals: { value: 15, unit: "min per pub per day", source: "Estimate", basis: "accounting checks the CB, Amex, Sodexo, Bimpli and Ticket Restaurant portals by hand (audit, rupture n°1)" },
  banking: { value: 45, unit: "min per pub per week", source: "Estimate", basis: "weekly banking Excel rebuilt by the GM every Monday (Bercy)" },
  payroll: { value: 120, unit: "min per month", source: "Estimate", basis: "Combo export prepared and sent to P2M by Jean-Bernard" },
  targets: { value: 30, unit: "min per pub per month", source: "Estimate", basis: "targets copied by hand in HT into Combo (Hop House)" },
  rota: { value: 45, unit: "min per pub per week", source: "Estimate", basis: "weekly rota built by hand around matches and groups" },
  chase: { value: 10, unit: "min per payment followed up", source: "Estimate", basis: "Tory asks accounting whether a corporate client has paid" },
  dataRequest: { value: 45, unit: "min per data request", source: "Estimate", basis: "'Ask Sébastien': decisions wait 1–3 weeks (Rosbif); 6 requests a week across the group" },
  duty: { value: 1500, unit: "€ per missing ledger line", source: "Audit", basis: "€1,500 fine per missing line at a customs control" },
  smsBooking: { value: 0.08, unit: "of SMS turning into a booking", source: "Estimate", basis: "share of missed callers who book from the link" },
  winback: { value: 0.3, unit: "of lapsed regulars coming back", source: "Estimate", basis: "response to a free-pint offer" },
};
const h = (minutes) => minutes / 60;

/* ---------- agents ---------- */

export const AGENTS = [
  {
    id: "close", name: "Close-of-service agent", icon: "CS", status: "live", since: "7 Sept",
    for: "Shift managers and GMs", workspace: "manager", autonomy: "Prepares, the SM confirms and sends",
    mission: "Closes the service with the SM: reconciles every card payment with its table and server, pre-fills the Manager Report, syncs hours with Combo.",
    tools: ["Zelty", "Nepting", "Combo", "Email"],
    skills: [
      { name: "Cash-up reconciliation", text: "Each Nepting payment is matched to its Zelty table and to the server who cashed it; only the rare mismatch is shown." },
      { name: "Manager Report pre-filled", text: "Hourly sales by beer/wet/food, targets, S-1, staff, hours, payments and Club Frog, ready for the SM's notes." },
      { auto: "mr-paul" }, { auto: "missed-call-sms" },
    ],
    impact(date) {
      const days = monthDays(date);
      let staffDays = 0, lines = 0;
      for (const p of PUBS) for (const d of days) {
        staffDays += new Set(SHIFTS.filter((s) => s.pub === p.id && s.date === d).map((s) => s.staff)).size;
        lines += hub.cashup({ pub: p.id, date: d }).exceptions.filter((e) => e.code === "unmatched").length;
      }
      const reports = PUBS.length * days.length;
      return [
        { label: "Manager Reports pre-filled", count: reports, hours: h(reports * UNITS.mr.value), unit: "mr" },
        { label: "Cash-ups reconciled (staff × days)", count: staffDays, hours: h(staffDays * UNITS.cashup.value - lines * UNITS.cashLine.value), unit: "cashup" },
      ];
    },
    today: (date) => ({ actions: NEPTING.filter((n) => n.date === date && n.ticket).length + PUBS.length, label: "payments matched and reports prepared" }),
  },
  {
    id: "rota", name: "Rota agent", icon: "RO", status: "pilot", since: "28 Sept", pilot: "Pilot: GMs approve each recommendation before it reaches Combo",
    for: "GMs", workspace: "manager", autonomy: "Prepares, the GM approves",
    mission: "Plans the staff the pub needs: sends daily targets to Combo and a recommended rota built from expected guests, matches picked in Fanzo and group bookings.",
    tools: ["Combo", "Fanzo", "Zenchef", "BookingShake"],
    skills: [{ auto: "targets-combo" }, { auto: "staffing-combo" }, { auto: "match-zenchef" }],
    impact(date) {
      const w = weeksIn(date);
      return [
        { label: "Targets sent to Combo (pub-months)", count: PUBS.length, hours: h(PUBS.length * UNITS.targets.value), unit: "targets" },
        { label: "Rotas prepared (pub-weeks)", count: Math.round(PUBS.length * w), hours: h(PUBS.length * w * UNITS.rota.value), unit: "rota" },
      ];
    },
    today: (date) => ({ actions: auto.outbox({ date }).filter((o) => ["targets-combo", "staffing-combo", "match-zenchef"].includes(o.automation)).length, label: "updates for Combo and Zenchef" }),
  },
  {
    id: "purchasing", name: "Purchasing agent", icon: "PU", status: "live", since: "21 Sept",
    for: "GMs and accounting", workspace: "finance", autonomy: "Acts alone on matching invoices, asks for the rest",
    mission: "Checks every supplier invoice against its Yokitup order and the agreed price, approves the matching ones in Yooz, writes the credit-note requests.",
    tools: ["Yooz", "Yokitup", "Email"],
    skills: [
      { name: "Invoice ↔ order ↔ price check", text: "Billed quantity against received, billed price against negotiated, duplicates blocked." },
      { auto: "invoices-yooz" }, { auto: "dispute-email" },
    ],
    impact(date) {
      const inv = hub.invoiceCheck({});
      const auto_ = INVOICES.filter((f) => f.date <= date).length - inv.exceptions.length;
      const priceGaps = inv.exceptions.flatMap((f) => f.issues).filter((i) => i.kind !== "Duplicate invoice").reduce((a, i) => a + i.atStake, 0);
      const dup = inv.exceptions.filter((f) => f.issues.some((i) => i.kind === "Duplicate invoice")).reduce((a, f) => a + f.total, 0);
      return [
        { label: "Invoices approved automatically", count: auto_, hours: h(auto_ * UNITS.invoice.value), unit: "invoice" },
        { label: "Price and quantity gaps caught", count: inv.exceptions.length, euros: priceGaps, basis: "Sum over-billed against orders and agreed prices" },
        { label: "Duplicate invoices blocked", euros: dup, basis: "Invoice totals that would have been paid twice" },
      ];
    },
    today: (date) => ({ actions: INVOICES.filter((f) => f.date <= date && f.date > hub.addDays(date, -7)).length, label: "invoices checked this week" }),
  },
  {
    id: "finance", name: "Finance agent", icon: "FI", status: "live", since: "14 Sept",
    for: "Jean-Bernard, Stella, Sahira", workspace: "finance", autonomy: "Acts alone",
    mission: "Turns terminal data into accounting: takings by payment mode to Sage, the same banking file for 8 pubs, payroll hours to P2M, the beer duty ledger kept complete.",
    tools: ["Sage", "Bank", "P2M (Silae)", "Beer duty ledger"],
    skills: [
      { name: "Payment modes from the terminals", text: "CB, Amex, meal cards, paper vouchers (OCR) and cash split per day and per pub." },
      { auto: "takings-sage" }, { auto: "hours-p2m" }, { auto: "duty-ledger" },
    ],
    impact(date) {
      const days = monthDays(date).length, w = weeksIn(date);
      const missing = hub.beerDuty({}).reduce((a, d) => a + d.missingLines.length, 0);
      return [
        { label: "Payment portals no longer checked (pub-days)", count: PUBS.length * days, hours: h(PUBS.length * days * UNITS.portals.value), unit: "portals" },
        { label: "Banking files produced (pub-weeks)", count: Math.round(PUBS.length * w), hours: h(PUBS.length * w * UNITS.banking.value), unit: "banking" },
        { label: "Payroll export to P2M", count: 1, hours: h(UNITS.payroll.value), unit: "payroll" },
        { label: "Beer duty lines that would have been missing", count: missing, euros: missing * UNITS.duty.value, unit: "duty" },
      ];
    },
    today: (date) => ({ actions: auto.outbox({ date }).filter((o) => ["takings-sage", "hours-p2m", "duty-ledger"].includes(o.automation)).length, label: "postings to Sage, P2M and the ledger" }),
  },
  {
    id: "guests", name: "Club Frog agent", icon: "CF", status: "pilot", since: "28 Sept", pilot: "Pilot on a daily OBY Pay export until the live API is opened",
    for: "Emma, Liz and the GMs", workspace: "marketing", autonomy: "Prepares, Emma approves campaigns",
    mission: "Measures Club Frog the same way in every pub, brings lapsed regulars back with an OBY Pay offer and turns every ad or survey lead into a member.",
    tools: ["OBY Pay", "Zelty", "Meta ads", "Typeform"],
    skills: [
      { name: "Participation KPI", text: "Rate by pub, day, shift, server and shift manager from bills and scans; manual discounts kept apart." },
      { name: "Visit counter", text: "Counts member visits from the bills linked to each account, which OBY Pay cannot do." },
      { auto: "winback-oby" }, { auto: "lead-oby" }, { auto: "booking-invite" }, { auto: "visit-reward" }, { auto: "clubfrog-weekly" },
    ],
    impact(date) {
      const w = weeksIn(date);
      const lapsed = auto.preview("winback-oby", date).ops.reduce((a, o) => a + (o.payload?.members || 0), 0);
      const memberSpend = hub.guests({ to: date }).memberSpendPerHead;
      return [
        { label: "Club Frog KPI sessions replaced (pub-weeks)", count: Math.round(PUBS.length * w), hours: h(PUBS.length * w * UNITS.kpi.value), unit: "kpi" },
        { label: "Lapsed regulars invited back", count: lapsed, euros: lapsed * UNITS.winback.value * memberSpend * 2.5, unit: "winback", basis: `${Math.round(UNITS.winback.value * 100)} % return × €${memberSpend.toFixed(2)} per guest × 2.5 guests` },
      ];
    },
    today: (date) => ({ actions: auto.outbox({ date }).filter((o) => ["winback-oby", "lead-oby"].includes(o.automation)).length + TICKETS.filter((t) => t.date === date && t.member).length, label: "member visits counted and contacts created" }),
  },
  {
    id: "bookings", name: "Bookings & events agent", icon: "BE", status: "live", since: "21 Sept",
    for: "Tory and the GMs", workspace: "ops", autonomy: "Acts alone",
    mission: "Keeps tables, groups and darts in one view, follows every group deposit from the bank and never lets a missed call go without an answer.",
    tools: ["Zenchef", "BookingShake", "SimplyBook", "OVH", "Retell AI", "Bank"],
    skills: [
      { name: "One booking view", text: "8 Zenchef accounts, BookingShake and SimplyBook in one list per service, validated from the hub." },
      { name: "AI receptionist (pilot)", text: "Retell AI answers the calls staff miss at Hop House and Rosbif, books, transfers and keeps a transcript." },
      { auto: "deposit-reminder" }, { auto: "missed-call-sms" }, { auto: "confirm-calls" }, { auto: "closure-alert" }, { auto: "booking-zenchef" },
    ],
    impact(date) {
      const missed = CALLS.filter((c) => c.date <= date).reduce((a, c) => a + c.missed, 0);
      const spend = hub.guests({ to: date }).spendPerHead;
      return [
        { label: "Payment statuses no longer chased", count: EVENTS.length, hours: h(EVENTS.length * UNITS.chase.value), unit: "chase" },
        { label: "Missed callers sent the booking link", count: missed, euros: missed * UNITS.smsBooking.value * 2.8 * spend, unit: "smsBooking", basis: `${UNITS.smsBooking.value * 100} % book × 2.8 guests × €${spend.toFixed(2)}` },
      ];
    },
    today: (date) => ({ actions: auto.outbox({ date }).filter((o) => ["deposit-reminder", "missed-call-sms"].includes(o.automation)).length, label: "reminders and SMS sent" }),
  },
  {
    id: "copilot", name: "Frog Copilot", icon: "CO", status: "live", since: "7 Sept",
    for: "Everyone", workspace: null, autonomy: "Answers, never changes data",
    mission: "Answers any question on the figures or on how things work, in French or English, from the hub and Frog's own documentation, with its sources.",
    tools: ["Central data hub", "Audit & process map", "SOPs"],
    skills: [
      { name: "Live figures", text: "Calls the same hub functions as the screens: revenue, cash-up, Club Frog, invoices, bookings, guests, automations." },
      { name: "Company knowledge", text: "Searches the audit, the process map, KPI definitions and every SOP or software guide added." },
    ],
    impact(date) {
      const req = Math.round(6 * weeksIn(date));
      return [{ label: "Data requests answered without Sébastien", count: req, hours: h(req * UNITS.dataRequest.value), unit: "dataRequest" }];
    },
    today: () => ({ actions: copilotStats.questions, label: "questions answered since the server started" }),
  },
];

// Next agents, ranked by impact (hours a month + € a month / 50) per unit of effort.
export const BACKLOG = [
  { name: "Menu launch agent", for: "Tory, Sébastien, GMs", hours: 30, euros: 0, effort: "M", committed: "7 Oct", why: "One menu change pushed to Zelty, Yokitup recipe cards, Frog Space, the website and the printer at once. Next launch: 7 October; last-minute prices today reach the printer but not the tills.", tools: "Zelty · Yokitup · Frog Space · WordPress" },
  { name: "Stock variance agent", for: "GMs, KSMs", hours: 40, euros: 1500, effort: "L", why: "Explains inventory gaps from sales, waste and deliveries: several days a month are spent justifying variances at Rosbif.", tools: "Yokitup · Zelty · Trail" },
  { name: "Waste agent", for: "Kitchen, SMs", hours: 20, euros: 0, effort: "S", why: "Waste typed once in Trail reaches Yokitup; HACCP kept in one tool.", tools: "Trail · Yokitup" },
  { name: "Reviews agent", for: "GMs, Tory", hours: 12, euros: 0, effort: "S", why: "Drafts replies to TripAdvisor and Yelp in each pub's voice and writes the monthly reviews report Tory builds by hand.", tools: "HGEM · Google · TripAdvisor" },
  { name: "Recruiting agent", for: "GMs, HR", hours: 15, euros: 0, effort: "M", why: "Sorts applications from the website, books interviews and prepares the Combo contract and DPAE.", tools: "Frog Space · Combo" },
  { name: "SM training agent", for: "GMs, new SMs", hours: 10, euros: 0, effort: "M", why: "Turns the SOPs and paper workbooks into short lessons on the phone; training SMs is the first use GMs want for the time saved.", tools: "Frog Space · Copilot" },
].map((b) => ({ ...b, score: Math.round(((b.hours + b.euros / 50) / { S: 1, M: 2, L: 3 }[b.effort]) * 10) / 10 })).sort((a, b) => (b.committed ? 1 : 0) - (a.committed ? 1 : 0) || b.score - a.score);

export const ROADMAP = [
  { when: "7 Sept", what: "Close-of-service agent and Frog Copilot live in the 8 pubs", state: "Delivered" },
  { when: "14 Sept", what: "Finance agent: Sage, banking file, P2M, beer duty ledger", state: "Delivered" },
  { when: "21 Sept", what: "Purchasing agent and Bookings & events agent", state: "Delivered" },
  { when: "28 Sept", what: "Rota agent and Club Frog agent in pilot", state: "Pilot" },
  { when: "7 Oct", what: "Menu launch agent for the autumn menu", state: "Next" },
  { when: "Oct", what: "OBY Pay live API · Reserve with Google at Bercy and Bordeaux · Apitic history (N-1)", state: "Next" },
  { when: "Nov", what: "Stock variance agent · 2027 budget built on hourly data", state: "Planned" },
];

/* ---------- team pulse (short check-ins) ---------- */

const PULSE = [
  // demo answers collected during the month
  ...[["SM & GM", 4.5, 4.2, 14], ["Accounting", 4.3, 4.6, 3], ["Head office", 4.4, 4.3, 3], ["Marketing", 4.0, 3.9, 2]].map(([role, time, trust, n]) => ({ role, time, trust, n, demo: true })),
];
const comments = [
  { role: "SM & GM", text: "The cash-up takes five minutes now. Can the rota agent also handle late-night staff?", demo: true },
  { role: "Accounting", text: "Sage entries are right first time. We would like the Amex settlements matched too.", demo: true },
  { role: "Marketing", text: "Waiting for the live OBY Pay connection to send win-back offers every day.", demo: true },
];
export function answerPulse({ role, time, trust, idea }) {
  const t = Number(time), tr = Number(trust);
  if (!PULSE.some((p) => p.role === role)) throw new Error("Unknown role");
  if (![t, tr].every((x) => Number.isInteger(x) && x >= 1 && x <= 5)) throw new Error("Scores must be 1 to 5");
  const p = PULSE.find((x) => x.role === role);
  p.time = (p.time * p.n + t) / (p.n + 1); p.trust = (p.trust * p.n + tr) / (p.n + 1); p.n += 1;
  if (typeof idea === "string" && idea.trim()) comments.unshift({ role, text: idea.trim().slice(0, 400) });
  return { ok: true };
}
export const pulse = () => ({ roles: PULSE.map((p) => ({ ...p, time: r1(p.time), trust: r1(p.trust) })), comments: comments.slice(0, 8), answers: PULSE.reduce((a, p) => a + p.n, 0) });

/* ---------- views ---------- */

export function agentSummary(a, date = TODAY) {
  const items = a.impact(date).map((i) => ({ ...i, hours: i.hours != null ? r1(i.hours) : null, euros: i.euros != null ? Math.round(i.euros) : null, source: i.unit ? UNITS[i.unit].source : "Hub data", basis: i.basis || (i.unit ? UNITS[i.unit].basis : "") }));
  const skills = a.skills.map((s) => (s.auto ? { auto: s.auto } : s));
  const autos = auto.list({ date }).filter((x) => skills.some((s) => s.auto === x.id));
  const waiting = autos.reduce((n, x) => n + x.waiting, 0);
  return {
    id: a.id, name: a.name, icon: a.icon, status: a.status, since: a.since, pilot: a.pilot, for: a.for, workspace: a.workspace, autonomy: a.autonomy, mission: a.mission, tools: a.tools,
    skills: skills.map((s) => (s.auto ? { auto: autos.find((x) => x.id === s.auto) } : s)), autos, waiting,
    hours: r1(items.reduce((s, i) => s + (i.hours || 0), 0)), euros: Math.round(items.reduce((s, i) => s + (i.euros || 0), 0)), items, today: a.today(date),
  };
}
export const agents = (date = TODAY) => AGENTS.map((a) => agentSummary(a, date));
export const agent = (id, date = TODAY) => { const a = AGENTS.find((x) => x.id === id); if (!a) throw new Error(`Unknown agent ${id}`); return agentSummary(a, date); };

// Hours given back by role, from the agents' impact lines
export function byRole(list) {
  const ROLE = { close: "SMs & GMs", rota: "GMs", purchasing: "GMs & accounting", finance: "Accounting", guests: "Emma & GMs", bookings: "Tory", copilot: "Sébastien & everyone" };
  const out = {};
  for (const a of list) out[ROLE[a.id]] = (out[ROLE[a.id]] || 0) + a.hours;
  return Object.entries(out).map(([role, hours]) => ({ role, hours: r1(hours) })).sort((a, b) => b.hours - a.hours);
}

export function adoption(date = TODAY) {
  const days = monthDays(date);
  const sent = PUBS.filter((p) => actions.get("mr", `${p.id}|${date}`)).length;
  const decided = auto.approvals({ date }).filter((o) => o.decided).length;
  const waiting = auto.approvals({ date }).filter((o) => !o.decided).length;
  return { mrSentToday: sent, approvalsDecided: decided, approvalsWaiting: waiting, days: days.length, weekday: dow(date) };
}
