// Decisions taken in the app (invoice approved, cash-up line checked, MR sent…).
// Shared by every workspace, so an invoice approved by a GM leaves the finance queue too.
// Prototype: kept in memory, reset when the server restarts.

const store = new Map();
const key = (type, id) => `${type}:${id}`;

export const ACTION_TYPES = {
  invoice: ["approved", "disputed"],
  cashline: ["checked"],
  mr: ["sent"],
  reminder: ["sent"],
  booking: ["validated", "declined"],
  voucher: ["checked"],
  check: ["done"], // checklist item ticked (`${pub}|${date}|${item}`)
  method: ["a", "b", "c", "d"], // method chosen for an open point (lib/processes.mjs)
};

export function record(type, id, status, extra = {}) {
  if (status === "undo" && ACTION_TYPES[type]) { store.delete(key(type, id)); return { type, id, status }; }
  if (!ACTION_TYPES[type]?.includes(status)) throw new Error(`Unknown action ${type}/${status}`);
  if (typeof id !== "string" || !id || id.length > 80) throw new Error("Action id must be a short string");
  const now = new Date();
  const entry = { type, id, status, at: now.toISOString(), time: now.toTimeString().slice(0, 5), ...extra };
  store.set(key(type, id), entry);
  return entry;
}
export const get = (type, id) => store.get(key(type, id)) || null;
export const done = (type, id) => store.has(key(type, id));
