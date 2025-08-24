// renderer.js — Poser
// ------------------------------------------------------------
// Runs in the renderer. Uses preload-exposed APIs:
//   window.poser    → adapters/MAC ops
//   window.nebula   → window controls
//   window.profiles → persistence (electron-store via IPC)
// ------------------------------------------------------------
import { prettyMac, randomMac, toast } from './utilities.js';
import {
  initRotation, startRotation, stopRotation,
  getRotateDeadline, isRotationEnabled
} from './macrotation.js';

/* =============================
 *  Small DOM helpers & storage
 * ============================= */
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/** In-memory store: profileId -> saved MAC string (AA:BB:...) */
const profileMACs = new Map();

/** Helper: extract stable id from a profile <li> */
function getProfileId(li) {
  return li?.dataset?.profileId || null;
}

/* =============================
 *  Rotation countdown UI
 * ============================= */
function minutesToMs(v) {
  const n = parseInt(v, 10);
  return isNaN(n) ? 5 * 60 * 1000 : n * 60 * 1000;
}

function updateCountdownUI() {
  const box = document.getElementById("rotateCountdown");
  if (!box) return;

  if (!isRotationEnabled()) {
    box.textContent = "—";
    box.classList.remove("active");
    return;
  }
  const ms = getRotateDeadline() - Date.now();
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  box.textContent = `${m}:${s}`;
  box.classList.add("active");
}

function setupRandomAndRotationUI() {
  const enable = document.getElementById("rotateEnable");
  const intervalEl = document.getElementById("rotateInterval");

  // Randomize Now
  document.getElementById("randomNowBtn")?.addEventListener("click", () => {
    document.getElementById("macInput").value = randomMac();
    if (enable?.checked) updateCountdownUI();
  });

  // Enable/disable rotation
  enable?.addEventListener("change", (e) => {
    if (e.target.checked) {
      startRotation({ autoApply: true });
      toast("Rotation enabled. Changes will take effect at selected interval.");
    } else {
      stopRotation();
      toast("Rotation disabled");
    }
  });

  // Changing interval restarts timer if enabled
  intervalEl?.addEventListener("change", () => {
    if (enable?.checked) {
      startRotation({ autoApply: true });
      toast("Rotation interval updated");
    } else {
      updateCountdownUI();
    }
  });
}

/* =============================
 *  Profiles
 * ============================= */
function getActiveProfileLI() {
  return $("#profile-list .item.active");
}

function updateDeleteButtonVisibility() {
  const li = getActiveProfileLI();
  const btn = $("#deleteProfileBtn");
  if (!btn) return;
  btn.style.display = (li && li.id !== "profile-this") ? "inline-block" : "none";
}

async function deleteActiveProfile() {
  const li = getActiveProfileLI();
  if (!li) { toast("No profile selected", true); return; }
  if (li.id === "profile-this") return;

  const pid = getProfileId(li);
  if (!pid) { toast("Profile missing id", true); return; }

  try {
    await window.profiles.remove(pid);
    profileMACs.delete(pid);
    li.remove();

    const base = $("#profile-this");
    if (base) {
      $$("#profile-list .item").forEach(el => el.classList.remove("active"));
      base.classList.add("active");
      const orig = await refreshOriginalMac();
      $("#macInput").value = orig !== "—" ? orig : "";
    }
    updateDeleteButtonVisibility();
    toast("Profile deleted");
  } catch (e) {
    console.error(e);
    toast("Delete failed: " + (e.message || e), true);
  }
}

async function loadAndRenderProfiles() {
  const list = $("#profile-list");
  const addBtn = $("#add-profile");
  const THIS_ID = "profile-this";

  // remove dynamic items
  Array.from(list.querySelectorAll(".item")).forEach((li) => {
    if (li.id !== THIS_ID && li.id !== "add-profile") li.remove();
  });

  const data = await window.profiles.list(); // [{id,name,mac}]
  for (const p of data) {
    const li = document.createElement("li");
    li.className = "item";
    li.dataset.profileId = p.id;
    li.innerHTML = `<span class="pname">${p.name}</span>`;
    list.insertBefore(li, addBtn);
    if (p.mac) profileMACs.set(p.id, p.mac);
  }
}

function setupProfilesUI() {
  const list = $("#profile-list");
  const addBtn = $("#add-profile");
  const newProfileBtn = $("#newProfileBtn"); // footer button
  const THIS_ID = "profile-this";

  // Next unique default name: Profile 1, 2, 3...
  const nextProfileName = (() => {
    let n = 1;
    return () => {
      const names = $$("#profile-list .item .pname").map((el) => el.textContent.trim());
      while (names.includes(`Profile ${n}`)) n++;
      return `Profile ${n++}`;
    };
  })();

  function setActive(li) {
    $$("#profile-list .item").forEach((el) => el.classList.remove("active"));
    li.classList.add("active");
    updateDeleteButtonVisibility();
  }

  function createProfile(name) {
    return window.profiles.create(name || undefined).then((p) => {
      const li = document.createElement("li");
      li.className = "item";
      li.dataset.profileId = p.id;
      li.innerHTML = `<span class="pname">${p.name}</span>`;
      $("#profile-list").insertBefore(li, $("#add-profile"));
      $$("#profile-list .item").forEach((el) => el.classList.remove("active"));
      li.classList.add("active");
      updateDeleteButtonVisibility();
      return li;
    });
  }

  function startRename(li) {
    if (!li || li.id === THIS_ID || li.id === "add-profile") return;
    if (li.querySelector("input.profile-rename")) return;

    const nameEl = li.querySelector(".pname");
    const old = nameEl ? nameEl.textContent.trim() : li.textContent.trim();

    const input = document.createElement("input");
    input.className = "profile-rename";
    input.value = old;

    li.innerHTML = "";
    li.appendChild(input);
    input.focus();
    input.select();

    const commit = async () => {
      const newName = input.value.trim() || old;
      const pid = getProfileId(li);
      li.innerHTML = `<span class="pname">${newName}</span>`;
      if (pid) await window.profiles.update({ id: pid, name: newName });
    };
    const cancel = () => {
      li.innerHTML = `<span class="pname">${old}</span>`;
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") commit();
      else if (e.key === "Escape") cancel();
    });
    input.addEventListener("blur", commit);
  }

  addBtn?.addEventListener("click", () => createProfile(nextProfileName()));
  newProfileBtn?.addEventListener("click", () => createProfile(nextProfileName()));

  list.addEventListener("click", async (e) => {
    const li = e.target.closest(".item");
    if (!li || li.id === "add-profile") return;
    if (e.target.matches("input.profile-rename")) return;

    setActive(li);

    if (li.id === THIS_ID) {
      const orig = await refreshOriginalMac();
      $("#macInput").value = orig !== "—" ? orig : "";
      $("#macInput").placeholder = "AA:BB:CC:DD:EE:FF";
      return;
    }

    const pid = getProfileId(li);
    const saved = profileMACs.get(pid);
    $("#macInput").value = saved || "";
    if (!saved) $("#macInput").placeholder = "AA:BB:CC:DD:EE:FF";
  });

  list.addEventListener("dblclick", (e) => {
    const li = e.target.closest(".item");
    if (!li || li.id === THIS_ID || li.id === "add-profile") return;
    startRename(li);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "F2") {
      const li = getActiveProfileLI();
      if (li && li.id !== THIS_ID) startRename(li);
    }
  });
}

function setupSaveToProfile() {
  const btn = $("#saveProfileBtn");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    try {
      const li = getActiveProfileLI();
      if (!li) throw new Error("No active profile selected.");
      if (li.id === "profile-this") throw new Error(`"This Computer" is static; pick or create a profile.`);

      const mac = normalizeInputMac($("#macInput").value);
      const pid = getProfileId(li);
      if (!pid) throw new Error("Profile is missing an id.");

      profileMACs.set(pid, mac);
      li.dataset.savedMac = mac;

      await window.profiles.update({ id: pid, mac });

      const name = li.querySelector(".pname")?.textContent.trim() || "Profile";
      toast(`Saved ${mac} to ${name}`);
    } catch (e) {
      toast(e.message, true);
    }
  });
}

/* =============================
 *  UI utilities
 * ============================= */
function setStatus(msg, type = "info") {
  const el = $("#status");
  if (!el) return;
  el.textContent = msg || "";
  el.className = `status ${type}`;
}

function normalizeInputMac(s) {
  const hex = String(s || "").replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
  if (hex.length !== 12) throw new Error("Enter MAC as 12 hex (e.g. AA:BB:CC:DD:EE:FF).");
  return hex.match(/.{2}/g).join(":");
}

/* =============================
 *  Adapters & MAC actions
 * ============================= */
async function populateAdapters() {
  const sel = $("#adapterSelect");
  if (!sel) return;
  sel.innerHTML = "";

  try {
    const adapters = await window.poser.listAdapters();
    if (!Array.isArray(adapters) || adapters.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No adapters found";
      sel.appendChild(opt);
      return;
    }

    adapters.forEach((a) => {
      const opt = document.createElement("option");
      opt.value = a.Name;
      opt.textContent = `${a.Name} — ${a.InterfaceDescription}`;
      sel.appendChild(opt);
    });

    const toL = (s) => String(s || "").toLowerCase();
    const looksWifi = (a) =>
      /\b(wi-?fi|wireless|wlan|802\.11)\b/.test((toL(a.InterfaceDescription) + " " + toL(a.Name)));
    const looksVpnOrVirtual = (a) =>
      /\b(vpn|wireguard|openvpn|anyconnect|nord|proton|zerotier|hamachi|tap|tun|wan miniport|hyper-v|vmware|virtualbox|virtual|tunnel|lynx)\b/
        .test((toL(a.InterfaceDescription) + " " + toL(a.Name)));
    const isUp = (a) => toL(a.Status) === "up";

    let best = null, bestScore = -1e9;
    for (const a of adapters) {
      let score = 0;
      if (looksWifi(a)) score += 5;
      if (isUp(a)) score += 3;
      if (looksVpnOrVirtual(a)) score -= 6;
      if (score > bestScore) { bestScore = score; best = a; }
    }
    if (!best) best = adapters.find(isUp) || adapters[0];

    sel.value = best.Name;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  } catch (err) {
    console.error(err);
    alert("Couldn't list adapters: " + err.message);
  }
}

async function refreshCurrentMac() {
  const name = $("#adapterSelect")?.value;
  if (!name) return;
  try {
    const mac = await window.poser.getMac(name);
    $("#currentMac").textContent = prettyMac(mac);
  } catch {
    $("#currentMac").textContent = "—";
  }
}

async function refreshOriginalMac() {
  const name = $("#adapterSelect")?.value;
  if (!name) return "—";
  try {
    const mac = await window.poser.getMac(name);
    return prettyMac(mac);
  } catch {
    return "—";
  }
}

async function applyMac() {
  const name = $("#adapterSelect")?.value;
  if (!name) return alert("Select an adapter first.");

  let mac;
  try {
    mac = normalizeInputMac($("#macInput").value);
  } catch (e) {
    return alert(e.message);
  }

  setStatus("Applying…", "info");
  try {
    const res = await window.poser.setMac(name, mac);
    await refreshCurrentMac();
    setStatus(`Applied via ${res.method}.`, "ok");
  } catch (e) {
    console.error(e);
    setStatus("Apply failed: " + (e.message || e), "error");
  }
}

async function restoreMac() {
  const name = $("#adapterSelect")?.value;
  if (!name) return alert("Select an adapter first.");

  setStatus("Restoring…", "info");
  try {
    await window.poser.restore(name);
    await refreshCurrentMac();
    setStatus("Restored to factory MAC.", "ok");
  } catch (e) {
    console.error(e);
    setStatus("Restore failed: " + (e.message || e), "error");
  }
}

/* =============================
 *  Window controls
 * ============================= */
function wireWindowButtons() {
  const actions = {
    close: () => window.nebula?.close?.(),
    min:   () => window.nebula?.minimize?.(),
    max:   () => window.nebula?.maximizeToggle?.()
  };
  $$(".winbtn").forEach((b) => b.addEventListener("click", () => actions[b.dataset.action]?.()));
}

/* =============================
 *  Boot
 * ============================= */
document.addEventListener("DOMContentLoaded", async () => {
  wireWindowButtons();
  $("#deleteProfileBtn")?.addEventListener("click", deleteActiveProfile);

  await loadAndRenderProfiles();
  populateAdapters();

  $("#adapterSelect")?.addEventListener("change", refreshCurrentMac);
  $("#applyBtn")?.addEventListener("click", applyMac);
  $("#restoreBtn")?.addEventListener("click", restoreMac);

  setupProfilesUI();
  setupSaveToProfile();
  setupRandomAndRotationUI();

  updateCountdownUI();

  $("#randomBtn")?.addEventListener("click", () => {
    $("#macInput").value = randomMac();
  });

  // Provide rotation module with helpers
  initRotation({ randomMac, applyMac, minutesToMs, setStatus, updateCountdownUI });

  // Hide delete initially
  updateDeleteButtonVisibility();
});
