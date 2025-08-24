


// main.js (CommonJS) — poser
const { app, BrowserWindow, ipcMain, nativeTheme } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const Store = require('electron-store');
const store = new Store({ name: 'poser', defaults: { profiles: [] } });
function getProfiles()  { return store.get('profiles') || []; }
function setProfiles(p) { store.set('profiles', p || []); }
function createProfile(name) {
  const item = { id: Date.now().toString(), name: name || 'Profile', mac: '' };
  setProfiles([...getProfiles(), item]);
  return item;
}
function upsertProfile({ id, name, mac }) {
  const list = getProfiles();
  let item = list.find(p => p.id === id);
  if (!item) {
    item = { id, name: name || 'Profile', mac: mac || '' };
    list.push(item);
  } else {
    if (name !== undefined) item.name = name;
    if (mac  !== undefined) item.mac  = mac;
  }
  setProfiles(list);
  return item;
}
function deleteProfile(id) {
  setProfiles(getProfiles().filter(p => p.id !== id));
}



let win;





// Elevated PowerShell via UAC (uses base64 to avoid quoting issues)
const sudo = require("sudo-prompt");
function runPSAdmin(script) {
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`;
  return new Promise((resolve, reject) => {
    sudo.exec(cmd, { name: "poser" }, (error, stdout, stderr) => {
      if (error) return reject(error);
      // Some PS writes to stderr even on success; prefer stdout when present.
      resolve((stdout || "").trim());
    });
  });
}








// ---------- PowerShell helper ----------
function runPS(command) {
  return new Promise((resolve, reject) => {
    const ps = spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
      { windowsHide: true }
    );
    let out = "", err = "";
    ps.stdout.on("data", d => (out += d.toString()));
    ps.stderr.on("data", d => (err += d.toString()));
    ps.on("exit", code => (code === 0 ? resolve(out.trim()) : reject(new Error(err || `Exit ${code}`))));
  });
}

function normalizeMac(mac) {
  const hex = String(mac).replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
  if (hex.length !== 12) throw new Error("Invalid MAC format. Expected 12 hex digits.");
  // Windows cmdlets accept AA-BB-CC-DD-EE-FF; we return hyphenated
  return hex.match(/.{2}/g).join("-");
}

// ---------- IPC: Adapters / MAC ops ----------
ipcMain.handle("adapters:list", async () => {
  const cmd = `
    Get-NetAdapter |
      Select-Object Name, InterfaceDescription, Status, MacAddress, InterfaceGuid |
      ForEach-Object { $_ | Add-Member -PassThru NoteProperty Guid ($_.InterfaceGuid.ToString()) } |
      Select-Object Name, InterfaceDescription, Status, MacAddress, Guid |
      ConvertTo-Json -Depth 3
  `;
  const json = await runPS(cmd);
  return JSON.parse(json || "[]");
});

ipcMain.handle("adapter:getMac", async (_e, { name }) => {
  const out = await runPS(`(Get-NetAdapter -Name "${name}").MacAddress`);
  return out.replace(/\s+/g, "").toUpperCase(); // usually "AA-BB-..."
});



// At top with your other requires
const profiles = require('./profiles');

// … inside your ipc wiring area:
ipcMain.handle('profiles:list',   () => profiles.getProfiles());
ipcMain.handle('profiles:create', (_e, { name }) => profiles.createProfile(name));
ipcMain.handle('profiles:update', (_e, payload)   => profiles.upsertProfile(payload));
ipcMain.handle('profiles:delete', (_e, { id })    => profiles.deleteProfile(id));



// Helper: strip separators and uppercase → "AABBCCDDEEFF"
function macToReg(macStr) {
  return String(macStr).replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
}
// Helper: enforce Locally Administered (bit1=1) and Unicast (bit0=0)
function enforceLaa(mac12) {
  if (mac12.length !== 12) throw new Error("MAC must be 12 hex digits");
  const b0 = parseInt(mac12.slice(0, 2), 16);
  const laa = ((b0 | 0x02) & 0xFE).toString(16).padStart(2, "0").toUpperCase();
  return laa + mac12.slice(2);
}

function enforceUnicast(mac12) {
  if (mac12.length !== 12) throw new Error("MAC must be 12 hex digits");
  const b0 = parseInt(mac12.slice(0, 2), 16);
  const unicast = (b0 & 0xFE).toString(16).padStart(2, "0").toUpperCase(); // clear multicast bit
  return unicast + mac12.slice(2);
}


ipcMain.handle("adapter:setMac", async (_e, { name, mac }) => {
  // Format for Windows driver: 12 hex, LAA enforced
  const mac12 = enforceUnicast(macToReg(mac)); // keeps A8 if valid
  const friendly = mac12.match(/.{2}/g).join("-");    // "AA-88-CE-89-59-41"

  const script = `
    $ErrorActionPreference='Stop'
    $name  = "${name}"
    $mac12 = "${mac12}"
    $class = "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e972-e325-11ce-bfc1-08002be10318}"

    # Find the adapter's 00xx key by InterfaceGuid -> NetCfgInstanceId
    $guid = (Get-NetAdapter -Name $name).InterfaceGuid.ToString()
    $key  = Get-ChildItem $class | ForEach-Object {
      $p=$_.PSPath
      $props = Get-ItemProperty $p -ErrorAction SilentlyContinue
      if ($props.NetCfgInstanceId -and $props.NetCfgInstanceId -eq $guid) { $p }
    } | Select-Object -First 1
    if (-not $key) { throw "Adapter registry key not found for '$name' (GUID: $guid)" }

    # --- registry-write chunk (fixed) ---
    if (Get-ItemProperty -Path $key -Name 'NetworkAddress' -ErrorAction SilentlyContinue) {
      Set-ItemProperty -Path $key -Name 'NetworkAddress' -Value $mac12
    } else {
      New-ItemProperty -Path $key -Name 'NetworkAddress' -PropertyType String -Value $mac12 | Out-Null
    }

    # Some drivers also honor the advanced property path; set it too (no restart here)
    try { Set-NetAdapterAdvancedProperty -Name $name -DisplayName 'Network Address' -DisplayValue $mac12 -NoRestart -ErrorAction SilentlyContinue | Out-Null } catch {}

    # Bounce adapter so driver reloads value
    Disable-NetAdapter -Name $name -Confirm:$false | Out-Null
    Start-Sleep -Milliseconds 1800
    Enable-NetAdapter  -Name $name -Confirm:$false | Out-Null
    Start-Sleep -Milliseconds 800

    (Get-NetAdapter -Name $name).MacAddress
  `;

  const after = await runPSAdmin(script);  // elevated via sudo-prompt
  return { ok: true, method: "Registry", requested: friendly, current: after.trim() };
});

// Chromium noise suppression
app.commandLine.appendSwitch('disable-logging');
app.commandLine.appendSwitch('log-level', '3'); // 3=ERROR, 2=WARNING, 1=INFO



ipcMain.handle("adapter:restore", async (_e, { name }) => {
  const script = `
    $ErrorActionPreference='Stop'
    $name  = "${name}"
    $class = "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e972-e325-11ce-bfc1-08002be10318}"
    $guid  = (Get-NetAdapter -Name $name).InterfaceGuid.ToString()

    # Find adapter's registry key
    $key = Get-ChildItem $class | ForEach-Object {
      $p=$_.PSPath
      $props = Get-ItemProperty $p -ErrorAction SilentlyContinue
      if ($props.NetCfgInstanceId -and $props.NetCfgInstanceId -eq $guid) { $p }
    } | Select-Object -First 1

    if (-not $key) { throw "Adapter registry key not found for '$name' (GUID: $guid)" }

    # Delete the override if it exists
    Remove-ItemProperty -Path $key -Name 'NetworkAddress' -ErrorAction SilentlyContinue

    # Bounce adapter so it reloads its burned-in MAC
    Disable-NetAdapter -Name $name -Confirm:$false | Out-Null
    Start-Sleep -Milliseconds 1800
    Enable-NetAdapter  -Name $name -Confirm:$false | Out-Null
    Start-Sleep -Milliseconds 800

    # Report the active MAC after restore
    (Get-NetAdapter -Name $name).MacAddress
  `;

  const after = await runPSAdmin(script); // run elevated via sudo-prompt
  return { ok: true, current: after.trim() };
});


// ---------- Window ----------
function createWindow() {
  const win = new BrowserWindow({
    width: 730,
    height: 700,
    minWidth: 730,
    maxWidth: 730,   // locks width
    minHeight: 400,   // still resizable vertically
    // maxHeight: 700, // optional if you also want to fix height
    frame: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js")
    }
  });

  win.once("ready-to-show", () => win.show());
  win.loadFile(path.join(__dirname, "index.html")).catch(err => {
    console.error("Failed to load index.html:", err);
  });

  // optional: helpful logs
  win.webContents.on("render-process-gone", (_e, details) =>
    console.error("Renderer crashed:", details)
  );
}

// ---------- App lifecycle ----------
app.commandLine.appendSwitch("enable-logging"); // more logs in terminal
nativeTheme.themeSource = "dark";

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});




