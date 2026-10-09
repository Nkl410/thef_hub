// Self-test: every view, every hub endpoint, every Copilot tool and the doc index.
// Run with `npm run check`. Does not call the Anthropic API.
import * as views from "../lib/views.mjs";
import * as ws from "../lib/workspaces.mjs";
import * as actions from "../lib/actions.mjs";
import * as auto from "../lib/automations.mjs";
import * as rag from "../lib/rag.mjs";
import { runTool, TOOL_NAMES } from "../lib/copilot.mjs";

let failed = 0;
const ok = (label, cond, extra = "") => { console.log(`${cond ? "ok  " : "FAIL"} ${label}${extra ? " · " + extra : ""}`); if (!cond) failed++; };

const meta = views.meta();
for (const m of meta.modules) {
  for (const pub of ["xvi", "toulouse", undefined]) {
    try {
      const v = views.view(m.id, { pub, date: "2026-09-26", week: meta.weeks[1].start, by: "staff" });
      ok(`view ${m.id} (${pub ?? "all"})`, v.title && Array.isArray(v.blocks), `${v.kpis?.length ?? 0} tiles, ${v.blocks.length} blocks`);
    } catch (e) { ok(`view ${m.id} (${pub ?? "all"})`, false, e.message); }
  }
}
for (const w of ws.WORKSPACES) {
  for (const pub of w.needsPub ? ["bordeaux", "bl", "bercy", "rosbif", "toulouse", "princess", "xvi", "hophouse"] : [undefined]) {
    try {
      const r = ws.workspace(w.id, { pub, date: "2026-09-26" });
      ok(`workspace ${w.id}${pub ? " " + pub : ""}`, r.greeting && r.tabs.length >= 2 && r.tabs.every((t) => t.sections.length), r.tabs.map((t) => `${t.label}(${t.sections.length})`).join(" "));
    } catch (e) { ok(`workspace ${w.id}`, false, e.message); }
  }
}
// an invoice approved in one workspace leaves every queue
const finQueue = () => ws.workspace("finance", {}).tabs[0].sections.find((x) => x.id === "invoices");
const fin = finQueue();
const first = fin.items.find((i) => !i.done);
actions.record("invoice", first.id, "approved");
ok("action shared across workspaces", finQueue().items.find((i) => i.id === first.id).done?.label === "Approved");
actions.record("invoice", first.id, "undo");
ok("undo", !finQueue().items.find((i) => i.id === first.id).done);
const g = (await import("../lib/hub.mjs")).guests({ pub: "hophouse" });
ok("guests", g.spendPerHead > 10 && g.byServer.length > 5 && g.regulars.members > 0, `€${g.spendPerHead} per guest, ${g.pintsPerHead} pints`);
let bad = false; try { actions.record("invoice", first.id, "deleted"); } catch { bad = true; }
ok("action rejects unknown status", bad);
// automations: scheduled runs, approval, live event, builder
auto.ensureDay("2026-09-30");
ok("automations ran", auto.outbox({ system: "Combo" }).length === 8 && auto.outbox({ system: "Sage" }).length === 8, `${auto.outbox({}).length} sent`);
const op = auto.approvals({ owner: "manager", pub: "bercy" }).find((o) => o.automation === "staffing-combo");
auto.decide(op.id, "approved");
ok("rota approved goes to Combo", auto.outbox({ system: "Combo" }).length === 9 && auto.approvals({ owner: "manager", pub: "bercy" }).find((o) => o.id === op.id).decided.status === "approved");
auto.fire("mr.sent", { pub: "bercy", date: "2026-09-30", notes: "ok" });
ok("MR sent triggers email", auto.outbox({ system: "Email" }).some((o) => o.title.startsWith("Bercy")));
const cid = auto.create({ trigger: "revenue-below", value: 5, action: "task", target: "Paul" });
ok("custom automation", auto.runOnce(cid).sent >= 0 && auto.list({}).some((a) => a.id === cid));
auto.setConfig("targets-combo", { enabled: false });
ok("switch off", auto.list({}).find((a) => a.id === "targets-combo").enabled === false);
ok("banking csv", ws.bankingCsv({}).split("\n").length === 9);
ok("payroll csv", ws.payrollCsv({}).split("\n").length > 50);
ok("MR csv", views.mrCsv({ pub: "bercy", date: "2026-09-30" }).split("\n").length > 20);

const inputs = {
  get_manager_report: { pub: "princess", date: "2026-09-26" }, get_cashup: { pub: "hophouse" }, get_club_frog: { by: "shift" },
  get_payment_modes: { week_start: "2026-09-21" }, search_docs: { query: "addition partagée Club Frog" }, get_kpis: { pub: "bercy", from: "2026-09-29", to: "2026-09-29" },
  get_bookings_day: { pub: "xvi", date: "2026-10-02" }, get_phone: { pub: "hophouse" }, get_open_points: { role: "finance" },
};

// process notes: every point has a status, attention points have methods or an open question
const proc = await import("../lib/processes.mjs");
const pts = proc.points({});
ok("open points", pts.length >= 30 && pts.every((p) => proc.STATUS[p.status] && p.problem && p.hub && p.source), `${pts.length} points, ${proc.summary().attention} to decide`);
ok("attention points say what to choose", pts.filter((p) => ["decide", "verify"].includes(p.status)).every((p) => p.options?.length >= 2 && p.recommended && p.decider));
actions.record("method", "P22", "a");
ok("method chosen", proc.points({}).find((p) => p.id === "P22").decision?.option === "a" && !proc.points({}).find((p) => p.id === "P22").attention);
actions.record("method", "P22", "undo");
const ws_ = await import("../lib/workspaces.mjs");
const linkOk = pts.flatMap((p) => p.links).every((l) => { const w = ws_.workspace(l.ws, { pub: l.pub }); return w.tabs.some((t) => t.id === l.tab); });
ok("open point links reach a tab", linkOk);
// bookings, menu, phone
const hubm = await import("../lib/hub.mjs");
const day = hubm.bookingDay({ pub: "xvi", date: "2026-10-03" });
ok("booking list: tables, darts, groups", day.items.length > 5 && day.items.every((b) => b.time && b.kind), `${day.items.length} bookings, ${day.totals.toValidate} to validate`);
const ch = hubm.setMenuPrice({ pub: "xvi", tap: 1, pint: 8, half: 4.5 });
auto.fire("menu.changed", ch);
ok("menu change goes to Zelty and Frog Space", hubm.menu({ pub: "xvi" }).lines[0].status === "In sync" && auto.outbox({ system: "Zelty + Frog Space" }).length === 1);
ok("AI receptionist pilot", hubm.phone({ pub: "hophouse" }).calls.length > 0 && hubm.phone({ pub: "xvi" }).calls.length === 0);
// checklists (Trail rebuilt): menu, ticks, waste to Yokitup
const ck = hubm.checklists({ pub: "rosbif", date: "2026-09-30" });
ok("checklists: every Trail section", ck.lists.length === 2 && ck.weekly.length === 7 && ck.temps.length >= 3 && ck.trace.length > 0 && ck.people.length > 0, `${ck.totals.done}/${ck.totals.total} items, ${ck.totals.wasteLines} waste lines`);
const todo = ck.lists[1].items.find((i) => !i.done) || ck.lists[0].items.find((i) => !i.done);
if (todo) { actions.record("check", `rosbif|2026-09-30|${todo.id}`, "done"); ok("tick a checklist item", hubm.checklists({ pub: "rosbif", date: "2026-09-30" }).lists.flatMap((l) => l.items).find((i) => i.id === todo.id).done); }
const w = hubm.addWaste({ pub: "rosbif", date: "2026-09-30", item: "glass-pint", qty: 2, reason: "Breakage" });
auto.fire("waste.added", { date: w.date, waste: w });
ok("waste goes to the Yokitup stock", auto.outbox({ system: "Yokitup", date: "2026-09-30" }).some((o) => o.title.includes("Pint glass")));
let badW = false; try { hubm.addWaste({ pub: "rosbif", item: "glass-pint", qty: 0, reason: "Breakage" }); } catch { badW = true; }
ok("waste rejects a bad quantity", badW);
for (const l of ["opening", "closing", "weekly", "temps", "trace", "waste"]) ok(`checklists menu: ${l}`, ws_.workspace("manager", { pub: "toulouse", list: l }).tabs.find((t) => t.id === "checklists").sections.length >= 4);
ok("Club Frog by shift manager", hubm.clubFrog({ pub: "bercy", by: "manager" }).rows.every((r) => !/\(GM\)/.test(r.key)));
for (const name of TOOL_NAMES) {
  const r = runTool(name, inputs[name] || {});
  ok(`tool ${name}`, !r.error, `${r.content.length} chars`);
}
ok("tool rejects bad pub", runTool("get_cashup", { pub: "london" }).error);
ok("tool rejects bad date", runTool("get_manager_report", { pub: "xvi", date: "2025-01-01" }).error);

const idx = rag.buildIndex();
ok("doc index", idx.chunks > 300, `${idx.chunks} passages`);
ok("retrieval: comptabilité matière", rag.search("amende comptabilité matière douane")[0]?.text.includes("1 500"));
ok("retrieval: Zenchef API", rag.search("Zenchef API abonnement Grow").some((x) => /Grow/.test(x.text)));

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
