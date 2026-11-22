// Languages most spoken by UK ride-hail drivers. Native names, writing direction.
export const LANGUAGES = [
  ["en", "English", "ltr"], ["ar", "العربية", "rtl"], ["ur", "اردو", "rtl"], ["bn", "বাংলা", "ltr"],
  ["pa", "ਪੰਜਾਬੀ", "ltr"], ["hi", "हिन्दी", "ltr"], ["gu", "ગુજરાતી", "ltr"], ["ta", "தமிழ்", "ltr"],
  ["so", "Soomaali", "ltr"], ["ps", "پښتو", "rtl"], ["fa", "فارسی", "rtl"], ["ckb", "کوردی", "rtl"],
  ["ku", "Kurdî", "ltr"], ["ti", "ትግርኛ", "ltr"], ["am", "አማርኛ", "ltr"], ["tr", "Türkçe", "ltr"],
  ["sq", "Shqip", "ltr"], ["pl", "Polski", "ltr"], ["ro", "Română", "ltr"], ["bg", "Български", "ltr"],
  ["lt", "Lietuvių", "ltr"], ["pt", "Português", "ltr"], ["es", "Español", "ltr"], ["fr", "Français", "ltr"],
  ["uk", "Українська", "ltr"], ["ru", "Русский", "ltr"],
];

let strings = {};
let fallback = {};
export let lang = "en";

async function load(code) {
  const res = await fetch(`lang/${code}.json`);
  if (!res.ok) throw new Error(`lang ${code}: ${res.status}`);
  return res.json();
}

export async function setLanguage(code) {
  if (!Object.keys(fallback).length) fallback = await load("en");
  const known = LANGUAGES.find((l) => l[0] === code) || LANGUAGES[0];
  try { strings = known[0] === "en" ? fallback : await load(known[0]); }
  catch { strings = fallback; }
  lang = known[0];
  document.documentElement.lang = lang;
  document.documentElement.dir = known[2];
}

// Translate a key; {name} placeholders are filled from vars. Missing keys fall back to English.
export function t(key, vars = {}) {
  const s = strings[key] ?? fallback[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
}

// Browser language → one of ours (e.g. "pt-BR" → "pt", "ku-Arab" → "ckb")
export function guessLanguage() {
  for (const raw of navigator.languages || [navigator.language || "en"]) {
    const l = raw.toLowerCase();
    if (l.startsWith("ku-arab") || l.startsWith("ckb")) return "ckb";
    const base = l.split("-")[0];
    if (LANGUAGES.some((x) => x[0] === base)) return base;
    if (base === "prs") return "fa"; // Dari reads Persian
  }
  return "en";
}

// Always "£" in front (some locales write "UK£" or put it after), digits in the reader's style.
export function money(x, digits = 2) {
  let n;
  try { n = new Intl.NumberFormat(lang, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Math.abs(x)); }
  catch { n = Math.abs(x).toFixed(digits); }
  return (x < 0 ? "−£" : "£") + n;
}

export function num(x, digits = 1) {
  try { return new Intl.NumberFormat(lang, { maximumFractionDigits: digits }).format(x); }
  catch { return String(x); }
}

export function weekdayShort(i) {
  const d = new Date(2024, 0, 1 + i); // 1 Jan 2024 was a Monday
  try { return new Intl.DateTimeFormat(lang, { weekday: "short" }).format(d); }
  catch { return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]; }
}

export function dateTime(d) {
  try { return new Intl.DateTimeFormat(lang, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d); }
  catch { return d.toLocaleString(); }
}

export function dateOnly(d) {
  const x = typeof d === "string" ? new Date(d + "T12:00") : d;
  try { return new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", year: "numeric" }).format(x); }
  catch { return x.toDateString(); }
}
