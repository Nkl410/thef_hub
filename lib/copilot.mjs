// Frog Copilot: Claude + tools on the central data hub + retrieval over company docs.
//
// The model never sees raw databases: it calls the same hub functions as the app
// (one definition per figure) and `search_docs` for procedures and context.
// Conversations are kept server-side and only ever appended to, so thinking
// blocks and tool turns are replayed unchanged on the next request.

import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import * as hub from "./hub.mjs";
import * as rag from "./rag.mjs";
import * as auto from "./automations.mjs";
import * as agentsMod from "./agents.mjs";
import * as processes from "./processes.mjs";

const MODEL = process.env.FROG_COPILOT_MODEL || "claude-opus-5-5";
const MAX_TOOL_ROUNDS = 8;
const MAX_RESULT_CHARS = 24000;

const SYSTEM = `You are Frog Copilot, the assistant of Frog Pubs, a group of 8 pubs in France: Bordeaux, British Library, Bercy, Rosbif, Toulouse, Princess, XVI and Hop House (ids: bordeaux, bl, bercy, rosbif, toulouse, princess, xvi, hophouse). Each pub has a general manager (GM), shift managers (SM, KSM) and staff. Head office: Paul (CEO), Tory (operations, corporate events, menus), Emma (CRM, Club Frog), Sébastien (IT), Liz (marketing consultant). Accounting: Jean-Bernard (CFO), Stella, Sahira.

You answer GMs, SMs, head office and accounting. You have two kinds of tools:
- Hub data tools (get_*): live figures from Frog's central data hub, which joins Zelty (till), Nepting (card terminals), OBY Pay (Club Frog), Combo (rota and hours), Yokitup (orders and stock), Yooz (invoices), Zenchef, SimplyBook and BookingShake (bookings), OVH (phones), GA4 and the bank. The latest closed business day is 2026-09-30; the hub holds 2026-09-01 to 2026-09-30.
- search_docs: Frog's documentation: the audit of the information system (stack, issues and API status per tool), the process map (who does what, with which tool, what breaks), the KPI definitions of the hub, and any SOP or software guide added to the knowledge base.

How to answer:
- Every figure you give comes from a hub tool called in this conversation. Never estimate, extrapolate or recall a figure. If no tool provides it, say which system or connector would.
- For procedures, tools, responsibilities and "why" questions, search the docs first, and quote the procedure as written there.
- Combine both when it helps: a figure plus the reason or the procedure behind it.
- Answer in the user's language (French or English). Lead with the answer in one or two sentences, then the detail. Use a small Markdown table to compare more than three items.
- Pub managers are busy: be short and concrete, name the pub, the day and the action.
- End with a line "Sources:" listing the hub tools you used (with pub and period) and the document titles you relied on.
- The prototype runs on a demo dataset shaped on the audit. If the user asks whether the figures are real, say they are demo figures until the connectors are live.`;

const S = (props, required = []) => ({ type: "object", properties: props, required, additionalProperties: false });
const PUB = { type: "string", description: "Pub id: bordeaux, bl, bercy, rosbif, toulouse, princess, xvi, hophouse" };
const DATE = (d) => ({ type: "string", description: `${d} (YYYY-MM-DD)` });

const TOOLS = [
  { name: "list_pubs", description: "List the pubs (id, name, GM, style, darts, brewing) and the period held by the hub.", input_schema: S({}), run: () => hub.listPubs() },
  { name: "get_kpis", description: "Revenue, target and gap, tickets, covers, average ticket, Club Frog rate and labour cost per pub over a period. Omit pub for all pubs.", input_schema: S({ pub: PUB, from: DATE("Start date"), to: DATE("End date") }), run: (i) => hub.kpis(i) },
  { name: "get_manager_report", description: "Pre-filled Manager Report of one pub for one business day: hourly milestones by beer/wet/food (by item time), Zelty milestones at table closing, target, last week, staff and hours, labour cost, payments, Club Frog rate, calls.", input_schema: S({ pub: PUB, date: DATE("Business day, default 2026-09-30") }, ["pub"]), run: (i) => hub.managerReport(i) },
  { name: "get_cashup", description: "Cash-up of one pub for one day: card takings per staff (Zelty by table opener, Nepting by typed code, hub by staff who cashed) and the list of lines to check with the reason.", input_schema: S({ pub: PUB, date: DATE("Business day, default 2026-09-30") }, ["pub"]), run: (i) => hub.cashup(i) },
  { name: "get_guests", description: "Guest habits for one pub or the group over a period (default last 4 weeks): spend per guest, pints per guest, share of tickets with food, party size, member vs non-member spend, regulars (repeat rate, days between visits, top members), by moment of the day, by weekday and, for one pub, by server.", input_schema: S({ pub: PUB, from: DATE("Start date"), to: DATE("End date") }), run: (i) => hub.guests(i) },
  { name: "get_payment_modes", description: "Weekly banking: payment-mode split per pub from terminals and real payments vs what was clicked in Zelty, with gaps. Weeks start on Monday.", input_schema: S({ pub: PUB, week_start: DATE("Monday of the week, e.g. 2026-09-21; default last week") }), run: (i) => hub.banking({ pub: i.pub, weekStart: i.week_start }) },
  { name: "get_club_frog", description: "Club Frog participation rate, OBY scans vs manual discounts, member vs non-member average spend, grouped by pub, shift, staff or day.", input_schema: S({ pub: PUB, from: DATE("Start date, default 7 days before 2026-09-30"), to: DATE("End date"), by: { type: "string", enum: ["pub", "shift", "staff", "manager", "day"], description: "manager = shift manager on the Combo rota" } }), run: (i) => hub.clubFrog(i) },
  { name: "get_bookings_day", description: "Every booking of one pub for one service day (tables from Zenchef, darts from SimplyBook, groups from BookingShake): time, guests, channel, taken by the AI receptionist, to validate, confirmation call result, and whether online bookings were closed. Days 2026-09-01 to 2026-10-07.", input_schema: S({ pub: PUB, date: DATE("Service day, default 2026-10-01") }, ["pub"]), run: (i) => hub.bookingDay(i) },
  { name: "get_phone", description: "Calls per pub (OVH): answered by the team, missed, answered by the AI receptionist pilot (Retell AI at Hop House and Rosbif), left without answer; the AI calls with outcome; confirmation calls and no-show rates.", input_schema: S({ pub: PUB, from: DATE("Start date"), to: DATE("End date") }), run: (i) => { const r = hub.phone(i); return { ...r, calls: r.calls.slice(0, 30) }; } },
  { name: "get_closures", description: "Evenings when a pub closed online bookings in Zenchef, with booking clicks and ad spend (Google Ads, Meta) during the closure.", input_schema: S({ pub: PUB, from: DATE("Start date"), to: DATE("End date") }), run: (i) => hub.closures(i) },
  { name: "get_member_visits", description: "Club Frog visits counted by the hub (a visit = a day with a bill linked to the member), 5th-visit rewards earned, members one visit away, and what members spend (bands, share of revenue).", input_schema: S({ pub: PUB, from: DATE("Start date"), to: DATE("End date") }), run: (i) => { const v = hub.visits(i); return { ...v, rewardList: v.rewardList.slice(0, 20), spend: hub.memberSpend(i) }; } },
  { name: "get_open_points", description: "Every pain point of the process notes (knowledge/pain-process.md) with its status in Frog Hub (in Frog Hub, partly covered, pilot, method to choose, to verify, outside the scope), what the hub does, what is still open, the methods to choose from with pros and cons, the recommended one, who decides and any method already chosen.", input_schema: S({ role: { type: "string", enum: ["manager", "ceo", "ops", "marketing", "finance", "data"], description: "Only the points of one team" } }), run: (i) => processes.points(i).map(({ id, title, status, statusLabel, system, owner, hub: h, open, options, recommended, decider, decision, source }) => ({ id, title, status: statusLabel, system, owner, hub: h, open, options, recommended, decider, decision, source })) },
  { name: "get_invoice_exceptions", description: "Invoices (Yooz) matched to orders (Yokitup) and agreed prices: counts auto-matched, and the exceptions to validate with the amount at stake.", input_schema: S({ pub: PUB }), run: (i) => hub.invoiceCheck(i) },
  { name: "get_beer_duty", description: "Comptabilité matière (customs beer ledger) for brewing pubs: brews, ledger lines, missing lines and the €1,500-per-line risk.", input_schema: S({ pub: PUB }), run: (i) => hub.beerDuty(i) },
  { name: "get_bookings", description: "Bookings and covers per pub and normalised channel (Website, Reserve with Google, Phone, Walk-in, Groups, Darts), website clicks, calls and missed calls.", input_schema: S({ pub: PUB, from: DATE("Start date"), to: DATE("End date") }), run: (i) => hub.bookings(i) },
  { name: "get_corporate_payments", description: "BookingShake corporate and group events with deposit and final-payment status read from the bank, and the action to take.", input_schema: S({ pub: PUB }), run: (i) => hub.corporate(i) },
  { name: "get_alerts", description: "Alerts of a business day across all pubs and modules (targets, cash-up, calls, invoices, beer duty, Club Frog, deposits).", input_schema: S({ date: DATE("Business day, default 2026-09-30") }), run: (i) => hub.alerts(i) },
  { name: "get_automations", description: "Automations of the hub (what is sent to which tool, when, auto or after an OK), what ran on a business day, what is waiting for approval, and the outbox (data sent to Combo, Sage, Yooz, OBY Pay, Zenchef, P2M, email, SMS). Optional system filter, e.g. Combo.", input_schema: S({ date: DATE("Business day, default 2026-09-30"), system: { type: "string", description: "Destination tool, e.g. Combo, Sage, Yooz, OBY Pay" } }),
    run: (i) => ({ automations: auto.list({ date: i.date }).map(({ id, name, system, trigger, mode, enabled, last, waiting }) => ({ id, name, system, trigger: trigger.label, mode, enabled, last, waiting })), activity: auto.activity({ date: i.date, system: i.system }).slice(0, 30), waiting: auto.approvals({ date: i.date }).filter((o) => !o.decided).map(({ title, system, detail }) => ({ title, system, detail })), outbox: auto.outbox({ date: i.date, system: i.system }).slice(0, 20).map(({ system, time, title }) => ({ system, time, title })) }) },
  { name: "get_agents", description: "Frog's AI agents and the monthly delivery: each agent's mission, status (live/pilot), autonomy, tools, impact this month (hours given back, € protected, with the basis of each count), plus hours by team, the roadmap, the next agents ranked by impact and the team pulse.", input_schema: S({ date: DATE("Business day, default 2026-09-30") }),
    run: (i) => { const A = agentsMod; const list = A.agents(i.date); return { agents: list.map(({ name, status, since, for: who, autonomy, mission, tools, hours, euros, items, waiting }) => ({ name, status, since, for: who, autonomy, mission, tools, hours, euros, waiting, impact: items.map(({ label, count, hours, euros, source, basis }) => ({ label, count, hours, euros, source, basis })) })), byTeam: A.byRole(list), roadmap: A.ROADMAP, nextAgents: A.BACKLOG, pulse: A.pulse() }; } },
  { name: "search_docs", description: "Search Frog's documentation (audit, process map, KPI definitions, SOPs, software guides). Returns the most relevant passages with their source.", input_schema: S({ query: { type: "string", description: "What to look for, in French or English" }, k: { type: "integer", description: "Number of passages, default 5" } }, ["query"]), run: (i) => rag.search(i.query, Math.min(Math.max(i.k || 5, 1), 8)) },
];
export const TOOL_NAMES = TOOLS.map((t) => t.name);
const BY_NAME = Object.fromEntries(TOOLS.map((t) => [t.name, t]));
const API_TOOLS = TOOLS.map(({ name, description, input_schema }) => ({ name, description, input_schema }));

export function runTool(name, input) {
  const tool = BY_NAME[name];
  if (!tool) return { error: true, content: `Unknown tool ${name}` };
  if (input === null || typeof input !== "object" || Array.isArray(input)) return { error: true, content: "Tool input must be an object" };
  try {
    let out = JSON.stringify(tool.run(input));
    if (out.length > MAX_RESULT_CHARS) out = out.slice(0, MAX_RESULT_CHARS) + ' …"[truncated: narrow the pub or period]"';
    return { error: false, content: out };
  } catch (e) {
    return { error: true, content: e.message };
  }
}

/* ---------- Claude client ---------- */

// The SDK only reports missing credentials on the first request, so look for them up front:
// an API key or token in the environment, or a profile saved by `ant auth login`.
const NO_CREDENTIALS = "No Anthropic credentials found (set ANTHROPIC_API_KEY or run `ant auth login`).";
const home = process.env.USERPROFILE || process.env.HOME || "";
const hasCredentials = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_PROFILE"].some((k) => process.env[k])
  || fs.existsSync(path.join(process.env.XDG_CONFIG_HOME || path.join(home, ".config"), "anthropic"));
let client = null, clientError = hasCredentials ? null : NO_CREDENTIALS;
if (hasCredentials) { try { client = new Anthropic(); } catch (e) { clientError = e.message; } }
export const llmStatus = () => ({ model: MODEL, available: !!client, reason: client ? null : clientError });

export const stats = { questions: 0 };
const sessions = new Map(); // sessionId -> Anthropic.Beta.BetaMessageParam[] (append-only)

export async function ask(sessionId, question) {
  stats.questions++;
  if (!client) return demoAnswer(question, llmStatus().reason);
  const messages = sessions.get(sessionId) || [];
  sessions.set(sessionId, messages);
  messages.push({ role: "user", content: question });
  const calls = [];

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        system: SYSTEM,
        cache_control: { type: "ephemeral" },
        tools: API_TOOLS,
        output_config: { effort: "medium" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        messages,
      });
      messages.push({ role: "assistant", content: response.content });

      if (response.stop_reason === "refusal") {
        return { answer: "I can't help with that request.", calls, mode: "llm", model: response.model };
      }
      const toolUses = response.content.filter((b) => b.type === "tool_use");
      if (response.stop_reason !== "tool_use" || !toolUses.length) {
        const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
        return { answer: text || "(no answer)", calls, mode: "llm", model: response.model, truncated: response.stop_reason === "max_tokens" };
      }
      if (round === MAX_TOOL_ROUNDS) break;
      const results = toolUses.map((tu) => {
        const r = runTool(tu.name, tu.input);
        calls.push({ name: tu.name, input: tu.input, error: r.error ? r.content : undefined });
        return { type: "tool_result", tool_use_id: tu.id, content: r.content, ...(r.error ? { is_error: true } : {}) };
      });
      messages.push({ role: "user", content: results }); // all results of one turn in one message
    }
    return { answer: "I stopped after too many lookups. Please narrow the question (one pub, one day).", calls, mode: "llm" };
  } catch (e) {
    // Leave the session consistent: drop it rather than replaying a half turn.
    sessions.delete(sessionId);
    if (e instanceof Anthropic.AuthenticationError) return demoAnswer(question, "The Anthropic credentials were rejected.");
    if (e instanceof Anthropic.RateLimitError) return { answer: "Copilot is rate limited, please retry in a minute.", calls, mode: "error" };
    if (e instanceof Anthropic.APIConnectionError) return demoAnswer(question, "The Anthropic API could not be reached.");
    if (e instanceof Anthropic.APIError) return { answer: `Copilot error (${e.status}): ${e.message}`, calls, mode: "error" };
    // Anything else comes from the client itself (e.g. credentials that cannot be resolved):
    // tool errors never reach here, runTool returns them to the model.
    client = null; clientError = `Claude unavailable: ${e.message.split(".")[0]}.`;
    return demoAnswer(question, clientError);
  }
}

export function reset(sessionId) { sessions.delete(sessionId); }

/* ---------- demo mode: retrieval + one hub call, no LLM ---------- */

const PUB_WORDS = [["bordeaux", "bordeaux"], ["british", "bl"], ["bl ", "bl"], ["bercy", "bercy"], ["rosbif", "rosbif"], ["toulouse", "toulouse"], ["princess", "princess"], ["xvi", "xvi"], ["hop house", "hophouse"], ["hophouse", "hophouse"]];
const INTENTS = [
  [/point|décid|decid|méthode|method|pain|process|trail|reconciliation|rapprochement/i, "get_open_points"], [/ferm|closed|closure|ad spend|publicité/i, "get_closures"],
  [/récompense|reward|visite|visit/i, "get_member_visits"], [/receptionist|réceptionniste|téléphone|phone|appel|call|transcript/i, "get_phone"], [/ce soir|tonight|réservations ce/i, "get_bookings_day"],
  [/manager report|\bmr\b|milestone/i, "get_manager_report"], [/cash.?up|caisse|nepting|écart|ecart/i, "get_cashup"],
  [/mode.* (de )?(paiement|règlement|reglement)|payment mode|banking|tilrec|sage/i, "get_payment_modes"], [/panier|par client|per guest|spend per|pinte|pint|habitu|regular|consomm/i, "get_guests"], [/club ?frog|fidélité|fidelite|oby|scan/i, "get_club_frog"],
  [/facture|invoice|yooz|yokitup|fournisseur|supplier|prix/i, "get_invoice_exceptions"], [/matière|matiere|douane|customs|brass|brew|duty/i, "get_beer_duty"],
  [/réservation|reservation|booking|zenchef|google|appel|call/i, "get_bookings"], [/corporate|acompte|deposit|bookingshake|groupe/i, "get_corporate_payments"],
  [/agent|delivery|impact|heures rendues|hours saved|roadmap|pulse/i, "get_agents"], [/automati|envoy|sent to|combo|trigger|déclench|outbox/i, "get_automations"], [/alerte|alert|aujourd|today|hier|yesterday/i, "get_alerts"], [/chiffre|revenue|ca |target|objectif|kpi/i, "get_kpis"],
];
function demoAnswer(question, reason) {
  const q = question.toLowerCase() + " ";
  const pub = (PUB_WORDS.find(([w]) => q.includes(w)) || [])[1];
  const intent = (INTENTS.find(([re]) => re.test(question)) || [])[1];
  const calls = [];
  let data = null;
  if (intent) {
    const needsPub = ["get_manager_report", "get_cashup", "get_bookings_day"].includes(intent);
    const input = needsPub ? { pub: pub || "xvi" } : pub && intent !== "get_open_points" ? { pub } : {};
    const r = runTool(intent, input);
    calls.push({ name: intent, input });
    if (!r.error) data = JSON.parse(r.content);
  }
  const docs = rag.search(question, 3);
  calls.push({ name: "search_docs", input: { query: question } });
  return { answer: null, demo: { reason, intent, data, docs }, calls, mode: "demo" };
}
