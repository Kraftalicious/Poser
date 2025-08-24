// utilities.js
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));





/** Pretty-print to "AA:BB:CC:DD:EE:FF" */
export function prettyMac(m) {
  if (!m) return "";
  const hex = String(m).replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
  if (hex.length !== 12) return String(m).toUpperCase();
  return hex.match(/.{2}/g).join(":");
}





/** random locally-administered, unicast MAC */
export function randomMac() {
  const b0 = (Math.floor(Math.random() * 256) | 0x02) & 0xFE; // set LAA, clear multicast
  const toHex = (n) => n.toString(16).padStart(2, "0").toUpperCase();
  const bytes = [b0, ...Array.from({ length: 5 }, () => Math.floor(Math.random() * 256))];
  return bytes.map(toHex).join(":");
}





/** Tiny toast (bottom-right) */
export function toast(msg, isErr = false) {
  let el = $("#toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.style.position = "fixed";
    el.style.right = "16px";
    el.style.bottom = "16px";
    el.style.padding = "10px 14px";
    el.style.borderRadius = "10px";
    el.style.background = "#2a2f46";
    el.style.color = "#d9dde4";
    el.style.border = "1px solid #3a3f59";
    el.style.transition = "opacity .25s ease";
    el.style.zIndex = "9999";
    document.body.appendChild(el);
  }
  el.style.background = isErr ? "#5b2b2b" : "#2a2f46";
  el.textContent = msg;
  el.style.opacity = "1";
  clearTimeout(el._t);
  el._t = setTimeout(() => (el.style.opacity = "0"), 2200);
}