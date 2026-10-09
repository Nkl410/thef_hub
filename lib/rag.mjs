// Retrieval over Frog's documentation (the "RAG" half of Frog Copilot).
//
// Sources indexed at start-up:
//   1. ../ClubFrog - Zuri.md            audit: business stack, issues per system, API status
//   2. ../Frog Pubs Process Map.html     every process, step, pain point and the systems register
//   3. ./knowledge/*.md|*.txt            company docs: SOPs, software guides, hub definitions…
//
// Ranking is BM25 over accent-folded tokens, which keeps the prototype free of
// external services. For production, swap `search()` for an embedding index
// (same chunk format) without touching the Copilot.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");
const AUDIT_DIR = path.resolve(ROOT, "..");

const STOP = new Set(("a an and are as at be by for from has have in is it its of on or that the to was were will with this what which who how " +
  "le la les un une des du de d l et ou est sont en au aux pour par sur dans que qui quoi comment quel quelle quels quelles ce cet cette ces il elle on nous vous ils elles ne pas plus se sa son ses leur leurs y a").split(" "));

export function tokenize(text) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .split(/[^a-z0-9€%]+/).filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => (w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w));
}

const stripMd = (s) => s.replace(/\*\*|__|`/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/<br\s*\/?>/g, " ").trim();

/* ---------- loaders ---------- */

function loadAuditMarkdown(file) {
  const full = fs.readFileSync(file, "utf8");
  const chunks = [];
  // Tory's notes follow the table; index them separately.
  const notesAt = full.search(/\n\s*Tory\s*:/);
  const raw = notesAt > 0 ? full.slice(0, notesAt) : full;
  if (notesAt > 0) chunks.push({ source: "ClubFrog - Zuri.md", title: "Notes (Tory)", text: stripMd(full.slice(notesAt)).replace(/\n\s*\n/g, "\n") });
  // Rows of the STACK ENTREPRISE table can span several lines; a row starts with "| ".
  const rows = raw.split(/\n(?=\| )/);
  const head = rows.shift();
  const preface = head.split(/\n\s*\n/).map(stripMd).filter((p) => p.length > 40);
  preface.forEach((p, i) => chunks.push({ source: "ClubFrog - Zuri.md", title: `Stack entreprise — priorities (${i + 1})`, text: p }));
  const cols = ["Système", "Nom / fournisseur", "Utilisation", "Utilisateurs", "Données détenues", "Coût", "Engagement", "Connexions", "Problèmes constatés", "API — statut et conditions"];
  for (const row of rows) {
    const cells = row.split(/(?<!\\)\|/).slice(1, -1).map((c) => stripMd(c.replace(/\s*\n\s*/g, " ")));
    if (cells.length < 4 || /^-+$/.test(cells[0]) || cells[0] === "Système" || cells.slice(1).every((c) => !c)) continue;
    const name = cells[1] || cells[0];
    const text = cells.map((c, i) => (c && cols[i] ? `${cols[i]}: ${c}` : c)).filter(Boolean).join("\n");
    chunks.push({ source: "ClubFrog - Zuri.md", title: `Stack entreprise — ${cells[0]} (${name})`, text });
  }
  return chunks;
}

function loadProcessMap(file) {
  const html = fs.readFileSync(file, "utf8");
  const start = html.indexOf("const GROUPS="), end = html.indexOf("/* ---------- rendering ---------- */");
  if (start < 0 || end < 0) return [];
  const sandbox = {};
  vm.runInNewContext(html.slice(start, end).replace(/\bconst (GROUPS|LANES|TYPES|FLOWS|P)=/g, "this.$1=") + "", sandbox, { timeout: 2000 });
  const chunks = [];
  for (const proc of sandbox.P || []) {
    const src = "Frog Pubs Process Map.html";
    chunks.push({ source: src, title: `Process — ${proc.title}`, text: `${proc.title}. When: ${proc.cadence}. Who: ${proc.owner}. ${proc.desc}` });
    if (proc.table) {
      for (const r of proc.table.rows) chunks.push({ source: src, title: `Systems register — ${r[0]}`, text: proc.table.cols.map((c, i) => `${c}: ${r[i]}`).join("\n") });
    }
    for (const [, lane, , , label, o = {}] of proc.nodes || []) {
      const parts = [`Process: ${proc.title}`, `Step: ${label}`, `Lane: ${sandbox.LANES?.[lane]?.label ?? lane}`];
      if (o.tool) parts.push(`Tool: ${o.tool}`);
      if (o.pt) parts.push(`Issue (${o.pain === 2 ? "critical" : "friction"}): ${o.pt}`);
      if (o.note) parts.push(`Detail: ${o.note}`);
      if (parts.length > 3) chunks.push({ source: src, title: `${proc.title} — ${label}`, text: parts.join("\n") });
    }
  }
  return chunks;
}

function loadKnowledgeDir(dir) {
  if (!fs.existsSync(dir)) return [];
  const chunks = [];
  for (const f of fs.readdirSync(dir).filter((x) => /\.(md|txt)$/i.test(x)).sort()) {
    const raw = fs.readFileSync(path.join(dir, f), "utf8");
    const docTitle = (raw.match(/^#\s+(.+)$/m) || [, f])[1].trim();
    // one chunk per "##" section, long sections split by paragraph groups
    const sections = raw.split(/\n(?=##\s)/);
    for (const s of sections) {
      const heading = (s.match(/^##+\s+(.+)$/m) || [, docTitle])[1].trim();
      const body = stripMd(s.replace(/^#+\s+.+$/gm, "")).trim();
      if (body.length < 20) continue;
      const paras = body.split(/\n\s*\n/);
      let buf = "";
      const flush = () => { if (buf.trim()) chunks.push({ source: `knowledge/${f}`, title: heading === docTitle ? docTitle : `${docTitle} — ${heading}`, text: buf.trim() }); buf = ""; };
      for (const p of paras) { if ((buf + p).length > 1400) flush(); buf += p + "\n\n"; }
      flush();
    }
  }
  return chunks;
}

/* ---------- index ---------- */

let INDEX = null;

export function buildIndex() {
  const chunks = [];
  const tryLoad = (label, fn) => { try { chunks.push(...fn()); } catch (e) { console.warn(`[rag] could not load ${label}: ${e.message}`); } };
  tryLoad("ClubFrog - Zuri.md", () => loadAuditMarkdown(path.join(AUDIT_DIR, "ClubFrog - Zuri.md")));
  tryLoad("Frog Pubs Process Map.html", () => loadProcessMap(path.join(AUDIT_DIR, "Frog Pubs Process Map.html")));
  tryLoad("knowledge/", () => loadKnowledgeDir(path.join(ROOT, "knowledge")));
  chunks.forEach((c, i) => { c.id = i; c.tokens = tokenize(`${c.title} ${c.title} ${c.text}`); });
  const df = new Map();
  for (const c of chunks) for (const t of new Set(c.tokens)) df.set(t, (df.get(t) || 0) + 1);
  const avgLen = chunks.reduce((s, c) => s + c.tokens.length, 0) / (chunks.length || 1);
  INDEX = { chunks, df, avgLen, N: chunks.length };
  return { chunks: chunks.length, sources: [...new Set(chunks.map((c) => c.source))] };
}

export function search(query, k = 5) {
  if (!INDEX) buildIndex();
  const { chunks, df, avgLen, N } = INDEX;
  const q = [...new Set(tokenize(query))];
  const K1 = 1.4, B = 0.75;
  const scored = [];
  for (const c of chunks) {
    let s = 0;
    for (const t of q) {
      const n = df.get(t);
      if (!n) continue;
      const tf = c.tokens.reduce((x, y) => x + (y === t), 0);
      if (!tf) continue;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      s += (idf * tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * c.tokens.length) / avgLen));
    }
    if (s > 0) scored.push([s, c]);
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, k)
    .map(([score, c]) => ({ source: c.source, title: c.title, score: Math.round(score * 100) / 100, text: c.text.length > 1800 ? c.text.slice(0, 1800) + "…" : c.text }));
}

export function stats() {
  if (!INDEX) buildIndex();
  const by = {};
  for (const c of INDEX.chunks) by[c.source] = (by[c.source] || 0) + 1;
  return { chunks: INDEX.N, bySource: by };
}
