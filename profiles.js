// profiles.js — main-process profiles module (CommonJS)
const Store = require('electron-store');

// Keep this name to store at %APPDATA%\Poser\poser.json
const store = new Store({ name: 'poser', defaults: { profiles: [] } });

// --- Core helpers ---
function getProfiles() {
  return store.get('profiles') || [];
}

function setProfiles(list) {
  store.set('profiles', Array.isArray(list) ? list : []);
}

function createProfile(name) {
  const item = {
    id: Date.now().toString(),
    name: name && name.trim() ? name.trim() : 'Profile',
    mac: ''
  };
  setProfiles([...getProfiles(), item]);
  return item;
}

function upsertProfile({ id, name, mac }) {
  if (!id) throw new Error('Profile id is required');
  const list = getProfiles();
  let p = list.find(x => x.id === id);
  if (!p) {
    p = { id, name: name || 'Profile', mac: mac || '' };
    list.push(p);
  } else {
    if (name !== undefined) p.name = name;
    if (mac  !== undefined) p.mac  = mac;
  }
  setProfiles(list);
  return p;
}

function deleteProfile(id) {
  setProfiles(getProfiles().filter(x => x.id !== id));
  return { ok: true };
}

module.exports = {
  getProfiles,
  setProfiles,
  createProfile,
  upsertProfile,
  deleteProfile
};
