// modules/storage.js
// Unified Promise-based wrapper around chrome.storage.local

const Storage = (() => {
  function get(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  }

  function set(data) {
    return new Promise((resolve, reject) =>
      chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
        resolve();
      })
    );
  }

  function remove(keys) {
    return new Promise((resolve) => chrome.storage.local.remove(keys, resolve));
  }

  // Daily record keyed as "day_YYYY-MM-DD"
  function _dateKey(date = new Date()) {
    return `day_${date.toISOString().slice(0, 10)}`;
  }

  async function getDayRecord(date = new Date()) {
    const key = _dateKey(date);
    const result = await get(key);
    return result[key] || _emptyDayRecord();
  }

  async function setDayRecord(data, date = new Date()) {
    const key = _dateKey(date);
    return set({ [key]: data });
  }

  async function updateDayRecord(updater, date = new Date()) {
    const record = await getDayRecord(date);
    const updated = updater(record);
    return setDayRecord(updated, date);
  }

  function _emptyDayRecord() {
    return {
      focusScore: 0,
      focusMinutes: 0,
      breakCount: 0,
      moodLog: [],
      resetLog: [],
      tabSwitches: 0,
      scrollBursts: 0,
      fatigueSpikes: [],
      hourlyTabSwitches: new Array(24).fill(0),
      hourlyFatigueScore: new Array(24).fill(0),
    };
  }

  async function getMeta() {
    const result = await get('meta');
    return result.meta || {
      streakDays: 0,
      lastActiveDate: null,
      totalFocusHours: 0,
      totalResets: 0,
    };
  }

  async function setMeta(data) {
    return set({ meta: data });
  }

  async function updateMeta(updater) {
    const meta = await getMeta();
    return setMeta(updater(meta));
  }

  async function getSettings() {
    const result = await get('settings');
    return result.settings || _defaultSettings();
  }

  async function setSettings(data) {
    return set({ settings: data });
  }

  async function updateSettings(updater) {
    const s = await getSettings();
    return setSettings(updater(s));
  }

  function _defaultSettings() {
    return {
      fatigueSensitivity: 0.6,
      theme: 'forest-calm',
      notificationsEnabled: true,
      quoteStyle: 'calm',
      ambientSound: false,
      features: {
        focusMode: true,
        ambientSounds: true,
        distractionBlocking: false,
        moodCheck: true,
        circadianPrompts: true,
      },
    };
  }

  async function getActiveSession() {
    const result = await get('activeSession');
    return result.activeSession || null;
  }

  async function setActiveSession(data) {
    if (data === null) return remove('activeSession');
    return set({ activeSession: data });
  }

  // Legacy keys used by old popup/background — kept for backward compat
  async function getFatigueState() {
    const result = await get(['fatigueScore', 'focusStartTime', 'tabSwitchTimes', 'scrollData']);
    return result;
  }

  // Get last N days of records for insights
  async function getRecentDays(n = 7) {
    const keys = [];
    const now = new Date();
    for (let i = 0; i < n; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      keys.push(`day_${d.toISOString().slice(0, 10)}`);
    }
    const result = await get(keys);
    return keys.map((k) => result[k] || _emptyDayRecord());
  }

  return {
    get,
    set,
    remove,
    getDayRecord,
    setDayRecord,
    updateDayRecord,
    getMeta,
    setMeta,
    updateMeta,
    getSettings,
    setSettings,
    updateSettings,
    getActiveSession,
    setActiveSession,
    getFatigueState,
    getRecentDays,
  };
})();
