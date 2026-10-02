# Frog Hub automations

## How automations work

An automation sends the right data to the right tool on its own. Each has a trigger (a time of day, an event in a pub, or a rule on the day figures), a destination (Combo, Sage, Yooz, OBY Pay, Zenchef, P2M, email, SMS, the beer duty ledger) and a mode: Auto sends straight away, Needs OK waits for a person (the GM for rotas and match nights, Emma for Club Frog campaigns). Every run is logged in Activity and every message is kept in the outbox with the exact data sent. Anyone can switch an automation off, change its mode, preview what it would send, run it now, or create a new one in the Automations workspace (When → Then → How).

## Daily targets to Combo

Trigger: Every day at 06:00. Sends to: Combo. Mode: automatic.

Combo compares staff cost with revenue. Targets arrive already in HT for the next 7 days, for every pub.

## Recommended rota to Combo

Trigger: Every day at 07:00 · next 7 days. Sends to: Combo. Mode: waits for the OK of GM.

Hours needed are computed from expected guests: same weekday over the last 4 weeks, matches picked in Fanzo and group bookings. The GM approves, Combo receives the draft rota.

## Match nights: Zenchef slots and staff

Trigger: When a GM picks a match in Fanzo. Sends to: Zenchef. Mode: waits for the OK of GM.

On match nights, table bookings are capped at 70 % between 19:30 and 22:30 to keep room for walk-ins, and the rota gets the extra hours.

## Takings to Sage

Trigger: Every day at 05:00. Sends to: Sage. Mode: automatic.

Takings are posted by pub and payment mode from terminal data, so the Zelty import no longer needs fixing.

## Matching invoices approved in Yooz

Trigger: When an invoice arrives in Yooz. Sends to: Yooz. Mode: automatic.

An invoice that matches its Yokitup order and the agreed price is approved without anyone opening it. The others go to the GM.

## Credit-note request to supplier

Trigger: When an invoice is disputed. Sends to: Email. Mode: automatic.

The email to the supplier is written from the invoice and the agreed price, and sent as soon as someone clicks Dispute.

## Manager Report to head office

Trigger: When the SM sends the Manager Report. Sends to: Email. Mode: automatic.

The report goes to Paul with the figures and the SM's notes, in the same format for every pub.

## Monthly hours to P2M (Silae)

Trigger: Last day of the month at 23:00. Sends to: P2M (Silae). Mode: automatic.

Validated Combo hours are sent to the payroll firm in its import format, without Jean-Bernard in the middle.

## Brews written to the beer duty ledger

Trigger: When a brew sheet is saved. Sends to: Beer duty ledger. Mode: automatic.

Each brew is written to the customs ledger the moment its sheet is saved: no line is ever missing.

## Deposit reminders

Trigger: Every day at 09:00 · events within 10 days. Sends to: BookingShake. Mode: automatic.

When a group deposit has not reached the bank 10 days before the event, the client gets the payment link again.

## Win back regulars (Club Frog)

Trigger: Every day at 10:00 · regulars unseen for 21 days. Sends to: OBY Pay. Mode: waits for the OK of Emma.

Members who came at least twice but not in the last 21 days get a pint on the house in their next OBY Pay message.

## Missed call → SMS with booking link

Trigger: When a call is missed. Sends to: OVH SMS. Mode: automatic.

A guest who could not get through receives the pub's booking link a minute later.

## New leads into Club Frog

Trigger: When a Meta lead or Typeform answer arrives. Sends to: OBY Pay. Mode: automatic.

Every email captured by an ad or a survey becomes a Club Frog contact with its welcome offer, without exports.

