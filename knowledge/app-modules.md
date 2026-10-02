# Frog Hub app: workspaces and who uses them

## How the app is organised

Frog Hub has one workspace per role, organised in tabs; a number on a tab shows what is left to do there. Each opens on what the hub has already done overnight (payments reconciled, reports pre-filled, invoices approved), then shows the few items that need a person, with the action right there. Every action can be undone for a few seconds. Clicking a row (an invoice, a server, an event) opens its details on the side; clicking a figure opens the tab that explains it; the ✦ Ask button sends a ready-made question to Frog Copilot. Decisions are shared: an invoice approved by a GM leaves the finance list too, and a Manager Report sent by a pub appears as received in Paul's view.

## Paul (CEO)

Group revenue for the day and the month against budget, average ticket, labour cost and Club Frog participation. A daily revenue chart, the month by pub against budget, and a table of the 8 pubs with the status of each Manager Report. "For your attention" lists business points only, such as a pub far from its budget or the group events of the week, each with a question ready for Frog Copilot.

## Finance (Jean-Bernard, Stella, Sahira)

Last week's takings reconciled for the 8 pubs, split by payment mode. Ready-to-download files: Sage entries, the banking file for all pubs and the payroll hours for P2M (Silae). Invoices that do not match their order or the agreed price are listed with Approve or Dispute with supplier; all others are approved automatically and duplicates are blocked. Group receivables, the beer duty ledger and payroll hours complete the page.

## Pub managers (GM and SM)

Pick a pub. Tabs: Close of service, Guests, Team, Invoices. The close of service is a guided list of four steps (cash-up, Manager Report, hours, invoices) with a progress bar; each step opens on what is left to do, and the Manager Report notes are saved as a draft while typing. Guests shows how customers consume: spend per guest, pints per guest, share of tickets with food, member against non-member spend, regulars coming back and how often, by moment of the day and by weekday, plus the best regulars and the servers with the highest spend per guest. Team shows takings by server, the Club Frog leaders and the rota of the day.

## Operations & events (Tory)

All bookings of the 8 pubs in one view, the upcoming group events with their payment status read from the bank, deposit reminders scheduled automatically (or sent now), covers booked by pub and bookings by channel.

## Marketing & CRM (Emma, Liz)

Club Frog participation measured the same way in every pub, by pub, by shift and by server, with member and non-member average spend. Booking channels by pub, website clicks against bookings, and Reserve with Google share.

## Data hub (Sébastien)

Every connector with its method (API, webhooks, daily file, OCR), its last sync and the records loaded. The automatic corrections applied to the data (payments credited to the right server, payment modes taken from the terminal, booking sources mapped to one channel list, duplicate invoices blocked) and the roll-out plan of the remaining connectors.

## Frog Copilot

An assistant for everyone, in French or English. It answers with live figures from the hub (by calling the same functions as the app) and with the company documentation: the audit, the process map, the KPI definitions and any SOP or software guide added to the knowledge base. Every answer names its sources. It does not invent figures: if a figure is not in the hub, it says which connector is missing.
