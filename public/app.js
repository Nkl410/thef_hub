/* Frog Hub front end: one workspace per role, organised in tabs.
   Routes: #/ws/<workspace>[/<pub>][?tab=<tab>&<filter>=<value>…] · #/definitions · #/api */

const $ = (s) => document.querySelector(s);
const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k instanceof Node ? k : String(k));
  return e;
};
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};
let META = null;
let WS = null; // current workspace payload
const state = { ws: store.get("frog-ws") || "manager", pub: store.get("frog-pub") || "xvi", agent: "close", tab: null, q: {}, date: null, page: "ws", pointsOpen: null };
const paramOf = (ws) => META.workspaces.find((w) => w.id === ws)?.param; // "pub" for the pub team, "agent" for an agent page

/* ---------- routing ---------- */

function parseHash() {
  const [path, query] = location.hash.replace(/^#\/?/, "").split("?");
  const [page, a, b] = path.split("/");
  const params = Object.fromEntries(new URLSearchParams(query || ""));
  const { tab = null, ...q } = params;
  if (page === "definitions" || page === "api") return { page };
  return { page: "ws", ws: META.workspaces.some((w) => w.id === a) ? a : state.ws, param: b, tab, q };
}
const wsHref = (ws, param, tab, q = {}) => {
  const k = paramOf(ws);
  const qs = new URLSearchParams(Object.entries({ tab, ...q }).filter(([, v]) => v != null && v !== "")).toString();
  return `#/ws/${ws}${k ? `/${param || state[k]}` : ""}${qs ? `?${qs}` : ""}`;
};
window.addEventListener("hashchange", () => render());

/* ---------- sidebar: roles grouped as Frog is organised ---------- */

function buildNav() {
  const nav = $("#nav"); nav.innerHTML = "";
  let group = null;
  for (const w of META.workspaces) {
    if (w.hidden) continue;
    if (w.group !== group) { group = w.group; nav.append(h("div", { class: "side-label" }, group)); }
    const current = state.page === "ws" && (state.ws === w.id || (state.ws === "agent" && w.id === "agents"));
    const badge = w.id === "points" && state.pointsOpen ? h("span", { class: "nav-badge" }, state.pointsOpen) : null;
    nav.append(h("a", { class: "navitem", href: wsHref(w.id), "aria-current": current ? "page" : null },
      h("span", { class: "mono" }, w.mono), h("span", { class: "nl" }, h("b", {}, w.label), h("small", {}, w.role)), badge));
    if (w.param === "pub") {
      const pick = h("div", { class: "pubpick" }, h("label", { for: "pub" }, "Pub"), pubSel);
      pick.hidden = !current;
      nav.append(pick);
    }
  }
  pubSel.value = state.pub;
}
let pubSel = null; // the pub selector, moved under "Pub team" in the sidebar

/* ---------- data ---------- */

async function getJSON(url, opts) {
  const res = await fetch(url, opts);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || res.statusText);
  return body;
}
const post = (url, body) => getJSON(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// keepScroll: refresh after an action without moving the page
async function render({ keepScroll = false } = {}) {
  const r = parseHash();
  state.page = r.page;
  if (r.page === "ws") {
    const k = paramOf(r.ws);
    const changed = r.ws !== state.ws || (k && r.param && r.param !== state[k]);
    state.ws = r.ws; if (k && r.param) state[k] = r.param; state.tab = r.tab || (changed ? null : state.tab);
    state.q = r.q;
    store.set("frog-ws", state.ws); store.set("frog-pub", state.pub);
  }
  buildNav();
  updateSuggestions();
  closeDrawer();
  if (r.page === "definitions") return renderDefinitions();
  if (r.page === "api") return renderApi();
  const y = window.scrollY;
  try {
    const q = new URLSearchParams({ date: state.date, pub: state.pub, agent: state.agent, ...state.q });
    WS = await getJSON(`/api/workspace/${state.ws}?${q}`);
    if (WS.nav && WS.nav.points !== state.pointsOpen) { state.pointsOpen = WS.nav.points; buildNav(); }
    renderWorkspace(WS);
    if (keepScroll) window.scrollTo(0, y);
    else if (state.q.focus) focusPoint(state.q.focus);
  } catch (e) {
    $("#page").innerHTML = ""; $("#page").append(h("div", { class: "card" }, "Could not load this workspace: " + e.message));
  }
}

/* ---------- workspace ---------- */

function setHeader(role, title, lede) {
  $("#role").textContent = role;
  $("#title").textContent = title;
  $("#lede").textContent = lede || "";
}

function renderWorkspace(w) {
  setHeader(w.id === "agent" ? "Programme · Agents & automations" : `${w.group} · ${w.role}`, w.greeting, w.text);
  const tab = w.tabs.find((t) => t.id === state.tab) || w.tabs[0];
  state.tab = tab.id;
  const tabs = $("#tabs"); tabs.innerHTML = "";
  for (const t of w.tabs) {
    tabs.append(h("a", { role: "tab", href: wsHref(state.ws, state.ws === "agent" ? state.agent : state.pub, t.id, t.id === tab.id ? state.q : {}), "aria-selected": String(t.id === tab.id) }, t.label, t.badge ? h("span", { class: "tab-badge" }, t.badge) : null));
  }
  const page = $("#page"); page.innerHTML = "";
  for (const s of tab.sections) page.append(section(s));
}

function section(s) {
  const el = SECTION[s.type]?.(s);
  if (!el) return h("div");
  if (s.id) el.id = "s-" + s.id;
  el.classList.add(s.span === "half" ? "half" : "full");
  return el;
}

const askBtn = (q) => (q ? h("button", { class: "ask", type: "button", title: "Ask Frog Copilot", onclick: () => ask(q) }, "Ask Copilot") : null);
const card = (s, ...kids) => h("section", { class: "card" },
  s.title ? h("div", { class: "card-head" }, h("h2", {}, s.title), h("div", { class: "card-tools" }, s.badge || null, askBtn(s.ask))) : null,
  s.note ? h("p", { class: "note" }, s.note) : null, ...kids);

async function act(item, a, btn) {
  if (a.copilot) return ask(a.copilot);
  if (a.href) { location.hash = a.href; return; }
  btn.disabled = true;
  if (item.type === "op") { // automation operation waiting for an OK
    await post("/api/automations/decide", { id: item.id, status: a.status });
    toast(a.toast || "Done");
    closeDrawer();
    return render({ keepScroll: true });
  }
  await post("/api/action", { type: item.type, id: item.id, status: a.status });
  toast(a.toast || "Done", async () => { await post("/api/action", { type: item.type, id: item.id, status: "undo" }); render({ keepScroll: true }); });
  render({ keepScroll: true });
}

const SECTION = {
  // summary strip: figures in one bordered row, the caption above
  hero(s) {
    return h("section", { class: "strip" }, s.label ? h("div", { class: "strip-label" }, s.label) : null,
      h("div", { class: "strip-row" }, s.counters.map((c) => h(c.href ? "a" : "div", { class: "counter" + (c.href ? " link" : ""), href: c.href || null }, h("b", {}, c.value), h("span", {}, c.label)))));
  },
  notice(s) {
    return h("section", { class: `notice ${s.tone || "info"}` }, h("div", {}, h("b", {}, s.title), s.text ? h("p", {}, s.text) : null),
      s.link ? h("a", { class: "notice-link", href: s.link.href }, s.link.label) : null);
  },
  // segmented filters that live in the URL, so a filtered view can be shared
  filters(s) {
    return h("section", { class: "filters" }, s.items.map((f) => h("div", { class: "filter" }, h("span", { class: "label" }, f.label),
      h("div", { class: "seg", role: "group", "aria-label": f.label }, f.options.map(([v, l]) => h("a", { href: wsHref(state.ws, state.pub, state.tab, { ...state.q, [f.param]: v, focus: undefined }), "aria-pressed": String(v === f.value) }, l))))));
  },
  agenda(s) {
    const total = s.groups.reduce((n, g) => n + g.items.length, 0);
    if (!total) return card(s, h("p", { class: "empty" }, s.empty));
    const legend = h("div", { class: "legend kinds" }, [["table", "Table · Zenchef"], ["darts", "Darts · SimplyBook"], ["group", "Group · BookingShake"], ["phone", "Taken by the AI receptionist"]].map(([k, l]) => h("span", {}, h("i", { class: `k-${k}` }), l)));
    return card({ ...s, badge: legend }, ...s.groups.map((g) => h("div", { class: "ag-group" },
      h("div", { class: "ag-group-head" }, h("span", { class: "label" }, g.label), g.covers != null ? h("span", { class: "muted" }, `${g.covers} guests`) : null),
      h("ul", { class: "agenda" }, g.items.map((i) => h("li", { class: `k-${i.kindLabel === "Phone" ? "phone" : i.kind}${i.done ? " is-done" : ""}${i.cancelled ? " is-cancelled" : ""}` },
        h("span", { class: "a-time" }, i.time),
        h("span", { class: "a-kind" }, i.kindLabel),
        h("div", { class: "a-main" }, h("b", {}, i.title), h("small", {}, i.meta), i.tags.length ? h("div", { class: "a-tags" }, i.tags.map(chipEl)) : null),
        h("div", { class: "q-act" }, i.done ? h("span", { class: "done-label" }, i.done.label) : i.actions.map((a) => {
          const btn = h("button", { class: a.style === "primary" ? "primary" : "ghost", type: "button" }, a.label);
          btn.addEventListener("click", () => act(i, a, btn));
          return btn;
        }))))))));
  },
  // waste typed once at the end of the shift, posted to the Yokitup stock
  wasteform(s) {
    const item = h("select", { "aria-label": "Item" }, s.items.map(([k, l]) => h("option", { value: k }, l)));
    const qty = h("input", { type: "number", min: "1", max: "200", step: "1", value: "1", "aria-label": "Quantity", style: "width:90px;min-width:0" });
    const reason = h("select", { "aria-label": "Reason" }, s.reasons.map((r) => h("option", { value: r }, r)));
    const add = h("button", { class: "primary", type: "button" }, "Record and send to Yokitup");
    add.addEventListener("click", async () => {
      add.disabled = true;
      try {
        const w = await post("/api/waste", { pub: s.pub, date: s.date, item: item.value, qty: +qty.value, reason: reason.value });
        toast(`${w.qty} ${w.unit} ${w.itemName}: out of the Yokitup stock`);
        render({ keepScroll: true });
      } catch (e) { toast(e.message); add.disabled = false; }
    });
    return card(s, h("div", { class: "b-row" }, item, qty, reason, add));
  },
  menu(s) {
    const tone = { "In sync": "good", "Price differs in Zelty": "attention", "Missing in Zelty": "bad" };
    const money = (x) => (x == null ? "—" : `€${x.toFixed(2)}`);
    const rows = s.lines.map((l) => {
      const pint = h("input", { type: "number", step: "0.5", min: "2", max: "20", value: l.frogSpace.pint, "aria-label": `${l.beer} pint price` });
      const half = h("input", { type: "number", step: "0.5", min: "2", max: "20", value: l.frogSpace.half, "aria-label": `${l.beer} half price` });
      const save = h("button", { class: l.status === "In sync" ? "ghost" : "primary", type: "button" }, l.status === "In sync" ? "Save" : "Send to both");
      save.addEventListener("click", async () => {
        save.disabled = true;
        try { await post("/api/menu", { pub: s.pub, tap: l.tap, pint: +pint.value, half: +half.value }); toast(`${l.beer}: sent to Zelty and Frog Space`); render({ keepScroll: true }); }
        catch (e) { toast(e.message); save.disabled = false; }
      });
      return h("tr", {}, h("td", { class: "muted" }, l.tap), h("td", {}, h("b", {}, l.beer), h("small", { class: "sub" }, `${l.style} · ${l.abv} %${l.house ? " · Frog beer" : ""}`)),
        h("td", {}, pint), h("td", {}, half), h("td", { class: l.status === "In sync" ? "muted" : "attention" }, l.zelty ? `${money(l.zelty.pint)} / ${money(l.zelty.half)}` : "not on the till"),
        h("td", {}, chipEl({ chip: l.status, tone: tone[l.status] })), h("td", {}, save));
    });
    return card(s, h("div", { class: "tw", style: "max-height:none" }, h("table", { class: "menu-table" },
      h("thead", {}, h("tr", {}, ["Tap", "Beer", "Pint", "Half", "In Zelty today", "Status", ""].map((c) => h("th", {}, c)))), h("tbody", {}, rows))));
  },
  points(s) {
    if (!s.items.length) return card(s, h("p", { class: "empty" }, s.empty || "No open point."));
    const one = (p) => {
      const d = h("details", { class: `point ${p.attention ? "open-point" : ""}`, id: `pt-${p.id}` },
        h("summary", {}, h("span", { class: "pt-id" }, p.id),
          h("div", { class: "pt-txt" }, h("b", {}, p.title), h("small", {}, `${p.system} · ${p.owner}`)),
          chipEl({ chip: p.decision ? `Chosen: ${p.decision.name}` : p.statusLabel, tone: p.decision ? "good" : p.tone })),
        h("div", { class: "pt-body" },
          h("dl", { class: "dr-fields" },
            h("dt", {}, "The problem"), h("dd", {}, p.problem),
            h("dt", {}, "Frog Hub today"), h("dd", {}, p.hub),
            p.open ? h("dt", {}, "Still open") : null, p.open ? h("dd", {}, p.open) : null,
            h("dt", {}, "Source"), h("dd", { class: "muted" }, `pain-process.md · ${p.source}`)),
          p.links.length ? h("div", { class: "actions" }, p.links.map((l) => h("a", { class: "btn", href: wsHref(l.ws, l.pub, l.tab) }, `Open ${l.label}`))) : null,
          p.options?.length ? h("div", {}, h("h3", { class: "sub" }, `Methods to choose from · decided by ${p.decider}`),
            h("div", { class: "options" }, p.options.map((o) => {
              const chosen = p.decision?.option === o.id;
              const btn = chosen
                ? h("button", { class: "ghost", type: "button", onclick: async () => { await post("/api/action", { type: "method", id: p.id, status: "undo" }); render({ keepScroll: true }); } }, "Undo the choice")
                : h("button", { class: p.decision ? "ghost" : "primary", type: "button", onclick: async () => { await post("/api/action", { type: "method", id: p.id, status: o.id }); toast(`${p.id}: ${o.name} chosen`); render({ keepScroll: true }); } }, "Choose this method");
              return h("article", { class: "option" + (chosen ? " chosen" : "") },
                h("div", { class: "op-head" }, h("span", { class: "op-id" }, o.id.toUpperCase()), h("b", {}, o.name), p.recommended === o.id ? chipEl({ chip: "Recommended", tone: "info" }) : null, h("span", { class: "chip muted" }, `effort ${o.effort}`)),
                h("p", {}, o.how), h("p", { class: "pc" }, h("span", { class: "label" }, "For"), " ", o.pros), h("p", { class: "pc" }, h("span", { class: "label" }, "Against"), " ", o.cons), btn);
            }))) : null));
      d.addEventListener("toggle", () => { if (d.open) state.lastPoint = p.id; });
      if (state.lastPoint === p.id || state.q.focus === p.id) d.open = true;
      return d;
    };
    if (!s.grouped) return card(s, h("div", { class: "point-list" }, s.items.map(one)));
    const by = {};
    for (const p of s.items) (by[p.tab] ||= []).push(p);
    return h("section", { class: "point-groups" }, Object.entries(by).map(([tab, list]) => card({ title: tab, badge: h("span", { class: "muted" }, `${list.length} point${list.length > 1 ? "s" : ""}`) }, h("div", { class: "point-list" }, list.map(one)))));
  },
  kpis(s) {
    return h("section", { class: "kpis" }, s.items.map((t) => {
      const kids = [h("div", { class: "l" }, t.label), h("div", { class: "v" }, t.value), t.sub ? h("div", { class: "s" }, t.sub) : null];
      return t.tab ? h("a", { class: `kpi link ${t.tone || ""}`, href: wsHref(state.ws, state.pub, t.tab), title: "See the detail" }, ...kids, h("span", { class: "kpi-go" }, "→")) : h("div", { class: `kpi ${t.tone || ""}` }, ...kids);
    }));
  },
  flow(s) {
    const done = s.steps.filter((x) => x.state === "done").length;
    const remembered = store.get(`frog-step-${state.pub}`);
    const openId = s.steps.find((x) => x.id === remembered && x.state !== "done")?.id || s.steps.find((x) => x.state !== "done")?.id;
    const box = h("section", { class: "card flow" },
      h("div", { class: "card-head" }, h("h2", {}, s.title), h("span", { class: done === s.steps.length ? "allclear" : "progress-label" }, done === s.steps.length ? "Service closed" : `${done} of ${s.steps.length} done`)),
      h("div", { class: "progress" }, h("div", { style: `width:${(100 * done) / s.steps.length}%` })));
    if (done === s.steps.length) box.append(h("p", { class: "clear" }, "Everything is closed for tonight."));
    for (const [n, st] of s.steps.entries()) {
      const open = st.id === openId && st.sections.length;
      const d = h("details", { class: `step ${st.state}`, open: open || null },
        h("summary", { class: st.sections.length ? "" : "static" }, h("span", { class: "ci" }, n + 1), h("div", { class: "st-txt" }, h("b", {}, st.label), h("p", {}, st.text)), h("span", { class: `badge ${st.state}` }, st.badge)),
        st.sections.length ? h("div", { class: "step-body" }, st.sections.map((x) => SECTION[x.type](x, true))) : null);
      d.addEventListener("toggle", () => { if (d.open) store.set(`frog-step-${state.pub}`, st.id); });
      box.append(d);
    }
    return box;
  },
  queue(s, inline) {
    const open = s.items.filter((i) => !i.done);
    const badge = s.neutral ? h("span", { class: "chip muted" }, `${s.items.length} ${s.neutral}`) : open.length ? h("span", { class: "count" }, `${open.length} to do`) : h("span", { class: "allclear" }, "No action needed");
    const head = inline ? {} : { ...s, badge };
    if (!s.items.length) return card(head, h("p", { class: "clear" }, s.empty));
    const limit = s.limit || 6;
    const items = [...open, ...s.items.filter((i) => i.done)]; // done items sink to the bottom
    const list = h("ul", { class: "queue" }, items.map((i, n) => h("li", { class: (i.done ? "is-done" : "") + (i.drawer ? " has-drawer" : ""), hidden: n >= limit ? true : null, "data-extra": n >= limit ? "1" : null },
      h("div", { class: "q-main", onclick: i.drawer ? () => openDrawer(i.drawer, i) : null, tabindex: i.drawer ? "0" : null, onkeydown: i.drawer ? (e) => { if (e.key === "Enter") openDrawer(i.drawer, i); } : null },
        h("b", {}, i.title), i.meta ? h("small", {}, i.meta) : null, i.detail ? h("p", {}, i.detail) : null, i.status ? chipEl(i.status) : null),
      i.amount ? h("div", { class: "q-amt" }, i.amount) : null,
      h("div", { class: "q-act" }, i.done ? h("span", { class: "done-label" }, i.done.label) : (i.actions || []).map((a) => {
        const btn = h("button", { class: a.style === "primary" ? "primary" : "ghost", type: "button" }, a.label);
        btn.addEventListener("click", () => act(i, a, btn));
        return btn;
      })))));
    const rest = items.length - limit;
    const more = rest > 0 ? h("button", { class: "more", type: "button", onclick: () => { list.querySelectorAll("li[data-extra]").forEach((li) => (li.hidden = false)); more.remove(); } }, `Show ${rest} more`) : null;
    return card(head, list, more);
  },
  line(s) { return card(s, chart(s)); },
  bars(s) {
    const max = Math.max(...s.items.map((i) => Math.max(i.value, i.target || 0))) || 1;
    const min = Math.min(...s.items.map((i) => i.value));
    // close values without a target: zoom on the range so differences stay visible
    const zoom = !s.items.some((i) => i.target) && min / max > 0.7;
    const w = (v) => (zoom ? 25 + (75 * (v - min)) / (max - min || 1) : (100 * v) / max);
    return card(s, h("div", { class: "bars" }, s.items.map((i) => h("div", { class: "bar-row" },
      h("span", { class: "bl" }, i.label),
      h("div", { class: "track" }, h("div", { class: "fill" + (i.target && i.value >= i.target ? " met" : ""), style: `width:${w(i.value)}%` }), i.target ? h("div", { class: "mark", style: `left:${(100 * i.target) / max}%`, title: "Target" }) : null),
      h("span", { class: "bv" }, i.text)))));
  },
  table(s) { return card(s, table(s.cols, s.rows)); },
  downloads(s) {
    return card(s, h("div", { class: "downloads" }, s.items.map((d) => h("a", { class: "dl", href: d.href, onclick: () => toast(`Downloading ${d.label}`) }, h("span", { class: "dl-i" }, "CSV"), h("span", {}, h("b", {}, d.label), h("small", {}, d.note))))));
  },
  form(s) {
    if (s.sent) return h("div", { class: "form" }, h("p", { class: "note" }, `Sent to head office at ${s.sent.at} with your notes.`), s.sent.notes ? h("pre", { class: "sent-notes" }, s.sent.notes) : null, h("div", { class: "actions" }, h("a", { class: "btn", href: s.export }, "Download the report (CSV)")));
    const key = `frog-mr-${s.pub}-${s.date}`;
    let draft = {};
    try { draft = JSON.parse(store.get(key) || "{}"); } catch { draft = {}; }
    const saved = h("span", { class: "note", style: "margin:0" });
    const fields = s.fields.map((f) => {
      const ta = h("textarea", { rows: 2, placeholder: "Optional" });
      ta.value = draft[f] || "";
      ta.addEventListener("input", () => { draft[f] = ta.value; store.set(key, JSON.stringify(draft)); saved.textContent = "Draft saved"; });
      return h("label", {}, f, ta);
    });
    const send = h("button", { class: "primary", type: "button", onclick: async () => {
      const notes = s.fields.map((f) => `${f}: ${(draft[f] || "").trim() || "—"}`).join("\n");
      send.disabled = true;
      await post("/api/action", { type: "mr", id: `${s.pub}|${s.date}`, status: "sent", notes });
      store.set(key, "{}");
      toast("Manager Report sent to head office", async () => { await post("/api/action", { type: "mr", id: `${s.pub}|${s.date}`, status: "undo" }); render({ keepScroll: true }); });
      render({ keepScroll: true });
    } }, "Send to head office");
    return h("div", { class: "form" }, fields, h("div", { class: "actions" }, send, h("a", { class: "btn", href: s.export }, "Download (CSV)"), saved));
  },
  connectors(s) {
    return card(s, h("div", { class: "conn-grid" }, s.groups.map((g) => h("div", { class: "conn-group" }, h("h3", {}, g.group),
      g.items.map((c) => h("div", { class: "conn" }, h("span", { class: `live ${c.state}` }), h("div", {}, h("b", {}, c.name), h("small", {}, `${c.method} · ${c.records}`)), h("span", { class: "conn-t" }, c.sync)))))));
  },
  tasks(s) {
    return card(s, h("ul", { class: "tasks" }, s.items.map((t) => h("li", {}, h("div", {}, h("b", {}, t.title), h("p", {}, t.detail), h("small", {}, t.owner)), h("span", { class: "chip " + (t.state === "Planned" ? "muted" : "info") }, t.state)))));
  },
};

/* ---------- automations ---------- */

const TRIGGER_ICON = { schedule: "", event: "", rule: "" };
async function setAuto(id, patch, msg) {
  await post("/api/automations/config", { id, date: state.date, ...patch });
  toast(msg);
  render({ keepScroll: true });
}
async function previewAuto(a) {
  const p = await getJSON(`/api/automations/preview?id=${a.id}&date=${state.date}`);
  openDrawer({
    title: a.name, subtitle: `${TRIGGER_ICON[a.trigger.kind] || ""} ${a.trigger.label} → ${a.system}`,
    fields: [["Why", a.why], ["Mode", a.mode === "auto" ? "Sends on its own" : `Waits for ${a.approver || "an OK"}`], ["Would send now", `${p.ops.length} item${p.ops.length === 1 ? "" : "s"}`]],
    ops: p.ops,
  });
}
function autoCard(a) {
  const toggle = h("button", { class: "switch", role: "switch", "aria-checked": String(a.enabled), title: a.enabled ? "Switch off" : "Switch on", onclick: () => setAuto(a.id, { enabled: !a.enabled }, a.enabled ? `${a.name}: off` : `${a.name}: on`) }, h("span"));
  const mode = h("div", { class: "seg mini", role: "group", "aria-label": "Mode" },
    ...[["auto", "Auto"], ["approval", "Needs OK"]].map(([m, l]) => h("button", { type: "button", "aria-pressed": String(a.mode === m), onclick: () => a.mode !== m && setAuto(a.id, { mode: m }, m === "auto" ? `${a.name} now sends on its own` : `${a.name} now waits for an OK`) }, l)));
  return h("article", { class: "auto" + (a.enabled ? "" : " off") },
    h("div", { class: "auto-head" }, h("div", {}, h("b", {}, a.name), a.custom ? h("span", { class: "chip info" }, "Created in Frog Hub") : null), toggle),
    h("div", { class: "flowline" },
      h("span", { class: "pill when" }, a.trigger.label), h("span", { class: "arrow" }, "→"),
      h("span", { class: "pill where" }, a.system)),
    h("p", { class: "why" }, a.why),
    h("div", { class: "auto-foot" },
      h("span", { class: "last" }, a.waiting ? h("a", { href: "#/ws/agents?tab=waiting" }, `${a.waiting} waiting for an OK`) : a.last),
      h("div", { class: "actions" }, mode,
        h("button", { class: "ghost", type: "button", onclick: () => previewAuto(a) }, "Preview"),
        a.enabled ? h("button", { class: "ghost", type: "button", onclick: async (e) => { e.target.disabled = true; const r = await post("/api/automations/run", { id: a.id, date: state.date }); toast(r.waiting ? `${r.waiting} waiting for an OK` : `${r.sent} sent to ${a.system}`); render({ keepScroll: true }); } }, "Run now") : null)));
}
Object.assign(SECTION, {
  automations(s) {
    if (!s.grouped) return card(s, h("div", { class: "auto-grid" }, s.items.map(autoCard)));
    const by = {};
    for (const a of s.items) (by[a.system] ||= []).push(a);
    return card(s, ...Object.entries(by).map(([sys, items]) => h("div", { class: "auto-group" }, h("h3", {}, `→ ${sys}`), h("div", { class: "auto-grid" }, items.map(autoCard)))));
  },
  activity(s) {
    if (!s.items.length) return card(s, h("div", { class: "clear" }, "Nothing ran yet."));
    return card(s, h("ol", { class: "timeline" }, s.items.map((l) => h("li", { class: l.status },
      h("span", { class: "t" }, l.time), h("span", { class: "dot" }),
      h("div", {}, h("b", {}, l.name), h("p", {}, l.text), h("small", {}, `${l.trigger} → ${l.system}`))))));
  },
  outbox(s) {
    if (!s.items.length) return card(s, h("div", { class: "clear" }, "Nothing sent yet."));
    const by = {};
    for (const o of s.items) (by[o.system] ||= []).push(o);
    return card(s, h("div", { class: "outbox" }, Object.entries(by).map(([sys, items]) => h("details", { class: "ob-sys" },
      h("summary", {}, h("b", {}, sys), h("span", { class: "chip good" }, `${items.length} sent`)),
      h("ul", {}, items.map((o) => h("li", {}, h("div", { class: "ob-line" }, h("span", { class: "t" }, o.time), h("span", {}, o.title)), payloadView(o.payload))))))));
  },
  builder(s) {
    const B = s.builder;
    const sel = (opts, v) => { const e = h("select", {}, opts.map(([k, l]) => h("option", { value: k }, l))); if (v != null) e.value = v; return e; };
    const trig = sel(B.triggers.map((t) => [t.id, t.label]));
    const val = h("input", { type: "number", value: B.triggers[0].default, step: "1", min: "0", "aria-label": "Threshold" });
    const unit = h("span", { class: "unit" }, B.triggers[0].unit);
    const pub = sel([["", "All pubs"], ...s.pubs]);
    const action = sel(B.actions.map((x) => [x.id, x.label]));
    const target = sel(B.actions[0].targets.map((x) => [x, x]));
    const mode = sel([["auto", "Run on its own"], ["approval", "Ask me first"]]);
    const name = h("input", { type: "text", placeholder: "Name (optional)", maxlength: "80" });
    const sentence = h("p", { class: "sentence" });
    const say = () => {
      const t = B.triggers.find((x) => x.id === trig.value);
      const cond = t.help.replace("X", val.value);
      sentence.textContent = `Every morning, for ${pub.value ? s.pubs.find(([k]) => k === pub.value)[1] : "each pub"}: if ${cond[0].toLowerCase()}${cond.slice(1)}, then ${action.selectedOptions[0].textContent.toLowerCase()} → ${target.value}${mode.value === "approval" ? ", after my OK" : ""}.`;
    };
    trig.addEventListener("change", () => { const t = B.triggers.find((x) => x.id === trig.value); val.value = t.default; unit.textContent = t.unit; say(); });
    action.addEventListener("change", () => { target.replaceChildren(...B.actions.find((x) => x.id === action.value).targets.map((x) => h("option", { value: x }, x))); say(); });
    [val, pub, target, mode].forEach((e) => e.addEventListener("input", say));
    say();
    const create = h("button", { class: "primary", type: "button", onclick: async () => {
      create.disabled = true;
      const r = await post("/api/automations/create", { date: state.date, spec: { trigger: trig.value, value: val.value, pub: pub.value || undefined, action: action.value, target: target.value, mode: mode.value, name: name.value.trim() || undefined } });
      toast(`Automation created · ${r.sent ? `${r.sent} sent today` : r.waiting ? `${r.waiting} waiting for your OK` : "nothing to send today"}`);
      location.hash = "#/ws/agents?tab=all";
    } }, "Create automation");
    return card(s, h("div", { class: "builder" },
      h("div", { class: "b-step" }, h("span", { class: "b-n" }, "1"), h("div", {}, h("b", {}, "When"), h("div", { class: "b-row" }, trig, val, unit, pub))),
      h("div", { class: "b-step" }, h("span", { class: "b-n" }, "2"), h("div", {}, h("b", {}, "Then"), h("div", { class: "b-row" }, action, target))),
      h("div", { class: "b-step" }, h("span", { class: "b-n" }, "3"), h("div", {}, h("b", {}, "How"), h("div", { class: "b-row" }, mode, name))),
      sentence, h("div", { class: "actions" }, create)));
  },
});

function payloadView(payload) {
  if (!payload) return null;
  return h("details", { class: "payload" }, h("summary", {}, "Data sent"), h("pre", {}, JSON.stringify(payload, null, 2)));
}

/* ---------- agents & delivery ---------- */

const STATUS = { live: ["Live", "good"], pilot: ["Pilot", "info"], next: ["Next", "muted"] };
Object.assign(SECTION, {
  agents(s) {
    return card(s, h("div", { class: "agent-grid" }, s.items.map((a) => h("a", { class: "agent", href: wsHref("agent", a.id) },
      h("div", { class: "ag-head" }, h("span", { class: "ag-icon" }, a.icon), h("div", {}, h("b", {}, a.name), h("small", {}, `for ${a.for}`)), h("span", { class: `chip ${STATUS[a.status][1]}` }, STATUS[a.status][0])),
      h("p", {}, a.mission),
      h("div", { class: "ag-stats" },
        h("div", {}, h("b", {}, `${Math.round(a.hours).toLocaleString("en-GB")} h`), h("small", {}, "given back this month")),
        h("div", {}, h("b", {}, a.euros ? `€${a.euros.toLocaleString("en-GB")}` : "—"), h("small", {}, "protected")),
        h("div", {}, h("b", {}, a.today.actions == null ? "—" : a.today.actions.toLocaleString("en-GB")), h("small", {}, a.today.label))),
      h("div", { class: "ag-foot" }, h("span", { class: "autonomy" }, a.autonomy), a.waiting ? h("span", { class: "count" }, `${a.waiting} waiting for an OK`) : h("span", { class: "allclear" }, "Up to date")),
      h("div", { class: "systems" }, a.tools.map((t) => h("span", { class: "tool" }, t)))))));
  },
  skills(s) {
    return card(s, h("div", { class: "skills" },
      h("div", { class: "auto-grid" }, s.items.filter((x) => !x.auto).map((x) => h("article", { class: "skill" }, h("b", {}, "◆ " + x.name), h("p", {}, x.text), h("span", { class: "chip good" }, "Built in")))),
      s.items.some((x) => x.auto) ? h("h3", { class: "sub" }, "Automated skills · switch, mode, preview") : null,
      h("div", { class: "auto-grid" }, s.items.filter((x) => x.auto).map((x) => autoCard(x.auto)))));
  },
  roadmap(s) {
    const tone = { Delivered: "good", Pilot: "info", Next: "attention", Planned: "muted" };
    return card(s, h("ol", { class: "roadmap" }, s.items.map((r) => h("li", { class: r.state.toLowerCase() }, h("span", { class: "when" }, r.when), h("span", { class: "dot" }), h("div", {}, h("p", {}, r.what), h("span", { class: `chip ${tone[r.state]}` }, r.state))))));
  },
  backlog(s) {
    const max = Math.max(...s.items.map((b) => b.score));
    return card(s, h("ol", { class: "backlog" }, s.items.map((b, i) => h("li", {},
      h("div", { class: "bk-head" }, h("span", { class: "rank" }, i + 1), h("b", {}, b.name), b.committed ? h("span", { class: "chip attention" }, `Committed · ${b.committed}`) : null, h("span", { class: "chip muted" }, `effort ${b.effort}`)),
      h("p", {}, b.why),
      h("div", { class: "bk-foot" }, h("div", { class: "track" }, h("div", { class: "fill met", style: `width:${(100 * b.score) / max}%` })), h("small", {}, `~${b.hours} h/month${b.euros ? ` · €${b.euros.toLocaleString("en-GB")}/month` : ""} · for ${b.for}`))))));
  },
  pulse(s) {
    const bar = (v) => h("div", { class: "track" }, h("div", { class: "fill met", style: `width:${(v / 5) * 100}%` }));
    const results = h("div", { class: "pulse-grid" }, s.roles.map((r) => h("div", { class: "pulse-role" }, h("b", {}, r.role), h("small", {}, `${r.n} answers`),
      h("div", { class: "pq" }, h("span", {}, "Saves me time"), bar(r.time), h("b", {}, r.time.toFixed(1))),
      h("div", { class: "pq" }, h("span", {}, "I trust the figures"), bar(r.trust), h("b", {}, r.trust.toFixed(1))))));
    const quotes = h("ul", { class: "quotes" }, s.comments.map((c) => h("li", {}, `“${c.text}”`, h("small", {}, ` — ${c.role}${c.demo ? " (demo)" : ""}`))));
    // 30-second check-in
    const role = h("select", {}, s.roles.map((r) => h("option", { value: r.role }, r.role)));
    const score = (label) => { const sel = h("select", {}, [5, 4, 3, 2, 1].map((n) => h("option", { value: n }, `${n}`))); return [h("label", {}, label, sel), sel]; };
    const [l1, time] = score("The hub saves me time (1–5)"), [l2, trust] = score("I trust the figures (1–5)");
    const idea = h("input", { type: "text", placeholder: "What should the next agent do for you?", maxlength: "400" });
    const send = h("button", { class: "primary", type: "button", onclick: async () => {
      send.disabled = true;
      await post("/api/pulse", { role: role.value, time: +time.value, trust: +trust.value, idea: idea.value });
      toast("Thanks, your answer is in the pulse");
      render({ keepScroll: true });
    } }, "Send");
    return card(s, results, h("h3", { class: "sub" }, "In their words"), quotes,
      h("div", { class: "checkin" }, h("h3", { class: "sub" }, "30-second check-in"), h("div", { class: "b-row" }, h("label", {}, "I am", role), l1, l2), h("div", { class: "b-row" }, idea, send)));
  },
});

// open and scroll to a point linked from elsewhere (…&focus=P03)
function focusPoint(id) {
  const el = document.getElementById(`pt-${id}`);
  if (!el) return;
  el.open = true;
  el.classList.add("flash");
  requestAnimationFrame(() => el.scrollIntoView({ block: "start", behavior: "smooth" }));
}

/* ---------- scorecard ---------- */

const fmtK = (v, u) => (v == null ? "—" : u === "€" ? `€${Math.round(v).toLocaleString("en-GB")}` : u === "%" ? `${v.toLocaleString("en-GB", { maximumFractionDigits: 1 })} %` : `${v.toLocaleString("en-GB", { maximumFractionDigits: 1 })} ${u}`);
const targetText = (k) => (k.target == null ? "trend" : `target ${k.better === "up" ? "≥" : "≤"} ${fmtK(k.target, k.unit)}`);
const STATE = { good: "On target", watch: "Close", bad: "Off target", neutral: "Tracked" };
function svgEl(tag, attrs) { const e = document.createElementNS("http://www.w3.org/2000/svg", tag); for (const [a, b] of Object.entries(attrs)) e.setAttribute(a, b); return e; }
function sparkline(series, k) {
  if (!series || series.length < 2) return null;
  const W = 120, H = 26;
  const vals = [...series, ...(k.target != null ? [k.target] : [])];
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const x = (i) => 2 + (i * (W - 4)) / (series.length - 1), y = (v) => H - 3 - ((v - lo) / span) * (H - 6);
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "spark", role: "img", "aria-label": `Weekly trend: ${series.join(", ")}` });
  if (k.target != null) svg.append(svgEl("line", { x1: 0, x2: W, y1: y(k.target), y2: y(k.target), stroke: "var(--accent)", "stroke-dasharray": "2 3", "stroke-width": 1 }));
  svg.append(svgEl("polyline", { points: series.map((v, i) => `${x(i)},${y(v)}`).join(" "), fill: "none", stroke: "var(--brand)", "stroke-width": 1.8, "stroke-linejoin": "round" }));
  svg.append(svgEl("circle", { cx: x(series.length - 1), cy: y(series.at(-1)), r: 2.6, fill: "var(--brand)" }));
  return svg;
}
function problemDetail(p) {
  return h("div", {},
    p.insights.length ? h("ul", { class: "pd-insights" }, p.insights.map((t) => h("li", {}, t))) : null,
    ...p.kpis.map((k) => h("div", { class: "pd-kpi" },
      h("div", { class: "pd-top" },
        h("div", {}, h("b", {}, k.name), h("p", {}, k.def), h("p", {}, `Source: ${k.source} · ${k.window}${k.note ? ` · ${k.note}` : ""}`)),
        h("div", { class: "pd-val" }, h("b", { class: k.status }, fmtK(k.value, k.unit)), h("span", { class: `state ${k.status}` }, STATE[k.status]),
          h("div", { class: "pk" }, h("span", { class: "t" }, targetText(k) + (k.baseline != null ? ` · before: ${fmtK(k.baseline, k.unit)}` : ""))), sparkline(k.series, k))),
      k.byPub ? h("div", { class: "pd-pubs" }, k.byPub.map((r) => h("div", { class: `pd-pub ${r.status}` }, h("span", {}, r.name), h("b", {}, fmtK(r.value, k.unit))))) : null)),
    p.agents.length ? h("p", { class: "note" }, `Acted on by: ${p.agents.map((a) => a.name).join(", ")}.`) : null);
}
Object.assign(SECTION, {
  problems(s) {
    const grid = h("section", { class: "problems" }, s.items.map((p) => {
      const el = h("article", { class: "problem", tabindex: "0", role: "button", "aria-label": `${p.name}: open the detail` },
        h("div", { class: "pb-head" }, h("span", { class: "pb-n" }, p.n), h("div", {}, h("h2", {}, p.name), h("small", {}, p.owner)), h("span", { class: `state ${p.status}` }, STATE[p.status])),
        h("div", { class: "pb-kpis" }, p.kpis.slice(0, 3).map((k) => h("div", { class: "pk" }, h("span", { class: "n" }, k.name), h("div", { class: "v" }, h("b", { class: k.status }, fmtK(k.value, k.unit))), h("span", { class: "t" }, targetText(k)), sparkline(k.series, k)))),
        p.insights[0] ? h("p", { class: "pb-insight" }, p.insights[0]) : h("p", { class: "note", style: "margin:0" }, p.pain),
        h("div", { class: "pb-foot" }, h("div", { class: "agent-chips" }, p.agents.map((a) => h("span", { class: "agent-chip" }, h("i", {}, a.icon), a.name))), h("span", {}, `${p.kpis.length} KPIs · open →`)));
      const open = () => openDrawer({ title: `${p.n}  ${p.name}`, subtitle: `${p.owner} · ${p.pain}`, wide: true, content: problemDetail(p), ask: `Explain the situation on "${p.name}" and what to do first` });
      el.addEventListener("click", open); el.addEventListener("keydown", (e) => { if (e.key === "Enter") open(); });
      return el;
    }));
    if (!s.note) return grid;
    const wrap = h("section", {}, h("p", { class: "note", style: "margin:0 0 14px;color:var(--ink-3)" }, s.note), grid);
    return wrap;
  },
  heatmap(s) {
    const t = h("table", { class: "heat" },
      h("thead", {}, h("tr", {}, h("th", { class: "p" }, "Pub"), s.cols.map((c) => h("th", {}, c.name, h("span", { class: "tg" }, c.target == null ? "trend" : `target ${fmtK(c.target, c.unit)}`))))),
      h("tbody", {},
        s.rows.map((r) => h("tr", {}, h("td", { class: "p", onclick: () => { location.hash = wsHref("manager", r.pub, "close"); } }, r.name, h("small", {}, "GM " + r.gm)), r.cells.map((c, i) => h("td", { class: c.status }, fmtK(c.value, s.cols[i].unit))))),
        h("tr", { class: "group" }, h("td", { class: "p" }, "Group"), s.group.map((v, i) => h("td", {}, fmtK(v, s.cols[i].unit))))));
    return card(s, h("div", { class: "tw", style: "max-height:none" }, t));
  },
  systemmap(s) {
    const M = s.map;
    const node = (col, id, label) => h("button", { class: "sm-node", type: "button", "data-col": col, "data-id": id }, label);
    const cols = h("div", { class: "sm-cols" },
      h("div", { class: "sm-col sources" }, h("h3", {}, "Tools Frog uses"), M.sources.map(([n]) => node("s", n, n))),
      h("div", { class: "sm-col entities" }, h("h3", {}, "Data joined in the hub"), M.entities.map(([id, n]) => node("e", id, n))),
      h("div", { class: "sm-col agents" }, h("h3", {}, "Agents that act"), M.agents.map(([id, n]) => node("a", id, n))),
      h("div", { class: "sm-col problems" }, h("h3", {}, "Problems they answer"), s.problems.map(([id, n]) => node("p", id, n))));
    const svg = svgEl("svg", { class: "sm-lines", "aria-hidden": "true" });
    const wrap = h("div", { class: "sysmap" }, svg, cols);
    const edges = [
      ...M.sources.flatMap(([n, e]) => e.map((x) => [`s:${n}`, `e:${x}`])),
      ...M.agents.flatMap(([id, , e]) => e.map((x) => [`e:${x}`, `a:${id}`])),
      ...s.problems.flatMap(([id, , ag]) => ag.map((x) => [`a:${x}`, `p:${id}`])),
    ];
    const draw = () => {
      svg.replaceChildren();
      const box = wrap.getBoundingClientRect();
      svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`); svg.setAttribute("width", box.width); svg.setAttribute("height", box.height);
      const find = (key) => { const [col, ...rest] = key.split(":"); return wrap.querySelector(`.sm-node[data-col="${col}"][data-id="${CSS.escape(rest.join(":"))}"]`); };
      for (const [a, b] of edges) {
        const n1 = find(a), n2 = find(b); if (!n1 || !n2) continue;
        const r1 = n1.getBoundingClientRect(), r2 = n2.getBoundingClientRect();
        const x1 = r1.right - box.left, y1 = r1.top + r1.height / 2 - box.top, x2 = r2.left - box.left, y2 = r2.top + r2.height / 2 - box.top, dx = (x2 - x1) / 2;
        const p = svgEl("path", { d: `M${x1} ${y1} C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}` }); p.dataset.a = a; p.dataset.b = b; svg.append(p);
      }
    };
    // hover a node: light up everything upstream and downstream of it
    wrap.addEventListener("mouseover", (e) => {
      const n = e.target.closest(".sm-node"); if (!n) return;
      const start = `${n.dataset.col}:${n.dataset.id}`;
      const down = new Set([start]), up = new Set([start]);
      let grew = true;
      while (grew) { grew = false; for (const [a, b] of edges) { if (down.has(a) && !down.has(b)) { down.add(b); grew = true; } if (up.has(b) && !up.has(a)) { up.add(a); grew = true; } } }
      wrap.classList.add("focus");
      wrap.querySelectorAll(".sm-node").forEach((x) => { const k = `${x.dataset.col}:${x.dataset.id}`; x.classList.toggle("on", down.has(k) || up.has(k)); });
      svg.querySelectorAll("path").forEach((p) => p.classList.toggle("on", (down.has(p.dataset.a) && down.has(p.dataset.b)) || (up.has(p.dataset.a) && up.has(p.dataset.b))));
    });
    wrap.addEventListener("mouseleave", () => wrap.classList.remove("focus"));
    requestAnimationFrame(() => requestAnimationFrame(draw));
    window.addEventListener("resize", () => { if (document.body.contains(wrap)) draw(); });
    return card(s, wrap);
  },
});

function chipEl(c) { return h("span", { class: `chip ${c.tone || "good"}` }, c.chip); }

function table(cols, rows) {
  const td = (c) => {
    if (c && typeof c === "object" && c.chip) return h("td", {}, chipEl(c));
    if (c && typeof c === "object") return h("td", { class: c.tone || "" }, c.v);
    return h("td", {}, c ?? "—");
  };
  const tr = (r) => {
    if (Array.isArray(r)) return h("tr", {}, r.map(td));
    const go = r.link ? () => { location.hash = wsHref(r.link.ws, r.link.pub || r.link.param, r.link.tab); } : r.drawer ? () => openDrawer(r.drawer) : null;
    return h("tr", { class: go ? "clickable" : "", tabindex: go ? "0" : null, onclick: go, onkeydown: go ? (e) => { if (e.key === "Enter") go(); } : null }, r.cells.map(td));
  };
  return h("div", { class: "tw" }, h("table", {}, h("thead", {}, h("tr", {}, cols.map((c) => h("th", {}, c)))), h("tbody", {}, rows.map(tr))));
}

function chart(blk) {
  const W = 900, H = 260, L = 64, R = 12, T = 12, B = 30;
  const max = Math.max(1, ...blk.series.flatMap((s) => s.values));
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  const top = Math.ceil(max / step) * step;
  const x = (i) => L + (i * (W - L - R)) / Math.max(1, blk.labels.length - 1);
  const y = (val) => T + (H - T - B) * (1 - val / top);
  const STY = { main: ["var(--brand)", 3, ""], target: ["var(--accent)", 1.8, "2 4"], dash: ["var(--ink-3)", 1.4, "6 4"] };
  const ns = "http://www.w3.org/2000/svg";
  const s = (tag, a) => { const e = document.createElementNS(ns, tag); for (const k in a) e.setAttribute(k, a[k]); return e; };
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": blk.title });
  for (let i = 0; i <= 4; i++) {
    const val = (top * i) / 4;
    svg.append(s("line", { x1: L, x2: W - R, y1: y(val), y2: y(val), stroke: "var(--rule)" }));
    const t = s("text", { x: L - 8, y: y(val) + 4, "text-anchor": "end", "font-size": 11, fill: "var(--ink-3)" }); t.textContent = "€" + Math.round(val).toLocaleString("en-GB"); svg.append(t);
  }
  const every = Math.ceil(blk.labels.length / 12);
  blk.labels.forEach((lab, i) => { if (i % every) return; const t = s("text", { x: x(i), y: H - 8, "text-anchor": "middle", "font-size": 11, fill: "var(--ink-3)" }); t.textContent = lab; svg.append(t); });
  for (const se of blk.series) {
    const [col, w, dash] = STY[se.style] || STY.dash;
    svg.append(s("polyline", { points: se.values.map((val, i) => `${x(i)},${y(val)}`).join(" "), fill: "none", stroke: col, "stroke-width": w, "stroke-dasharray": dash, "stroke-linejoin": "round" }));
  }
  // hover: read the values under the cursor
  const guide = s("line", { y1: T, y2: H - B, stroke: "var(--ink)", "stroke-width": 1, opacity: 0 });
  svg.append(guide);
  const tip = h("div", { class: "tip", hidden: true });
  svg.addEventListener("mousemove", (e) => {
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.max(0, Math.min(blk.labels.length - 1, Math.round(((px - L) / (W - L - R)) * (blk.labels.length - 1))));
    guide.setAttribute("x1", x(i)); guide.setAttribute("x2", x(i)); guide.setAttribute("opacity", 0.3);
    tip.hidden = false; tip.style.left = `${(x(i) / W) * 100}%`;
    tip.replaceChildren(h("b", {}, blk.labels[i]), ...blk.series.map((se) => h("span", {}, `${se.name}: €${Math.round(se.values[i]).toLocaleString("en-GB")}`)));
  });
  svg.addEventListener("mouseleave", () => { guide.setAttribute("opacity", 0); tip.hidden = true; });
  const legend = h("div", { class: "legend" }, blk.series.map((se) => h("span", {}, h("i", { style: `background:${(STY[se.style] || STY.dash)[0]}` }), se.name)));
  return h("div", { class: "chart" }, svg, tip, legend);
}

/* ---------- drawer & toast ---------- */

function openDrawer(d, item) {
  const dr = $("#drawer");
  const acts = item && !item.done && item.actions?.length ? h("div", { class: "actions" }, item.actions.map((a) => {
    const btn = h("button", { class: a.style === "primary" ? "primary" : "ghost", type: "button" }, a.label);
    btn.addEventListener("click", () => act(item, a, btn));
    return btn;
  })) : null;
  dr.replaceChildren(...[
    h("div", { class: "dr-head" }, h("div", {}, h("h2", {}, d.title), d.subtitle ? h("small", {}, d.subtitle) : null), h("button", { class: "ghost", type: "button", "aria-label": "Close", onclick: closeDrawer }, "✕")),
    d.fields?.length ? h("dl", { class: "dr-fields" }, d.fields.flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)])) : null,
    d.transcript ? h("div", {}, h("h3", { class: "sub" }, "Transcript"), h("ol", { class: "transcript" }, d.transcript.map(([who, text]) => h("li", { class: who === "AI" ? "ai" : "guest" }, h("span", { class: "label" }, who === "AI" ? "AI receptionist" : "Guest"), h("p", {}, text))))) : null,
    d.content || null,
    d.table ? table(d.table.cols, d.table.rows) : null,
    d.payload ? payloadView(d.payload) : null,
    d.ops ? (d.ops.length ? h("ul", { class: "dr-ops" }, d.ops.map((o) => h("li", {}, h("b", {}, o.title), o.detail ? h("p", {}, o.detail) : null, o.table ? table(o.table.cols, o.table.rows) : null, payloadView(o.payload)))) : h("p", { class: "note" }, "Nothing to send for this day.")) : null,
    acts, d.ask ? h("button", { class: "ask wide", type: "button", onclick: () => ask(d.ask) }, "Ask Copilot about this") : null].filter(Boolean));
  dr.classList.toggle("wide", !!d.wide);
  dr.hidden = false; $("#scrim").hidden = false;
  dr.querySelector(".dr-head button").focus();
}
function closeDrawer() { $("#drawer").hidden = true; $("#scrim").hidden = true; }
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });

let toastTimer = null;
function toast(text, undo) {
  const t = $("#toast");
  t.replaceChildren(h("span", {}, text), undo ? h("button", { type: "button", onclick: async () => { t.hidden = true; await undo(); } }, "Undo") : null);
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 6000);
}

/* ---------- reference pages ---------- */

function renderDefinitions() {
  setHeader("Central data hub", "One definition per figure", "Every screen, export and Copilot answer uses these definitions.");
  $("#tabs").innerHTML = "";
  const dl = h("dl", { class: "defs" }, Object.entries(META.definitions).flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)]));
  $("#page").innerHTML = ""; $("#page").append(h("section", { class: "card full" }, dl));
}
function renderApi() {
  setHeader("Central data hub", "Hub API", "Read-only JSON endpoints. Frog Copilot calls the same functions, so the app and the assistant always give the same figure.");
  $("#tabs").innerHTML = "";
  const eps = ["pubs", "kpis?pub=bercy&from=2026-09-01&to=2026-09-30", "manager-report?pub=princess&date=2026-09-26", "cashup?pub=xvi&date=2026-09-30", "guests?pub=hophouse", "banking?week=2026-09-21", "club-frog?by=shift", "invoices?pub=toulouse", "beer-duty", "bookings", "corporate", "alerts?date=2026-09-30", "definitions"];
  $("#page").innerHTML = "";
  $("#page").append(h("section", { class: "card full" }, h("ul", {}, eps.map((e) => h("li", {}, h("a", { href: `/api/data/${e}`, target: "_blank" }, h("code", {}, `GET /api/data/${e}`))))),
    h("p", { class: "note" }, `Documentation indexed for the Copilot: ${META.docs.chunks} passages from ${Object.keys(META.docs.bySource).length} sources.`)));
}

/* ---------- Copilot ---------- */

let sessionId = store.get("frog-cp-session");

function updateSuggestions() {
  const pubName = META.pubs.find((p) => p.id === state.pub)?.name;
  const S = {
    ceo: ["How did the group do yesterday?", "Which pub is furthest from budget this month, and why?", "Compare labour cost across the 8 pubs", "Quels événements de groupe cette semaine ?"],
    finance: ["Résume les encaissements de la semaine dernière par mode de paiement", "Which invoices still need a decision?", "Quels acomptes corporate restent à recevoir ?", "Where is the beer duty ledger at?"],
    manager: [`Quelles réservations ce soir à ${pubName} ?`, `Comment s'est passé le service d'hier à ${pubName} ?`, `Which shift manager at ${pubName} has the best Club Frog rate this week?`, "Comment faire une addition partagée avec Club Frog ?"],
    ops: ["Which group events are coming up, and are they paid?", "Quels pubs ont fermé les réservations en ligne ce mois-ci ?", "What did the AI receptionist do this week?"],
    marketing: ["Taux Club Frog par manager de shift cette semaine", "Combien de membres ont gagné une récompense de 5e visite ?", "How much ad spend went to a closed booking calendar?"],
    points: ["Quels points restent à décider, et par qui ?", "Which method do you recommend for bank reconciliation, and why?", "What does Frog Hub do about Trail and waste?"],
    agents: ["Qu'est-ce qui a été envoyé à Combo ce matin ?", "Which agents are waiting for an OK?", "Pourquoi le planning recommandé ajoute des heures samedi ?"],
    agent: ["Qu'a fait cet agent aujourd'hui ?", "How is its impact counted?", "What does it send, and to which tool?"],
    delivery: ["Combien d'heures les agents ont rendu ce mois-ci, par équipe ?", "Which agent should we build next, and why?", "What do the teams say about the hub?"],
    data: ["Quelles corrections automatiques ont été faites hier ?", "What do we still need from OBY Pay for the live API?", "Que faut-il pour connecter l'API Zenchef ?"],
  };
  const sug = $("#cp-suggest"); sug.innerHTML = "";
  (S[state.ws] || S.ceo).forEach((s) => sug.append(h("button", { type: "button", onclick: () => ask(s) }, s)));
}

function mdToHtml(md) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<i>$2</i>");
  const lines = md.split("\n"), out = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*\|.*\|\s*$/.test(l) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || "")) {
      const row = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = row(l); i++;
      const body = [];
      while (i + 1 < lines.length && /^\s*\|.*\|\s*$/.test(lines[i + 1])) body.push(row(lines[++i]));
      out.push(`<div class="tw"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
    } else if (/^\s*[-*] /.test(l)) {
      const items = [l]; while (/^\s*[-*] /.test(lines[i + 1] || "")) items.push(lines[++i]);
      out.push(`<ul>${items.map((x) => `<li>${inline(x.replace(/^\s*[-*] /, ""))}</li>`).join("")}</ul>`);
    } else if (/^\s*\d+[.)] /.test(l)) {
      const items = [l]; while (/^\s*\d+[.)] /.test(lines[i + 1] || "")) items.push(lines[++i]);
      out.push(`<ol>${items.map((x) => `<li>${inline(x.replace(/^\s*\d+[.)] /, ""))}</li>`).join("")}</ol>`);
    } else if (/^#{1,4} /.test(l)) out.push(`<h4>${inline(l.replace(/^#+ /, ""))}</h4>`);
    else if (l.trim()) out.push(`<p>${inline(l)}</p>`);
  }
  return out.join("");
}

function addMsg(role, node) { const m = h("div", { class: `msg ${role}` }, node); $("#cp-log").append(m); $("#cp-log").scrollTop = 1e9; return m; }
function chipsFor(calls = []) {
  const fmt = (c) => `${c.name}(${Object.entries(c.input || {}).map(([k, v]) => `${k}=${String(v).slice(0, 40)}`).join(", ")})`;
  return calls.length ? h("div", { class: "chips" }, calls.map((c) => h("span", { class: "chip muted" + (c.error ? " err" : ""), title: c.error || "" }, fmt(c)))) : null;
}
function primitiveTable(data) {
  const arr = Array.isArray(data) ? data : Object.values(data).find(Array.isArray);
  const rows = (arr || [data]).slice(0, 8);
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r).filter((k) => r[k] == null || typeof r[k] !== "object")))].slice(0, 7);
  return table(cols, rows.map((r) => cols.map((c) => r[c])));
}
function renderDemo(d, calls) {
  const wrap = h("div", { style: "display:grid;gap:8px" }, h("div", { class: "banner" }, `Demo mode, without the LLM: ${d.reason} Here is what the hub and the documentation return for this question.`));
  if (d.data) wrap.append(h("b", {}, `Hub data · ${d.intent}`), primitiveTable(d.data));
  if (d.docs?.length) {
    wrap.append(h("b", {}, "Documentation"));
    for (const p of d.docs) wrap.append(h("div", { class: "passage" }, h("b", {}, `${p.title} · ${p.source}`), p.text.slice(0, 420) + (p.text.length > 420 ? "…" : "")));
  }
  wrap.append(chipsFor(calls));
  return wrap;
}

async function ask(text) {
  addMsg("user", text);
  openCopilot();
  const pending = addMsg("bot", h("span", { class: "thinking" }, "Looking in the hub and the docs…"));
  $("#cp-send").disabled = true;
  try {
    const res = await fetch("/api/copilot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, message: text }) });
    const r = await res.json();
    if (r.sessionId) { sessionId = r.sessionId; store.set("frog-cp-session", sessionId); }
    pending.innerHTML = "";
    if (!res.ok) pending.append(r.error || "Error");
    else if (r.mode === "demo") pending.append(renderDemo(r.demo, r.calls));
    else { const div = h("div"); div.innerHTML = mdToHtml(r.answer || ""); pending.append(div); const c = chipsFor(r.calls); if (c) pending.append(c); }
  } catch (e) {
    pending.textContent = "Copilot unreachable: " + e.message;
  } finally {
    $("#cp-send").disabled = false; $("#cp-log").scrollTop = 1e9;
  }
}

function initCopilot() {
  const st = META.copilot;
  $("#cp-status").textContent = st.available ? `Claude · ${st.model} · live data + docs` : "Demo mode · no LLM key";
  addMsg("bot", h("div", {}, h("p", {}, "Ask me for any figure, any pub, any day — or how something works. I answer from the hub and Frog's documentation, and I show my sources.")));
  $("#cp-form").addEventListener("submit", (e) => { e.preventDefault(); const t = $("#cp-input").value.trim(); if (!t) return; $("#cp-input").value = ""; ask(t); });
  $("#cp-input").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#cp-form").requestSubmit(); } });
  $("#cp-reset").addEventListener("click", async () => {
    if (sessionId) await fetch("/api/copilot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, reset: true }) });
    $("#cp-log").innerHTML = ""; addMsg("bot", h("p", {}, "New conversation."));
  });
  $("#cp-fab").addEventListener("click", () => $("#copilot").classList.add("open"));
  $("#cp-close").addEventListener("click", () => $("#copilot").classList.remove("open"));
}

/* ---------- start ---------- */

function openCopilot() {
  document.body.classList.remove("cp-collapsed"); store.set("frog-cp", "open");
  $("#copilot").classList.add("open");
}
function toggleCopilot() {
  const collapsed = document.body.classList.toggle("cp-collapsed");
  store.set("frog-cp", collapsed ? "closed" : "open");
}

(async function init() {
  META = await getJSON("/api/meta");
  state.date = META.today;
  const dateSel = $("#date");
  for (let d = new Date(META.period.to + "T12:00:00Z"); d >= new Date(META.period.from + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - 1)) {
    const iso = d.toISOString().slice(0, 10);
    dateSel.append(h("option", { value: iso }, d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })));
  }
  dateSel.value = state.date;
  dateSel.addEventListener("change", () => { state.date = dateSel.value; render({ keepScroll: true }); });
  pubSel = $("#pub");
  META.pubs.forEach((p) => pubSel.append(h("option", { value: p.id }, p.name)));
  pubSel.addEventListener("change", () => { location.hash = wsHref("manager", pubSel.value, state.tab); });
  $("#open-defs").addEventListener("click", () => { location.hash = "#/definitions"; });
  $("#open-api").addEventListener("click", () => { location.hash = "#/api"; });
  $("#scrim").addEventListener("click", closeDrawer);
  $("#cp-toggle").addEventListener("click", toggleCopilot);
  if (store.get("frog-cp") === "closed") document.body.classList.add("cp-collapsed");
  initCopilot();
  render();
})();
