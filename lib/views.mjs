// Screen descriptions for the app. Each module turns hub results into a generic
// view (tiles, tables, charts, alerts) that public/app.js renders.

import * as hub from "./hub.mjs";
import { PUB, PUBS, TODAY } from "./data.mjs";

const eur = (x) => (x == null ? "—" : `€${Math.round(x).toLocaleString("en-GB")}`);
const eur2 = (x) => `€${(Math.abs(x) < 0.005 ? 0 : +x).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pctS = (x) => (x == null ? "—" : `${x > 0 ? "+" : ""}${x.toLocaleString("en-GB", { maximumFractionDigits: 1 })} %`);
const cell = (v, tone) => ({ v, tone });
const toneGap = (x, warn = -5, crit = -15) => (x <= crit ? "crit" : x <= warn ? "warn" : "ok");

export const MODULES = [
  { id: "today", label: "Today", controls: ["date"] },
  { id: "mr", label: "Manager Report", controls: ["pub", "date"] },
  { id: "cashup", label: "Cash-up", controls: ["pub", "date"] },
  { id: "banking", label: "Banking & payment modes", controls: ["pubAll", "week"] },
  { id: "clubfrog", label: "Club Frog", controls: ["pubAll", "by"] },
  { id: "invoices", label: "Invoices", controls: ["pubAll"] },
  { id: "duty", label: "Comptabilité matière", controls: [] },
  { id: "bookings", label: "Bookings & channels", controls: ["pubAll"] },
  { id: "corporate", label: "Corporate payments", controls: ["pubAll"] },
];

const FRICTION = {
  today: { text: "Paul: “lack of communication: currently only through the MR”. Figures sit in a dozen tools and reach head office by email, WhatsApp or not at all.", source: "Paul audit · Communication tab of the process map" },
  mr: { text: "Every figure of the MR is typed by hand, with the X printed every hour: 30–45 min at Princess, 1h–1h30 at 2 am in Toulouse. Zelty counts a sale at table closing, so hourly milestones are wrong.", source: "ClubFrog - Zuri: Reporting interne · ruptures n°3" },
  cashup: { text: "Zelty and Nepting are not connected. Each cash-up takes 5–12 min per staff (10 a night at XVI); finding one gap takes at least 20 min at Hop House. Takings are credited to whoever opened the table.", source: "ClubFrog - Zuri: rupture n°4 · Terminaux CB" },
  banking: { text: "Zelty does not split payment modes: accounting checks CB, Amex, Sodexo, Bimpli and Ticket Restaurant portals by hand. Every pub has a different tilrec, Rosbif has none.", source: "ClubFrog - Zuri: rupture n°1 · Rapprochement de caisse" },
  clubfrog: { text: "The 20 % KPI is computed by hand with Emma's ChatGPT prompt: 1h–1h30 per session at Rosbif, and figures that disagree (Bercy: 3,303 vs 3,200).", source: "ClubFrog - Zuri: rupture n°2 · Club Frog / OBY Pay" },
  invoices: { text: "Invoices are validated twice, in Yooz and in Yokitup (Bercy: 545 pending), with no price check: fries billed 40 % too high for 6 months in Toulouse, France Boissons bottles billed double.", source: "ClubFrog - Zuri: rupture n°5 · Yooz" },
  duty: { text: "The customs beer ledger is sometimes not updated. A missing line costs €1,500 at a customs control: the most direct financial risk found in the audit.", source: "ClubFrog - Zuri: Déclaratif réglementaire" },
  bookings: { text: "8 Zenchef accounts with no group view and a source field typed differently in each pub. GA4 clicks never joined to bookings; Reserve with Google probably off at Bercy and Bordeaux; missed calls never measured.", source: "Process map: Marketing & booking attribution · Reservations" },
  corporate: { text: "Tory has to chase accounting to know whether a corporate client has paid; the shared payment Excel is rarely updated.", source: "ClubFrog - Zuri: Suivi des paiements corporate" },
};

export function meta() {
  return { ...hub.listPubs(), weeks: hub.weeks(), modules: MODULES, definitions: hub.DEFINITIONS };
}

export function view(id, q) {
  const fn = BUILD[id];
  if (!fn) throw new Error(`Unknown module ${id}`);
  const v = fn(q);
  return { id, ...MODULES.find((m) => m.id === id), friction: FRICTION[id], ...v };
}

const BUILD = {
  today({ date = TODAY }) {
    const k = hub.kpis({ from: date, to: date });
    const month = hub.kpis({});
    const al = hub.alerts({ date });
    return {
      title: `Group view · ${date}`,
      kpis: [
        { label: "Group revenue (day)", value: eur(k.reduce((s, x) => s + x.revenue, 0)), sub: `target ${eur(k.reduce((s, x) => s + x.target, 0))}` },
        { label: "Revenue month to date", value: eur(month.reduce((s, x) => s + x.revenue, 0)), sub: `${pctS(100 * (month.reduce((s, x) => s + x.revenue, 0) / month.reduce((s, x) => s + x.target, 0) - 1))} vs budget` },
        { label: "Critical alerts", value: String(al.filter((a) => a.level === 2).length), tone: "crit" },
        { label: "Alerts to check", value: String(al.filter((a) => a.level === 1).length), tone: "warn" },
      ],
      blocks: [
        { type: "alerts", title: "What needs attention", items: al },
        {
          type: "table", title: "Pubs on the day", note: "One definition per figure for the 8 pubs (see Definitions).",
          cols: ["Pub", "GM", "Revenue", "Target", "vs target", "Tickets", "Avg ticket", "Club Frog", "Labour cost"],
          rows: k.map((x) => [x.name, PUB[x.pub].gm, eur(x.revenue), eur(x.target), cell(pctS(x.vsTargetPct), toneGap(x.vsTargetPct)), x.tickets, eur2(x.avgTicket), cell(`${x.clubFrogRatePct} %`, x.clubFrogRatePct < 10 ? "warn" : "ok"), cell(`${x.labourCostPct} %`, x.labourCostPct > 35 ? "crit" : x.labourCostPct > 30 ? "warn" : "ok")]),
        },
      ],
    };
  },

  mr({ pub = "princess", date = TODAY }) {
    const r = hub.managerReport({ pub, date });
    const T = r.totals;
    return {
      title: `${r.name} · ${r.weekday} ${r.date}${r.matchNight ? " · match night" : ""}`,
      kpis: [
        { label: "Revenue", value: eur(T.revenue), sub: `target ${eur(T.target)}`, tone: toneGap(T.vsTargetPct) },
        { label: "vs target", value: pctS(T.vsTargetPct), tone: toneGap(T.vsTargetPct) },
        { label: "vs last week (S-1)", value: pctS(T.vsLastWeekPct), sub: eur(T.lastWeek) },
        { label: "N-1", value: "—", sub: "Apitic history to import" },
        { label: "Beer / wet / food", value: `${Math.round((100 * T.beer) / T.revenue)} / ${Math.round((100 * T.wet) / T.revenue)} / ${Math.round((100 * T.food) / T.revenue)} %` },
        { label: "Labour cost", value: `${r.labour.costPct} %`, sub: `${r.labour.worked} h worked / ${r.labour.planned} h planned`, tone: r.labour.costPct > 35 ? "crit" : r.labour.costPct > 30 ? "warn" : "ok" },
        { label: "Club Frog", value: `${T.clubFrogRatePct} %`, sub: "target 20 %", tone: T.clubFrogRatePct < 10 ? "warn" : "ok" },
        { label: "Missed calls", value: r.calls ? String(r.calls.missed) : "—", sub: r.calls ? `${r.calls.missedBeforeOpening} before opening` : "" },
      ],
      blocks: [
        {
          type: "chart", title: "Cumulative revenue by hour", note: "Hub = sales by item time. Zelty = sales counted at table closing (today's milestones). Target follows last week's hourly shape.",
          labels: r.hours.map((h) => h.hour),
          series: [
            { name: "Hub (item time)", values: r.hours.map((h) => h.cumulative), style: "main" },
            { name: "Zelty (at closing)", values: r.hours.map((h) => h.zeltyCumulative), style: "muted" },
            { name: "Target", values: r.hours.map((h) => h.targetCumulative), style: "target" },
            { name: "Last week", values: r.hours.map((h) => h.lastWeekCumulative), style: "dash" },
          ],
        },
        {
          type: "table", title: "Hourly milestones", note: "Pre-filled from Zelty item times. Hours with no sales are hidden.",
          cols: ["Hour", "Beer", "Wet", "Food", "Total", "Cumulative", "Target cum.", "Zelty cum. (today)"],
          rows: r.hours.filter((h) => h.total > 0).map((h) => [h.hour, eur(h.beer), eur(h.wet), eur(h.food), eur(h.total), eur(h.cumulative), cell(eur(h.targetCumulative), h.cumulative < h.targetCumulative * 0.9 ? "warn" : ""), cell(eur(h.zeltyCumulative), "muted")]),
        },
        { type: "table", title: "Staff and hours (Combo)", cols: ["Staff", "Code", "Planned", "Worked", "Cost"], rows: r.staff.map((s) => [s.name, s.staff, `${s.planned} h`, cell(`${s.worked} h`, s.worked > s.planned + 1 ? "warn" : ""), eur(s.cost)]) },
        { type: "table", title: "Payments", cols: ["Mode", "Amount"], rows: Object.entries(r.payments).map(([k, v]) => [k, eur2(v)]) },
        { type: "form", title: "Left to the SM", note: "The only part still written by hand.", fields: ["Individual feedback (SMART)", "Incidents and equipment", "Comments for head office"] },
      ],
      actions: [{ label: "Export MR (CSV)", href: `/api/export/mr.csv?pub=${pub}&date=${date}` }],
    };
  },

  cashup({ pub = "xvi", date = TODAY }) {
    const c = hub.cashup({ pub, date });
    return {
      title: `${c.name} · ${date}`,
      kpis: [
        { label: "Card takings (terminals)", value: eur2(c.totals.terminal) },
        { label: "Zelty card (as clicked)", value: eur2(c.totals.zeltyCard), sub: `gap ${eur2(c.totals.zeltyCard - c.totals.terminal)}`, tone: Math.abs(c.totals.zeltyCard - c.totals.terminal) > 50 ? "warn" : "ok" },
        { label: "Lines to check", value: String(c.exceptions.length), tone: c.exceptions.length > 6 ? "warn" : "ok" },
        { label: "Manual check avoided", value: `${c.manualTimeMin.low}–${c.manualTimeMin.high} min`, sub: c.manualTimeMin.basis },
      ],
      blocks: [
        { type: "table", title: "Lines to check", note: "Only the payments that do not match. Everything else is reconciled.", cols: ["Issue", "Staff", "Time", "Amount", "Detail"], rows: c.exceptions.map((e) => [cell(e.kind, /Wrong|no Zelty/.test(e.kind) ? "crit" : "warn"), e.staff, e.time, eur2(e.amount), e.detail]) },
        {
          type: "table", title: "Card takings per staff", note: "The hub column credits the staff who cashed. Zelty credits whoever opened the table; Nepting uses the code typed on the terminal.",
          cols: ["Staff", "Code", "Hub (cashed)", "Zelty (opened table)", "Nepting (typed code)", "Cash", "Lines"],
          rows: c.staff.map((s) => [s.name, s.staff, eur2(s.hubByCasher), cell(eur2(s.zeltyByOpener), "muted"), cell(eur2(s.neptingByTypedCode), "muted"), eur2(s.cash), cell(String(s.issues), s.issues ? "warn" : "ok")]),
        },
      ],
    };
  },

  banking({ pub, week }) {
    const b = hub.banking({ pub: pub || undefined, weekStart: week });
    return {
      title: `Week ${b.week.start} → ${b.week.end}`,
      kpis: [
        { label: "Takings", value: eur(b.pubs.reduce((s, p) => s + p.total, 0)) },
        { label: "Mis-recorded in Zelty", value: eur(b.pubs.reduce((s, p) => s + p.absGap, 0)), sub: "amount in the wrong payment mode", tone: "warn" },
        { label: "Pubs", value: String(b.pubs.length), sub: "same format for all" },
      ],
      blocks: b.pubs.map((p) => ({
        type: "table", title: `${p.name} · ${eur(p.total)}`, cols: ["Payment mode", "Real (terminals, OCR, cash)", "Clicked in Zelty", "Gap"],
        rows: p.modes.filter((m) => m.hub || m.zelty).map((m) => [m.mode, eur2(m.hub), cell(eur2(m.zelty), "muted"), cell(eur2(m.gap), Math.abs(m.gap) > 100 ? "warn" : "")]),
      })),
      actions: [{ label: "Sage entries (CSV)", href: `/api/export/sage.csv?week=${b.week.start}${pub ? `&pub=${pub}` : ""}` }],
    };
  },

  clubfrog({ pub, by = "pub" }) {
    const c = hub.clubFrog({ pub: pub || undefined, by });
    return {
      title: `${pub ? PUB[pub].name : "All pubs"} · ${c.from} → ${c.to} · by ${by}`,
      kpis: [
        { label: "Club Frog rate", value: `${c.total.ratePct} %`, sub: "target 20 %", tone: c.total.ratePct < 15 ? "warn" : "ok" },
        { label: "Member tickets", value: String(c.total.memberTickets), sub: `of ${c.total.tickets}` },
        { label: "OBY scans", value: String(c.total.obyScans), sub: "what OBY Pay counts" },
        { label: "Manual discounts", value: String(c.total.manualDiscounts), sub: "failed scans, invisible to OBY", tone: "warn" },
      ],
      blocks: [
        { type: "text", text: `Definition: ${c.definition} OBY Pay counts ${c.total.obyScans}, Zelty counts ${c.total.zeltyClubFrogLines}: the gap is the ${c.total.manualDiscounts} manual discounts.` },
        {
          type: "table", title: `Participation by ${by}`, cols: [by[0].toUpperCase() + by.slice(1), "Tickets", "Members", "Rate", "OBY scans", "Manual", "Avg member", "Avg non-member"],
          rows: c.rows.map((r) => [r.key, r.tickets, r.memberTickets, cell(`${r.ratePct} %`, r.ratePct >= 20 ? "ok" : r.ratePct < 10 ? "crit" : "warn"), r.obyScans, r.manualDiscounts, eur2(r.memberAvg), eur2(r.nonMemberAvg)]),
        },
      ],
    };
  },

  invoices({ pub }) {
    const i = hub.invoiceCheck({ pub: pub || undefined });
    return {
      title: `${pub ? PUB[pub].name : "All pubs"} · September 2026`,
      kpis: [
        { label: "Invoices received", value: String(i.invoices) },
        { label: "Auto-matched", value: String(i.autoMatched), sub: `${Math.round((100 * i.autoMatched) / i.invoices)} % need no validation`, tone: "ok" },
        { label: "To validate", value: String(i.toValidate), tone: "warn" },
        { label: "Amount at stake", value: eur2(i.atStake), tone: "crit" },
      ],
      blocks: [
        { type: "table", title: "Invoices to validate", note: "Matched against the Yokitup order and the agreed price. GMs validate the gaps only.", cols: ["Pub", "Invoice", "Date", "Supplier", "Issue", "Detail", "At stake"], rows: i.exceptions.flatMap((f) => f.issues.map((x) => [f.name, f.id, f.date, f.supplier, cell(x.kind, /double|Duplicate/.test(x.kind) ? "crit" : "warn"), x.detail, eur2(x.atStake)])) },
        { type: "table", title: "By pub", cols: ["Pub", "Invoices", "To validate"], rows: i.byPub.map((p) => [p.name, p.invoices, p.toValidate]) },
      ],
    };
  },

  duty() {
    const d = hub.beerDuty({});
    const missing = d.reduce((s, x) => s + x.missingLines.length, 0);
    return {
      title: "Brewing pubs · September 2026",
      kpis: [
        { label: "Brews", value: String(d.reduce((s, x) => s + x.brews, 0)) },
        { label: "Missing ledger lines", value: String(missing), tone: missing ? "crit" : "ok" },
        { label: "Risk at a customs control", value: eur(missing * 1500), sub: "€1,500 per missing line", tone: missing ? "crit" : "ok" },
      ],
      blocks: [
        { type: "table", title: "Ledger status", note: "Brews come from the brew sheets; sold volume is estimated from Zelty beer sales (0.5 L at €7.50, to replace with product volumes).", cols: ["Pub", "Brews", "Brewed (hl)", "Sold (hl, est.)", "Ledger lines", "Missing", "Risk"], rows: d.map((x) => [x.name, x.brews, x.brewedHl, x.soldHlEstimate, x.ledgerLines, cell(String(x.missingLines.length), x.missingLines.length ? "crit" : "ok"), eur(x.riskEur)]) },
        { type: "table", title: "Lines to add to the ledger", cols: ["Pub", "Brew date", "Beer", "Volume (hl)"], rows: d.flatMap((x) => x.missingLines.map((l) => [x.name, l.date, l.beer, l.hl])) },
      ],
    };
  },

  bookings({ pub }) {
    const b = hub.bookings({ pub: pub || undefined });
    return {
      title: `${pub ? PUB[pub].name : "All pubs"} · ${b.from} → ${b.to}`,
      kpis: [
        { label: "Bookings", value: b.rows.reduce((s, r) => s + r.bookings, 0).toLocaleString("en-GB") },
        { label: "Covers booked", value: b.rows.reduce((s, r) => s + r.covers, 0).toLocaleString("en-GB") },
        { label: "Missed calls", value: b.rows.reduce((s, r) => s + r.missedCalls, 0).toLocaleString("en-GB"), sub: `${b.rows.reduce((s, r) => s + r.missedBeforeOpening, 0)} before opening`, tone: "warn" },
        { label: "Pubs with 0 % Google", value: String(b.rows.filter((r) => r.reserveWithGooglePct === 0).length), tone: b.rows.some((r) => r.reserveWithGooglePct === 0) ? "crit" : "ok" },
      ],
      blocks: [
        { type: "table", title: "Bookings by channel", cols: ["Pub", ...b.channels, "Google share", "Web clicks", "Click → booking", "Missed calls"], rows: b.rows.map((r) => [r.name, ...b.channels.map((c) => r.byChannel[c]), cell(`${r.reserveWithGooglePct} %`, r.reserveWithGooglePct === 0 ? "crit" : ""), r.websiteClicks, `${r.clickToBookingPct} %`, cell(String(r.missedCalls), r.missedCalls / r.calls > 0.3 ? "warn" : "")]) },
        { type: "table", title: "Source normalisation", note: "Raw source typed in the 8 Zenchef accounts → one channel in the hub.", cols: ["Raw source", "Channel", "Bookings"], rows: b.rawSources.map((s) => [s.source, s.normalised, s.count]) },
      ],
    };
  },

  corporate({ pub }) {
    const e = hub.corporate({ pub: pub || undefined });
    const tone = (s) => (s === "OK" ? "ok" : /unpaid|never|missing/i.test(s) ? "crit" : "warn");
    return {
      title: `${pub ? PUB[pub].name : "All pubs"} · events September–October`,
      kpis: [
        { label: "Events", value: String(e.length) },
        { label: "To chase", value: String(e.filter((x) => tone(x.status) === "crit").length), tone: "crit" },
        { label: "Excel not updated", value: String(e.filter((x) => x.status === "Paid, tracker not updated").length), sub: "status now read from the bank" },
        { label: "Booked amount", value: eur(e.reduce((s, x) => s + x.amount, 0)) },
      ],
      blocks: [{ type: "table", title: "Payment status", cols: ["Date", "Pub", "Client", "Guests", "Amount", "Deposit", "Payment", "Status", "Action"], rows: e.map((x) => [x.date, x.name, x.client, x.guests, eur(x.amount), eur(x.deposit), x.channel, cell(x.status, tone(x.status)), x.action]) }],
    };
  },
};

export function mrCsv({ pub, date = TODAY }) {
  const r = hub.managerReport({ pub, date });
  const lines = [["Manager Report", r.name, r.date], [], ["Hour", "Beer", "Wet", "Food", "Total", "Cumulative", "Target cumulative", "Last week cumulative"]];
  for (const h of r.hours) lines.push([h.hour, h.beer, h.wet, h.food, h.total, h.cumulative, h.targetCumulative, h.lastWeekCumulative]);
  lines.push([], ["Revenue", r.totals.revenue], ["Target", r.totals.target], ["Last week", r.totals.lastWeek], ["Labour cost %", r.labour.costPct], ["Club Frog %", r.totals.clubFrogRatePct]);
  lines.push([], ["Staff", "Code", "Planned", "Worked", "Cost"], ...r.staff.map((s) => [s.name, s.staff, s.planned, s.worked, s.cost]));
  return lines.map((l) => l.join(";")).join("\n");
}

export { PUBS };
