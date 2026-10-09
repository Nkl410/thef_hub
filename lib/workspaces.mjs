// One workspace per role. Tabs follow the rhythm of the role: what happens tonight, the close
// of service, the Monday routine, the month. Each tab opens on what needs a person, with the
// action right there; what the hub did on its own is a one-line summary, not a banner.
//
// Section types rendered by public/app.js: hero (summary strip), kpis, notice, filters, flow,
// queue, agenda, line, bars, table, downloads, form, menu, points, connectors, tasks, and the
// programme sections (agents, automations, activity, outbox, builder, skills, roadmap, backlog,
// pulse, problems, heatmap, systemmap). Rows and queue items may carry a `drawer` (detail
// panel), KPI tiles a `tab` (jump), sections an `ask` (question pre-filled for Frog Copilot).

import * as hub from "./hub.mjs";
import * as actions from "./actions.mjs";
import * as auto from "./automations.mjs";
import * as agentsMod from "./agents.mjs";
import * as kpisMod from "./kpis.mjs";
import * as proc from "./processes.mjs";
import { PUB, PUBS, TODAY, DATES, STAFF, NEPTING, BOOKINGS, SHIFTS, PAYMENT_MODES, VOUCHERS, AI_PILOT, dow } from "./data.mjs";

const eur = (x) => `€${Math.round(x).toLocaleString("en-GB")}`;
const eur2 = (x) => `€${(Math.abs(x) < 0.005 ? 0 : +x).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pctS = (x) => `${x > 0 ? "+" : ""}${(+x).toLocaleString("en-GB", { maximumFractionDigits: 1 })} %`;
const pct = (x) => `${(+x).toLocaleString("en-GB", { maximumFractionDigits: 1 })} %`;
const num = (x) => Math.round(x).toLocaleString("en-GB");
const dec = (x, d = 1) => (+x).toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d });
const cell = (v, tone) => ({ v, tone });
const chip = (v, tone = "good") => ({ chip: v, tone });
const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const longDay = (d) => `${WEEKDAY[dow(d)]} ${+d.slice(8)} ${MONTH[+d.slice(5, 7) - 1]}`;
const shortDay = (d) => `${WEEKDAY[dow(d)].slice(0, 3)} ${+d.slice(8)}/${+d.slice(5, 7)}`;
const staffName = (pub, code) => (STAFF[pub].find((s) => s.code === code) || { name: code }).name;
const plain = (key) => key.replace(/ \((?:[A-Z]{2}\d{2}|GM)\)$/, "");

export const WORKSPACES = [
  { id: "manager", group: "Pubs", label: "Pub team", role: "GM and shift managers", people: "GMs and SMs", mono: "PT", needsPub: true, param: "pub" },
  { id: "ceo", group: "Head office", label: "Paul", role: "CEO · the group", people: "Paul", mono: "PA" },
  { id: "ops", group: "Head office", label: "Tory", role: "Operations, groups, bookings", people: "Tory", mono: "TO" },
  { id: "marketing", group: "Head office", label: "Emma & Liz", role: "Club Frog and marketing", people: "Emma, Liz", mono: "EL" },
  { id: "finance", group: "Head office", label: "Accounting", role: "Jean-Bernard, Stella, Sahira", people: "Jean-Bernard, Stella, Sahira", mono: "AC" },
  { id: "data", group: "Head office", label: "Sébastien", role: "Data and IT", people: "Sébastien", mono: "SE" },
  { id: "points", group: "Programme", label: "Open points", role: "Process notes · methods to choose", people: "Frog and Zuri", mono: "OP" },
  { id: "agents", group: "Programme", label: "Agents & automations", role: "What runs on its own", people: "Everyone", mono: "AG" },
  { id: "scorecard", group: "Programme", label: "Scorecard", role: "8 problems · 25 KPIs", people: "Paul and Zuri", mono: "SC" },
  { id: "delivery", group: "Programme", label: "Delivery", role: "Impact, roadmap, team pulse", people: "Paul and Zuri", mono: "DL" },
  { id: "agent", label: "Agent", role: "Agent", people: "Everyone", hidden: true, param: "agent" },
];

/* ---------- shared pieces ---------- */

function opItems(list) {
  return list.map((o) => ({
    type: "op", id: o.id, title: o.title, meta: `${o.name} → ${o.system}`, detail: o.detail,
    actions: [{ label: "Approve and send", status: "approved", style: "primary", toast: `Sent to ${o.system}` }, { label: "Not this time", status: "rejected", toast: "Not sent" }],
    done: o.decided ? { label: o.decided.status === "approved" ? `Sent to ${o.system} · ${o.decided.time}` : "Not sent" } : null,
    drawer: { title: o.title, subtitle: `${o.name} → ${o.system}`, fields: [["What", o.detail]], table: o.table, payload: o.payload },
  }));
}
const openOps = (list) => list.filter((o) => !o.decided).length;
const sentToday = (date) => auto.outbox({ date }).length;

function lastFullWeek(date) {
  const full = hub.weeks().filter((w) => w.end === hub.addDays(w.start, 6) && w.end < date);
  return full.at(-1) || hub.weeks()[0];
}
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "June", "July", "Aug", "Sept", "Oct", "Nov", "Dec"];
const weekLabel = (w) => `${+w.start.slice(8)}–${+w.end.slice(8)} ${MON[+w.end.slice(5, 7) - 1]}`;
function period(p, date) {
  if (p === "day") return { from: date, to: date, label: longDay(date) };
  if (p === "month") return { from: DATES[0], to: date, label: `Month to ${shortDay(date)}` };
  const from = hub.addDays(date, -6) < DATES[0] ? DATES[0] : hub.addDays(date, -6);
  return { from, to: date, label: `7 days to ${shortDay(date)}` };
}
const nextService = (date) => (hub.BOOKABLE.includes(hub.addDays(date, 1)) ? hub.addDays(date, 1) : date);

function cashFacts(pub, date) {
  const c = hub.cashup({ pub, date });
  const by = (code) => c.exceptions.filter((e) => e.code === code);
  const toConfirm = by("unmatched");
  const matched = NEPTING.filter((n) => n.pub === pub && n.date === date && n.ticket).length;
  return { c, matched, fixed: { wrongCode: by("wrongCode").length, split: by("split").length, mode: by("mode").length }, toConfirm, open: toConfirm.filter((e) => !actions.done("cashline", e.id)).length };
}
function invoiceQueue(pub) {
  const inv = hub.invoiceCheck({ pub });
  const review = inv.exceptions.filter((f) => !f.issues.some((i) => i.kind === "Duplicate invoice"));
  const items = review.map((f) => {
    const a = actions.get("invoice", f.id);
    const stake = f.issues.reduce((s, i) => s + i.atStake, 0);
    return {
      type: "invoice", id: f.id, title: `${f.supplier} · ${eur2(stake)} to check`, meta: `${f.name} · invoice ${f.id} · ${f.date}`,
      detail: f.issues.map((i) => i.detail).join(" · "), amount: eur2(f.total),
      actions: [{ label: "Approve", status: "approved", style: "primary", toast: `Invoice ${f.id} approved` }, { label: "Dispute", status: "disputed", toast: `Credit note requested from ${f.supplier}` }],
      done: a ? { label: a.status === "approved" ? "Approved" : "Credit note requested" } : null,
      drawer: {
        title: `${f.supplier} · invoice ${f.id}`, subtitle: `${f.name} · ${f.date} · order ${f.order}`,
        fields: [["Invoice total", eur2(f.total)], ["To check", eur2(stake)], ["Why", f.issues.map((i) => i.detail).join("; ")]],
        table: { cols: ["Item", "Billed", "Received", "Price", "Agreed"], rows: f.lines.map((l) => [l.item, l.billed, cell(l.received, l.billed > l.received ? "attention" : ""), cell(eur2(l.price), l.price > l.agreed * 1.02 ? "attention" : ""), eur2(l.agreed)]) },
      },
    };
  });
  return { inv, items, blocked: inv.exceptions.length - review.length, open: items.filter((i) => !i.done).length };
}
function voucherItems(list) {
  return list.map((v) => ({
    type: "voucher", id: v.id, title: `${v.name} · ${shortDay(v.date)} · ${eur2(v.amount)}`,
    meta: v.scanned ? `${v.count} vouchers scanned · ${v.unreadable} unreadable` : "Batch not scanned at cash-up",
    detail: v.scanned ? `Type the ${v.unreadable} unreadable voucher${v.unreadable > 1 ? "s" : ""} (${eur2(v.unreadableAmount)}) from the photo.` : "Count the envelope, or ask the SM to scan it today.",
    amount: eur2(v.scanned ? v.unreadableAmount : v.amount),
    actions: [{ label: "Checked", status: "checked", style: "primary", toast: "Batch checked, ready for Sage" }],
    done: actions.done("voucher", v.id) ? { label: "Checked" } : null,
    drawer: { title: `Meal vouchers · ${v.name}`, subtitle: longDay(v.date), fields: [["Amount on the till", eur2(v.amount)], ["Vouchers", String(v.count)], ["Unreadable", `${v.unreadable} · ${eur2(v.unreadableAmount)}`], ["Scanned at cash-up", v.scanned ? "Yes" : "No"]],
      table: { cols: ["Issuer", "Vouchers"], rows: Object.entries(v.byIssuer).map(([k, n]) => [k, n]) } },
  }));
}
const mrState = (pub, date) => actions.get("mr", `${pub}|${date}`);
const used = (b) => b.channels.filter((c) => b.rows.some((r) => r.byChannel[c]));
function statusChip(e, date) {
  if (e.date <= date && e.finalPaid) return chip("Paid");
  if (e.date <= date && !e.finalPaid) return chip(actions.done("reminder", e.id) ? "Reminder sent" : "Balance due · reminder scheduled", "attention");
  if (e.depositInBank) return chip("Deposit received");
  return chip(actions.done("reminder", e.id) ? "Reminder sent" : "Deposit reminder scheduled", "muted");
}
const eventDrawer = (e, date) => ({
  title: `${e.client}`, subtitle: `${e.name} · ${e.date}`,
  fields: [["Guests", e.guests], ["Amount", eur(e.amount)], ["Deposit (50 %)", `${eur(e.deposit)} · ${e.depositInBank ? "received" : "not yet received"}`], ["Balance", e.date <= date ? (e.finalPaid ? "paid" : "due") : "after the event"], ["Payment", e.channel]],
});

// open points of a role (attention first), as a tab
function pointsTab(role, title = "Open points") {
  const items = proc.points({ role });
  const s = proc.summary(role);
  return { id: "points", label: "Open points", badge: s.attention, sections: [
    { type: "points", title, note: "From the process notes. Each point says what Frog Hub does today; where the notes give no direct solution, choose a method.", items: [...items.filter((p) => p.attention), ...items.filter((p) => !p.attention)] },
  ] };
}
const pointNotice = (id, extra = "") => {
  const p = proc.POINTS.find((x) => x.id === id);
  const d = proc.points({}).find((x) => x.id === id);
  return { type: "notice", tone: d.decision ? "info" : "attention", title: `${p.id} · ${p.title}`, text: `${d.decision ? `Method chosen: ${d.decision.name}. ` : `${proc.STATUS[p.status].label}. `}${p.open || p.hub}${extra}`, link: { label: "See the methods", href: `#/ws/points?tab=all&focus=${p.id}` } };
};

/* ---------- bookings: one list for tables, darts and groups ---------- */

const KIND = { table: "Table", darts: "Darts", group: "Group" };
function agendaItems(day) {
  return day.items.map((b) => {
    const d = actions.get("booking", b.id);
    const tags = [];
    if (b.via) tags.push(chip("AI receptionist", "info"));
    if (b.member) tags.push(chip("Club Frog", "good"));
    if (b.confirm) tags.push(chip(`Call: ${b.confirm.toLowerCase()}`, b.confirm === "Confirmed" ? "good" : b.confirm === "Cancelled" ? "bad" : "muted"));
    if (b.deposit) tags.push(chip(b.deposit, b.deposit === "Deposit received" ? "good" : "attention"));
    return {
      type: "booking", id: b.id, time: b.time, kind: b.kind, kindLabel: b.via ? "Phone" : KIND[b.kind], title: `${b.guest} · ${b.covers} guest${b.covers > 1 ? "s" : ""}`,
      meta: `${b.channel} · in ${b.system}`, tags, cancelled: b.confirm === "Cancelled",
      actions: b.needsValidation && b.confirm !== "Cancelled" ? [{ label: "Validate", status: "validated", style: "primary", toast: "Booking validated · SMS sent from Zenchef" }, { label: "Decline", status: "declined", toast: "Booking declined" }] : [],
      done: d ? { label: d.status === "validated" ? `Validated ${d.time}` : "Declined" } : null,
    };
  });
}
function agenda(day, title) {
  const items = agendaItems(day);
  const groups = ["Lunch", "Evening"].map((s) => ({ label: s, covers: day.items.filter((b) => b.service === s).reduce((a, b) => a + b.covers, 0), items: items.filter((_, i) => day.items[i].service === s) })).filter((g) => g.items.length);
  return { type: "agenda", title, note: "Tables (Zenchef), darts (SimplyBook) and groups (BookingShake) in one list. Bookings to validate are decided here and written back to Zenchef.", groups, empty: "No booking for this service yet." };
}
const toValidate = (day) => day.items.filter((b) => b.needsValidation && b.confirm !== "Cancelled" && !actions.done("booking", b.id)).length;

/* ---------- guest sections (shared by managers, marketing and Paul) ---------- */

function guestSections(g, scope) {
  const R = g.regulars;
  return [
    { type: "kpis", items: [
      { label: "Spend per guest", value: eur2(g.spendPerHead), sub: `${num(g.covers)} guests · 4 weeks` },
      { label: "Pints per guest", value: dec(g.pintsPerHead, 2), sub: `at €${g.pintPrice.toFixed(2)} a pint` },
      { label: "Food with the drinks", value: pct(g.foodAttachPct), sub: "of bills include food" },
      { label: "Members spend", value: eur2(g.memberSpendPerHead), sub: `per guest · others ${eur2(g.otherSpendPerHead)}`, tone: "good" },
      { label: "Regulars coming back", value: pct(R.repeatPct), sub: R.daysBetweenVisits ? `every ${dec(R.daysBetweenVisits)} days on average` : "of members" },
    ] },
    { type: "table", span: "half", title: "By moment of the day", ask: `How does spend per guest change between lunch, evening and late ${scope}?`,
      cols: ["Moment", "Guests", "Spend / guest", "Pints / guest", "With food"],
      rows: g.byShift.map((r) => [r.key, num(r.covers), eur2(r.spendPerHead), dec(r.pintsPerHead, 2), pct(r.foodAttachPct)]) },
    { type: "bars", span: "half", title: "Spend per guest by day of the week", items: g.byWeekday.map((r) => ({ label: r.key.slice(0, 3), value: r.spendPerHead, text: eur2(r.spendPerHead) })) },
  ];
}

function clubFrogTable(cf, by) {
  const head = { pub: "Pub", shift: "Moment", staff: "Server", manager: "Shift manager", day: "Day" }[by];
  return {
    cols: [head, ...(by === "pub" ? [] : ["Pub"]), "Bills", "Member bills", "Rate", "Scans", "Manual discounts", "Members per bill"],
    rows: cf.rows.filter((r) => by !== "staff" || r.tickets >= 20).slice(0, 30).map((r) => [by === "day" ? shortDay(r.key) : plain(r.key), ...(by === "pub" ? [] : [r.pub]), num(r.tickets), num(r.memberTickets), cell(pct(r.ratePct), r.ratePct >= 20 ? "good" : r.ratePct < 10 ? "attention" : ""), num(r.obyScans), num(r.manualDiscounts), dec(r.membersPerBill, 2)]),
  };
}

/* ---------- Pub team (GM and SMs) ---------- */

function manager({ pub = "xvi", date = TODAY, list = "opening" }) {
  const p = hub.checkPub(pub);
  if (!CHECK_MENU.some(([k]) => k === list)) list = "opening";
  const ck = hub.checklists({ pub: p.id, date });
  const closingList = ck.lists.find((l) => l.id === "closing");
  const ckOpen = ck.lists.reduce((a, l) => a + l.total - l.done, 0) + ck.totals.tempsOut;
  const next = nextService(date);
  const day = hub.bookingDay({ pub: p.id, date: next });
  const mr = hub.managerReport({ pub: p.id, date });
  const f = cashFacts(p.id, date);
  const q = invoiceQueue(p.id);
  const T = mr.totals;
  const sent = mrState(p.id, date);
  const nextOps = auto.approvals({ date, owner: "manager", pub: p.id });
  const w = lastFullWeek(date);
  const bank = hub.banking({ pub: p.id, weekStart: w.start }).pubs[0];
  const cfWeek = (by) => hub.clubFrog({ pub: p.id, by, from: w.start, to: w.end });
  const cf7 = hub.clubFrog({ pub: p.id, by: "staff", from: hub.addDays(date, -6), to: date });
  const cfByCode = Object.fromEntries(cf7.rows.map((r) => [r.key.match(/\((.+)\)/)?.[1], r]));
  const g = hub.guests({ pub: p.id, from: hub.addDays(date, -27), to: date });
  const ph = hub.phone({ pub: p.id, from: hub.addDays(date, -6), to: date });
  const phDay = hub.phone({ pub: p.id, from: date, to: date }).rows[0];
  const pilot = AI_PILOT.pubs.includes(p.id);
  const mn = hub.menu({ pub: p.id });
  const v = VOUCHERS.find((x) => x.pub === p.id && x.date === date);
  const fixedTotal = f.fixed.wrongCode + f.fixed.split + f.fixed.mode;

  // --- tonight
  const closed = day.closed[0];
  const tonight = [
    ...(closed ? [{ type: "notice", tone: "attention", title: `Online bookings are closed from ${closed.from} (${closed.by})`, text: `Ads keep sending guests to the booking page during the closure. Liz and Paul have been told. Reopen in Zenchef if tables are free.`, link: { label: "Why it matters", href: "#/ws/points?tab=all&focus=P03" } }] : []),
    { type: "hero", label: `${longDay(next)}${day.matchNight ? " · match night" : ""}`, counters: [
      { value: num(day.totals.covers), label: `guests booked · ${day.totals.bookings} bookings` },
      { value: num(day.totals.lunch), label: "at lunch" }, { value: num(day.totals.evening), label: "in the evening" },
      { value: String(toValidate(day)), label: "to validate" },
      { value: String(day.totals.darts + day.totals.groups), label: `darts and groups` },
    ] },
    agenda(day, `Bookings · ${longDay(next)}`),
    { type: "kpis", items: [
      { label: "Calls yesterday", value: num(phDay.calls), sub: `${num(phDay.answeredByStaff)} answered by the team`, tab: "phone" },
      { label: "Missed by the team", value: num(phDay.missedByStaff), sub: `${phDay.beforeOpening} before opening`, tone: phDay.missedByStaff > 10 ? "attention" : "", tab: "phone" },
      pilot ? { label: "Answered by the AI", value: num(phDay.aiAnswered), sub: `${phDay.lost} left without answer`, tab: "phone" } : { label: "Sent the booking link", value: num(phDay.missedByStaff), sub: "SMS after a missed call", tab: "phone" },
    ] },
  ];

  // --- close of service
  const cashItems = f.toConfirm.map((e) => ({
    type: "cashline", id: e.id, title: `${eur2(e.amount)} at ${e.time}`, meta: `Server ${staffName(p.id, e.staff)}`,
    detail: e.kind === "Refused payment retried" ? "Refused, then retried on the terminal." : "Card payment with no table on the till.",
    actions: [{ label: "Checked", status: "checked", style: "primary", toast: "Payment checked" }], done: actions.done("cashline", e.id) ? { label: "Checked" } : null,
  }));
  const vDone = !v || actions.done("voucher", v.id) || (v.scanned && !v.unreadable);
  const steps = [
    { id: "cash", label: "Cash-up", text: `${f.matched} card payments matched to their table and server${fixedTotal ? `, ${fixedTotal} set right automatically` : ""}.`, state: f.open ? "todo" : "done", badge: f.open ? `${f.open} to check` : "Reconciled",
      sections: [{ type: "queue", title: "Card payments to check", empty: "Every card payment is matched.", items: cashItems }] },
    { id: "vouchers", label: "Meal vouchers", text: v ? (v.scanned ? `${v.count} paper vouchers scanned for ${eur2(v.amount)}${v.unreadable ? `, ${v.unreadable} unreadable` : ""}.` : `Envelope of ${eur2(v.amount)} not scanned yet.`) : "No paper voucher today.", state: vDone ? "done" : "todo", badge: vDone ? (v ? "Sent to accounting" : "None") : v.scanned ? "Check the unreadable" : "Scan the envelope",
      sections: vDone ? [] : [{ type: "queue", title: "Vouchers", items: voucherItems([{ ...v, name: p.name }]) }] },
    { id: "mr", label: "Manager Report", text: "Sales by hour, targets, staff, hours and payments are filled in. Add your notes.", state: sent ? "done" : "ready", badge: sent ? `Sent ${sent.time}` : "Add notes and send",
      sections: [{ type: "form", pub: p.id, date, sent: sent ? { at: sent.time, notes: sent.notes } : null, fields: ["Individual feedback", "Incidents and equipment", "For head office"], export: `/api/export/mr.csv?pub=${p.id}&date=${date}` }] },
    { id: "hours", label: "Hours", text: `${mr.labour.worked} h worked for ${mr.labour.planned} h planned, already in Combo.`, state: "done", badge: "Synced", sections: [] },
    { id: "checklist", label: "Closing checklist", text: `${closingList.done} of ${closingList.total} items done · ${ck.totals.wasteLines} waste lines sent to Yokitup. Shown to head office with the MR, so it is not asked again.`, state: closingList.done === closingList.total ? "done" : "todo", badge: closingList.done === closingList.total ? "Done" : `${closingList.total - closingList.done} to tick`,
      sections: closingList.done === closingList.total ? [] : [{ type: "queue", title: "Closing checklist", items: closingList.items.filter((i) => !i.done).map((i) => ({ type: "check", id: `${p.id}|${date}|${i.id}`, title: i.label, meta: SIDE[i.side], actions: [{ label: "Done", status: "done", style: "primary", toast: `${i.label}: done` }], done: null })) }] },
  ];

  // --- this week (GM, Monday)
  const weekBadge = q.open + openOps(nextOps);
  const modeRows = bank.modes.filter((m) => m.hub || m.zelty).map((m) => [m.mode, eur2(m.hub), eur2(m.zelty), cell(eur2(m.gap), Math.abs(m.gap) > 50 ? "attention" : "")]);
  const cfm = cfWeek("manager"), cfs = cfWeek("staff");

  return {
    greeting: `${p.name} · GM ${p.gm}`,
    text: `${longDay(date)} is closed. Tonight is ${longDay(next)}.`,
    tabs: [
      { id: "tonight", label: "Tonight", badge: toValidate(day), sections: tonight },
      { id: "close", label: "Close of service", badge: steps.filter((s) => s.state !== "done").length, sections: [
        { type: "flow", title: `Close of service · ${longDay(date)}`, steps },
        { type: "kpis", items: [
          { label: "Revenue", value: eur(T.revenue), sub: `target ${eur(T.target)} · ${pctS(T.vsTargetPct)}`, tone: T.vsTargetPct >= 0 ? "good" : "" },
          { label: "vs last week", value: pctS(T.vsLastWeekPct), sub: eur(T.lastWeek) },
          { label: "Guests", value: String(T.covers), sub: `€${(T.revenue / (T.covers || 1)).toFixed(2)} per guest`, tab: "team" },
          { label: "Labour cost", value: pct(mr.labour.costPct), sub: `${eur(mr.labour.cost)} for the day`, tab: "team" },
          { label: "Club Frog", value: pct(T.clubFrogRatePct), sub: "of bills linked to a member" },
        ] },
        { type: "line", title: "Sales through the day", note: "Cumulative sales by hour, from the time of each item, against target and last week.", ask: `How did sales at ${p.name} build up hour by hour on ${date}?`, labels: mr.hours.map((x) => x.hour), series: [
          { name: "Today", style: "main", values: mr.hours.map((x) => x.cumulative) },
          { name: "Target", style: "target", values: mr.hours.map((x) => x.targetCumulative) },
          { name: "Last week", style: "dash", values: mr.hours.map((x) => x.lastWeekCumulative) },
        ] },
      ] },
      { id: "checklists", label: "Checklists", badge: ckOpen, sections: checklistSections(ck, list) },
      { id: "week", label: "This week", badge: weekBadge, sections: [
        { type: "queue", id: "approvals", title: "Next week: waiting for your OK", note: "Recommended rota and match-night slots, prepared from expected guests, matches picked in Fanzo and group bookings.", empty: "Nothing waiting: next week is already in Combo and Zenchef.", items: opItems(nextOps) },
        { type: "queue", id: "invoices", title: "Invoices to review", note: "Matching invoices were approved for you. Click one to see it line by line.", empty: "All your invoices are approved.", items: q.items },
        { type: "table", span: "half", title: `Tilrec · week ${weekLabel(w)}`, note: "Takings by payment mode from the terminals, vouchers and cash count, against what was clicked in Zelty.", cols: ["Mode", "Takings", "Clicked in Zelty", "Gap"], rows: modeRows },
        { type: "downloads", span: "half", title: "Files for the week", items: [
          { label: `Banking file · ${p.name}`, href: `/api/export/banking.csv?week=${w.start}&pub=${p.id}`, note: `Week ${weekLabel(w)}, same format in every pub` },
          { label: `Manager Report · ${shortDay(date)}`, href: `/api/export/mr.csv?pub=${p.id}&date=${date}`, note: "Figures of the last service" },
        ] },
        { type: "table", span: "half", title: `Club Frog by shift manager · ${weekLabel(w)}`, note: "Bills of the service each SM ran (Combo rota).", ask: `Which shift manager at ${p.name} had the best Club Frog rate last week, and why?`, ...clubFrogTable(cfm, "manager") },
        { type: "table", span: "half", title: `Club Frog by server · ${weekLabel(w)}`, ...clubFrogTable(cfs, "staff") },
        { type: "table", title: "Expected guests and hours · next 7 days", note: "What the recommended rota is based on.", ask: `Why does the hub recommend more hours at ${p.name} next week?`,
          cols: ["Day", "Expected guests", "Usual hours", "Recommended", "Why"],
          rows: auto.staffingForecast(p.id, date).map((x) => [shortDay(x.date), x.covers, `${x.usual} h`, cell(`${x.recommended} h`, x.delta >= 4 ? "attention" : ""), x.why]) },
      ] },
      { id: "phone", label: "Phone", sections: phoneSections(ph, p, pilot) },
      { id: "menu", label: "Beer menu", badge: mn.outOfSync, sections: [
        { type: "menu", title: `Beer list · ${p.name}`, note: "Change a price once here: it goes to the tills (Zelty) and to Frog Space. Lines that differ today were retyped by hand.", pub: p.id, lines: mn.lines },
      ] },
      { id: "team", label: "Team & guests", sections: [
        { type: "kpis", items: [
          { label: "Hours worked", value: `${mr.labour.worked} h`, sub: `${mr.labour.planned} h planned` },
          { label: "Staff cost", value: eur(mr.labour.cost), sub: pct(mr.labour.costPct) + " of revenue HT" },
          { label: "On shift", value: String(mr.staff.length), sub: hub.managersOnShift(p.id, date).map((s) => s.name).join(" and ") + " as SM" },
        ] },
        { type: "table", span: "half", title: "Takings by server", note: "Credited to whoever cashed the table · click a name for details.", cols: ["Server", "Card", "Cash", "Total"],
          rows: f.c.staff.filter((s) => s.hubByCasher + s.cash > 0).map((s) => ({ drawer: serverDrawer(p, g.byServer.find((x) => x.key === s.staff), cfByCode[s.staff], s), cells: [s.name, eur2(s.hubByCasher), eur2(s.cash), eur2(s.hubByCasher + s.cash)] })) },
        { type: "table", span: "half", title: "Rota of the day", cols: ["Staff", "Planned", "Worked", "Cost"], rows: mr.staff.map((s) => [s.name, `${s.planned} h`, `${s.worked} h`, eur(s.cost)]) },
        ...guestSections(g, `at ${p.name}`),
        { type: "table", title: "Your best regulars · 4 weeks", note: "Club Frog members, by spend over the last 4 weeks.", span: "half",
          cols: ["Member", "Visits", "Spend", "Last visit"], rows: g.regulars.top.map((m) => [`Member #${m.member.split("-M")[1]}`, m.visits, eur2(m.spend), shortDay(m.lastVisit)]) },
        { type: "table", title: "Who sells the most per guest", note: "Spend per guest by server · click a name for details.", span: "half", ask: `Which servers at ${p.name} have the highest spend per guest, and why?`,
          cols: ["Server", "Guests", "Spend / guest", "With food"],
          rows: g.byServer.slice(0, 10).map((s) => ({ drawer: serverDrawer(p, s, cfByCode[s.key], f.c.staff.find((x) => x.staff === s.key)), cells: [s.name, num(s.covers), cell(eur2(s.spendPerHead), s.spendPerHead >= g.spendPerHead * 1.04 ? "good" : ""), pct(s.foodAttachPct)] })) },
      ] },
      pointsTab("manager", "Open points for the pubs"),
    ],
  };
}
function serverDrawer(p, s, cfRow, takings) {
  if (!s) return null;
  return {
    title: s.name, subtitle: `${p.name} · last 4 weeks`,
    fields: [["Guests served", num(s.covers)], ["Spend per guest", eur2(s.spendPerHead)], ["Pints per guest", dec(s.pintsPerHead, 2)], ["Bills with food", pct(s.foodAttachPct)], ["Club Frog (7 days)", cfRow ? `${pct(cfRow.ratePct)} · ${cfRow.memberTickets} member visits` : "—"], ["Takings on the day", takings ? eur2(takings.hubByCasher + takings.cash) : "—"]],
    ask: `How is ${s.name} doing at ${p.name}: spend per guest, food and Club Frog?`,
  };
}

/* ---------- checklists: the Trail menu rebuilt in Frog Hub (P14, method b) ---------- */

const CHECK_MENU = [["opening", "Opening"], ["closing", "Closing"], ["weekly", "Weekly cleaning"], ["temps", "Temperatures"], ["trace", "Traceability"], ["waste", "Waste & breakage"]];
const SIDE = { bar: "Bar", kitchen: "Kitchen", both: "Bar and kitchen" };
const doneLabel = (d) => ({ label: d.name ? `Done by ${d.name} · ${d.time}` : `Done · ${d.time}` });
function checklistSections(c, list) {
  const T = c.totals;
  const tabBadge = { opening: c.lists[0].total - c.lists[0].done, closing: c.lists[1].total - c.lists[1].done, weekly: T.weeklyDue - T.weeklyDone, temps: T.tempsOut + T.tempsMissing, trace: T.traceAlerts, waste: 0 };
  const out = [
    pointNotice("P14", " This tab is method b, ready to test: everything Trail does, and the waste goes to Yokitup on its own."),
    { type: "hero", label: `Checklists · ${longDay(c.date)}`, counters: [
      { value: `${T.done} / ${T.total}`, label: "opening and closing items done", href: `#/ws/manager/${c.pub}?tab=checklists&list=opening` },
      { value: `${T.weeklyDone} / ${T.weeklyDue}`, label: "weekly cleanings done this week", href: `#/ws/manager/${c.pub}?tab=checklists&list=weekly` },
      { value: String(T.tempsOut), label: `temperatures out of range · ${T.tempsMissing} missing`, href: `#/ws/manager/${c.pub}?tab=checklists&list=temps` },
      { value: eur2(T.wasteCost), label: `waste at cost · ${T.wasteLines} lines sent to Yokitup`, href: `#/ws/manager/${c.pub}?tab=checklists&list=waste` },
    ] },
    { type: "filters", items: [{ param: "list", label: "Menu", value: list, options: CHECK_MENU.map(([k, l]) => [k, tabBadge[k] ? `${l} (${tabBadge[k]})` : l]) }] },
  ];
  if (list === "opening" || list === "closing") {
    const l = c.lists.find((x) => x.id === list);
    out.push({ type: "queue", title: `${l.label} checklist`, note: `${l.when} · ${l.owner}. Each item is signed by the person who ticks it.`, limit: 20, items: l.items.map((i) => ({
      type: "check", id: `${c.pub}|${c.date}|${i.id}`, title: i.label, meta: SIDE[i.side],
      actions: [{ label: "Done", status: "done", style: "primary", toast: `${i.label}: done` }], done: i.done ? doneLabel(i.done) : null,
    })), empty: "No item." });
  }
  if (list === "weekly") {
    out.push({ type: "queue", title: "Weekly cleaning", limit: 20, note: "One deep clean a day, the same day every week. A cleaning not ticked on its day stays here as missed.", items: c.weekly.filter((w) => !w.skip).map((w) => ({
      type: "check", id: `${c.pub}|${w.date}|weekly`, title: w.label, meta: `${longDay(w.date)} · ${SIDE[w.side]}`,
      status: w.done ? null : w.due ? chip(w.date === c.date ? "Today" : "Missed", w.date === c.date ? "info" : "attention") : chip("Coming", "muted"),
      actions: w.due && !w.done ? [{ label: "Done", status: "done", style: "primary", toast: `${w.label}: done` }] : [], done: w.done ? doneLabel(w.done) : null,
    })) });
  }
  if (list === "temps") {
    out.push({ type: "table", title: "Temperatures", note: "Two readings a day, at opening and at 16:00. Out of range is flagged to the SM at once. Delivery temperatures stay in Yokitup, so HACCP is kept once.", cols: ["Equipment", "Range", "Opening", "16:00", "Status"],
      rows: c.temps.map((e) => {
        const r = (i) => (e.readings[i] ? cell(`${e.readings[i].value} °C · ${e.readings[i].name}`, e.readings[i].ok ? "" : "attention") : cell("not recorded", "attention"));
        return [e.name, `${e.min} to ${e.max} °C`, r(0), r(1), e.outOfRange ? chip("Out of range", "bad") : e.missing ? chip("Reading missing", "attention") : chip("OK")];
      }) });
  }
  if (list === "trace") {
    out.push(c.trace.length
      ? { type: "table", title: "Traceability · opened products", note: "Every opened or prepared product with its label. Past its use-by date, it goes to waste.", cols: ["Product", "Opened", "Use by", "Labelled by", "Status"],
        rows: c.trace.map((t) => [t.product, shortDay(t.opened), shortDay(t.useBy), t.name, chip(t.state, t.state === "OK" ? "good" : t.state === "Use today" ? "attention" : "bad")]) }
      : { type: "notice", tone: "info", title: "No kitchen at this pub", text: "Traceability applies to the kitchen only." });
  }
  if (list === "waste") {
    out.push({ type: "wasteform", title: "Record waste or breakage", note: "Typed once here at the end of the shift. It leaves the Yokitup stock straight away, at cost price.", pub: c.pub, date: c.date, items: c.options.items, reasons: c.options.reasons });
    out.push({ type: "table", title: `Waste of ${longDay(c.date)}`, note: `${eur2(c.totals.wasteCost)} at cost.`, cols: ["Time", "Item", "Qty", "Reason", "By", "Cost", "Yokitup"],
      rows: c.waste.slice().sort((a, b) => b.time.localeCompare(a.time)).map((w) => [w.time, w.itemName, `${w.qty} ${w.unit}`, w.reason, w.name || "—", eur2(w.cost), chip("Stock updated")]) });
  }
  out.push({ type: "table", title: "Who ticks what · last 7 days", note: "Trail only gives a percentage per pub (Bercy). Here every tick, reading and waste line is signed.", cols: ["Person", "Role", "Checklist items", "Temperatures", "Waste lines"],
    rows: c.people.map((x) => [x.name, x.role, x.items, x.temps, x.waste]) });
  return out;
}

/* ---------- phone (pub and group) ---------- */

const callDrawer = (c) => ({ title: `${c.guest} · ${c.intent}`, subtitle: `${c.name} · ${shortDay(c.date)} ${c.time} · ${Math.floor(c.seconds / 60)} min ${c.seconds % 60} s`, fields: [["Outcome", c.outcome], ...(c.booking ? [["Booking", `${c.booking} for ${c.covers} on ${shortDay(c.bookedFor)}`]] : []), ["When", c.beforeOpening ? "Before opening" : "During opening hours"]], transcript: hub.transcript(c) });
function phoneSections(ph, p, pilot) {
  const r = p ? ph.rows[0] : ph.rows.reduce((a, x) => ({ calls: a.calls + x.calls, answeredByStaff: a.answeredByStaff + x.answeredByStaff, missedByStaff: a.missedByStaff + x.missedByStaff, aiAnswered: a.aiAnswered + x.aiAnswered, lost: a.lost + x.lost, beforeOpening: a.beforeOpening + x.beforeOpening }), { calls: 0, answeredByStaff: 0, missedByStaff: 0, aiAnswered: 0, lost: 0, beforeOpening: 0 });
  const C = ph.confirmations;
  const out = [
    { type: "hero", label: `Last 7 days · OVH${pilot ? ` and the AI receptionist (Retell AI pilot since ${+AI_PILOT.since.slice(8)} Sept)` : ""}`, counters: [
      { value: num(r.calls), label: "calls" }, { value: num(r.answeredByStaff), label: "answered by the team" },
      { value: num(r.aiAnswered), label: pilot ? "answered by the AI receptionist" : "answered by the AI (pilot pubs)" },
      { value: num(r.lost), label: "left without answer · SMS sent" },
    ] },
  ];
  if (p && !pilot) out.push(pointNotice("P01", ` ${p.name} has ${num(r.missedByStaff)} calls missed by the team over 7 days, ${num(r.beforeOpening)} of them before opening.`));
  if (!p) out.push({ type: "table", title: "By pub · 7 days", cols: ["Pub", "Calls", "Answered by the team", "Missed by the team", "Before opening", "Answered by the AI", "Left without answer"],
    rows: ph.rows.map((x) => ({ link: { ws: "manager", pub: x.pub, tab: "phone" }, cells: [x.name, num(x.calls), num(x.answeredByStaff), cell(num(x.missedByStaff), x.missedByStaff / (x.calls || 1) > 0.2 ? "attention" : ""), num(x.beforeOpening), x.pilot ? num(x.aiAnswered) : chip("Not live", "muted"), num(x.lost)] })) });
  if (ph.calls.length) {
    out.push({ type: "bars", span: "half", title: "What the AI receptionist did", items: Object.entries(ph.outcomes).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ label: k, value: n, text: String(n) })) });
    out.push({ type: "kpis", span: "half", items: [
      { label: "Confirmation calls", value: num(C.calls), sub: `${C.results.Confirmed || 0} confirmed · ${C.results.Cancelled || 0} tables released` },
      { label: "No-shows with a call", value: pct(C.noShowWithCall), sub: "tables of 4 or more", tone: "good" },
      { label: "No-shows without", value: pct(C.noShowWithout), sub: "pubs not in the pilot" },
    ] });
    out.push({ type: "table", title: "Calls taken by the AI receptionist", note: "Click a call for its summary and transcript.", cols: ["When", ...(p ? [] : ["Pub"]), "Guest", "Asked for", "Outcome"],
      rows: ph.calls.slice(0, 40).map((c) => ({ drawer: callDrawer(c), cells: [`${shortDay(c.date)} ${c.time}`, ...(p ? [] : [c.name]), c.guest, c.intent, cell(c.outcome, /validate|Tory|GM|Transferred/.test(c.outcome) ? "attention" : "")] })) });
  }
  return out;
}

/* ---------- Paul ---------- */

function ceo({ date = TODAY }) {
  const day = hub.kpis({ from: date, to: date });
  const month = hub.kpis({ from: DATES[0], to: date });
  const S = (a, k) => a.reduce((s, x) => s + x[k], 0);
  const rev = S(day, "revenue"), tgt = S(day, "target"), mRev = S(month, "revenue"), mTgt = S(month, "target");
  const matched = PUBS.reduce((s, p) => s + NEPTING.filter((n) => n.pub === p.id && n.date === date && n.ticket).length, 0);
  const cf = hub.clubFrog({ from: hub.addDays(date, -6), to: date }).total;
  const inv = hub.invoiceCheck({});
  const sent = PUBS.filter((p) => mrState(p.id, date)).length;
  const g = hub.guests({ to: date, from: hub.addDays(date, -27) });
  const tonight = hub.closures({ from: hub.addDays(date, 1), to: hub.addDays(date, 1) });

  const attention = [];
  for (const m of month) {
    if (m.vsTargetPct < -15) attention.push({ title: `${m.name} is ${pct(-m.vsTargetPct)} below its budget this month`, detail: `${eur(m.revenue)} for a budget of ${eur(m.target)}. Hourly sales are ready for the 2027 budget in November.`, ask: `Why is ${m.name} below budget this month, by day and by hour?` });
    if (m.labourCostPct > 38) attention.push({ title: `${m.name}: labour cost at ${pct(m.labourCostPct)} of revenue`, detail: "Hours worked against planned are available shift by shift.", ask: `Show labour cost at ${m.name} by day this month` });
  }
  if (tonight.length) attention.push({ title: `Online bookings closed tonight at ${tonight.map((c) => c.name).join(", ")}`, detail: tonight.map((c) => `${c.name} from ${c.from} (${c.by})`).join(" · ") + ". Ads keep running.", ask: "Which pubs closed online bookings this month, and how much ad spend went to a closed calendar?" });
  const events = hub.corporate({}).filter((e) => e.date > date && e.date <= hub.addDays(date, 7));
  if (events.length) attention.push({ title: `${events.length} group event${events.length > 1 ? "s" : ""} in the next 7 days`, detail: events.map((e) => `${e.name} ${shortDay(e.date)} · ${e.guests} guests`).join(" · "), ask: "List the group events of the next 7 days with their payment status" });
  const decide = proc.points({ role: "ceo" }).filter((p) => p.attention && /Paul/.test(p.decider || ""));

  const dailyLabels = DATES.filter((d) => d <= date);
  const perDay = dailyLabels.map((d) => hub.kpis({ from: d, to: d }));
  const ads = hub.adSpend({ to: date });
  const book = hub.bookings({ from: DATES[0], to: date });
  return {
    greeting: "Good morning, Paul",
    text: `${longDay(date)} is closed for the 8 pubs. Figures come from the tills, terminals and rotas.`,
    tabs: [
      { id: "today", label: "Today", sections: [
        { type: "kpis", items: [
          { label: "Group revenue", value: eur(rev), sub: `target ${eur(tgt)} · ${pctS(100 * (rev / tgt - 1))}`, tone: rev >= tgt ? "good" : "", tab: "pubs" },
          { label: "Month to date", value: eur(mRev), sub: `${pctS(100 * (mRev / mTgt - 1))} vs budget`, tab: "trends" },
          { label: "Spend per guest", value: eur2(g.spendPerHead), sub: "4 weeks", tab: "guests" },
          { label: "Labour cost (month)", value: pct(S(month, "labourCostPct") / month.length), sub: "average of the 8 pubs", tab: "costs" },
          { label: "Club Frog (7 days)", value: pct(cf.ratePct), sub: `${num(cf.memberTickets)} member visits · target 20 %`, tab: "guests" },
        ] },
        { type: "queue", title: "For your attention", neutral: "points", note: "Business points only: the data is already reconciled.", empty: "Nothing needs you today.", items: attention.slice(0, 5).map((a, i) => ({ type: "info", id: `ceo-${i}`, title: a.title, detail: a.detail, actions: [{ label: "Ask Copilot", copilot: a.ask }] })) },
        ...(decide.length ? [{ type: "queue", title: "Decisions waiting for you", neutral: "to decide", note: "Points from the process notes with no direct solution.", items: decide.map((p) => ({ type: "info", id: p.id, title: `${p.id} · ${p.title}`, detail: p.open, actions: [{ label: "See the methods", href: `#/ws/points?tab=all&focus=${p.id}` }] })) }] : []),
        { type: "hero", label: "Done by the hub overnight", counters: [{ value: `${sent} / 8`, label: sent ? "Manager Reports received" : "Manager Reports pre-filled, waiting for the SMs" }, { value: num(matched), label: "card payments reconciled" }, { value: num(sentToday(date)), label: "updates sent to the tools", href: "#/ws/agents?tab=activity" }, { value: num(inv.autoMatched), label: "invoices approved (month)" }] },
      ] },
      { id: "pubs", label: "Pubs", sections: [
        { type: "table", title: `The 8 pubs on ${longDay(date)}`, note: "Click a pub to open its view.", ask: "Compare the 8 pubs yesterday: revenue against target, labour and Club Frog",
          cols: ["Pub", "GM", "Revenue", "vs target", "Guests", "Avg bill", "Labour", "Club Frog", "Manager Report"],
          rows: day.map((k) => {
            const m = mrState(k.pub, date);
            return { link: { ws: "manager", pub: k.pub, tab: "close" }, cells: [k.name, PUB[k.pub].gm, eur(k.revenue), cell(pctS(k.vsTargetPct), k.vsTargetPct >= 0 ? "good" : k.vsTargetPct < -15 ? "attention" : ""), k.covers, eur2(k.avgTicket), pct(k.labourCostPct), pct(k.clubFrogRatePct), m ? chip(`Received ${m.time}`) : chip("Pre-filled", "muted")] };
          }) },
        heatmap(date),
        { type: "bars", title: "Month to date against budget", items: month.map((m) => ({ label: m.name, value: m.revenue, target: m.target, text: `${eur(m.revenue)} · ${pctS(m.vsTargetPct)}` })) },
      ] },
      { id: "trends", label: "Trends", sections: [
        { type: "line", title: "Group revenue by day", note: "Against the daily budget.", labels: dailyLabels.map((d) => d.slice(8)),
          series: [{ name: "Revenue", style: "main", values: perDay.map((k) => k.reduce((s, x) => s + x.revenue, 0)) }, { name: "Budget", style: "target", values: perDay.map((k) => k.reduce((s, x) => s + x.target, 0)) }] },
      ] },
      { id: "guests", label: "Guests", sections: [
        ...guestSections(g, "across the group"),
        { type: "table", title: "Guests by pub · 4 weeks", cols: ["Pub", "Guests", "Spend / guest", "Pints / guest", "With food", "Members", "Regular visit"],
          rows: g.byPub.map((r) => { const id = PUBS.find((p) => p.name === r.key).id; const gp = hub.guests({ pub: id, to: date, from: hub.addDays(date, -27) }); return { link: { ws: "manager", pub: id, tab: "team" }, cells: [r.key, num(r.covers), eur2(r.spendPerHead), dec(r.pintsPerHead, 2), pct(r.foodAttachPct), pct(r.memberPct), gp.regulars.daysBetweenVisits ? `every ${dec(gp.regulars.daysBetweenVisits)} days` : "—"] }; }) },
      ] },
      { id: "costs", label: "Costs", sections: [
        { type: "table", span: "half", title: "Staff cost · month to date", note: "Worked hours from Combo × loaded rate, against revenue HT.", cols: ["Pub", "Revenue", "Labour", "Revenue per hour"],
          rows: month.map((m) => { const s = SHIFTS.filter((x) => x.pub === m.pub && x.date <= date); const h = s.reduce((a, x) => a + x.worked, 0); return [m.name, eur(m.revenue), cell(pct(m.labourCostPct), m.labourCostPct > 35 ? "attention" : ""), eur(m.revenue / 1.2 / (h || 1))]; }) },
        { type: "table", span: "half", title: "Marketing · ad spend month to date", note: "Google Ads and Meta, against bookings from the website and Google.", cols: ["Pub", "Google", "Meta", "Total", "Per online booking"],
          rows: ads.map((a) => { const r = book.rows.find((x) => x.pub === a.pub); const online = r.byChannel.Website + r.byChannel["Reserve with Google"]; return [a.name, eur(a.google), eur(a.meta), eur(a.total), eur2(a.total / (online || 1))]; }) },
        pointNotice("P38"),
      ] },
      { id: "scorecard", label: "Scorecard", sections: [problemCards({ date })] },
      pointsTab("ceo", "Open points for head office"),
    ],
  };
}

/* ---------- Accounting ---------- */

function finance({ date = TODAY }) {
  const w = lastFullWeek(date);
  const b = hub.banking({ weekStart: w.start });
  const weekDates = DATES.filter((d) => d >= w.start && d <= w.end);
  let matched = 0, fixedModes = 0;
  for (const p of PUBS) for (const d of weekDates) { const f = cashFacts(p.id, d); matched += f.matched; fixedModes += f.fixed.mode + f.fixed.split; }
  const q = invoiceQueue();
  const duty = hub.beerDuty({});
  const events = hub.corporate({});
  const outstanding = events.filter((e) => !e.depositInBank || (e.date <= date && !e.finalPaid));
  const totalWeek = b.pubs.reduce((s, p) => s + p.total, 0);
  const modeTotal = (m) => b.pubs.reduce((s, p) => s + p.modes.find((x) => x.code === m).hub, 0);
  const cards = modeTotal("cb") + modeTotal("amex") + modeTotal("tr_card");
  const month = DATES.filter((d) => d <= date);
  const payroll = PUBS.map((p) => { const s = SHIFTS.filter((x) => x.pub === p.id && month.includes(x.date)); return { name: p.name, hours: s.reduce((a, x) => a + x.worked, 0), cost: s.reduce((a, x) => a + x.worked * x.rate, 0), staff: new Set(s.map((x) => x.staff)).size }; });
  const wk = weekLabel(w);
  const vo = hub.vouchers({ from: DATES[0], to: date });
  const vItems = voucherItems(vo.review);
  const vOpen = vItems.filter((i) => !i.done).length;
  // what each acquirer should pay into the bank for the week
  const SETTLE = [["cb", "CB · Market Pay", "D+1"], ["amex", "Amex", "D+3"], ["tr_card", "Meal cards · Conecs", "D+2"], ["tr_paper", "Paper vouchers · issuers", "on remittance"], ["cash", "Cash deposit", "at deposit"]];

  return {
    greeting: "Good morning, Jean-Bernard, Stella and Sahira",
    text: `Week ${wk} is reconciled for the 8 pubs. Files are ready to download.`,
    tabs: [
      { id: "todo", label: "To do", badge: q.open + vOpen, sections: [
        { type: "downloads", title: "Ready to download", items: [
          { label: `Sage entries · week ${wk}`, href: `/api/export/sage.csv?week=${w.start}`, note: "Takings by day, pub and payment mode" },
          { label: "Banking file · all pubs", href: `/api/export/banking.csv?week=${w.start}`, note: "Same format for the 8 pubs" },
          { label: "Payroll hours for P2M (Silae)", href: `/api/export/payroll.csv?to=${date}`, note: "Worked hours by staff, month to date" },
        ] },
        { type: "queue", id: "invoices", title: "Invoices to review", note: "Biggest amounts first. Click an invoice to see it line by line.", empty: "All invoices are approved.", limit: 5, items: q.items },
        { type: "queue", id: "vouchers", title: "Meal vouchers to check", note: "Unreadable vouchers and envelopes not scanned at cash-up. Everything else is read and posted.", empty: "Every voucher batch is read.", limit: 5, items: vItems },
        { type: "hero", label: `Done by the hub · week ${wk}`, counters: [{ value: num(matched), label: "card payments matched" }, { value: num(fixedModes), label: "payment modes set from terminal data" }, { value: num(q.inv.autoMatched), label: "invoices approved automatically" }, { value: String(q.blocked), label: "duplicate invoices blocked" }] },
      ] },
      { id: "takings", label: "Takings", sections: [
        { type: "kpis", items: [
          { label: "Takings last week", value: eur(totalWeek), sub: "8 pubs" },
          { label: "Cards and meal cards", value: eur(cards), sub: pct((100 * cards) / totalWeek) + " of takings" },
          { label: "Cash to bank", value: eur(modeTotal("cash")), sub: "counted at cash-up" },
          { label: "Paper vouchers", value: eur(modeTotal("tr_paper")), sub: "scanned at the pub" },
        ] },
        { type: "table", title: `Takings by payment mode · week ${wk}`, cols: ["Pub", ...Object.values(PAYMENT_MODES), "Total", "Status"],
          rows: b.pubs.map((p) => [p.name, ...Object.keys(PAYMENT_MODES).map((m) => eur(p.modes.find((x) => x.code === m).hub)), eur(p.total), chip("Reconciled")]) },
      ] },
      { id: "vouchers", label: "Meal vouchers", badge: vOpen, sections: [
        { type: "kpis", items: [
          { label: "Vouchers read", value: num(vo.count - vo.unreadable), sub: `of ${num(vo.count)} · month to date` },
          { label: "Amount", value: eur(vo.amount), sub: "paper meal vouchers" },
          { label: "Unreadable", value: num(vo.unreadable), sub: `${eur2(vo.unreadableAmount)} to type`, tone: vo.unreadable ? "attention" : "" },
          { label: "Envelopes not scanned", value: num(vo.notScanned), sub: "counted by hand", tone: vo.notScanned ? "attention" : "" },
        ] },
        { type: "table", span: "half", title: "By pub · month to date", cols: ["Pub", "Vouchers", "Amount", "Unreadable", "Not scanned"], rows: vo.byPub.map((r) => [r.name, num(r.count), eur(r.amount), r.unreadable, cell(r.notScanned, r.notScanned ? "attention" : "")]) },
        { type: "bars", span: "half", title: "By issuer", note: "For the remittance to each issuer.", items: vo.issuers.map((i) => ({ label: i.issuer, value: i.count, text: `${num(i.count)} vouchers` })) },
      ] },
      { id: "bank", label: "Bank reconciliation", sections: [
        pointNotice("P22"),
        { type: "table", title: `What should reach the bank · week ${wk}`, note: "From the hub's takings, by acquirer. This is the file Sage would match against the statement (method a).", cols: ["Pub", ...SETTLE.map((s) => `${s[1]} (${s[2]})`)],
          rows: b.pubs.map((p) => [p.name, ...SETTLE.map(([m]) => eur(p.modes.find((x) => x.code === m).hub))]) },
      ] },
      { id: "receivables", label: "Receivables & duty", sections: [
        { type: "table", title: "Group and corporate receivables", note: `${outstanding.length} events still to collect · reminders go out automatically.`,
          cols: ["Event", "Pub", "Date", "Amount", "Status"],
          rows: events.filter((e) => e.date >= hub.addDays(date, -20)).map((e) => ({ drawer: eventDrawer(e, date), cells: [e.client, e.name, shortDay(e.date), eur(e.amount), statusChip(e, date)] })) },
        { type: "table", title: "Beer duty ledger", note: "Filled from brew sheets; brewed against sold is an estimate until each Zelty product is mapped to its beer (P28).", cols: ["Pub", "Brews", "Brewed (hl)", "Sold (hl, estimate)", "Lines filled by the hub", "Status"],
          rows: duty.map((d) => [d.name, d.brews, d.brewedHl, d.soldHlEstimate, d.missingLines.length, chip("Ready to declare")]) },
        pointNotice("P18"),
      ] },
      { id: "payroll", label: "Payroll", sections: [
        pointNotice("P16"),
        { type: "table", title: "Payroll · month to date", note: "Validated hours from Combo, exported for P2M.", cols: ["Pub", "Staff", "Hours worked", "Staff cost", "Status"],
          rows: payroll.map((p) => [p.name, p.staff, num(p.hours), eur(p.cost), chip("Export ready")]) },
      ] },
      pointsTab("finance", "Open points for accounting"),
    ],
  };
}

/* ---------- Tory: operations, groups and bookings ---------- */

function ops({ date = TODAY }) {
  const ev = hub.corporate({});
  const upcoming = ev.filter((e) => e.date > date);
  const month = hub.bookings({ from: DATES[0], to: date });
  const next = nextService(date);
  const days = PUBS.map((p) => hub.bookingDay({ pub: p.id, date: next }));
  const pending = days.flatMap((d) => agendaItems({ ...d, items: d.items.filter((b) => b.needsValidation && b.confirm !== "Cancelled") }).map((i) => ({ ...i, meta: `${d.name} · ${i.time} · ${i.meta}` })));
  const ph = hub.phone({ from: hub.addDays(date, -6), to: date });
  return {
    greeting: "Good morning, Tory",
    text: "Tables, groups and darts of the 8 pubs in one place. Payment status comes from the bank; reminders go out on their own.",
    tabs: [
      { id: "bookings", label: "Bookings", badge: pending.filter((i) => !i.done).length, sections: [
        { type: "table", title: `The 8 pubs · ${longDay(next)}`, note: "Click a pub to open its booking list.", cols: ["Pub", "Bookings", "Guests", "Lunch", "Evening", "To validate", "Darts", "Groups", "Online"],
          rows: days.map((d) => ({ link: { ws: "manager", pub: d.pub, tab: "tonight" }, cells: [d.name, d.totals.bookings, d.totals.covers, d.totals.lunch, d.totals.evening, cell(toValidate(d), toValidate(d) ? "attention" : ""), d.totals.darts || "—", d.totals.groups || "—", d.closed.length ? chip(`Closed from ${d.closed[0].from}`, "attention") : chip("Open")] })) },
        { type: "agenda", title: "Bookings to validate in every pub", note: "Large tables and bookings taken by the AI receptionist. The GM usually decides; you can too.", groups: [{ label: longDay(next), items: pending }], empty: "Nothing to validate." },
        { type: "bars", span: "half", title: "Guests booked by pub · month to date", items: month.rows.map((r) => ({ label: r.name, value: r.covers, text: `${num(r.covers)} guests · ${r.bookings} bookings` })) },
        { type: "table", span: "half", title: "Bookings by channel · month to date", cols: ["Pub", ...used(month)], rows: month.rows.map((r) => [r.name, ...used(month).map((c) => r.byChannel[c] || "—")]) },
      ] },
      { id: "events", label: "Group events", sections: [
        { type: "queue", id: "events", neutral: "upcoming", title: "Upcoming group events", note: "Click an event for its details.", empty: "No group event ahead.",
          items: upcoming.map((e) => ({ type: "reminder", id: e.id, title: `${e.client} · ${e.name}`, meta: `${longDay(e.date)} · ${e.guests} guests · ${e.channel}`, amount: eur(e.amount), status: statusChip(e, date), drawer: eventDrawer(e, date),
            actions: e.depositInBank ? [] : [{ label: "Send reminder now", status: "sent", toast: `Reminder sent to ${e.client}` }], done: actions.done("reminder", e.id) ? { label: "Reminder sent" } : null })) },
        { type: "kpis", items: [
          { label: "Groups booked", value: eur(ev.reduce((s, e) => s + e.amount, 0)), sub: `${ev.length} events, Sept–Oct` },
          { label: "Deposits received", value: pct((100 * ev.filter((e) => e.depositInBank).length) / ev.length), sub: "read from the bank" },
          { label: "Reminders scheduled", value: String(ev.filter((e) => !e.depositInBank || (e.date <= date && !e.finalPaid)).length), sub: "sent on their own" },
        ] },
      ] },
      { id: "phone", label: "Phone", sections: phoneSections(ph, null, true) },
      { id: "checklists", label: "Checklists", sections: [
        { type: "table", title: "Checklists in the 8 pubs · last 7 days", note: "Opening and closing items done, weekly cleanings, temperatures out of range and waste sent to Yokitup. Click a pub to open its checklists.", cols: ["Pub", "Opening and closing", "Weekly cleaning", "Temperatures out of range", "Waste lines", "Waste at cost"],
          rows: hub.checklistsGroup({ date }).map((r) => ({ link: { ws: "manager", pub: r.pub, tab: "checklists" }, cells: [r.name, cell(pct(r.checklistPct), r.checklistPct < 80 ? "attention" : ""), cell(pct(r.weeklyPct), r.weeklyPct < 60 ? "attention" : ""), cell(r.tempsOut, r.tempsOut > 3 ? "attention" : ""), r.wasteLines, eur2(r.wasteCost)] })) },
        pointNotice("P14"),
      ] },
      pointsTab("ops", "Open points for operations"),
    ],
  };
}

/* ---------- Emma and Liz: Club Frog and marketing ---------- */

function marketing({ date = TODAY, period: per = "week", by = "pub" }) {
  const P = period(per, date);
  if (!["pub", "shift", "staff", "manager", "day"].includes(by)) by = "pub";
  const cf = hub.clubFrog({ from: P.from, to: P.to, by: "pub" });
  const cfBy = hub.clubFrog({ from: P.from, to: P.to, by });
  const T = cf.total;
  const ch = hub.bookings({ from: DATES[0], to: date });
  const g = hub.guests({ from: hub.addDays(date, -27), to: date });
  const approvals = auto.approvals({ date, owner: "marketing" });
  const vis = hub.visits({ to: date });
  const ms = hub.memberSpend({ to: date });
  const ct = hub.contacts();
  const cl = hub.closures({ from: DATES[0], to: hub.addDays(date, 1) });
  const ads = hub.adSpend({ to: date });
  const web = ch.rows.reduce((s, r) => s + r.websiteClicks, 0), webBook = ch.rows.reduce((s, r) => s + r.byChannel.Website, 0);
  // invitations sent before the visit to bookers who are not members
  const invited = BOOKINGS.filter((b) => b.date <= date && b.kind === "table" && !b.member && b.email);
  const invByPub = PUBS.map((p) => { const i = invited.filter((b) => b.pub === p.id); return { name: p.name, sent: i.length, joined: i.filter((b) => b.joined).length }; });
  const joined = invited.filter((b) => b.joined).length;
  const byLabel = { pub: "Pub", shift: "Moment", staff: "Server", manager: "Shift manager", day: "Day" };
  return {
    greeting: "Good morning, Emma and Liz",
    text: "Club Frog, guests and channels in one customer view, measured the same way in every pub.",
    tabs: [
      { id: "clubfrog", label: "Club Frog report", badge: openOps(approvals), sections: [
        { type: "filters", items: [
          { param: "period", label: "Period", value: per, options: [["day", "Day"], ["week", "7 days"], ["month", "Month"]] },
          { param: "by", label: "By", value: by, options: [["pub", "Pub"], ["day", "Day"], ["shift", "Moment"], ["staff", "Server"], ["manager", "Shift manager"]] },
        ] },
        { type: "hero", label: P.label, counters: [
          { value: pct(T.ratePct), label: "of bills linked to a member · target 20 %" }, { value: num(T.memberTickets), label: "member bills" },
          { value: num(T.manualDiscounts), label: "kept when a scan failed" }, { value: dec(T.membersPerBill, 2), label: "members per member bill" },
        ] },
        { type: "queue", id: "approvals", title: "Waiting for your OK", note: "Win-back offers to lapsed regulars and rewards earned on the 5th visit, ready for OBY Pay.", empty: "Nothing waiting.", items: opItems(approvals) },
        { type: "bars", title: `Participation by pub · ${P.label}`, note: "Target 20 %.", ask: "Which pubs are below 20 % Club Frog participation and at which moment of the day?", items: cf.rows.map((r) => ({ label: r.key, value: r.ratePct, target: 20, text: `${pct(r.ratePct)} · ${r.memberTickets} bills` })) },
        { type: "table", title: `By ${byLabel[by].toLowerCase()} · ${P.label}`, note: by === "manager" ? "Bills of the service each SM ran, from the Combo rota." : by === "staff" ? "Servers with at least 20 bills." : null, ...clubFrogTable(cfBy, by) },
      ] },
      { id: "members", label: "Members", sections: [
        { type: "hero", label: "Month to date", counters: [
          { value: num(vis.members), label: "members who came" }, { value: dec(vis.avgVisits, 2), label: "visits per member" },
          { value: num(vis.rewards), label: "5th-visit rewards earned" }, { value: num(vis.oneAway), label: "one visit away from a reward" },
        ] },
        pointNotice("P30"),
        { type: "bars", span: "half", title: "Members by number of visits", note: "A visit is a day with a bill linked to the member.", items: vis.distribution.map((d) => ({ label: `${d.visits} visit${d.visits === "1" ? "" : "s"}`, value: d.members, text: num(d.members) })) },
        { type: "table", span: "half", title: "Latest rewards earned", cols: ["Member", "Pub", "Day", "Visit"], rows: vis.rewardList.slice(0, 10).map((r) => [`Member #${r.member.split("-M")[1]}`, r.name, shortDay(r.date), r.visit]) },
        { type: "kpis", items: [
          { label: "Spent by members", value: eur(ms.memberRevenue), sub: `${pct(ms.sharePct)} of revenue` },
          { label: "Per member", value: eur2(ms.avgPerMember), sub: "month to date" },
          { label: "Members spend per guest", value: eur2(g.memberSpendPerHead), sub: `others ${eur2(g.otherSpendPerHead)}`, tone: "good" },
        ] },
        { type: "bars", span: "half", title: "What members spend through Club Frog", note: "Members by spend band, month to date.", items: ms.bands.map((b) => ({ label: b.label, value: b.members, text: `${num(b.members)} members · ${eur(b.spend)}` })) },
        { type: "notice", span: "half", tone: "attention", title: `P29 · ${num(ct.unlinked)} of ${num(ct.contacts)} contacts are not linked to a pub`, text: `Only ${pct(ct.linkedPct)} of Club Frog contacts have a pub. The hub can link every member who scanned to the pub of the last visit.`, link: { label: "See the methods", href: "#/ws/points?tab=all&focus=P29" } },
        ...guestSections(g, "across the group"),
      ] },
      { id: "acquisition", label: "Acquisition", sections: [
        { type: "hero", label: "Month to date", counters: [
          { value: num(invited.length), label: "bookers invited before their visit" }, { value: num(joined), label: "joined Club Frog" },
          { value: pct((100 * joined) / (invited.length || 1)), label: "take-up" }, { value: "2", label: "lead sources: Meta and Typeform" },
        ] },
        pointNotice("P10"),
        { type: "table", span: "half", title: "Invitations by pub", cols: ["Pub", "Invited", "Joined", "Take-up"], rows: invByPub.map((r) => [r.name, num(r.sent), num(r.joined), pct((100 * r.joined) / (r.sent || 1))]) },
        { type: "automations", span: "half", title: "What brings new members", items: auto.list({ date }).filter((a) => ["booking-invite", "lead-oby", "winback-oby", "visit-reward", "clubfrog-weekly"].includes(a.id)) },
        pointNotice("P04"),
      ] },
      { id: "channels", label: "Channels & attribution", badge: cl.filter((c) => c.date >= date).length, sections: [
        { type: "kpis", items: [
          { label: "Website clicks → bookings", value: pct((100 * webBook) / (web || 1)), sub: `${num(web)} booking clicks (estimate, P02)` },
          { label: "Reserve with Google", value: pct((100 * ch.rows.reduce((s, r) => s + r.byChannel["Reserve with Google"], 0)) / ch.rows.reduce((s, r) => s + r.bookings, 0)), sub: "share of bookings" },
          { label: "Evenings closed online", value: num(cl.filter((c) => c.date <= date).length), sub: `about ${eur(cl.filter((c) => c.date <= date).reduce((s, c) => s + c.adSpend, 0))} of ads to a closed calendar`, tone: "attention" },
          { label: "Ad spend", value: eur(ads.reduce((s, a) => s + a.total, 0)), sub: "Google Ads and Meta, month to date" },
        ] },
        { type: "table", title: "Online bookings closed in Zenchef", note: "Each closure is emailed to Liz, Paul and the GM when it happens.", cols: ["Day", "Pub", "Closed", "By", "Booking clicks", "Ad spend"],
          rows: cl.slice().reverse().slice(0, 20).map((c) => [shortDay(c.date), c.name, `${c.from}–${c.to}`, c.by, c.clicks ?? (c.date > date ? chip("Tonight", "attention") : "—"), eur2(c.adSpend)]) },
        { type: "table", title: "Bookings by channel · month to date", note: "Every booking source mapped to one channel list.", cols: ["Pub", ...used(ch), "Web clicks", "Click → booking"],
          rows: ch.rows.map((r) => [r.name, ...used(ch).map((c) => (c === "Reserve with Google" && !PUB[r.pub].rwg ? chip("0 % · to check", "attention") : r.byChannel[c] || "—")), num(r.websiteClicks), pct(r.clickToBookingPct)]) },
        pointNotice("P05"),
        pointNotice("P02"),
      ] },
      pointsTab("marketing", "Open points for Club Frog and marketing"),
    ],
  };
}

/* ---------- Sébastien: data and IT ---------- */

const CONNECTORS = [
  ["Till & payments", [["Zelty POS", "API · webhooks", "tickets"], ["Nepting · Market Pay", "API", "card payments"], ["Paper vouchers", "Photo + OCR", "vouchers"]]],
  ["Staff & performance", [["Combo", "API", "shifts"], ["Fanzo", "Daily file", "matches"], ["Budget", "Hub", "daily targets"]]],
  ["Loyalty & marketing", [["OBY Pay / Club Frog", "Daily file", "member visits"], ["Google Analytics 4", "API", "booking clicks"], ["Google Ads · Meta ads", "API", "ad accounts"], ["Typeform · Meta leads", "Webhooks", "leads"]]],
  ["Purchasing", [["Yokitup", "Daily file", "orders"], ["Yooz", "API", "invoices"], ["Trail", "Not connected", "checklists"]]],
  ["Finance", [["Bank", "Bank file", "statements"], ["Sage", "File drop", "entries"], ["Brew sheets (Frog Space)", "Daily file", "brews"]]],
  ["Bookings & phone", [["Zenchef ×8", "API", "bookings"], ["BookingShake", "Daily file", "events"], ["SimplyBook", "Daily file", "darts sessions"], ["OVH telephony", "API", "calls"], ["Retell AI (pilot)", "API · webhooks", "AI calls"]]],
  ["Menus", [["Frog Space beer list", "To define", "menu lines"]]],
];

function data({ date = TODAY }) {
  const k = hub.kpis({ from: date, to: date });
  let wrongCode = 0, split = 0, mode = 0;
  for (const p of PUBS) { const f = cashFacts(p.id, date); wrongCode += f.fixed.wrongCode; split += f.fixed.split; mode += f.fixed.mode; }
  const counts = {
    tickets: k.reduce((s, x) => s + x.tickets, 0), "card payments": NEPTING.filter((n) => n.date === date).length, shifts: SHIFTS.filter((s) => s.date === date).length,
    "member visits": hub.clubFrog({ from: date, to: date }).total.memberTickets, bookings: BOOKINGS.filter((b) => b.date === date).length,
    calls: hub.bookings({ from: date, to: date }).rows.reduce((s, r) => s + r.calls, 0), invoices: hub.invoiceCheck({}).invoices, events: hub.corporate({}).length,
    vouchers: VOUCHERS.filter((v) => v.date === date).reduce((s, v) => s + v.count, 0), "AI calls": hub.phone({ from: date, to: date }).calls.length,
    "menu lines": PUBS.reduce((s, p) => s + hub.menu({ pub: p.id }).lines.length, 0), "ad accounts": PUBS.length * 2,
  };
  const all = CONNECTORS.flatMap(([, items]) => items);
  const live = all.filter(([, m]) => !/Not connected|To define/.test(m)).length;
  const inv = hub.invoiceCheck({});
  const raw = hub.bookings({ from: date, to: date }).rawSources.reduce((s, r) => s + r.count, 0);
  return {
    greeting: "Good morning, Sébastien",
    text: "Connectors synced overnight. Data is cleaned and joined before anyone opens the app.",
    tabs: [
      { id: "connectors", label: "Connectors", sections: [
        { type: "hero", label: "Overnight sync · 05:58", counters: [{ value: `${live} / ${all.length}`, label: "sources synced" }, { value: num(Object.values(counts).reduce((s, x) => s + x, 0)), label: "records loaded" }, { value: num(wrongCode + split + mode), label: "till records set right automatically" }, { value: String(all.length - live), label: "sources still to connect" }] },
        { type: "connectors", title: "Connectors", groups: CONNECTORS.map(([gName, items]) => ({ group: gName, items: items.map(([name, method, unit]) => ({ name, method, sync: /Not connected|To define/.test(method) ? "—" : "05:58", records: counts[unit] != null ? `${num(counts[unit])} ${unit}` : unit, state: /Not connected|To define/.test(method) ? "off" : /file|OCR|drop/i.test(method) ? "file" : "live" })) })) },
      ] },
      { id: "quality", label: "Data quality", sections: [
        { type: "table", span: "half", title: `Automatic corrections · ${longDay(date)}`, cols: ["Correction", "Records"], rows: [
          ["Card payment credited to the server who cashed it", num(wrongCode)],
          ["Split card payments rebuilt from the terminal", num(split)],
          ["Payment mode taken from the terminal", num(mode)],
          ["Booking source mapped to its channel", num(raw)],
          ["Duplicate supplier invoices blocked (month)", num(inv.exceptions.filter((f) => f.issues.some((i) => i.kind === "Duplicate invoice")).length)],
        ] },
        { type: "tasks", span: "half", title: "Roll-out", items: [
          { title: "OBY Pay live API", detail: "Daily export runs in the meantime; needed for rewards and staff accounts (P30, P34).", owner: "Obypay account manager", state: "In progress" },
          { title: "Yokitup and BookingShake APIs", detail: "Daily exports run in the meantime.", owner: "Editors", state: "In progress" },
          { title: "Retell AI on a real OVH line", detail: "Forwarding after 4 rings at Hop House and Rosbif (P01).", owner: "Sébastien", state: "In progress" },
          { title: "Zelty product write and Frog Space import", detail: "So the beer menu changed in the hub reaches both (P09).", owner: "Sébastien", state: "Planned" },
          { title: "Reserve with Google at Bercy and Bordeaux", detail: "Check the Zenchef Partners tab first (P05).", owner: "Sébastien", state: "To verify" },
          { title: "Apitic history import", detail: "Adds last year's figures (N-1) to every report.", owner: "Zuri", state: "Planned" },
        ] },
      ] },
      { id: "outbound", label: "Outbound", sections: [{ type: "outbox", title: "Sent to the tools", note: "Everything the automations sent, grouped by destination, with the exact data.", items: auto.outbox({ date }) }] },
      pointsTab("data", "Open points with a technical part"),
    ],
  };
}

/* ---------- Open points (programme) ---------- */

function pointsWs({ status, focus }) {
  const st = status || (focus ? "all" : "attention");
  const all = proc.points({});
  const s = proc.summary();
  const decided = all.filter((p) => p.decision);
  const filtered = st === "all" ? all : st === "attention" ? all.filter((p) => p.attention) : all.filter((p) => p.status === st);
  return {
    greeting: "Open points",
    text: "Every pain point of the process notes, with what Frog Hub does about it. Where the notes give no direct solution, the point stays open until Frog chooses a method.",
    tabs: [
      { id: "all", label: "Process notes", badge: s.attention, sections: [
        { type: "hero", label: `${s.total} points from the process notes`, counters: [
          { value: String(s.solved), label: "in Frog Hub", href: "#/ws/points?tab=all&status=solved" }, { value: String(s.partial), label: "partly covered", href: "#/ws/points?tab=all&status=partial" },
          { value: String(s.pilot + s.decide + s.verify), label: "pilot, method to choose or to verify", href: "#/ws/points?tab=all&status=attention" }, { value: String(s.out), label: "outside the scope, Frog decides", href: "#/ws/points?tab=all&status=out" },
        ] },
        { type: "filters", items: [{ param: "status", label: "Show", value: st, options: [["attention", "To decide"], ["all", "All"], ["solved", "In Frog Hub"], ["partial", "Partly covered"], ["out", "Outside the scope"]] }] },
        { type: "points", grouped: true, items: filtered, empty: "No point with this status." },
      ] },
      { id: "decided", label: "Decisions", badge: null, sections: [
        decided.length
          ? { type: "table", title: "Methods chosen", note: "Recorded in Frog Hub; undo from the point itself.", cols: ["Point", "Method", "Decided by", "At"], rows: decided.map((p) => ({ link: { ws: "points", tab: "all" }, cells: [`${p.id} · ${p.title}`, p.decision.name, p.decider || "—", p.decision.time] })) }
          : { type: "notice", tone: "info", title: "No method chosen yet", text: "Open a point in Process notes and choose a method; it will be listed here." },
      ] },
    ],
  };
}

/* ---------- Agents & automations ---------- */

function agentsWs({ date = TODAY }) {
  const list = auto.list({ date });
  const ops = auto.approvals({ date });
  const out = auto.outbox({ date });
  const systems = [...new Set(out.map((o) => o.system))];
  const team = agentsMod.agents(date);
  return {
    greeting: "Agents and automations",
    text: "Seven agents, each with one job, working in the tools Frog already uses. They act on their own, or prepare and wait for an OK.",
    tabs: [
      { id: "team", label: "Agents", sections: [
        { type: "hero", label: "At work for Frog", counters: [{ value: String(team.filter((a) => a.status === "live").length), label: `agents live · ${team.filter((a) => a.status === "pilot").length} in pilot` }, { value: num(out.length), label: "updates sent to the tools today" }, { value: `${num(team.reduce((a, x) => a + x.hours, 0))} h`, label: "given back to the teams this month", href: "#/ws/delivery" }, { value: String(openOps(ops)), label: "waiting for an OK", href: "#/ws/agents?tab=waiting" }] },
        { type: "agents", title: "The team", items: team },
      ] },
      { id: "all", label: "All automations", sections: [
        { type: "automations", title: "Every automation", note: `Sorted by the tool they feed (${systems.length} tools reached today). Preview shows exactly what is sent; Run now sends it again.`, items: [...list].sort((a, b) => a.system.localeCompare(b.system)) },
      ] },
      { id: "waiting", label: "Waiting for OK", badge: openOps(ops), sections: [
        { type: "queue", id: "approvals", title: "Ready to send", note: "Each item is prepared and checked by the hub; it leaves only once someone approves it.", empty: "Nothing waiting.", limit: 8, items: opItems(ops) },
      ] },
      { id: "activity", label: "Activity", sections: [{ type: "activity", title: `What ran on ${longDay(date)}`, items: auto.activity({ date }) }] },
      { id: "outbox", label: "Sent to the tools", sections: [{ type: "outbox", title: "Outbox", note: "Every message sent, by destination, with the exact data.", items: out }] },
      { id: "create", label: "New automation", sections: [{ type: "builder", title: "Create an automation", note: "When something happens in a pub, do something. It runs every morning on the day's figures.", builder: auto.BUILDER, pubs: PUBS.map((p) => [p.id, p.name]) }] },
    ],
  };
}

/* ---------- one agent ---------- */

function agentWs({ date = TODAY, agent: id = "close" }) {
  const a = agentsMod.agent(id, date);
  const ids = a.autos.map((x) => x.id);
  const ops = auto.approvals({ date }).filter((o) => ids.includes(o.automation));
  const where = { manager: "Pub team", finance: "Accounting", ops: "Tory", marketing: "Emma & Liz" }[a.workspace];
  return {
    greeting: a.name,
    text: a.mission,
    tabs: [
      { id: "today", label: "Today", badge: openOps(ops), sections: [
        { type: "hero", label: `${a.status === "live" ? "Live" : "Pilot"} since ${a.since} · works for ${a.for}`, counters: [
          { value: a.today.actions == null ? "—" : num(a.today.actions), label: a.today.label },
          { value: `${num(a.hours)} h`, label: "given back this month", href: `#/ws/agent/${a.id}?tab=impact` },
          { value: a.euros ? eur(a.euros) : "—", label: "protected or recovered this month" },
          { value: String(openOps(ops)), label: "waiting for an OK" },
        ] },
        ...(a.pilot ? [{ type: "kpis", items: [{ label: "Autonomy", value: a.autonomy, sub: a.pilot }] }] : []),
        ...(ids.length ? [{ type: "queue", id: "approvals", title: "Waiting for an OK", note: where ? `Also shown in the ${where} workspace.` : null, empty: "Nothing waiting: the agent did everything it could on its own.", items: opItems(ops) }] : []),
        ...(ids.length ? [{ type: "activity", title: "What it did", items: auto.activity({ date }).filter((l) => ids.includes(l.automation)) }] : []),
      ] },
      { id: "skills", label: "Skills", sections: [{ type: "skills", title: "What this agent can do", note: `Autonomy: ${a.autonomy}. Connected to ${a.tools.join(", ")}.`, items: a.skills }] },
      { id: "impact", label: "Impact", sections: [
        { type: "kpis", items: [
          { label: "Hours given back", value: `${num(a.hours)} h`, sub: "this month", tone: "good" },
          { label: "€ protected or recovered", value: a.euros ? eur(a.euros) : "—", sub: "this month" },
          { label: "Status", value: a.status === "live" ? "Live" : "Pilot", sub: `since ${a.since}` },
        ] },
        { type: "table", title: "How the impact is counted", note: "Units from the audit when it gives a figure; estimates are marked and will be confirmed with the teams.", cols: ["What the agent did", "Count", "Hours", "€", "Source", "Basis"],
          rows: a.items.map((i) => [i.label, i.count != null ? num(i.count) : "—", i.hours != null ? `${num(i.hours)} h` : "—", i.euros != null ? eur(i.euros) : "—", chip(i.source, i.source === "Audit" || i.source === "Hub data" ? "good" : "attention"), i.basis]) },
      ] },
    ],
  };
}

/* ---------- delivery dashboard ---------- */

function delivery({ date = TODAY }) {
  const team = agentsMod.agents(date);
  const hours = team.reduce((a, x) => a + x.hours, 0), euros = team.reduce((a, x) => a + x.euros, 0);
  const P = agentsMod.pulse();
  const avg = (k) => P.roles.reduce((a, r) => a + r[k] * r.n, 0) / P.answers;
  const fte = hours / 151.67; // monthly hours of a full-time job in France
  return {
    greeting: "Delivery · month 1",
    text: "September 2026: what the agents delivered, the time and money they gave back, what the teams think, and what comes next.",
    tabs: [
      { id: "month", label: "Month 1", sections: [
        { type: "hero", label: "Delivered in September", counters: [
          { value: `${team.filter((a) => a.status === "live").length} + ${team.filter((a) => a.status === "pilot").length}`, label: "agents live + in pilot" },
          { value: `${num(hours)} h`, label: `given back to the teams (≈ ${fte.toFixed(1)} full-time jobs)` },
          { value: eur(euros), label: "protected or recovered" },
          { value: `${avg("time").toFixed(1)} / 5`, label: "\"the hub saves me time\" (team pulse)", href: "#/ws/delivery?tab=pulse" },
        ] },
        { type: "bars", span: "half", title: "Hours given back by team", items: agentsMod.byRole(team).map((r) => ({ label: r.role, value: r.hours, text: `${num(r.hours)} h` })) },
        { type: "table", span: "half", title: "By agent", note: "Click an agent for the detail of its count.", cols: ["Agent", "Status", "Hours", "€"],
          rows: team.map((a) => ({ link: { ws: "agent", param: a.id, tab: "impact" }, cells: [a.name, chip(a.status === "live" ? "Live" : "Pilot", a.status === "live" ? "good" : "info"), `${num(a.hours)} h`, a.euros ? eur(a.euros) : "—"] })) },
      ] },
      { id: "roadmap", label: "Roadmap", sections: [
        { type: "roadmap", span: "half", title: "Delivery plan", items: agentsMod.ROADMAP },
        { type: "backlog", span: "half", title: "Next agents, ranked by impact", note: "Committed items first, then by score = (hours a month + € a month ÷ 50) ÷ effort. Proposed from the audit; Frog decides the order.", items: agentsMod.BACKLOG },
      ] },
      { id: "pulse", label: "Team pulse", sections: [
        { type: "pulse", title: "What the teams say", note: `${P.answers} short check-ins this month (demo answers until the teams use the app).`, ...P },
      ] },
      { id: "method", label: "How we count", sections: [
        { type: "table", title: "Units used to count impact", note: "Each unit comes from the audit when it gives a figure. Estimates are marked and will be checked with the teams in month 2.",
          cols: ["Unit", "Value", "Source", "Basis"], rows: Object.values(agentsMod.UNITS).map((u) => [u.unit, String(u.value), chip(u.source, u.source === "Audit" ? "good" : "attention"), u.basis]) },
      ] },
    ],
  };
}

/* ---------- scorecard: Frog's problems measured ---------- */

const HEAT_KPIS = ["revVsTarget", "spendGuest", "modeError", "cardMatch", "participation", "scanFail", "labourPct", "revPerHour", "missedCalls", "rwgShare"];
function problemCards({ date, pub, only }) {
  const sc = kpisMod.scorecard({ date, pub }).filter((p) => !only || only.includes(p.id));
  return {
    type: "problems", items: sc.map((p) => ({
      id: p.id, n: p.n, name: p.name, owner: p.owner, pain: p.pain, status: p.status, insights: p.insights,
      agents: p.agents.map((a) => agentsMod.AGENTS.find((x) => x.id === a)).filter(Boolean).map((a) => ({ id: a.id, name: a.name, icon: a.icon })),
      kpis: p.kpis.map((k) => ({ id: k.id, name: k.name, unit: k.unit, value: k.value, target: k.target, better: k.better, status: k.status, series: k.series, baseline: k.baseline, window: k.window, def: k.def, source: k.source, note: k.note,
        byPub: pub ? null : kpisMod.byPub(kpisMod.kpi(k.id), date).map((r) => ({ name: r.name, value: r.value, status: r.status })) })),
    })),
  };
}
function heatmap(date) {
  const ks = HEAT_KPIS.map((id) => kpisMod.kpi(id));
  return { type: "heatmap", title: "The 8 pubs on the key KPIs", note: "Last 7 days. Colour shows the gap to target; click a pub to open its view.",
    cols: ks.map((k) => ({ name: k.name, unit: k.unit, target: k.target })),
    rows: PUBS.map((p) => ({ pub: p.id, name: p.name, gm: p.gm, cells: ks.map((k) => { const e = kpisMod.evaluate(k, { pub: p.id, date }); return { value: e.value, status: e.status }; }) })),
    group: ks.map((k) => kpisMod.evaluate(k, { date }).value) };
}

function scorecardWs({ date = TODAY }) {
  const sc = kpisMod.scorecard({ date });
  const all = sc.flatMap((p) => p.kpis);
  const on = all.filter((k) => k.status === "good").length;
  return {
    greeting: "Frog scorecard",
    text: "The problems found in the audit, each measured by KPIs computed from the hub every night: where Frog stands, where it hurts, and which agent acts on it.",
    tabs: [
      { id: "overview", label: "Scorecard", sections: [
        { type: "hero", label: `Last 7 days to ${longDay(date)}`, counters: [
          { value: `${on}/${all.length}`, label: "KPIs on target" },
          { value: String(sc.filter((p) => p.status === "bad").length), label: "problems still off target" },
          { value: `${kpisMod.evaluate(kpisMod.kpi("participation"), { date }).value} %`, label: "Club Frog participation (target 20 %)" },
          { value: `${kpisMod.evaluate(kpisMod.kpi("labourPct"), { date }).value} %`, label: "labour cost (target 30 %)" },
        ] },
        problemCards({ date }),
      ] },
      { id: "pubs", label: "By pub", sections: [heatmap(date)] },
      { id: "map", label: "System map", sections: [{ type: "systemmap", title: "Frog's information system, remapped", note: "From the tools Frog uses, to the data the hub joins, to the agents that act, to the problems they answer. Hover any element to follow its path.", map: kpisMod.SYSTEM_MAP, problems: kpisMod.PROBLEMS.map((p) => [p.id, `${p.n} ${p.name}`, p.agents]) }] },
      { id: "dictionary", label: "KPI dictionary", sections: [{ type: "table", title: "Definitions", note: "One definition per KPI, used everywhere in Frog Hub and by the Copilot.", cols: ["KPI", "Problem", "Definition", "Target", "Source"],
        rows: kpisMod.KPIS.map((k) => [k.name, kpisMod.PROBLEMS.find((p) => p.id === k.problem).name, k.def, k.target == null ? "Trend" : `${k.better === "up" ? "≥" : "≤"} ${k.target}${k.unit === "%" ? " %" : ` ${k.unit}`}`, k.source]) }] },
    ],
  };
}

const BUILD = { ceo, finance, manager, ops, marketing, data, points: pointsWs, agents: agentsWs, agent: agentWs, delivery, scorecard: scorecardWs };
export function workspace(id, q) {
  if (!BUILD[id]) throw new Error(`Unknown workspace "${id}"`);
  if (q.date) hub.checkDate(q.date);
  return { id, ...WORKSPACES.find((w) => w.id === id), date: q.date || TODAY, ...BUILD[id](q), nav: { points: proc.summary().attention } };
}

/* ---------- exports ---------- */

export function bankingCsv({ week, pub }) {
  const w = hub.weeks().find((x) => x.start === week) || lastFullWeek(TODAY);
  const b = hub.banking({ weekStart: w.start, pub: pub || undefined });
  const lines = [["week_start", "pub", ...Object.values(PAYMENT_MODES), "total"]];
  for (const p of b.pubs) lines.push([w.start, p.name, ...Object.keys(PAYMENT_MODES).map((m) => p.modes.find((x) => x.code === m).hub.toFixed(2)), p.total.toFixed(2)]);
  return lines.map((l) => l.join(";")).join("\n");
}
export function payrollCsv({ to = TODAY }) {
  const lines = [["pub", "staff_code", "name", "hours_worked", "hourly_rate", "cost"]];
  for (const p of PUBS) {
    const per = {};
    for (const s of SHIFTS.filter((x) => x.pub === p.id && x.date <= to)) { per[s.staff] ||= { h: 0, rate: s.rate }; per[s.staff].h += s.worked; }
    for (const [code, v] of Object.entries(per)) lines.push([p.name, code, staffName(p.id, code), v.h, v.rate, (v.h * v.rate).toFixed(2)]);
  }
  return lines.map((l) => l.join(";")).join("\n");
}
