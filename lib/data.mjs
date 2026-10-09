// Demo dataset for the central data hub.
//
// In production each collection below is filled by a connector (Zelty API,
// Market Pay / Nepting files, OBY Pay export, Combo API, Yokitup, Yooz, Zenchef,
// BookingShake, OVH, GA4…). Here it is generated with a seeded random generator,
// so every run gives the same figures. Orders of magnitude and known anomalies
// come from the audit (ClubFrog - Zuri.md and the Frog Pubs Process Map); the
// individual records (staff names, tickets, invoices, clients) are fictitious.

const SEED = 20260930;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const between = (a, b) => a + rnd() * (b - a);
const round2 = (x) => Math.round(x * 100) / 100;
function weighted(entries, gen = rnd) {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = gen() * total;
  for (const [v, w] of entries) { if ((r -= w) <= 0) return v; }
  return entries[entries.length - 1][0];
}

/* ---------- reference data (from the audit) ---------- */

export const PUBS = [
  { id: "bordeaux", name: "Bordeaux", gm: "Maywane", style: "table", weekly: 22000, darts: true, rwg: false, bookingshake: true, brews: false, clubTarget: 0.20, cardAvg: 33 },
  { id: "bl", name: "British Library", gm: "German", style: "table", weekly: 46000, darts: false, rwg: true, bookingshake: true, brews: true, clubTarget: 0.15, cardAvg: 36 },
  { id: "bercy", name: "Bercy", gm: "Nico", style: "table", weekly: 52000, darts: true, rwg: false, bookingshake: true, brews: true, clubTarget: 0.16, cardAvg: 38 },
  { id: "rosbif", name: "Rosbif", gm: "Lucas", style: "table", weekly: 38000, darts: false, rwg: true, bookingshake: true, brews: true, clubTarget: 0.15, cardAvg: 35 },
  { id: "toulouse", name: "Toulouse", gm: "Allar", style: "bar", weekly: 10500, darts: false, rwg: true, bookingshake: false, brews: false, clubTarget: 0.08, cardAvg: 14 },
  { id: "princess", name: "Princess", gm: "Mari", style: "bar", weekly: 31000, darts: true, rwg: true, bookingshake: true, brews: false, clubTarget: 0.07, cardAvg: 17, lateNight: true },
  { id: "xvi", name: "XVI", gm: "Sejan", style: "table", weekly: 56000, darts: true, rwg: true, bookingshake: true, brews: false, clubTarget: 0.14, cardAvg: 39 },
  { id: "hophouse", name: "Hop House", gm: "Ricardo", style: "table", weekly: 48000, darts: false, rwg: true, bookingshake: true, brews: true, clubTarget: 0.13, cardAvg: 37 },
];
export const PUB = Object.fromEntries(PUBS.map((p) => [p.id, p]));

export const PAYMENT_MODES = {
  cb: "Card (CB)", amex: "Amex", tr_card: "Meal card (Conecs)", tr_paper: "Paper ticket resto", ancv: "ANCV", cash: "Cash",
};
export const CARD_MODES = ["cb", "amex", "tr_card"];

const FIRST = ["Léa", "Hugo", "Inès", "Tom", "Chloé", "Yanis", "Manon", "Lucas", "Sarah", "Nathan", "Emma", "Rayan", "Jade", "Malik", "Zoé", "Théo", "Lina", "Adam", "Camille", "Noah", "Alice", "Sacha", "Nora", "Jules", "Maya", "Ilyes", "Rose", "Louis", "Anaïs", "Kenza", "Paul-Henri", "Elsa", "Victor", "Lou", "Amir", "Clara"];

/* ---------- calendar ---------- */

export const DATES = [];
for (let d = 1; d <= 30; d++) DATES.push(`2026-09-${String(d).padStart(2, "0")}`);
export const TODAY = "2026-09-30"; // last closed business day in the hub (J-1 of 1 Oct)
export const dow = (date) => new Date(date + "T12:00:00Z").getUTCDay(); // 0 = Sunday
const DOW_FACTOR = [0.9, 0.7, 0.8, 0.9, 1.0, 1.4, 1.5];
// Champions League nights (Tue/Wed): Fanzo match selection drives the evening.
export const MATCH_NIGHTS = new Set(["2026-09-15", "2026-09-16", "2026-09-29", "2026-09-30"]);

/* ---------- staff (Combo) ---------- */

export const STAFF = {};
for (const p of PUBS) {
  const n = p.weekly > 40000 ? 22 : p.weekly > 20000 ? 14 : 7;
  STAFF[p.id] = Array.from({ length: n }, (_, i) => ({
    code: `${p.id.slice(0, 2).toUpperCase()}${String(i + 1).padStart(2, "0")}`,
    name: FIRST[(i + p.id.length * 3) % FIRST.length],
    role: i === 0 ? "SM" : i === 1 ? "SM" : i === 2 && p.style === "table" ? "KSM" : "Staff",
  }));
}

// Some servers recommend a second round or a dish more than others (fixed per staff, between -12 % and +18 %).
export function staffUpsell(code) {
  let h = 0;
  for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) % 9973;
  return 0.88 + (h % 31) / 100;
}

/* ---------- hourly shape ---------- */

function hourWeights(p, date) {
  const w = {};
  for (let h = 11; h <= 25; h++) w[h] = 0.2; // 25 = 01:00
  const add = (h, x) => (w[h] = (w[h] || 0) + x);
  if (p.style === "table") { add(12, 1.6); add(13, 1.8); add(14, 0.6); }
  else { add(12, 0.4); add(13, 0.4); }
  add(17, 0.8); add(18, 1.4); add(19, 1.8); add(20, 1.8); add(21, 1.6); add(22, 1.2); add(23, 0.8);
  if (MATCH_NIGHTS.has(date)) { add(20, 1.5); add(21, 2.0); add(22, 1.2); }
  if (p.lateNight && [5, 6].includes(dow(date))) { add(23, 2.5); add(24, 3.0); add(25, 2.5); }
  return w;
}

/* ---------- tickets (Zelty) + card payments (Nepting) ---------- */

export const TICKETS = [];
export const NEPTING = [];
let tid = 0, nid = 0;

for (const p of PUBS) {
  const staff = STAFF[p.id];
  for (const date of DATES) {
    const late = p.lateNight && [5, 6].includes(dow(date));
    let dayRev = (p.weekly / 7) * DOW_FACTOR[dow(date)] * between(0.9, 1.1) * (MATCH_NIGHTS.has(date) ? 1.25 : 1);
    const weights = Object.entries(hourWeights(p, date));
    let rev = 0;
    while (rev < dayRev) {
      const hour = +weighted(weights.map(([h, x]) => [h, x]));
      const open = hour * 60 + Math.floor(rnd() * 60);
      const covers = p.style === "bar" ? weighted([[1, 5], [2, 4], [3, 1]]) : weighted([[1, 2], [2, 5], [3, 2], [4, 2], [6, 1], [10, 0.3]]);
      const opener = pick(staff), casher = rnd() < 0.72 ? opener : pick(staff);
      // what a guest spends depends on the moment and on who serves them
      const lunch = hour < 17, lateHour = hour >= 23;
      const withFood = rnd() < (p.style === "bar" ? 0.12 : lunch ? 0.78 : lateHour ? 0.12 : 0.48);
      const drinks = (lunch ? between(5, 11) : lateHour ? between(12, 24) : between(9, 19)) * (MATCH_NIGHTS.has(date) ? 1.2 : 1) * ([5, 6].includes(dow(date)) ? 1.1 : 1);
      const meal = withFood ? (lunch ? between(13, 19) : between(14, 24)) : 0;
      const total0 = covers * (drinks + meal) * (late ? 1.3 : 1) * staffUpsell(opener.code);
      const foodShare = (meal / (drinks + meal)) || 0;
      const beerShare = (1 - foodShare) * (lateHour ? between(0.45, 0.7) : between(0.6, 0.85));
      const food = round2(total0 * foodShare), beer = round2(total0 * beerShare);
      const wet = round2(total0 - food - beer);
      const total = round2(food + beer + wet);
      const duration = p.style === "bar" ? between(2, 25) : between(35, 140);
      const close = Math.min(open + Math.round(duration), 26 * 60 + 30);

      // Club Frog / OBY Pay
      const memberProb = p.clubTarget * between(0.85, 1.15);
      const isMember = rnd() < memberProb;
      const scanFails = isMember && rnd() < (p.style === "bar" ? 0.28 : 0.1);
      const member = isMember ? `${p.id}-M${Math.floor(rnd() * Math.round(p.weekly / 120)) + 1}` : null; // each pub has its own regulars
      const totalAdj = isMember ? round2(total * between(1.3, 1.7)) : total;
      const k = totalAdj / total;

      // payments
      const mode = weighted([["cb", 62], ["amex", 4], ["tr_card", p.style === "table" ? 7 : 2], ["tr_paper", p.style === "table" ? 3 : 0.5], ["ancv", 0.5], ["cash", p.style === "bar" ? 28 : 18]]);
      const split = covers >= 4 && rnd() < 0.35 && CARD_MODES.includes(mode);
      const payments = [];
      if (split) {
        const share = round2(totalAdj / covers);
        for (let i = 0; i < covers; i++) payments.push({ mode, amount: i < covers - 1 ? share : round2(totalAdj - share * (covers - 1)) });
      } else payments.push({ mode, amount: round2(totalAdj) });
      // what staff clicked in Zelty: big groups in a rush are closed as one payment, modes sometimes wrong
      const rush = hour >= 19 && hour <= 22 && [5, 6].includes(dow(date));
      const zeltyPayments = split && rnd() < (rush ? 0.6 : 0.3)
        ? [{ mode, amount: round2(totalAdj) }]
        : payments.map((x) => ({ ...x, mode: rnd() < (rush ? 0.09 : 0.04) ? pick(["cb", "cash", "tr_paper", "amex"].filter((m) => m !== x.mode)) : x.mode }));

      const t = {
        id: `T${++tid}`, pub: p.id, date, open, close, table: p.style === "bar" ? null : 1 + Math.floor(rnd() * 40),
        opener: opener.code, casher: casher.code, covers,
        beer: round2(beer * k), wet: round2(wet * k), food: round2(food * k), total: round2(totalAdj),
        payments, zeltyPayments, member, scanned: isMember && !scanFails, manualClubFrog: scanFails,
      };
      t.total = round2(t.beer + t.wet + t.food);
      const diff = round2(t.total - payments.reduce((s, x) => s + x.amount, 0));
      payments[payments.length - 1].amount = round2(payments[payments.length - 1].amount + diff);
      if (zeltyPayments.length === 1) zeltyPayments[0].amount = t.total;
      TICKETS.push(t);
      rev += t.total;

      // Nepting: the server types the amount and their own code on the terminal
      for (const pay of payments) {
        if (!CARD_MODES.includes(pay.mode)) continue;
        const wrongCode = rnd() < (rush ? 0.08 : 0.03);
        NEPTING.push({
          id: `N${++nid}`, pub: p.id, date, time: close - Math.floor(rnd() * 3), amount: pay.amount, mode: pay.mode,
          serverCode: wrongCode ? pick(staff).code : casher.code, ticket: t.id, refused: false,
        });
      }
    }
    // a few terminal payments with no Zelty counterpart (typed twice, refused then retried…)
    const extra = Math.floor(between(0, 2.6));
    for (let i = 0; i < extra; i++) {
      const s = pick(staff);
      NEPTING.push({ id: `N${++nid}`, pub: p.id, date, time: (19 + Math.floor(rnd() * 4)) * 60, amount: round2(between(12, 90)), mode: "cb", serverCode: s.code, ticket: null, refused: rnd() < 0.5 });
    }
  }
}

/* ---------- Combo: hours and staff cost ---------- */

export const SHIFTS = [];
for (const p of PUBS) for (const date of DATES) {
  const dayStaff = STAFF[p.id];
  const n = Math.max(3, Math.round(dayStaff.length * (0.45 + 0.1 * DOW_FACTOR[dow(date)])));
  const day = DATES.indexOf(date);
  const picks = Array.from({ length: n }, (_, i) => dayStaff[(i + day) % dayStaff.length]);
  // a shift manager runs every service, two on Friday and Saturday (lunch opener, evening closer)
  const sms = dayStaff.filter((s) => s.role === "SM");
  const needed = [5, 6].includes(dow(date)) ? 2 : 1;
  for (let k = 0, slot = n - 1; picks.filter((s) => s.role === "SM").length < needed && k < sms.length; k++) {
    const sm = sms[(day + k) % sms.length];
    if (!picks.includes(sm)) { while (picks[slot].role === "SM") slot--; picks[slot--] = sm; }
  }
  for (let i = 0; i < n; i++) {
    const s = picks[i];
    const planned = Math.round(between(5, 9) * 2) / 2;
    SHIFTS.push({ pub: p.id, date, staff: s.code, planned, worked: Math.max(3, planned + Math.round(between(-1, 1.6) * 2) / 2), rate: s.role === "Staff" ? 17.8 : 22.5 });
  }
}

/* ---------- Target file: monthly budget split per day ---------- */

export const TARGETS = {};
for (const p of PUBS) {
  // Toulouse: September budget ~€70k for ~€40k actual (audit). Others: budget a little above actual.
  const monthBudget = p.id === "toulouse" ? 70000 : (p.weekly / 7) * 30 * between(1.02, 1.09);
  const sumW = DATES.reduce((s, d) => s + DOW_FACTOR[dow(d)], 0);
  for (const d of DATES) TARGETS[`${p.id}|${d}`] = round2((monthBudget * DOW_FACTOR[dow(d)]) / sumW);
}

/* ---------- Purchasing: Yokitup orders, Yooz invoices ---------- */

const CATALOG = [
  { sku: "FRIES10", item: "Frites surgelées 10 kg", supplier: "LR Food", price: 18.4, unit: "carton" },
  { sku: "BURGER", item: "Steaks hachés 150 g ×40", supplier: "LR Food", price: 62.0, unit: "carton" },
  { sku: "CHEDDAR", item: "Cheddar tranches 1 kg", supplier: "Terasur", price: 11.9, unit: "kg" },
  { sku: "SALAD", item: "Mesclun 1 kg", supplier: "Terasur", price: 6.2, unit: "kg" },
  { sku: "COKE", item: "Coca-Cola 33 cl ×24", supplier: "France Boissons", price: 17.5, unit: "pack" },
  { sku: "WINE-R", item: "Côtes-du-Rhône 75 cl", supplier: "France Boissons", price: 5.9, unit: "bouteille" },
  { sku: "GIN", item: "Gin 70 cl", supplier: "France Boissons", price: 16.8, unit: "bouteille" },
  { sku: "GLASSW", item: "Produit lave-verres 5 L", supplier: "Rolidor", price: 24.0, unit: "bidon" },
  { sku: "MALT", item: "Malt pale ale 25 kg", supplier: "Frog Beer brewery", price: 31.0, unit: "sac" },
  { sku: "KEG-IPA", item: "Fût Frog IPA 30 L", supplier: "Frog Beer brewery", price: 96.0, unit: "fût" },
];
export const ORDERS = [];
export const INVOICES = [];
let oid = 0, iid = 0;
for (const p of PUBS) {
  const perWeek = p.weekly > 40000 ? 14 : p.weekly > 20000 ? 7 : 3; // big pubs order daily, small pubs weekly
  const suppliers = [...new Set(CATALOG.map((c) => c.supplier))].filter((s) => s !== "Frog Beer brewery" || !p.brews);
  for (let w = 0; w < 4; w++) for (let k = 0; k < perWeek; k++) {
    const date = DATES[Math.min(29, w * 7 + Math.floor(rnd() * 7))];
    const supplier = pick(suppliers);
    const lines = CATALOG.filter((c) => c.supplier === supplier).filter(() => rnd() < 0.8).map((c) => ({ sku: c.sku, item: c.item, qty: 1 + Math.floor(rnd() * (p.weekly > 40000 ? 8 : 4)), price: c.price }));
    if (!lines.length) continue;
    const order = { id: `PO${++oid}`, pub: p.id, date, supplier, lines, received: true };
    ORDERS.push(order);
    // invoice as billed (Yooz): mostly identical, with known anomaly types
    const inv = { id: `F${++iid}`, pub: p.id, date, supplier, order: order.id, lines: lines.map((l) => ({ ...l })), duplicateOf: null };
    if (p.id === "toulouse" && supplier === "LR Food") inv.lines.forEach((l) => { if (l.sku === "FRIES10") l.price = round2(l.price * 1.4); }); // fries billed +40 %
    if (supplier === "France Boissons" && rnd() < 0.025) { const l = pick(inv.lines); l.price = round2(l.price * 2); } // bottles billed double
    if (rnd() < 0.04) { const l = pick(inv.lines); l.qty += 1 + Math.floor(rnd() * 3); } // billed more than received
    if (rnd() < 0.03) { const l = pick(inv.lines); l.price = round2(l.price * between(1.06, 1.15)); } // price drift vs negotiated
    INVOICES.push(inv);
    if (rnd() < 0.02) INVOICES.push({ ...inv, id: `F${++iid}`, lines: inv.lines.map((l) => ({ ...l })), duplicateOf: inv.id });
  }
}
INVOICES.forEach((f) => (f.total = round2(f.lines.reduce((s, l) => s + l.qty * l.price, 0))));

/* ---------- Comptabilité matière (beer duty ledger) ---------- */

export const BREWS = [];   // brew sheets (Frog Space)
export const LEDGER = [];  // what is written today in the drive ledger
for (const p of PUBS.filter((x) => x.brews)) {
  for (let i = 0; i < DATES.length; i += 3 + Math.floor(rnd() * 3)) {
    const b = { pub: p.id, date: DATES[i], beer: pick(["Frog IPA", "Natural Blonde", "Ribbet Red", "Dark de Triomphe"]), hl: round2(between(5, 10)) };
    BREWS.push(b);
    if (rnd() > (p.id === "bercy" ? 0.05 : 0.22)) LEDGER.push({ ...b }); // the risk sits at head office, not at the pub
  }
}

/* ---------- Reservations (Zenchef, BookingShake, SimplyBook) ---------- */

// Raw "source" values as typed in each of the 8 Zenchef accounts, and the hub's normalised channel.
export const SOURCE_MAP = {
  "Site web": "Website", "Widget": "Website", "frogpubs.com": "Website",
  "Google": "Reserve with Google", "RwG": "Reserve with Google", "Reserve with Google": "Reserve with Google",
  "Téléphone": "Phone", "Tel": "Phone", "phone": "Phone",
  "Walk-in": "Walk-in", "Sur place": "Walk-in",
  "BookingShake": "Groups (BookingShake)", "SimplyBook": "Darts (SimplyBook)",
};
export const BOOKINGS = [];
export const WEB = []; // GA4 booking clicks per pub/day
export const CALLS = []; // OVH: calls and missed calls per pub/day
for (const p of PUBS) for (const date of DATES) {
  const n = Math.round((p.weekly / 7 / 600) * DOW_FACTOR[dow(date)] * (MATCH_NIGHTS.has(date) ? 1.6 : 1) * between(0.7, 1.2));
  for (let i = 0; i < n; i++) {
    const raw = weighted([
      [pick(["Site web", "Widget", "frogpubs.com"]), 45], [pick(["Google", "RwG", "Reserve with Google"]), p.rwg ? 22 : 0],
      [pick(["Téléphone", "Tel", "phone"]), 25], [pick(["Walk-in", "Sur place"]), 8],
    ]);
    BOOKINGS.push({ pub: p.id, date, rawSource: raw, channel: SOURCE_MAP[raw], covers: weighted([[2, 5], [3, 2], [4, 3], [6, 1], [8, 0.5], [12, 0.3]]), system: "Zenchef" });
  }
  if (p.darts && rnd() < 0.6) BOOKINGS.push({ pub: p.id, date, rawSource: "SimplyBook", channel: SOURCE_MAP.SimplyBook, covers: 4 + Math.floor(rnd() * 6), system: "SimplyBook" });
  WEB.push({ pub: p.id, date, bookingClicks: Math.round(n * between(1.6, 2.4)) });
  const calls = Math.round(n * between(0.8, 1.4)) + (MATCH_NIGHTS.has(date) ? 12 : 0);
  const missRate = p.id === "hophouse" ? 0.32 : p.id === "rosbif" ? 0.26 : 0.16;
  const beforeOpening = ["toulouse", "princess"].includes(p.id) ? Math.round(between(1, 3)) : p.id === "xvi" && MATCH_NIGHTS.has(date) ? Math.round(between(5, 10)) : Math.round(between(0, 2));
  CALLS.push({ pub: p.id, date, calls: calls + beforeOpening, missed: Math.round(calls * missRate) + beforeOpening, missedBeforeOpening: beforeOpening });
}

/* ---------- Corporate & groups (BookingShake) ---------- */

export const EVENTS = [];
const CLIENTS = ["Client A (conseil)", "Client B (banque)", "Client C (tech)", "Client D (agence)", "Client E (assurance)", "Mairie F (public)", "Client G (luxe)", "Client H (start-up)", "Client I (cabinet d'avocats)", "Ministère J (public)"];
let eid = 0;
for (const p of PUBS.filter((x) => x.bookingshake)) {
  for (let i = 0; i < 4; i++) {
    const client = pick(CLIENTS), public_ = /public/.test(client);
    const date = `2026-${rnd() < 0.5 ? "09" : "10"}-${String(1 + Math.floor(rnd() * 28)).padStart(2, "0")}`;
    const amount = Math.round(between(1200, 9000));
    const depositPaid = rnd() < 0.75;
    const past = date <= TODAY;
    EVENTS.push({
      id: `BS${++eid}`, pub: p.id, client, date, guests: 20 + Math.floor(rnd() * 80), amount,
      deposit: Math.round(amount / 2), depositInBank: depositPaid, depositInExcel: depositPaid && rnd() < 0.55,
      finalPaid: past && rnd() < 0.6, channel: public_ ? "Chorus Pro" : rnd() < 0.6 ? "Payment link" : "Bank transfer",
    });
  }
}

/* ======================================================================
   Additions from the process notes (knowledge/pain-process.md).
   They use a second seeded generator, so every figure above stays the same.
   ====================================================================== */

const rnd2 = mulberry32(SEED + 101);
const pick2 = (arr) => arr[Math.floor(rnd2() * arr.length)];
const between2 = (a, b) => a + rnd2() * (b - a);
const weighted2 = (entries) => weighted(entries, rnd2);
const plusDays = (date, k) => { const t = new Date(date + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + k); return t.toISOString().slice(0, 10); };

// The 7 days after the last closed business day: bookings already in the books.
export const AHEAD = Array.from({ length: 7 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);

/* ---------- booking details (Zenchef, SimplyBook) ---------- */

const SURNAMES = ["Martin", "Bernard", "Dubois", "Thomas", "Robert", "Richard", "Petit", "Durand", "Leroy", "Moreau", "Simon", "Laurent", "Lefebvre", "Michel", "Garcia", "David", "Bertrand", "Roux", "Vincent", "Fournier", "Morel", "Girard", "Mercier", "Dupont", "Lambert", "Bonnet", "Martinez", "Smith", "Jones", "Brown", "Taylor", "Wilson", "Nguyen", "Haddad", "Rossi", "Silva"];

// AI receptionist pilot (Retell AI): answers the calls staff do not pick up, books (to be
// validated like any Zenchef booking), transfers to a person and calls guests to confirm.
export const AI_PILOT = { pubs: ["hophouse", "rosbif"], since: "2026-09-17", tool: "Retell AI" };
export const inPilot = (pub, date) => AI_PILOT.pubs.includes(pub) && date >= AI_PILOT.since;

function detailBooking(b, n) {
  const darts = b.system === "SimplyBook";
  const lunch = !darts && PUB[b.pub].style === "table" && rnd2() < 0.32;
  b.id = `B${n}`;
  b.kind = darts ? "darts" : "table";
  b.time = darts ? (18 + Math.floor(rnd2() * 4)) * 60 + pick2([0, 30]) : lunch ? 12 * 60 + 15 * Math.floor(rnd2() * 7) : 18 * 60 + 30 + 15 * Math.floor(rnd2() * 13);
  b.guest = pick2(SURNAMES);
  b.member = rnd2() < 0.18;
  b.email = ["Website", "Reserve with Google"].includes(b.channel) ? rnd2() < 0.96 : b.channel === "Phone" ? rnd2() < 0.4 : rnd2() < 0.15;
  b.via = null;                               // "AI receptionist" when the pilot took the booking
  b.needsValidation = !darts && b.covers >= 8; // large tables are validated by the GM in Zenchef
  // the AI receptionist calls the day before to confirm tables of 4 or more
  b.confirm = inPilot(b.pub, plusDays(b.date, -1)) && !darts && b.covers >= 4
    ? weighted2([["Confirmed", 70], ["Covers changed", 8], ["Cancelled", 7], ["No answer", 15]]) : null;
  b.outcome = b.confirm === "Cancelled" ? "cancelled" : rnd2() < (b.confirm === "Confirmed" ? 0.02 : 0.07) ? "no-show" : rnd2() < 0.04 ? "cancelled" : "honoured";
  // Club Frog invitation sent before the visit to bookers who are not members
  b.joined = !b.member && b.email && rnd2() < 0.12;
}

let bid = 0;
for (const b of BOOKINGS) detailBooking(b, ++bid);
for (const p of PUBS) for (const date of AHEAD) {
  const n = Math.round((p.weekly / 7 / 600) * DOW_FACTOR[dow(date)] * between2(0.75, 1.15));
  for (let i = 0; i < n; i++) {
    const raw = weighted2([
      [pick2(["Site web", "Widget", "frogpubs.com"]), 45], [pick2(["Google", "RwG", "Reserve with Google"]), p.rwg ? 22 : 0],
      [pick2(["Téléphone", "Tel", "phone"]), 25], [pick2(["Walk-in", "Sur place"]), 4],
    ]);
    const b = { pub: p.id, date, rawSource: raw, channel: SOURCE_MAP[raw], covers: weighted2([[2, 5], [3, 2], [4, 3], [6, 1], [8, 0.5], [12, 0.3]]), system: "Zenchef", upcoming: true };
    detailBooking(b, ++bid); BOOKINGS.push(b);
  }
  if (p.darts && rnd2() < 0.7) { const b = { pub: p.id, date, rawSource: "SimplyBook", channel: SOURCE_MAP.SimplyBook, covers: 4 + Math.floor(rnd2() * 6), system: "SimplyBook", upcoming: true }; detailBooking(b, ++bid); BOOKINGS.push(b); }
}
for (const e of EVENTS) e.time = rnd2() < 0.3 ? 12 * 60 + 30 : 19 * 60;

/* ---------- AI receptionist calls (pilot) ---------- */

export const AI_CALLS = [];
const INTENTS = [["Booking request", 45], ["Opening hours, menu, matches", 25], ["Change or cancel a booking", 10], ["Group or event enquiry", 8], ["Lost property", 5], ["Asked for a person", 7]];
let aid = 0;
for (const c of CALLS) {
  if (!inPilot(c.pub, c.date)) continue;
  const answered = Math.round(c.missed * between2(0.82, 0.95));
  c.aiAnswered = answered;
  for (let i = 0; i < answered; i++) {
    const before = i < Math.min(c.missedBeforeOpening, answered);
    const time = before ? 9 * 60 + Math.floor(rnd2() * 150) : (12 + Math.floor(rnd2() * 10)) * 60 + Math.floor(rnd2() * 60);
    const intent = weighted2(INTENTS);
    const call = { id: `AI${++aid}`, pub: c.pub, date: c.date, time, beforeOpening: before, seconds: Math.round(between2(45, 210)), intent, covers: null, booking: null, guest: pick2(SURNAMES) };
    if (intent === "Booking request") {
      // the AI writes the booking in Zenchef, waiting for the GM's validation
      const target = BOOKINGS.find((b) => b.pub === c.pub && b.channel === "Phone" && !b.via && b.kind === "table" && b.date >= c.date && b.date <= plusDays(c.date, 3));
      if (target && rnd2() < 0.85) { target.via = "AI receptionist"; target.needsValidation = true; target.guest = call.guest; call.booking = target.id; call.covers = target.covers; call.bookedFor = target.date; call.outcome = "Booking created, to validate"; }
      else { call.covers = 2 + Math.floor(rnd2() * 5); call.outcome = rnd2() < 0.5 ? "Fully booked, another time offered" : "Transferred to staff"; }
    } else if (intent === "Asked for a person") call.outcome = rnd2() < 0.7 ? "Transferred to staff" : "Message taken for the GM";
    else if (intent === "Group or event enquiry") call.outcome = "Message sent to Tory";
    else if (intent === "Change or cancel a booking") call.outcome = rnd2() < 0.6 ? "Change noted, to confirm in Zenchef" : "Transferred to staff";
    else call.outcome = "Answered";
    AI_CALLS.push(call);
  }
}

/* ---------- Zenchef: online bookings closed by the pub, and ad spend ---------- */

export const AD_SPEND = [];  // per pub and day, Google Ads + Meta (ad accounts)
export const CLOSURES = [];  // evenings when the pub closed online bookings in Zenchef
for (const p of PUBS) for (const date of [...DATES, ...AHEAD]) {
  const spend = (p.weekly / 7 / 1000) * between2(4, 7);
  AD_SPEND.push({ pub: p.id, date, google: round2(spend * 0.6), meta: round2(spend * 0.4) });
  const weekend = [5, 6].includes(dow(date));
  const prob = weekend ? ({ xvi: 0.55, bercy: 0.45, princess: 0.5, hophouse: 0.3 }[p.id] ?? 0.1) : 0.03;
  if (rnd2() < prob) CLOSURES.push({ pub: p.id, date, from: pick2([18 * 60, 18 * 60 + 30, 19 * 60]), to: 23 * 60, by: `GM ${p.gm}` });
}

/* ---------- Club Frog: members on the same bill, contacts ---------- */

// several guests at a table can scan their own code on the same bill
for (const t of TICKETS) if (t.member) t.membersOnTicket = Math.min(t.covers, PUB[t.pub].style === "table" && t.covers >= 2 ? weighted2([[1, 6], [2, 3], [3, 1]]) : 1);

// Club Frog contacts in OBY Pay (process notes, Tab 12)
export const CRM = { contacts: 50000, linkedToPub: 9500 };

/* ---------- Beer menu: Frog Space (typed by head office) and Zelty (typed again by hand) ---------- */

const HOUSE = [["Frog IPA", "IPA", 5.4], ["Natural Blonde", "Blonde", 4.2], ["Ribbet Red", "Red ale", 5.0], ["Dark de Triomphe", "Stout", 4.8], ["Hoppy Frog", "Session IPA", 4.0]];
const GUEST = [["Guinness", "Stout", 4.2], ["Kronenbourg 1664", "Lager", 5.5], ["Brooklyn Lager", "Lager", 5.2], ["Magners", "Cider", 4.5], ["Leffe Blonde", "Abbey", 6.6], ["Hoegaarden", "Wheat", 4.9]];
export const MENU = [];
for (const p of PUBS) {
  const lines = [...HOUSE, ...GUEST.filter(() => rnd2() < 0.6)];
  lines.forEach(([beer, style, abv], i) => {
    const pint = pick2([7, 7.5, 8, 8.5]) + (["xvi", "bercy"].includes(p.id) ? 0.5 : 0);
    const half = Math.ceil(pint * 0.55 * 2) / 2;
    const r = rnd2();
    const zelty = r < 0.04 ? null : r < 0.16 ? { pint: pint - 0.5, half } : { pint, half }; // retyped by hand: sometimes stale or missing
    MENU.push({ pub: p.id, tap: i + 1, beer, style, abv, house: i < HOUSE.length, frogSpace: { pint, half }, zelty, updated: `2026-09-${String(1 + Math.floor(rnd2() * 28)).padStart(2, "0")}` });
  });
}

/* ---------- Paper meal vouchers scanned at cash-up ---------- */

const ISSUERS = [["Ticket Restaurant (Edenred)", 45], ["Pluxee (Sodexo)", 25], ["Up Déjeuner", 18], ["Bimpli", 12]];
export const VOUCHERS = [];
const paper = {};
for (const t of TICKETS) for (const y of t.payments) if (y.mode === "tr_paper") paper[`${t.pub}|${t.date}`] = (paper[`${t.pub}|${t.date}`] || 0) + y.amount;
for (const p of PUBS) for (const date of DATES) {
  const amount = round2(paper[`${p.id}|${date}`] || 0);
  if (!amount) continue;
  const count = Math.max(1, Math.round(amount / between2(9, 11.5)));
  const unreadable = rnd2() < 0.35 ? Math.max(1, Math.round(count * between2(0.02, 0.08))) : 0;
  const byIssuer = {};
  for (let i = 0; i < count; i++) { const k = weighted2(ISSUERS); byIssuer[k] = (byIssuer[k] || 0) + 1; }
  VOUCHERS.push({ id: `V-${p.id}-${date}`, pub: p.id, date, amount, count, unreadable, unreadableAmount: round2((amount * unreadable) / count), scanned: rnd2() < 0.9, byIssuer });
}

/* ======================================================================
   Checklists: what the pubs do in Trail today (audit and process map):
   opening and closing checklists, weekly cleaning, temperatures,
   traceability, waste and breakage. Rebuilt in Frog Hub (open point P14,
   method b) so waste reaches the Yokitup stock without retyping.
   Templates to confirm against the pubs' real Trail lists.
   ====================================================================== */

const rnd3 = mulberry32(SEED + 202);
const pick3 = (arr) => arr[Math.floor(rnd3() * arr.length)];
const between3 = (a, b) => a + rnd3() * (b - a);

export const CHECKLISTS = {
  opening: { label: "Opening", when: "Before opening", owner: "SM on shift", items: [
    ["o1", "Alarm off, lights, music and screens on", "bar"],
    ["o2", "Fridge, cellar and freezer temperatures recorded", "both"],
    ["o3", "Beer lines pulled through and tasted", "bar"],
    ["o4", "Glass washer filled, test cycle run", "bar"],
    ["o5", "Tills open, float counted (€200)", "bar"],
    ["o6", "Toilets checked and stocked", "bar"],
    ["o7", "Allergen board and menus up to date", "both"],
    ["o8", "Fryer oil checked, hot holding switched on", "kitchen"],
  ] },
  closing: { label: "Closing", when: "After the last guest", owner: "SM on shift", items: [
    ["c1", "Waste and breakage of the day recorded", "both"],
    ["c2", "Beer lines capped, drip trays cleaned", "bar"],
    ["c3", "Glass washer drained and cleaned", "bar"],
    ["c4", "Kitchen surfaces cleaned and sanitised", "kitchen"],
    ["c5", "Opened food labelled, dated and covered", "kitchen"],
    ["c6", "Fryers and gas off", "kitchen"],
    ["c7", "Cash-up done, float in the safe", "bar"],
    ["c8", "Bins out, back door locked, alarm on", "both"],
  ] },
};
// one deep clean a day, the same weekday every week (0 = Sunday)
export const WEEKLY_CLEANING = [
  [1, "Beer line deep clean (cellar)", "bar"], [2, "Ice machine cleaned and descaled", "bar"], [3, "Extraction hood filters", "kitchen"],
  [4, "Cold room floor and shelves", "kitchen"], [5, "Behind and under the bar", "bar"], [6, "Toilets deep clean", "bar"], [0, "Coffee machine descaled", "bar"],
];
export const EQUIPMENT = [
  { id: "cellar", name: "Cellar", min: 10, max: 13, kitchen: false }, { id: "bar1", name: "Bar fridge 1", min: 0, max: 5, kitchen: false },
  { id: "bar2", name: "Bar fridge 2", min: 0, max: 5, kitchen: false }, { id: "kfridge", name: "Kitchen fridge", min: 0, max: 5, kitchen: true },
  { id: "freezer", name: "Freezer", min: -25, max: -18, kitchen: true }, { id: "hot", name: "Hot holding", min: 63, max: 85, kitchen: true },
];
export const WASTE_REASONS = ["Breakage", "Line waste or spillage", "Out of date", "Kitchen error", "Sent back by a guest"];
// what is wasted, at cost price, mapped to its Yokitup product
export const WASTE_ITEMS = [
  { id: "pint-house", name: "Pint of Frog beer", unit: "pint", cost: 1.1, yokitup: "KEG-IPA", kitchen: false },
  { id: "pint-guest", name: "Pint of guest beer", unit: "pint", cost: 1.6, yokitup: "KEG-GUEST", kitchen: false },
  { id: "glass-pint", name: "Pint glass", unit: "glass", cost: 2.2, yokitup: "GLASS-PINT", kitchen: false },
  { id: "glass-wine", name: "Wine glass", unit: "glass", cost: 2.9, yokitup: "GLASS-WINE", kitchen: false },
  { id: "wine", name: "Côtes-du-Rhône 75 cl", unit: "bottle", cost: 5.9, yokitup: "WINE-R", kitchen: false },
  { id: "coke", name: "Coca-Cola 33 cl", unit: "can", cost: 0.73, yokitup: "COKE", kitchen: false },
  { id: "burger", name: "Burger patty 150 g", unit: "patty", cost: 1.55, yokitup: "BURGER", kitchen: true },
  { id: "fries", name: "Fries portion", unit: "portion", cost: 0.46, yokitup: "FRIES10", kitchen: true },
  { id: "cheddar", name: "Cheddar slices", unit: "100 g", cost: 1.19, yokitup: "CHEDDAR", kitchen: true },
  { id: "salad", name: "Mixed leaves", unit: "100 g", cost: 0.62, yokitup: "SALAD", kitchen: true },
];
const TRACE = [["Burger patties", 2], ["Cheddar slices", 5], ["Mixed leaves", 2], ["Coleslaw (made here)", 3], ["Chicken wings, cooked", 2], ["Cut lemons and limes", 1], ["Burger sauce (made here)", 4], ["Pulled pork, cooked", 3]];

export const CHECKS = {};      // `${pub}|${date}|${item}` -> { by, time } for items ticked in the demo history
export const TEMPS = [];        // { pub, date, equipment, time, value, by }
export const WASTE = [];        // { id, pub, date, time, item, qty, reason, by, cost }
export const TRACEABILITY = []; // { pub, date, product, opened, useBy, by }
let wid = 0;
const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
for (const p of PUBS) for (const date of DATES) {
  const crew = SHIFTS.filter((s) => s.pub === p.id && s.date === date).map((s) => STAFF[p.id].find((x) => x.code === s.staff));
  const sms = crew.filter((s) => s.role !== "Staff");
  const who = (side) => (side === "kitchen" && crew.find((s) => s.role === "KSM") && rnd3() < 0.6 ? crew.find((s) => s.role === "KSM") : rnd3() < 0.55 && sms.length ? pick3(sms) : pick3(crew)).code;
  const barPub = p.style === "bar";
  // the kitchen ticks every day; the bar less, Toulouse least (audit)
  const rate = (side) => (side === "kitchen" ? 0.95 : p.id === "toulouse" ? 0.62 : barPub ? 0.8 : 0.9);
  for (const [key, list] of Object.entries(CHECKLISTS)) {
    for (const [id, , side] of list.items) {
      if (barPub && side === "kitchen") continue;
      if (rnd3() < rate(side) * (key === "closing" ? 0.95 : 1)) {
        const t = key === "opening" ? 10 * 60 + 30 + Math.floor(rnd3() * 75) : 24 * 60 + 30 + Math.floor(rnd3() * 60);
        CHECKS[`${p.id}|${date}|${id}`] = { by: who(side), time: hhmm(t) };
      }
    }
  }
  const [, , wSide] = WEEKLY_CLEANING.find(([d]) => d === dow(date));
  if (!(barPub && wSide === "kitchen") && rnd3() < 0.55) CHECKS[`${p.id}|${date}|weekly`] = { by: who(wSide), time: hhmm(15 * 60 + Math.floor(rnd3() * 120)) };
  for (const e of EQUIPMENT.filter((x) => !x.kitchen || !barPub)) for (const t of [11 * 60, 16 * 60]) {
    if (rnd3() > 0.92) continue; // reading missed
    const mid = (e.min + e.max) / 2, drift = rnd3() < 0.04 ? (e.id === "hot" ? -8 : 4) : 0;
    TEMPS.push({ pub: p.id, date, equipment: e.id, time: hhmm(t + Math.floor(rnd3() * 20)), value: Math.round((mid + between3(-1.6, 1.6) + drift) * 10) / 10, by: who(e.kitchen ? "kitchen" : "bar") });
  }
  const n = Math.round(between3(1, 3) + (p.weekly / 20000) * between3(0.5, 1.5) + (MATCH_NIGHTS.has(date) ? 2 : 0));
  for (let i = 0; i < n; i++) {
    const it = pick3(WASTE_ITEMS.filter((x) => !x.kitchen || !barPub));
    const reason = it.id.startsWith("glass") ? "Breakage" : it.id.startsWith("pint") ? pick3(["Line waste or spillage", "Sent back by a guest", "Line waste or spillage"]) : it.kitchen ? pick3(["Out of date", "Kitchen error", "Sent back by a guest"]) : pick3(["Breakage", "Out of date"]);
    const qty = it.unit === "pint" ? 1 + Math.floor(rnd3() * 6) : 1 + Math.floor(rnd3() * 3);
    WASTE.push({ id: `W${++wid}`, pub: p.id, date, time: hhmm(18 * 60 + Math.floor(rnd3() * 330)), item: it.id, qty, reason, by: who(it.kitchen ? "kitchen" : "bar"), cost: round2(qty * it.cost) });
  }
  if (!barPub) for (const [product, life] of TRACE) {
    if (rnd3() < 0.25) continue;
    const opened = plusDays(date, -Math.floor(rnd3() * (life + 1)));
    TRACEABILITY.push({ pub: p.id, date, product, opened, useBy: plusDays(opened, life), by: who("kitchen") });
  }
}
