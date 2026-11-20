// Local storage for phase 1. Everything stays on this phone.
// Phase 2 swaps this module for a shared backend (accounts, shared events and notices).
const P = "ff.";

export function get(key, dflt) {
  try {
    const v = localStorage.getItem(P + key);
    return v === null ? dflt : JSON.parse(v);
  } catch { return dflt; }
}

export function set(key, value) {
  try { localStorage.setItem(P + key, JSON.stringify(value)); return true; }
  catch { return false; }
}

export function push(key, item, max = 500) {
  const list = get(key, []);
  list.unshift(item);
  set(key, list.slice(0, max));
  return list;
}

export function update(key, id, patch) {
  const list = get(key, []).map((x) => (x.id === id ? { ...x, ...patch } : x));
  set(key, list);
  return list;
}

export function remove(key, id) {
  const list = get(key, []).filter((x) => x.id !== id);
  set(key, list);
  return list;
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
