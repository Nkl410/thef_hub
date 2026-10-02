# Frog Hub

Prototype of the next step after the audit: an app that sits on Frog's central data hub, removes the manual work behind each friction point, and Frog Copilot, an assistant that answers with live hub figures and Frog's own documentation.

> The hub runs on a **demo dataset** generated from the audit (orders of magnitude, known anomalies). Staff names, tickets, invoices and clients are fictitious. Each collection is replaced by a connector when the APIs are opened.

## Run it

```bash
cd frog-hub-app
npm install
npm start            # http://localhost:3000
npm run check        # self-test: every screen, hub endpoint, Copilot tool and the doc index
```

Frog Copilot uses Claude (`claude-opus-5-5`) when credentials are available: `ANTHROPIC_API_KEY` in the environment, or a profile saved with `ant auth login`. Without credentials it runs in demo mode: it still answers with the hub figures and the matching documentation passages, without writing a sentence.

```bash
# PowerShell
$env:ANTHROPIC_API_KEY = "sk-ant-..."; npm start
```

## Workspaces

One workspace per role, organised in tabs (a number on a tab = items left to do). Each opens on what the hub did overnight, then lists the few items that need a person, with the action right there (Approve, Dispute, Checked, Send) and an Undo for a few seconds. Rows open a detail panel, figures jump to the tab that explains them, and ✦ Ask sends a ready-made question to Frog Copilot. Decisions are shared across workspaces.

| Workspace | For | What they find |
| --- | --- | --- |
| Paul | CEO | Group revenue vs budget, month by pub, the 8 pubs on the day with their Manager Report, business points for attention |
| Finance | Jean-Bernard, Stella, Sahira | Week reconciled by payment mode, Sage / banking / payroll files to download, invoices to review, receivables, beer duty ledger |
| Pub managers | GMs and SMs (pick a pub) | Guided close of service (cash-up, MR, hours, invoices), Guests (spend and pints per guest, food, regulars, best sellers per guest), Team, Invoices |
| Operations & events | Tory | Bookings for the 8 pubs, upcoming group events with payment status and reminders, channels |
| Marketing & CRM | Emma, Liz | Club Frog by pub, shift and server, member spend, booking channels and web conversion |
| Data hub | Sébastien | Connectors and last sync, automatic data corrections, roll-out of the remaining APIs |

Decisions are kept in memory in this prototype (reset when the server restarts).

## Agents and monthly delivery

Frog Hub is the "agents in production" step of an AI-native transformation: seven agents, each with one job from the audit, plugged into Frog's existing tools, plus a monthly delivery dashboard.

| Agent | Works for | Job | Autonomy |
| --- | --- | --- | --- |
| 🌙 Close-of-service | SMs, GMs | Cash-up reconciled, Manager Report pre-filled and sent, hours synced | Prepares, SM confirms |
| 🗓️ Rota (pilot) | GMs | Targets and recommended rota to Combo, match nights to Zenchef | Prepares, GM approves |
| 📦 Purchasing | GMs, accounting | Invoice ↔ order ↔ price, approvals in Yooz, credit-note requests | Acts alone on matches |
| 💶 Finance | Jean-Bernard, Stella, Sahira | Takings to Sage, banking file, payroll to P2M, beer duty ledger | Acts alone |
| 🐸 Club Frog (pilot) | Emma, Liz, GMs | One KPI, win-back offers and new leads into OBY Pay | Prepares, Emma approves |
| 🍻 Bookings & events | Tory, GMs | One booking view, deposit reminders, SMS after a missed call | Acts alone |
| ✦ Frog Copilot | Everyone | Answers on figures and procedures, with sources | Read-only |

**Delivery** (for Paul and Zuri): hours given back by team and by agent, euros protected, the delivery plan (delivered / pilot / next), the next agents ranked by impact (menu launch for 7 October first), a team pulse with a 30-second check-in, and the units behind every count (audit figures vs estimates to confirm).

## Automations

The hub does not only show data: it sends the right data to the right tool. Each automation is **When** (a time, an event in a pub, or a rule on the day's figures) → **What** (data computed by the hub) → **Where** (Combo, Sage, Yooz, OBY Pay, Zenchef, P2M, email, SMS, beer duty ledger), and runs **Auto** or **Needs OK**.

| Automation | When | Sends to | Mode |
| --- | --- | --- | --- |
| Daily targets | 06:00 | Combo (targets HT, next 7 days) | Auto |
| Recommended rota | 07:00 | Combo (draft hours from expected guests, matches, groups) | GM's OK |
| Match nights | Match picked in Fanzo | Zenchef (slots capped at 70 %) | GM's OK |
| Takings | 05:00 | Sage (entries by payment mode) | Auto |
| Matching invoices | Invoice arrives | Yooz (approved) | Auto |
| Credit-note request | Someone clicks Dispute | Email to the supplier | Auto |
| Manager Report | SM sends it | Email to Paul | Auto |
| Monthly hours | Last day of the month | P2M (Silae) | Auto |
| Brews | Brew sheet saved | Beer duty ledger | Auto |
| Deposit reminders | 09:00, events within 10 days | BookingShake payment link | Auto |
| Win back regulars | 10:00, unseen for 21 days | OBY Pay campaign | Emma's OK |
| Missed call | Call missed | SMS with booking link (OVH) | Auto |
| New leads | Meta lead or Typeform answer | OBY Pay contact | Auto |

The **Automations** workspace lists them all (switch on/off, change mode, Preview the exact data, Run now), shows what is **Waiting for OK**, the **Activity** of the day, everything **Sent to the tools** with its payload, and lets anyone create a new automation in three steps. Each role also has an Automations tab, and its approvals appear where they work (the GM's "Next week" step, Emma's Club Frog tab). People's actions are triggers too: sending an MR emails Paul, disputing an invoice emails the supplier.

Connectors are simulated in this prototype: the outbox shows exactly what would be sent to each tool.

## Frog Copilot

- **Live figures**: 11 tools call the same hub functions as the screens (`lib/hub.mjs`), so the app and the assistant always give the same number.
- **Documentation (RAG)**: `search_docs` searches the audit (`ClubFrog - Zuri.md`), the process map (every step, pain point and the systems register) and every `.md`/`.txt` file in `knowledge/`. Add SOPs and software guides there and restart.
- **Rules**: every figure comes from a tool call, every answer ends with its sources, and it answers in French or English.
- Model: `claude-opus-5-5`, effort `medium`, with server-side fallback on refusals (`fallbacks: "default"`). Conversations are kept server-side and only appended to.

## Structure

```
server.mjs          HTTP server: app, /api/view/*, /api/data/* (hub API), exports, /api/copilot
lib/data.mjs        demo dataset (to replace with connectors)
lib/hub.mjs         query layer: one definition per figure
lib/workspaces.mjs  one workspace per role, built from the hub
lib/actions.mjs     shared decisions (approve, dispute, send…)
lib/agents.mjs      the 7 agents, impact units, roadmap, next agents, team pulse
lib/automations.mjs automation engine: catalogue, triggers, approvals, activity log, outbox, builder
lib/views.mjs       detailed module views (/api/view) and the MR export
lib/rag.mjs         document index and BM25 search
lib/copilot.mjs     Claude + tools + demo mode
knowledge/          company documentation indexed by the Copilot
public/             front end
scripts/selftest.mjs
```

## From prototype to production

1. **Connectors**: replace `lib/data.mjs` with the hub database fed by the APIs listed in `knowledge/hub-definitions.md` (Zelty and Zenchef are ready; OBY Pay, Yokitup and BookingShake are waiting for answers).
2. **Retrieval**: keep the chunk format and replace BM25 with an embedding index once the knowledge base grows beyond a few hundred pages.
3. **Access**: sign-in with Google Workspace, and data scoped by role: a GM sees their pub, head office sees the group.
4. **Write-back**: post the validated MR to head office, push Sage entries, and send invoice validations back to Yooz.
