// macrotation.js — rotation engine (ES module)
// Keeps all timer state internal; renderer provides helpers via initRotation()

// --- module-scoped state ---
let rotateTimer = null;
let rotateCountdownTimer = null;
let rotateApplying = false;
let rotateDeadline = 0; // timestamp (ms) for next tick

// --- injected dependencies (provided by renderer.initRotation) ---
let deps = {
  randomMac: null,          // () => "AA:BB:..."
  applyMac: null,           // () => Promise<void>
  minutesToMs: null,        // (val:string|number) => ms:number
  setStatus: null,          // (msg, type?) => void
  updateCountdownUI: null   // () => void
};

// call this once from renderer after DOM is ready
export function initRotation({ randomMac, applyMac, minutesToMs, setStatus, updateCountdownUI }) {
  deps.randomMac = randomMac;
  deps.applyMac = applyMac;
  deps.minutesToMs = minutesToMs;
  deps.setStatus = setStatus;
  deps.updateCountdownUI = updateCountdownUI;
}

// public helpers the renderer can read
export function getRotateDeadline() { return rotateDeadline; }
export function isRotationEnabled() { return !!rotateTimer; }

// internal: read current interval (ms) from DOM with fallback
function currentIntervalMs() {
  const sel = document.getElementById("rotateInterval");
  const raw = sel?.value ?? "5";
  return (deps.minutesToMs?.(raw)) ?? 5 * 60 * 1000;
}

// stop everything & clear UI
export function stopRotation() {
  if (rotateTimer) { clearInterval(rotateTimer); rotateTimer = null; }
  if (rotateCountdownTimer) { clearInterval(rotateCountdownTimer); rotateCountdownTimer = null; }
  rotateApplying = false;
  rotateDeadline = 0;
  deps.updateCountdownUI?.();
}

// start timer; autoApply=true means call applyMac() each tick
export function startRotation({ autoApply = true } = {}) {
  stopRotation(); // reset any prior timers

  const ms = currentIntervalMs();
  rotateDeadline = Date.now() + ms;

  // 1) main rotation tick
  rotateTimer = setInterval(async () => {
    try {
      if (rotateApplying) return;
      rotateApplying = true;

      // put a fresh random MAC into the input field
      const mac = deps.randomMac?.();
      const input = document.getElementById("macInput");
      if (input && mac) input.value = mac;

      // optionally apply it
      if (autoApply && deps.applyMac) {
        await deps.applyMac();
      }
    } catch (e) {
      console.error(e);
      deps.setStatus?.("Auto-apply failed: " + (e?.message || e), "error");
    } finally {
      rotateApplying = false;
      // schedule next tick from 'now' for steady cadence
      rotateDeadline = Date.now() + currentIntervalMs();
      deps.updateCountdownUI?.();
    }
  }, ms);

  // 2) 1-second countdown refresher
  rotateCountdownTimer = setInterval(() => {
    deps.updateCountdownUI?.();
  }, 1000);

  // prime the UI
  deps.updateCountdownUI?.();
}
