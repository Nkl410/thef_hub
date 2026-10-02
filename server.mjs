// Frog Hub: local server for the app, the hub API and Frog Copilot.
//   npm start            → http://localhost:3000
//   PORT=4000 npm start  → another port

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import * as hub from "./lib/hub.mjs";
import * as views from "./lib/views.mjs";
import * as workspaces from "./lib/workspaces.mjs";
import * as actions from "./lib/actions.mjs";
import * as automations from "./lib/automations.mjs";
import * as agents from "./lib/agents.mjs";
import * as rag from "./lib/rag.mjs";
import * as copilot from "./lib/copilot.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, "public");
const PORT = +process.env.PORT || 3000;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" };

// Read-only hub endpoints: the same functions the Copilot calls.
const DATA = {
  pubs: () => hub.listPubs(),
  kpis: (q) => hub.kpis(q),
  "manager-report": (q) => hub.managerReport(q),
  cashup: (q) => hub.cashup(q),
  guests: (q) => hub.guests(q),
  banking: (q) => hub.banking({ pub: q.pub, weekStart: q.week }),
  "club-frog": (q) => hub.clubFrog(q),
  invoices: (q) => hub.invoiceCheck(q),
  "beer-duty": (q) => hub.beerDuty(q),
  bookings: (q) => hub.bookings(q),
  corporate: (q) => hub.corporate(q),
  alerts: (q) => hub.alerts(q),
  definitions: () => hub.DEFINITIONS,
};

const send = (res, status, body, type = "application/json; charset=utf-8", extra = {}) => {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", ...extra });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const query = (url) => Object.fromEntries([...url.searchParams].filter(([, v]) => v !== ""));

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) { raw += chunk; if (raw.length > 20000) throw new Error("Request too large"); }
  return JSON.parse(raw || "{}");
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const p = url.pathname;
  try {
    if (p === "/api/meta") return send(res, 200, { ...views.meta(), workspaces: workspaces.WORKSPACES, copilot: copilot.llmStatus(), docs: rag.stats() });
    if (p.startsWith("/api/workspace/")) return send(res, 200, workspaces.workspace(p.slice(15), query(url)));
    if (p === "/api/action" && req.method === "POST") {
      const { type, id, status, notes } = await readJson(req);
      const entry = actions.record(type, id, status, typeof notes === "string" ? { notes: notes.slice(0, 3000) } : {});
      // people's actions are triggers too
      if (type === "mr" && status === "sent") { const [pub, date] = id.split("|"); automations.fire("mr.sent", { pub, date, notes: entry.notes }); }
      if (type === "invoice" && status === "disputed") automations.fire("invoice.disputed", { id });
      if (type === "invoice" && status === "approved") automations.fire("invoice.approved", { id });
      return send(res, 200, entry);
    }
    if (p === "/api/pulse" && req.method === "POST") return send(res, 200, agents.answerPulse(await readJson(req)));
    // automations
    if (p === "/api/automations") return send(res, 200, automations.list(query(url)));
    if (p === "/api/automations/builder") return send(res, 200, automations.BUILDER);
    if (p === "/api/automations/preview") return send(res, 200, automations.preview(url.searchParams.get("id"), url.searchParams.get("date") || undefined));
    if (p.startsWith("/api/automations/") && req.method === "POST") {
      const body = await readJson(req);
      const date = body.date || undefined;
      const verb = p.slice(17);
      if (verb === "config") {
        const c = automations.setConfig(body.id, body);
        if (c.enabled) automations.runOnce(body.id, date);
        return send(res, 200, c);
      }
      if (verb === "run") return send(res, 200, automations.run(body.id, date));
      if (verb === "decide") return send(res, 200, automations.decide(body.id, body.status));
      if (verb === "create") { const id = automations.create(body.spec || {}); return send(res, 200, { id, ...automations.runOnce(id, date) }); }
    }
    if (p === "/api/export/banking.csv") return send(res, 200, "﻿" + workspaces.bankingCsv(query(url)), "text/csv; charset=utf-8", { "Content-Disposition": "attachment; filename=banking-all-pubs.csv" });
    if (p === "/api/export/payroll.csv") return send(res, 200, "﻿" + workspaces.payrollCsv(query(url)), "text/csv; charset=utf-8", { "Content-Disposition": "attachment; filename=payroll-hours.csv" });
    if (p.startsWith("/api/view/")) return send(res, 200, views.view(p.slice(10), query(url)));
    if (p.startsWith("/api/data/")) {
      const fn = DATA[p.slice(10)];
      return fn ? send(res, 200, fn(query(url))) : send(res, 404, { error: "Unknown endpoint", endpoints: Object.keys(DATA) });
    }
    if (p === "/api/export/sage.csv") return send(res, 200, "﻿" + hub.sageExport({ pub: url.searchParams.get("pub") || undefined, weekStart: url.searchParams.get("week") }), "text/csv; charset=utf-8", { "Content-Disposition": "attachment; filename=sage-takings.csv" });
    if (p === "/api/export/mr.csv") return send(res, 200, "﻿" + views.mrCsv(query(url)), "text/csv; charset=utf-8", { "Content-Disposition": `attachment; filename=MR-${url.searchParams.get("pub")}-${url.searchParams.get("date") || ""}.csv` });
    if (p === "/api/docs/search") return send(res, 200, rag.search(url.searchParams.get("q") || "", 5));
    if (p === "/api/copilot" && req.method === "POST") {
      const { sessionId, message, reset } = await readJson(req);
      const sid = typeof sessionId === "string" && sessionId.length < 80 ? sessionId : crypto.randomUUID();
      if (reset) { copilot.reset(sid); return send(res, 200, { sessionId: sid, reset: true }); }
      if (typeof message !== "string" || !message.trim() || message.length > 4000) return send(res, 400, { error: "message must be a non-empty string (max 4000 chars)" });
      return send(res, 200, { sessionId: sid, ...(await copilot.ask(sid, message.trim())) });
    }
    if (p.startsWith("/api/")) return send(res, 404, { error: "Not found" });

    // static files
    const file = path.normalize(path.join(PUBLIC, p === "/" ? "index.html" : p));
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, "Not found", "text/plain");
    return send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || "application/octet-stream");
  } catch (e) {
    const status = /Unknown|No data|must be|too large|JSON|Action id|Decision|Threshold|Scores|role/.test(e.message) ? 400 : 500;
    if (status === 500) console.error(e);
    return send(res, status, { error: e.message });
  }
});

const idx = rag.buildIndex();
server.listen(PORT, () => {
  const llm = copilot.llmStatus();
  console.log(`Frog Hub running on http://localhost:${PORT}`);
  console.log(`Docs indexed: ${idx.chunks} passages from ${idx.sources.length} sources`);
  console.log(llm.available ? `Copilot: ${llm.model}` : `Copilot: demo mode (${llm.reason})`);
});
