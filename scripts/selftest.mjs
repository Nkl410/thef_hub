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
};
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
