const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
function style(kind, px, dark) {
  const fg = dark ? "#fff" : "#000";
  if (kind.startsWith("badge:")) { const [, bg, col] = kind.split(":"); return `display:inline-block;font-size:${px}px;font-weight:700;background:${bg};color:${col};padding:2px 12px;border-radius:8px`; }
  if (kind === "b") return `font-size:${px}px;font-weight:700;color:${fg}`;
  if (kind === "btn") return `display:inline-block;font-size:${px}px;font-weight:700;background:${dark ? "#fff" : "#000"};color:${dark ? "#000" : "#fff"};padding:8px 28px;border-radius:8px`;
  if (kind === "chip") return `display:inline-block;font-size:${px}px;font-weight:700;background:${dark ? "#3a3a3c" : "#222"};color:#fff;padding:4px 12px;border-radius:14px`;
  return `font-size:${px}px;color:${fg}`;
}
module.exports = (c, dark) => `<html><body style="margin:0;width:390px;height:844px;background:${dark ? "#000" : "#eef0f2"};font-family:sans-serif">
<div style="padding:10px 18px">${c.top.map(([t, k, px]) => `<div style="margin:6px 0"><span style="${style(k, px, dark)}">${esc(t)}</span></div>`).join("")}</div>
<div style="position:absolute;bottom:20px;left:12px;right:12px;background:${dark ? "#1c1c1e" : "#fff"};border-radius:14px;padding:16px 18px">
${c.card.map(([t, k, px]) => `<div style="margin:6px 0"><span style="${style(k, px, dark)}">${esc(t)}</span></div>`).join("")}</div></body></html>`;
