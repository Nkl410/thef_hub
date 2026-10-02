# Central data hub: definitions and sources

## Why one definition per figure

Today each tool counts in its own way. Zelty dates a sale at table closing, OBY Pay counts scans but not manual Club Frog discounts, and each Zenchef account types the booking source differently. The hub writes one definition per figure, used by every screen, every export and Frog Copilot. When two numbers disagree, the hub shows both and explains the gap instead of picking one silently.

## Revenue and business day

Revenue is the sum of closed Zelty tickets, TTC. A service that runs after midnight belongs to the business day it started on, so a Friday night at Princess stays on Friday. Revenue HT is approximated as TTC divided by 1.2 until the VAT mapping per product is loaded from Zelty.

## Hourly milestones

The hub spreads each ticket's sales between the time the ticket was opened and the time it was closed, using item times from Zelty. Zelty's own reports count the whole ticket at table closing, which pushes lunch sales into the afternoon and evening sales after the service. The Manager Report uses the hub's milestones.

## Club Frog participation rate

Club Frog rate = tickets linked to a member ÷ all tickets, over the same period and pubs. A ticket is linked when an OBY Pay scan succeeded, or when staff applied the manual "Club Frog" discount after a failed scan. The two counts are shown separately so the gap between OBY Pay and Zelty is explained, not hidden. The group target is 20 %. Bar pubs and late-night service (Toulouse, Princess) structurally sit below it, because a scan takes about 40 seconds and one discount applies per pint.

## Staff attribution of payments

A card payment belongs to the staff who cashed it. The hub matches each Nepting payment to its Zelty ticket by amount and time, so a wrong server code typed on the terminal, or a table opened by someone else, no longer moves takings to the wrong person.

## Payment modes

Payment modes come from what really happened: Nepting and Market Pay for cards, Amex and meal cards (Conecs), the OCR of paper tickets resto, and cash counted at cash-up. The mode clicked in Zelty is kept for comparison. This split feeds the weekly banking (tilrec) and the Sage entries.

## Labour cost

Labour cost % = worked hours from Combo × loaded hourly rate ÷ revenue HT. Planned hours come from the published rota, worked hours from the validated hours.

## Booking channels

The raw "source" field of the 8 Zenchef accounts is mapped to six channels: Website, Reserve with Google, Phone, Walk-in, Groups (BookingShake), Darts (SimplyBook). Website booking clicks come from Google Analytics 4, calls and missed calls from the OVH call log.

## Data sources and refresh

| System | What the hub reads | How | Refresh |
| --- | --- | --- | --- |
| Zelty | Tickets, items with time, staff code, payments, discounts | REST API, signed webhooks | Real time |
| Nepting / Market Pay | Card payments, server code, settlements | Market Pay Hub API or settlement files | Every 15 min / daily |
| OBY Pay | Members, scans, points, campaigns | API or daily export (to confirm) | Daily |
| Combo | Rota, hours, staff cost | API ("People" offer) | Daily |
| Yokitup | Orders, receipts, stock, recipe cards | API or exports (requested) | Daily |
| Yooz | Invoices and validation status | REST API | Daily |
| Zenchef | Bookings, covers, source | API (Grow) | Hourly |
| BookingShake | Quotes, deposits, invoices | API or exports (requested) | Daily |
| Bank | Statements | Bank file | Daily |
| OVH | Calls and missed calls | OVH API | Daily |
| GA4 / Google Business Profile | Booking clicks, Reserve with Google | Google APIs | Daily |
| Frog Space | Menus, brew sheets | To define (internal tool) | Daily |
