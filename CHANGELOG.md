# 📜 Poser -- Changelog v2.1.0

### 🎨 UI & Styling

-   Added a **Discord-style dark theme** with custom titlebar and
    sidebar.\
-   Profiles sidebar cleaned up:
    -   "This Computer" is now a static, default profile.\
    -   Replaced multiple empty profiles with a single **"+ Add
        Profile"** button.\
    -   Profiles can be **renamed inline** (double-click or F2).\
    -   Added **Delete Profile** button (hidden when "This Computer" is
        selected).\
-   Improved spacing & aesthetics:
    -   Hid scrollbars for a clean look.\
    -   Added subtle separators (`<hr class="sep">`) for section
        breaks.\
    -   Italic label support.\
    -   Custom checkbox styling option for "Enable rotation."\
    -   Checkbox spacing (`margin-right`) for cleaner alignment.

------------------------------------------------------------------------

### ⚙️ Core Features

-   Profiles persist via **electron-store** (`poser.json` in
    `%APPDATA%\Poser`).\
-   Profiles now save & load MAC addresses, with **auto-fill when
    selected**.\
-   Default adapter auto-select:
    -   Picks the active **Wi-Fi adapter** if available.\
    -   Ignores VPNs/virtual adapters where possible.\
-   Apply/Restore MAC working end-to-end:
    -   Writes registry key (`NetworkAddress`) correctly (without
        colons).\
    -   Restore deletes the override and restarts the adapter.\
-   Added **status messages** (inline + toast notifications).

------------------------------------------------------------------------

### 🔄 New Rotation Feature

-   Under "Set MAC", added a new **Rotation block**:
    -   Checkbox: **Enable rotation**\
    -   Dropdown: select interval (1 / 5 / 15 / 30 / 60 min)\
    -   Countdown pill shows **time until next rotation**.\
    -   **Randomize Now** button instantly drops a random MAC into the
        input.\
-   Rotation:
    -   Generates a valid locally-administered unicast MAC.\
    -   **Auto-applies** at each interval when enabled.\
    -   Countdown resets when Randomize Now is used.

------------------------------------------------------------------------

### 🛠 Dev & Build

-   Added **live reload** in dev using `nodemon` (or `electronmon` as an
    option).\
-   Fixed ESM issue with `electron-store` by locking to **v8
    (CommonJS)** for simplicity.\
-   `package.json` updated with:
    -   `npm run dev` → hot-reload for JS/HTML/CSS changes.\
    -   `npm run dist:win` → builds a standalone EXE with
        electron-builder.\
-   Confirmed portable & installer builds work.

------------------------------------------------------------------------

### ✅ Quality of Life

-   Profiles sidebar always shows **"This Computer"** highlighted by
    default.\
-   Selecting "This Computer" shows the **adapter's original MAC**.\
-   Toast notifications for save/delete/rotation events.\
-   Option to lock window width (fixed horizontal size).

------------------------------------------------------------------------

💡 **Today we took Poser from a skeleton Electron app to a polished
desktop utility with profiles, persistence, MAC rotation, a slick UI,
and working builds.**
