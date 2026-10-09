// Process coverage: every pain point of the process notes (knowledge/pain-process.md),
// what Frog Hub does about it, and, where the notes give no direct solution, the methods
// to choose from. Those are the attention points shown on the platform.
//
// status: solved   the hub does it (prototype on demo data)
//         partial  the hub does part of it; `open` says what is left
//         pilot    the solution is chosen and is being tested
//         decide   no direct solution yet: pick a method below
//         verify   a fact must be checked with the team before building
//         out      outside the scope Frog gave us; shown so Frog can decide
//
// A decision on a method is recorded with actions.record("method", id, optionId).

import * as actions from "./actions.mjs";

export const STATUS = {
  solved: { label: "In Frog Hub", tone: "good" },
  partial: { label: "Partly covered", tone: "info" },
  pilot: { label: "Pilot to test", tone: "info" },
  decide: { label: "Method to choose", tone: "attention" },
  verify: { label: "To verify", tone: "attention" },
  out: { label: "Outside the scope", tone: "muted" },
};

// tabs of the process map, in its order
export const TABS = [
  "System landscape",
  "Manager Report (MR) & targets",
  "Weekly banking, tilrec & payment modes",
  "Stock, waste, inventory & beer duty",
  "Club Frog loyalty, CRM & participation KPI",
  "Marketing, website & booking attribution",
  "Head-office finance, purchases & projects",
];

const L = (label, ws, tab, pub) => ({ label, ws, tab, pub });

export const POINTS = [
  /* ---------- Tab 1 · System landscape ---------- */
  {
    id: "P01", tab: TABS[0], area: "Customer channels", system: "Phone · Retell AI", owner: "GMs · Tory", roles: ["manager", "ops", "ceo"],
    title: "Calls are not answered, before opening and during the rush",
    problem: "Guests call and nobody picks up. The notes ask for an AI receptionist that answers, books (bookings validated like any Zenchef booking), transfers to a person on request, calls guests the day before to confirm, and gives each manager the recap and transcripts of the calls.",
    status: "pilot",
    hub: "AI receptionist in pilot at Hop House and Rosbif since 17 Sept: calls staff did not take are answered, bookings land in the booking list to validate, groups go to Tory, and tables of 4 or more are called the day before. Each pub has a Phone tab with the recap and the transcripts.",
    open: "Test Retell AI on a real line (OVH forwarding after 4 rings), check the Zenchef write-back, then decide on the roll-out to the 6 other pubs.",
    links: [L("Phone, pub view", "manager", "phone", "hophouse"), L("Phone, all pubs", "ops", "phone")],
    options: [
      { id: "a", name: "Overflow only", how: "The AI answers only the calls staff do not pick up after 4 rings, and every call before opening.", pros: "Staff keep the relationship; low risk for the pilot.", cons: "Rush-hour callers wait 4 rings.", effort: "S" },
      { id: "b", name: "AI first, staff on request", how: "The AI answers every call and transfers when the guest asks for a person or for groups.", pros: "No call ever lost; staff are not interrupted during service.", cons: "Some regulars may dislike it; needs a good transfer flow.", effort: "M" },
    ],
    recommended: "a", decider: "Paul with the GMs of Hop House and Rosbif", source: "Tab 1 › Customer channels › Phone",
  },
  {
    id: "P02", tab: TABS[0], area: "Marketing tools", system: "GA4 · Zenchef · frogpubs.com (Define)", owner: "Liz · Sébastien", roles: ["marketing", "data"],
    title: "A booking click on the website is never joined to a Zenchef booking",
    problem: "GA4 sees the click on Book or on the phone number, then the guest leaves for Zenchef and the trace is lost. The site → Zenchef key is in place but returns nothing.",
    status: "decide",
    hub: "The hub compares clicks and website bookings per pub and per day (click → booking rate), not booking by booking.",
    open: "Choose how to join a click to its booking.",
    links: [L("Channels & attribution", "marketing", "channels")],
    options: [
      { id: "a", name: "Zenchef events into GA4", how: "Turn on the Zenchef widget's Google Analytics / Tag Manager integration so a confirmed booking is a GA4 conversion.", pros: "No development; conversions visible in Google Ads.", cons: "Depends on the Zenchef plan and the widget iframe; still no per-booking join in the hub.", effort: "S" },
      { id: "b", name: "Tracking key read back from the Zenchef API", how: "Define passes a click id (UTM + GA client id) in the widget link; the hub reads it on each booking from the Zenchef API and joins it to the GA4 click.", pros: "Booking-level truth: spend per booking and per channel.", cons: "Needs Define, the Zenchef Grow API and a check of why the current key is empty.", effort: "M" },
      { id: "c", name: "Statistical join in the hub", how: "Match clicks and bookings per pub in 15-minute windows.", pros: "Available now with the data the hub has.", cons: "An estimate, not a join.", effort: "S" },
    ],
    recommended: "b", decider: "Liz and Sébastien, with Define", source: "Tab 1 › Marketing tools › GA4 · Tab 1 › Zenchef #1",
  },
  {
    id: "P03", tab: TABS[0], area: "Marketing tools", system: "Zenchef · Google Ads · Meta", owner: "GMs · Liz · Paul", roles: ["marketing", "ceo", "ops", "manager"],
    title: "Managers close online bookings while Frog pays ads to send guests there",
    problem: "Some managers close bookings when they expect enough walk-ins. Frog keeps paying ads that send guests to a closed calendar, without knowing it. Tab 13 asks for an alert shown in the hub to Liz, Paul and everyone concerned.",
    status: "solved",
    hub: "Every closure is detected, shown on the pub's Tonight tab, emailed to Liz, Paul and the GM, and costed (booking clicks and ad spend during the closure) in Channels & attribution.",
    open: "Read the closures from the Zenchef API (availability) instead of the demo data; agree a rule with the GMs (e.g. keep 30 % open).",
    links: [L("Closures and ad spend", "marketing", "channels"), L("Today, Paul", "ceo", "today")],
    source: "Tab 1 › Marketing tools › GA4 · Tab 13 › Problem #2",
  },
  {
    id: "P04", tab: TABS[0], area: "Marketing tools", system: "Meta ads · OBY Pay", owner: "Emma · Liz", roles: ["marketing"],
    title: "A Meta ad cannot create a Club Frog account",
    problem: "Frog wants campaigns like \"leave your email for a free pint\", but there is no link Meta ads → OBY Pay. The notes suggest that a simple link may be enough.",
    status: "partial",
    hub: "The New leads automation turns each Meta lead or Typeform answer into an OBY Pay contact with its welcome offer (demo flow).",
    open: "Choose between a link and an API flow; the API flow needs OBY Pay's contact API.",
    links: [L("Acquisition", "marketing", "acquisition")],
    options: [
      { id: "a", name: "A tagged link to the OBY Pay sign-up page", how: "The ad points to the Club Frog sign-up page with a campaign tag; OBY Pay creates the account.", pros: "No integration; can go live this week.", cons: "Lower conversion (one more page); the hub only sees the tag.", effort: "S" },
      { id: "b", name: "Meta Lead Ads → hub → OBY Pay", how: "The lead form stays in Meta; a webhook sends it to the hub, which creates the contact in OBY Pay with consent.", pros: "Best conversion; each lead is counted per campaign.", cons: "Needs the OBY Pay contact API and a Meta app review.", effort: "M" },
    ],
    recommended: "a", decider: "Emma and Liz", source: "Tab 1 › Marketing tools › Meta ads · OBY Pay #3",
  },
  {
    id: "P05", tab: TABS[0], area: "Marketing tools", system: "Google Business Profile ×8", owner: "Liz · Sébastien", roles: ["marketing", "data"],
    title: "Bercy and Bordeaux show 0 % of bookings from Google",
    problem: "The other pubs get 7 to 40 % of bookings from Google, Bercy and Bordeaux none, with a high share from the website. Hypothesis: Google bookings are counted as website bookings. Nobody can see it today.",
    status: "verify",
    hub: "The hub flags both pubs and shows the raw Zenchef source of each booking, mapped to one channel list.",
    open: "Check the hypothesis before changing anything.",
    links: [L("Channels & attribution", "marketing", "channels")],
    options: [
      { id: "a", name: "Check Reserve with Google in the Zenchef Partners tab", how: "Look at both Zenchef accounts: is Reserve with Google switched on and mapped to the right source?", pros: "Ten minutes; may be the whole answer.", cons: "Does not explain the website share if it is on.", effort: "S" },
      { id: "b", name: "Tag the Book button of the Google profiles", how: "Add a UTM to the booking link of both Google Business Profiles and compare with the Performance API \"bookings\" figure.", pros: "Proves where Google bookings land.", cons: "Takes two to three weeks of data.", effort: "S" },
    ],
    recommended: "a", decider: "Sébastien", source: "Tab 1 › Marketing tools › Google Business Profile",
  },
  {
    id: "P06", tab: TABS[0], area: "Till & payment", system: "Nepting · Zelty", owner: "SMs · GMs · Accounting", roles: ["manager", "finance"],
    title: "Nepting is connected to nothing: card figures are reconciled by hand",
    problem: "Managers use Nepting every day for the right card figures (Zelty's are wrong), GMs every Monday, accountants to split payments.",
    status: "solved",
    hub: "Each terminal payment is matched to its Zelty bill and to the server who cashed it; wrong server codes, split bills and wrong payment modes are corrected; only the rare unmatched payment is left to the SM.",
    links: [L("Close of service", "manager", "close")],
    source: "Tab 1 › Pub – Till payment › Nepting",
  },
  {
    id: "P07", tab: TABS[0], area: "Till & payment", system: "Zelty · OBY Pay · Combo", owner: "Emma · GMs", roles: ["marketing", "manager"],
    title: "Share of bills linked to a Club Frog account, by pub, day, shift, server and manager",
    problem: "OBY Pay has the accounts and scans, Zelty all the bills; nobody combines them. Emma crosses scans, sales and rotas to know who is responsible for each bill, and wants the manager with the best rate (rotas from Combo). Also: the average number of members per bill.",
    status: "solved",
    hub: "One rate, measured the same way everywhere, by pub, day, shift, server and shift manager on the Combo rota, with the average number of members on a member bill.",
    open: "Read shift start and end times from Combo to split lunch and evening exactly (today: first SM lunch, second SM evening).",
    links: [L("Club Frog report", "marketing", "clubfrog"), L("This week, pub view", "manager", "week")],
    source: "Tab 1 › Zelty #1 · Tab 12 › Emma #2",
  },
  {
    id: "P08", tab: TABS[0], area: "Till & payment", system: "Zelty → MR · Combo → MR", owner: "SMs", roles: ["manager"],
    title: "Sales and staff are retyped into the Manager Report",
    problem: "Zelty figures (sales by product family) and Combo staff on shift are typed by hand at each MR.",
    status: "solved",
    hub: "The MR is pre-filled: hourly sales by beer, wet and food, targets, last week, staff and hours, payments, Club Frog and calls. The SM adds notes and sends.",
    links: [L("Close of service", "manager", "close")],
    source: "Tab 1 › Zelty #2 · Combo #1 · Tab 6",
  },
  {
    id: "P09", tab: TABS[0], area: "Till & payment", system: "Frog Space · Zelty", owner: "Tory · GMs", roles: ["manager", "ops"],
    title: "The beer list typed in Frog Space is typed again in Zelty",
    problem: "Beer menus entered in Frog Space are retyped by hand in Zelty. The notes propose one access point in Frog Hub where the manager changes the beer menu, sent to Zelty and Frog Space.",
    status: "solved",
    hub: "Beer menu tab per pub: Frog Space and Zelty side by side, lines out of sync flagged, one change sent to both.",
    open: "Zelty product API write access and a Frog Space import endpoint to confirm with Sébastien.",
    links: [L("Beer menu", "manager", "menu")],
    source: "Tab 1 › Zelty #3 · Frogspace #1",
  },
  {
    id: "P10", tab: TABS[0], area: "Till & payment", system: "Zenchef · BookingShake · OBY Pay", owner: "Emma", roles: ["marketing", "ops"],
    title: "Someone who books does not become a member",
    problem: "No link Zenchef → OBY Pay. The notes suggest an automatic \"become a member\" email after each booking, maybe with something free; creating the account automatically needs the guest's consent.",
    status: "partial",
    hub: "The day before the visit, every booker who is not a member receives an invitation; the account is created only when they accept. Conversions are counted per pub.",
    open: "Choose the offer attached to the invitation.",
    links: [L("Acquisition", "marketing", "acquisition")],
    options: [
      { id: "a", name: "Invitation only", how: "\"Join Club Frog and collect points from tonight.\"", pros: "No cost.", cons: "Lower take-up.", effort: "S" },
      { id: "b", name: "Invitation with a pint on the first visit", how: "The welcome pint is credited when the member scans on the night of the booking.", pros: "Gives a reason to scan at the till, which also lifts participation.", cons: "Costs one pint per new member.", effort: "S" },
      { id: "c", name: "Account created at booking, opt-out", how: "A box pre-ticked in the booking form.", pros: "Highest numbers.", cons: "Not valid consent under GDPR; not recommended.", effort: "M" },
    ],
    recommended: "b", decider: "Emma", source: "Tab 1 › OBY Pay #2 · Zenchef #3 · Tab 12 › #7",
  },
  {
    id: "P11", tab: TABS[0], area: "Till & payment", system: "Typeform · OBY Pay", owner: "Emma", roles: ["marketing"],
    title: "Survey answers are typed into OBY Pay by Emma",
    problem: "Typeform questionnaires are not linked to OBY Pay; Emma enters the results by hand (less urgent).",
    status: "partial",
    hub: "Typeform answers go through the New leads automation like Meta leads.",
    open: "Configure the Typeform webhook and the fields to store in OBY Pay.",
    links: [L("Acquisition", "marketing", "acquisition")],
    source: "Tab 1 › OBY Pay #4",
  },
  {
    id: "P12", tab: TABS[0], area: "Pub operations tools", system: "SimplyBook · Zenchef · BookingShake", owner: "GMs", roles: ["manager", "ops"],
    title: "Darts bookings are not in Zenchef: managers check two tools",
    problem: "SimplyBook darts bookings do not show in Zenchef. The notes ask for one booking list in the hub with every booking of the pub (colour by kind, guests, time), validation from the hub, and at least links to the other tools.",
    status: "solved",
    hub: "Tonight tab per pub: tables, darts and groups in one list by time, colour by kind, bookings to validate with Validate / Decline (written back to Zenchef), and a link to the tool that holds each booking.",
    open: "Write-back to SimplyBook and BookingShake once their APIs are open (today: link to the tool).",
    links: [L("Tonight", "manager", "tonight"), L("Bookings, all pubs", "ops", "bookings")],
    source: "Tab 1 › Zenchef #2",
  },
  {
    id: "P13", tab: TABS[0], area: "Pub operations tools", system: "Yokitup · Yooz", owner: "GMs · Accounting", roles: ["manager", "finance"],
    title: "Invoices are validated twice",
    problem: "When an invoice arrives in Yooz it should be checked against the Yokitup delivery note, with an alert on gaps, managers checking at first.",
    status: "solved",
    hub: "Each invoice is checked against its order, the quantity received and the agreed price; matching ones are approved in Yooz, the others go to the GM with Approve or Dispute (credit-note email written).",
    links: [L("This week, pub view", "manager", "week"), L("Finance to do", "finance", "todo")],
    source: "Tab 1 › Yokitup #1 · Yooz #1",
  },
  {
    id: "P14", tab: TABS[0], area: "Pub operations tools", system: "Trail · Yokitup", owner: "SMs · Kitchen · Tory", roles: ["manager", "ops", "data"],
    title: "Waste typed in Trail never reaches the Yokitup stock",
    problem: "Staff record breakage at the end of the shift in Trail; someone must change Yokitup by hand, otherwise the inventory is wrong. The notes give two solutions.",
    status: "decide",
    hub: "Method b is ready to test: a Checklists tab per pub rebuilds the Trail menu (opening, closing, weekly cleaning, temperatures, traceability, waste and breakage), signs every tick by person, and posts each waste line to the Yokitup stock.",
    open: "Choose between connecting Trail and replacing it. To replace it: load the pubs' real Trail lists into the templates, test in one kitchen pub and one bar pub, then end the Trail licence (~£600 a month).",
    links: [L("Checklists, pub view", "manager", "checklists"), L("Checklists, all pubs", "ops", "checklists")],
    options: [
      { id: "a", name: "Daily Trail export into Yokitup", how: "Each night the hub reads the waste lines from Trail and posts stock adjustments to Yokitup.", pros: "Nothing changes for the teams.", cons: "Needs a Trail export or API and Yokitup write access; two tools stay.", effort: "M" },
      { id: "b", name: "Replace Trail with a checklist in Frog Hub", how: "Waste, HACCP, opening and closing checklists move into the hub, which writes waste to Yokitup.", pros: "One tool less (~£600 a month), data typed once, one login for the SM, a view by person.", cons: "A change of habit for every pub; the real Trail lists must be loaded first (prototype: Pub team › Checklists).", effort: "M" },
    ],
    recommended: "a", decider: "Tory and the GMs", source: "Tab 1 › Yokitup #2",
  },
  {
    id: "P15", tab: TABS[0], area: "Pub operations tools", system: "HGEM · TripAdvisor · Yelp", owner: "GMs · Tory", roles: ["ops", "manager"],
    title: "Only Google reviews get an answer; TripAdvisor and Yelp are answered by hand",
    problem: "HGEM answers Google reviews only. The notes ask whether AI could connect to TripAdvisor and Yelp.",
    status: "decide",
    hub: "Nothing yet: the Reviews agent is in the backlog.",
    open: "Choose how replies are drafted and posted.",
    links: [L("Next agents", "delivery", "roadmap")],
    options: [
      { id: "a", name: "Drafts in the hub, posted by the GM", how: "The hub reads review notifications by email, drafts a reply in the pub's voice; the GM copies it in one click.", pros: "No API needed; works for both sites.", cons: "One manual step per review.", effort: "S" },
      { id: "b", name: "TripAdvisor owner API", how: "Post replies through TripAdvisor's management API.", pros: "Fully automatic.", cons: "Access is restricted and must be requested; Yelp has no reply API.", effort: "M" },
      { id: "c", name: "Ask HGEM", how: "Check whether HGEM can add TripAdvisor on Frog's plan.", pros: "One tool for all reviews.", cons: "Extra cost; depends on HGEM.", effort: "S" },
    ],
    recommended: "a", decider: "Tory", source: "Tab 1 › HGEM #1",
  },
  {
    id: "P16", tab: TABS[0], area: "Pub operations tools", system: "Combo → Silae (P2M)", owner: "Jean-Bernard", roles: ["finance"],
    title: "Who exports Combo hours to Silae each month, and how?",
    problem: "The notes say the monthly export to Silae is perhaps manual and must be checked: who does it and how.",
    status: "verify",
    hub: "The hub prepares the validated hours in the P2M import format and sends them on the last day of the month (prototype).",
    open: "Confirm the current process with Jean-Bernard and P2M before switching it on.",
    links: [L("Payroll", "finance", "payroll")],
    options: [
      { id: "a", name: "The hub sends the hours to P2M", how: "Validated Combo hours, in P2M's format, on the last day of the month.", pros: "Nobody in the middle; same file every month.", cons: "P2M must accept the file.", effort: "S" },
      { id: "b", name: "Keep Combo's export, the hub checks it", how: "Combo's native Silae export stays; the hub compares it with the validated hours and flags gaps.", pros: "No change for P2M.", cons: "The manual step stays.", effort: "S" },
    ],
    recommended: "a", decider: "Jean-Bernard", source: "Tab 1 › Combo #2",
  },
  {
    id: "P17", tab: TABS[0], area: "Pub Excel & paper", system: "Tilrec · Zelty · Nepting", owner: "GMs · SMs", roles: ["manager", "finance"],
    title: "The tilrec compares Zelty and Nepting for each cash-up by hand",
    problem: "Managers spend their time matching Zelty and Nepting figures for each staff cash-up.",
    status: "solved",
    hub: "Takings by staff and by payment mode come reconciled; the weekly banking file is pre-filled for each pub.",
    open: "Confirm with the GMs the exact figures they want on the tilrec.",
    links: [L("This week, pub view", "manager", "week"), L("Takings", "finance", "takings")],
    source: "Tab 1 › Tilrec #1 · Tab 7",
  },
  {
    id: "P18", tab: TABS[0], area: "Pub Excel & paper", system: "Comptabilité matière (beer duty ledger)", owner: "Jean-Bernard · Brewers", roles: ["finance"],
    title: "The beer duty ledger is sometimes not filled in",
    problem: "A crucial document (€1,500 per missing line at a customs control) is sometimes left empty. The notes have no solution.",
    status: "decide",
    hub: "The hub detects brews missing from the ledger and, in the prototype, writes each line when the brew sheet is saved in Frog Space.",
    open: "Choose where the line is created so it cannot be forgotten.",
    links: [L("Receivables & duty", "finance", "receivables")],
    options: [
      { id: "a", name: "The ledger is written from the brew sheet", how: "Each brew sheet saved in Frog Space creates its ledger line automatically.", pros: "Nothing to remember.", cons: "Relies on the brew sheet being filled in.", effort: "S" },
      { id: "b", name: "Brew sheet in Frog Hub", how: "Brewers record the brew in the hub; it cannot be saved without the ledger fields.", pros: "Complete by construction.", cons: "Brewers change tool.", effort: "M" },
      { id: "c", name: "Monthly check before the declaration", how: "Before the customs declaration, the hub compares brews, ledger and Zelty beer sales and lists gaps to Jean-Bernard.", pros: "Catches every gap, whatever the cause.", cons: "Gaps found late in the month.", effort: "S" },
    ],
    recommended: "a", decider: "Jean-Bernard", source: "Tab 1 › Comptabilité matière #1",
  },
  {
    id: "P19", tab: TABS[0], area: "Head office", system: "Corporate payment Excel · BookingShake · Bank", owner: "Tory", roles: ["ops", "finance"],
    title: "Tory chases the accountants to know who has paid",
    problem: "The shared payment Excel is rarely up to date; the notes ask to give Tory the payment confirmations.",
    status: "solved",
    hub: "Deposit and balance status come from the bank for every group event; reminders go out on their own 10 days before.",
    links: [L("Group events", "ops", "events")],
    source: "Tab 1 › Corporate payment excel",
  },
  {
    id: "P20", tab: TABS[0], area: "Accounting", system: "Zelty → Sage · Nepting", owner: "Accounting", roles: ["finance"],
    title: "Zelty data imported into Sage does not match",
    problem: "Zelty does not split payment modes correctly, so accountants look at Nepting side by side. The notes: link Nepting × Zelty first, then automate Zelty → Sage through it.",
    status: "solved",
    hub: "Takings are posted to Sage by pub and payment mode from terminal data, every morning at 05:00.",
    links: [L("Takings", "finance", "takings")],
    source: "Tab 1 › Sage #1",
  },
  {
    id: "P21", tab: TABS[0], area: "Accounting", system: "Paper meal vouchers · Sage", owner: "Accounting · SMs", roles: ["finance", "manager"],
    title: "Paper meal vouchers are counted and typed one by one",
    problem: "The notes propose a scan tool at the pub, a folder per day and pub, then the data into Sage, with accountants reviewing, especially at first.",
    status: "solved",
    hub: "The SM scans the vouchers at cash-up; each batch is read by issuer and amount, unreadable vouchers and batches not scanned go to accounting to review, then into the Sage entries.",
    open: "Choose the scanner (phone camera or desk scanner) with the pilot pub.",
    links: [L("Meal vouchers", "finance", "vouchers"), L("Close of service", "manager", "close")],
    source: "Tab 1 › Sage #2 · Tab 7 › Comptables",
  },
  {
    id: "P22", tab: TABS[0], area: "Accounting", system: "Bank · Sage", owner: "Accounting", roles: ["finance"],
    title: "Bank reconciliation is done by hand in Sage",
    problem: "The notes: see what is possible; ask for access and understand where the accountants get the data, in which form.",
    status: "decide",
    hub: "The hub already knows what should reach the bank each day (takings by payment mode and acquirer).",
    open: "Get access to Sage and the bank portals, then choose the method.",
    links: [L("Bank reconciliation", "finance", "bank")],
    options: [
      { id: "a", name: "Expected-settlement file for Sage", how: "Each day the hub writes what each acquirer should pay (CB, Amex, Conecs, cash deposits) in a file Sage can match against the bank statement.", pros: "Works with today's Sage; accountants keep control.", cons: "Matching stays in Sage.", effort: "M" },
      { id: "b", name: "Bank feed into the hub", how: "Bank statements arrive in the hub (EBICS or bank API), which proposes the matches and sends the lettering to Sage.", pros: "Almost no manual matching.", cons: "Bank contract and Sage v11 cloud migration first.", effort: "L" },
      { id: "c", name: "Only the gaps", how: "Keep the manual process; the hub lists the settlements that did not arrive.", pros: "Quick to deliver.", cons: "Saves less time.", effort: "S" },
    ],
    recommended: "a", decider: "Jean-Bernard, Stella and Sahira", source: "Tab 1 › Sage #3",
  },

  /* ---------- Tab 6 · Manager Report ---------- */
  {
    id: "P23", tab: TABS[1], area: "Shift managers", system: "Zelty X report", owner: "SMs", roles: ["manager"],
    title: "A report is printed every hour; if it is forgotten the data is lost",
    problem: "SMs print the X every hour for the hourly milestones; during the rush it is often impossible. The notes propose an hourly extraction and ask where to store it.",
    status: "solved",
    hub: "Nothing to print or store: the hub rebuilds every hour of the day from the time of each item in Zelty, so the milestones are complete even if nobody printed.",
    links: [L("Close of service", "manager", "close")],
    source: "Tab 6 › Print a report every hour",
  },
  {
    id: "P24", tab: TABS[1], area: "Shift managers", system: "Zelty · Target file", owner: "SMs", roles: ["manager"],
    title: "Sales by product family and monthly targets are copied by hand",
    problem: "Sales by wet, food and beer, and the targets from the monthly budget file, are copied into the MR.",
    status: "solved",
    hub: "Included in the pre-filled MR, and targets are sent to Combo every morning in HT.",
    links: [L("Close of service", "manager", "close")],
    source: "Tab 6 › Ventes classifiées · Target",
  },
  {
    id: "P25", tab: TABS[1], area: "Shift managers", system: "Manager Report", owner: "Paul · SMs", roles: ["manager", "ceo"],
    title: "Should the Manager Report go out on its own?",
    problem: "The notes list \"MR done automatically\" among the time savers. Today the SM adds notes and sends.",
    status: "decide",
    hub: "Every figure is pre-filled; the SM only adds feedback, incidents and comments.",
    open: "Decide what happens when the SM has not sent it.",
    links: [L("Today, Paul", "ceo", "today")],
    options: [
      { id: "a", name: "SM confirms and sends", how: "As today: the SM reads, adds notes and sends.", pros: "The SM owns the report and the notes.", cons: "Late or missing when the night was hard.", effort: "S" },
      { id: "b", name: "Sent at 11:00 if not sent", how: "Figures go to Paul at 11:00 the next morning, marked \"without SM notes\"; notes can follow.", pros: "Paul always has the figures.", cons: "Fewer notes from the SMs.", effort: "S" },
    ],
    recommended: "b", decider: "Paul", source: "Notes › Automations that can gain time",
  },

  /* ---------- Tab 7 · Weekly banking ---------- */
  {
    id: "P26", tab: TABS[2], area: "General manager", system: "Tilrec", owner: "GMs", roles: ["manager"],
    title: "The GM fills the tilrec from figures found everywhere",
    problem: "Card payments from Nepting, meal vouchers and the rest could be pre-filled.",
    status: "solved",
    hub: "The pub's week is pre-filled by payment mode in This week, with the banking file to download.",
    links: [L("This week, pub view", "manager", "week")],
    source: "Tab 7 › General Manager",
  },
  {
    id: "P27", tab: TABS[2], area: "Accountants", system: "Sage", owner: "Accounting", roles: ["finance"],
    title: "Accountants split the payments by hand",
    problem: "Payment modes are split by hand before posting.",
    status: "solved",
    hub: "The split comes from the terminals, vouchers and cash count; Sage entries are ready.",
    links: [L("Takings", "finance", "takings")],
    source: "Tab 7 › Comptables",
  },

  /* ---------- Tab 9 · Stock & beer duty ---------- */
  {
    id: "P28", tab: TABS[3], area: "Jean-Bernard", system: "Comptabilité matière · Zelty", owner: "Jean-Bernard", roles: ["finance"],
    title: "Beer brewed against beer sold is reconciled by hand",
    problem: "The data comes from the ledger and Zelty; once both are in the hub the reconciliation can be automated.",
    status: "partial",
    hub: "Brewed hectolitres per pub are compared with an estimate of hectolitres sold from beer sales.",
    open: "Map each Zelty product to its beer and volume (pint, half, pitcher) to reconcile beer by beer; add Yokitup stock.",
    links: [L("Receivables & duty", "finance", "receivables")],
    source: "Tab 9 › Jean-Bernard",
  },

  /* ---------- Tab 12 · Club Frog ---------- */
  {
    id: "P29", tab: TABS[4], area: "Club Frog members", system: "OBY Pay", owner: "Emma", roles: ["marketing"],
    title: "50,000 contacts, only 9,500 linked to a pub",
    problem: "The notes suggest contacting members not linked to a pub or not seen for a while, and say it is not our job, but we can help automate if Frog decides to.",
    status: "out",
    hub: "The hub knows the pub of every member who scanned at least once.",
    open: "Frog decides whether to act.",
    links: [L("Members", "marketing", "members")],
    options: [
      { id: "a", name: "Link each contact to the pub of its last scan", how: "The hub writes the pub of the most recent visit back to OBY Pay.", pros: "Every active member gets a pub, campaigns can be local.", cons: "Contacts who never scanned stay unlinked.", effort: "S" },
      { id: "b", name: "A campaign to unlinked contacts", how: "\"Which is your Frog?\" email with a pint at the chosen pub.", pros: "Reactivates dormant contacts.", cons: "Cost of the offer; email deliverability on an old base.", effort: "S" },
    ],
    recommended: "a", decider: "Emma", source: "Tab 12 › Club Frog members #1",
  },
  {
    id: "P30", tab: TABS[4], area: "Club Frog members", system: "OBY Pay · Zelty", owner: "Emma", roles: ["marketing"],
    title: "Count visits for \"buy 5, get 1\"",
    problem: "OBY Pay works with points only: no reward on a trigger, no visit count. The notes propose counting visits from the bills a member is linked to.",
    status: "partial",
    hub: "Visits are counted from the bills linked to each member; every 5th visit, a reward is prepared for OBY Pay as a points credit, after Emma's OK.",
    open: "OBY Pay must accept a points credit by API (or a daily file). Also choose what counts as a visit.",
    links: [L("Members", "marketing", "members")],
    options: [
      { id: "a", name: "One visit per day", how: "A day with at least one bill linked to the member counts once.", pros: "Splitting a bill does not earn two visits.", cons: "Lunch and dinner on the same day count once.", effort: "S" },
      { id: "b", name: "One visit per bill", how: "Each bill the member is linked to counts (the notes' proposal).", pros: "Simple to explain.", cons: "Three bills at one table count as three visits.", effort: "S" },
    ],
    recommended: "a", decider: "Emma", source: "Tab 12 › Club Frog members #2 and #3",
  },
  {
    id: "P31", tab: TABS[4], area: "Club Frog members", system: "OBY Pay", owner: "Emma", roles: ["marketing"],
    title: "A referral programme",
    problem: "Frog wants a referral system. The notes: not our job.",
    status: "out",
    hub: "Nothing planned.",
    open: "Ask OBY Pay whether referral exists on their side.",
    links: [],
    source: "Tab 12 › Club Frog members #4",
  },
  {
    id: "P32", tab: TABS[4], area: "Club Frog members", system: "Nepting · OBY Pay", owner: "Emma", roles: ["marketing"],
    title: "Recognise the member's card at payment",
    problem: "Frog wants the card used at payment to be linked to the loyalty account. The notes: not our job, but Nepting data could help if OBY Pay holds payment data.",
    status: "out",
    hub: "Nothing planned: it would need a card token shared by Nepting and OBY Pay.",
    open: "A question for OBY Pay and Market Pay (PCI-DSS, consent); Frog decides.",
    links: [],
    source: "Tab 12 › Club Frog members #5",
  },
  {
    id: "P33", tab: TABS[4], area: "Club Frog members", system: "SimplyBook · OBY Pay", owner: "Emma · GMs", roles: ["marketing", "manager"],
    title: "A discount on darts for members",
    problem: "Frog wants a link between SimplyBook and OBY Pay to give members a darts discount; they spoke of coding a link and it is not sure it is possible.",
    status: "decide",
    hub: "Darts bookings are in the hub, so are Club Frog members.",
    open: "Choose how the discount is checked.",
    links: [L("Tonight", "manager", "tonight")],
    options: [
      { id: "a", name: "Member code in SimplyBook", how: "Members get a promo code in their OBY Pay space; SimplyBook applies it.", pros: "No integration.", cons: "Codes get shared.", effort: "S" },
      { id: "b", name: "Hub matches the booking email", how: "The hub matches each darts booking email with the member list and shows \"member\" in the booking list; the discount is applied at the till.", pros: "No code to share; uses what the hub has.", cons: "The discount is applied by staff.", effort: "S" },
      { id: "c", name: "SimplyBook ↔ OBY Pay integration", how: "Code a link between both APIs.", pros: "Automatic.", cons: "Depends on both editors; the most effort.", effort: "L" },
    ],
    recommended: "b", decider: "Emma", source: "Tab 12 › Club Frog members #6",
  },
  {
    id: "P34", tab: TABS[4], area: "Club Frog members", system: "OBY Pay · Combo", owner: "Emma · GMs", roles: ["marketing", "manager"],
    title: "Staff no longer receive their credits",
    problem: "Staff should have half price on food and pints at €3. The notes give two ways.",
    status: "decide",
    hub: "The hub knows who is staff from Combo.",
    open: "Choose how staff accounts are kept.",
    links: [],
    options: [
      { id: "a", name: "A staff account type in OBY Pay", how: "OBY Pay creates a staff tier with the staff prices.", pros: "Simple, inside OBY Pay.", cons: "Leavers stay staff until someone removes them.", effort: "S" },
      { id: "b", name: "Staff list synced from Combo", how: "The hub reads staff from Combo each night and grants or removes the staff tier in OBY Pay.", pros: "Always up to date, leavers removed at once.", cons: "Needs the OBY Pay API.", effort: "M" },
    ],
    recommended: "b", decider: "Emma", source: "Tab 12 › Club Frog members #8",
  },
  {
    id: "P35", tab: TABS[4], area: "Emma", system: "OBY Pay · Zelty", owner: "Emma · GMs", roles: ["marketing", "manager"],
    title: "Emma builds the Monday Club Frog report for the GMs by hand",
    problem: "Data is hard to fetch; each GM should already have it. A report per pub combining OBY Pay and Zelty, a global view for Emma and Paul, filters by day, week and month.",
    status: "solved",
    hub: "Club Frog report with day / 7 days / month filters, by pub, shift, server and manager, and an email to each GM every Monday at 08:00.",
    links: [L("Club Frog report", "marketing", "clubfrog"), L("This week, pub view", "manager", "week")],
    source: "Tab 12 › Emma #1",
  },
  {
    id: "P36", tab: TABS[4], area: "Notes", system: "OBY Pay · Zelty", owner: "Emma", roles: ["marketing"],
    title: "A view of what members spend through the loyalty programme",
    problem: "Listed among the time savers: a view for client spending through the fidelity programme.",
    status: "solved",
    hub: "Members tab: what members spend, their share of revenue, spend bands and visits.",
    links: [L("Members", "marketing", "members")],
    source: "Notes › Automations that can gain time",
  },

  /* ---------- Tab 13 · Marketing ---------- */
  {
    id: "P37", tab: TABS[5], area: "Marketing", system: "frogpubs.com · Google · Instagram · ads", owner: "Liz", roles: ["marketing"],
    title: "Every link to Zenchef must be checked",
    problem: "Booking links are spread over the website, the 8 Google profiles, social media and ads; nobody knows which still work.",
    status: "decide",
    hub: "Nothing yet.",
    open: "Choose between a one-off audit and a weekly check.",
    links: [L("Channels & attribution", "marketing", "channels")],
    options: [
      { id: "a", name: "One-off audit by Liz", how: "A list of every booking link, checked by hand once.", pros: "Quick.", cons: "Out of date at the next campaign.", effort: "S" },
      { id: "b", name: "Weekly link check by the hub", how: "The hub opens each known link every Monday and flags broken links or links to the wrong pub.", pros: "Stays right over time.", cons: "The list of links must be kept up to date.", effort: "S" },
    ],
    recommended: "b", decider: "Liz", source: "Tab 13 › Problem #1",
  },

  /* ---------- Tab 18 · Head office finance ---------- */
  {
    id: "P38", tab: TABS[6], area: "Jean-Bernard", system: "Combo · Sage · ad accounts", owner: "Jean-Bernard · Paul", roles: ["ceo", "finance"],
    title: "A dashboard for Paul: staff cost, capex, marketing",
    problem: "Jean-Bernard wants a dashboard for Paul with staff cost, capex and marketing. The note stops there: the content is still to define.",
    status: "decide",
    hub: "Staff cost by pub and ad spend are in Paul's Costs tab; capex is not connected.",
    open: "Finish the brief with Jean-Bernard and choose the capex source.",
    links: [L("Costs", "ceo", "costs")],
    options: [
      { id: "a", name: "From Sage analytic accounts", how: "Capex (class 2) and marketing (623) by pub from a monthly Sage export.", pros: "One source, the accounting one.", cons: "Monthly, after closing.", effort: "M" },
      { id: "b", name: "From a projects sheet kept by Jean-Bernard", how: "The hub reads a shared sheet of projects, budgets and commitments.", pros: "Shows commitments before invoices.", cons: "A sheet to keep up to date.", effort: "S" },
    ],
    recommended: "a", decider: "Jean-Bernard and Paul", source: "Tab 18 › Jean-Bernard",
  },
];

const ATTENTION = new Set(["decide", "verify", "pilot", "out"]);
const decision = (p) => actions.get("method", p.id);

export function points({ role } = {}) {
  return POINTS.filter((p) => !role || p.roles.includes(role)).map((p) => {
    const d = decision(p);
    const chosen = d ? p.options?.find((o) => o.id === d.status) : null;
    return { ...p, statusLabel: STATUS[p.status].label, tone: STATUS[p.status].tone, decision: chosen ? { option: chosen.id, name: chosen.name, time: d.time } : null, attention: ATTENTION.has(p.status) && !chosen };
  });
}
export function summary(role) {
  const list = points({ role });
  const by = (s) => list.filter((p) => p.status === s).length;
  return { total: list.length, solved: by("solved"), partial: by("partial"), pilot: by("pilot"), decide: by("decide"), verify: by("verify"), out: by("out"), attention: list.filter((p) => p.attention).length, decided: list.filter((p) => p.decision).length };
}
export const optionIds = ["a", "b", "c", "d"];
