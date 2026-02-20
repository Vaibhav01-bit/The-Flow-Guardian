// background.js — The Flow Guardian v2.0
// Modular service worker orchestrating fatigue detection, alarms, focus sessions
// All data is local-only via chrome.storage.local

// ── In-memory state (restored on startup) ─────────────────────────────────
let _fatigueScore = 0;
let _sessionStartTime = Date.now();
let _lastBreakTime = Date.now();
let _tabSwitchTimes = [];
let _scrollBurstTimes = [];
let _activeFocusSession = null; // { startTime, durationMins, soundChoice, endAlarmName }

const FATIGUE_THRESHOLD = 100;
const TICK_INTERVAL_MIN = 1;
const COOL_DOWN = 0.88;

// Weights
const W = {
  tabSwitch: 3.5,
  scrollBurst: 1.2,
  sessionAge: 0.4,
  noBreak: 6.0,
};

// ── Startup & Install ──────────────────────────────────────────────────────

chrome.runtime.onStartup.addListener(() => {
  restoreState().then(setupAlarms);
  updateStreakOnStartup();
});

chrome.runtime.onInstalled.addListener(() => {
  restoreState().then(setupAlarms);
  initDefaultSettings();
});

function setupAlarms() {
  chrome.alarms.create('fatigue-tick', { periodInMinutes: TICK_INTERVAL_MIN });
  chrome.alarms.create('daily-reset', { when: nextMidnight(), periodInMinutes: 1440 });
}

function nextMidnight() {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

async function initDefaultSettings() {
  const result = await chromeGet('settings');
  if (!result.settings) {
    await chromeSet({
      settings: {
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
      },
    });
  }
}

async function restoreState() {
  const saved = await chromeGet([
    'bgFatigueScore',
    'bgSessionStartTime',
    'bgLastBreakTime',
    'bgTabSwitchTimes',
    'bgScrollBurstTimes',
    'activeSession',
  ]);
  _fatigueScore = saved.bgFatigueScore || 0;
  _sessionStartTime = saved.bgSessionStartTime || Date.now();
  _lastBreakTime = saved.bgLastBreakTime || Date.now();
  _tabSwitchTimes = saved.bgTabSwitchTimes || [];
  _scrollBurstTimes = saved.bgScrollBurstTimes || [];
  _activeFocusSession = saved.activeSession || null;
}

function persistState() {
  chromeSet({
    bgFatigueScore: _fatigueScore,
    bgSessionStartTime: _sessionStartTime,
    bgLastBreakTime: _lastBreakTime,
    bgTabSwitchTimes: _tabSwitchTimes,
    bgScrollBurstTimes: _scrollBurstTimes,
  });
}

// ── Alarm Handler ──────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm) return;

  if (alarm.name === 'fatigue-tick') {
    handleFatigueTick();
  }

  if (alarm.name === 'daily-reset') {
    handleDailyReset();
  }

  if (alarm.name.startsWith('focus-end-')) {
    handleFocusSessionEnd();
  }
});

// ── Tab Activation ─────────────────────────────────────────────────────────

chrome.tabs.onActivated.addListener(() => {
  const now = Date.now();
  _tabSwitchTimes.push(now);
  // Prune to last 5 min
  _tabSwitchTimes = _tabSwitchTimes.filter((t) => now - t <= 5 * 60000);
  // Log to analytics day record
  logTabSwitchToDay();
});

async function logTabSwitchToDay() {
  const hour = new Date().getHours();
  const today = dayKey();
  const result = await chromeGet(today);
  const rec = result[today] || emptyDayRecord();
  rec.tabSwitches = (rec.tabSwitches || 0) + 1;
  rec.hourlyTabSwitches[hour] = (rec.hourlyTabSwitches[hour] || 0) + 1;
  await chromeSet({ [today]: rec });
}

// ── Message Handler ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request || !request.type) return;

  switch (request.type) {
    // Fatigue signals from content script
    case 'scrolling':
      handleScrollData(request.data);
      sendResponse({ ok: true });
      return true;

    case 'scrollBurst':
      _scrollBurstTimes.push(Date.now());
      _scrollBurstTimes = _scrollBurstTimes.filter((t) => Date.now() - t <= 5 * 60000);
      logScrollBurstToDay();
      sendResponse({ ok: true });
      return true;

    // State queries
    case 'getFatigueState':
      sendResponse({ score: _fatigueScore, threshold: FATIGUE_THRESHOLD });
      return true;

    case 'getDashboard':
      getDashboardData().then(sendResponse);
      return true; // async

    case 'getAnalytics':
      getAnalyticsData().then(sendResponse);
      return true;

    // Resets
    case 'resetFatigue':
      _fatigueScore = 0;
      _lastBreakTime = Date.now();
      _sessionStartTime = Date.now();
      persistState();
      sendResponse({ ok: true });
      return true;

    case 'logReset':
      handleLogReset(request.resetType, request.mood).then(() => sendResponse({ ok: true }));
      return true;

    // Focus sessions
    case 'startFocusSession':
      startFocusSession(request.durationMins, request.soundChoice).then(sendResponse);
      return true;

    case 'endFocusSession':
      endFocusSession().then(sendResponse);
      return true;

    case 'getFocusSession':
      sendResponse({ session: _activeFocusSession });
      return true;
  }
});

// ── Content Script Messages ───────────────────────────────────────────────

function handleScrollData(data) {
  if (!data) return;
  // Legacy compat — still used for fatigue calc
}

async function logScrollBurstToDay() {
  const today = dayKey();
  const result = await chromeGet(today);
  const rec = result[today] || emptyDayRecord();
  rec.scrollBursts = (rec.scrollBursts || 0) + 1;
  await chromeSet({ [today]: rec });
}

// ── Fatigue Tick ───────────────────────────────────────────────────────────

async function handleFatigueTick() {
  const now = Date.now();
  const settings = await chromeGet('settings');
  const sensitivity = (settings.settings && settings.settings.fatigueSensitivity) || 0.6;
  const notificationsEnabled = !(settings.settings && settings.settings.notificationsEnabled === false);

  // Prune windows
  _tabSwitchTimes = _tabSwitchTimes.filter((t) => now - t <= 5 * 60000);
  _scrollBurstTimes = _scrollBurstTimes.filter((t) => now - t <= 5 * 60000);

  const switchScore = _tabSwitchTimes.length * W.tabSwitch;
  const scrollScore = _scrollBurstTimes.length * W.scrollBurst;
  const sessionMins = Math.min(60, (now - _sessionStartTime) / 60000);
  const ageScore = Math.floor(sessionMins / 10) * W.sessionAge;
  const breakPenalty = (now - _lastBreakTime > 90 * 60000) ? W.noBreak : 0;

  const rawIncrease = switchScore + scrollScore + ageScore + breakPenalty;
  _fatigueScore = Math.max(0, _fatigueScore * COOL_DOWN + rawIncrease);
  _fatigueScore = Math.min(100, _fatigueScore * sensitivity);
  if (!isFinite(_fatigueScore)) _fatigueScore = 0;

  // Log score to hourly analytics
  await logFatigueScoreToDay(Math.round(_fatigueScore));

  // Trigger notifications
  if (notificationsEnabled) {
    if (_fatigueScore >= 85) {
      triggerResetNotification();
      _fatigueScore = _fatigueScore * 0.75; // back off
    } else if (_fatigueScore >= 65) {
      triggerSoftNudge();
    }
  }

  persistState();
}

async function logFatigueScoreToDay(score) {
  const hour = new Date().getHours();
  const today = dayKey();
  const result = await chromeGet(today);
  const rec = result[today] || emptyDayRecord();
  if (!rec.hourlyFatigueScore) rec.hourlyFatigueScore = new Array(24).fill(0);
  rec.hourlyFatigueScore[hour] = Math.max(rec.hourlyFatigueScore[hour] || 0, score);
  if (score >= 85 && (!rec.fatigueSpikes || rec.fatigueSpikes.length === 0 ||
    Date.now() - rec.fatigueSpikes[rec.fatigueSpikes.length - 1].time > 10 * 60000)) {
    rec.fatigueSpikes = rec.fatigueSpikes || [];
    rec.fatigueSpikes.push({ time: Date.now(), score });
  }
  await chromeSet({ [today]: rec });
}

// ── Notifications ──────────────────────────────────────────────────────────

function triggerResetNotification() {
  const h = new Date().getHours();
  let message;
  if (h >= 6 && h < 11) message = 'Morning fatigue detected. A 60s reset will help you start strong.';
  else if (h >= 17) message = 'Evening tiredness — a calm reset can help you wind down well.';
  else message = 'A short reset can restore your focus. Would you like to try?';

  chrome.notifications.create('fatigue-alert', {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Time for a gentle pause?',
    message,
    buttons: [{ title: 'Start Reset' }, { title: 'Maybe Later' }],
    priority: 2,
    requireInteraction: false,
  }, (id) => {
    if (chrome.runtime.lastError) openResetPage(); // fallback
  });
}

function triggerSoftNudge() {
  chrome.action.setBadgeText({ text: '!' });
  chrome.action.setBadgeBackgroundColor({ color: '#f6ad55' });
  setTimeout(() => {
    chrome.action.setBadgeText({ text: '' });
  }, 60000);
}

chrome.notifications.onButtonClicked.addListener((notifId, btnIdx) => {
  if (notifId === 'fatigue-alert' && btnIdx === 0) openWellnessPage();
});

// Clicking the notification body also opens the wellness page
chrome.notifications.onClicked.addListener((notifId) => {
  if (notifId === 'fatigue-alert' || notifId === 'focus-complete') openWellnessPage();
  chrome.notifications.clear(notifId);
});

function openWellnessPage() {
  chrome.tabs.create({ url: chrome.runtime.getURL('wellness.html') });
}

// Keep legacy alias
function openResetPage() { openWellnessPage(); }


// ── Focus Sessions ─────────────────────────────────────────────────────────

async function startFocusSession(durationMins, soundChoice) {
  const alarmName = `focus-end-${Date.now()}`;
  _activeFocusSession = {
    startTime: Date.now(),
    durationMins,
    soundChoice: soundChoice || null,
    endAlarmName: alarmName,
  };
  await chromeSet({ activeSession: _activeFocusSession });
  chrome.alarms.create(alarmName, { delayInMinutes: durationMins });
  return { ok: true, session: _activeFocusSession };
}

async function endFocusSession() {
  if (!_activeFocusSession) return { ok: false };
  const elapsed = Math.round((Date.now() - _activeFocusSession.startTime) / 60000);
  chrome.alarms.clear(_activeFocusSession.endAlarmName);

  // Log minutes to day record
  const today = dayKey();
  const result = await chromeGet(today);
  const rec = result[today] || emptyDayRecord();
  rec.focusMinutes = (rec.focusMinutes || 0) + Math.max(1, elapsed);
  await chromeSet({ [today]: rec });

  // Log to meta total
  const metaResult = await chromeGet('meta');
  const meta = metaResult.meta || emptyMeta();
  meta.totalFocusHours = +((meta.totalFocusHours || 0) + elapsed / 60).toFixed(2);
  await chromeSet({ meta });

  _activeFocusSession = null;
  await chromeSet({ activeSession: null });
  _lastBreakTime = Date.now(); // ending a focus session counts as a break
  return { ok: true, minutesLogged: Math.max(1, elapsed) };
}

async function handleFocusSessionEnd() {
  const session = _activeFocusSession;
  if (session) {
    await endFocusSession();
    chrome.notifications.create('focus-complete', {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: '✅ Focus session complete!',
      message: `Great work — ${session.durationMins} minutes done. Time for a short break.`,
      priority: 1,
    });
    openResetPage();
  }
}

// ── Log Reset ─────────────────────────────────────────────────────────────

async function handleLogReset(resetType, mood) {
  const today = dayKey();
  const result = await chromeGet(today);
  const rec = result[today] || emptyDayRecord();

  if (mood) {
    rec.moodLog = rec.moodLog || [];
    rec.moodLog.push({ time: Date.now(), mood });
  }

  if (resetType) {
    rec.resetLog = rec.resetLog || [];
    rec.resetLog.push({ time: Date.now(), type: resetType });
    rec.breakCount = (rec.breakCount || 0) + 1;
  }
  await chromeSet({ [today]: rec });

  // Decay fatigue on reset
  _fatigueScore = _fatigueScore * 0.4;
  _lastBreakTime = Date.now();
  _sessionStartTime = Date.now();
  persistState();

  // Update meta
  const metaResult = await chromeGet('meta');
  const meta = metaResult.meta || emptyMeta();
  meta.totalResets = (meta.totalResets || 0) + 1;
  await chromeSet({ meta });
}

// ── Daily Reset (midnight) ─────────────────────────────────────────────────

async function handleDailyReset() {
  // Compute yesterday's focus score and store it
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yKey = dayKey(yesterday);
  const result = await chromeGet(yKey);
  const rec = result[yKey];
  if (rec) {
    rec.focusScore = computeDailyFocusScore(rec);
    await chromeSet({ [yKey]: rec });
  }
  // Update streak
  await updateStreakOnStartup();
}

async function updateStreakOnStartup() {
  const today = new Date().toISOString().slice(0, 10);
  const metaResult = await chromeGet('meta');
  const meta = metaResult.meta || emptyMeta();
  if (meta.lastActiveDate === today) return;

  if (meta.lastActiveDate) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toISOString().slice(0, 10);
    meta.streakDays = meta.lastActiveDate === yStr ? (meta.streakDays || 0) + 1 : 1;
  } else {
    meta.streakDays = 1;
  }
  meta.lastActiveDate = today;
  await chromeSet({ meta });
}

// ── Dashboard Data ─────────────────────────────────────────────────────────

async function getDashboardData() {
  const today = dayKey();
  const [dayResult, metaResult] = await Promise.all([
    chromeGet(today),
    chromeGet('meta'),
  ]);
  const rec = dayResult[today] || emptyDayRecord();
  const meta = metaResult.meta || emptyMeta();

  return {
    fatigueScore: Math.round(_fatigueScore),
    focusScore: computeDailyFocusScore(rec),
    focusMinutes: rec.focusMinutes || 0,
    breakCount: rec.breakCount || 0,
    streakDays: meta.streakDays || 0,
    totalFocusHours: meta.totalFocusHours || 0,
    lastMood: rec.moodLog && rec.moodLog.length ? rec.moodLog[rec.moodLog.length - 1].mood : null,
    circadianContext: getCircadianContext(),
    circadianPrompt: getCircadianPrompt(),
    activeSession: _activeFocusSession,
  };
}

async function getAnalyticsData() {
  // Get last 7 days
  const keys = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    keys.push(dayKey(d));
  }
  const result = await chromeGet(keys);
  const days = keys.map((k) => result[k] || emptyDayRecord()).reverse();
  const today = dayKey();
  const todayResult = await chromeGet(today);
  const todayRec = todayResult[today] || emptyDayRecord();

  return {
    weekly: {
      focusScores: days.map(computeDailyFocusScore),
      focusMinutes: days.map((d) => d.focusMinutes || 0),
      tabSwitches: days.map((d) => d.tabSwitches || 0),
      breaks: days.map((d) => d.breakCount || 0),
    },
    today: {
      hourlyFatigue: todayRec.hourlyFatigueScore || new Array(24).fill(0),
      hourlyTabSwitches: todayRec.hourlyTabSwitches || new Array(24).fill(0),
      tabSwitches: todayRec.tabSwitches || 0,
      scrollBursts: todayRec.scrollBursts || 0,
    },
    insights: generateInsights(todayRec),
  };
}

// ── Insight Generator ──────────────────────────────────────────────────────

function generateInsights(rec) {
  const insights = [];
  const focusMins = rec.focusMinutes || 0;
  const breaks = rec.breakCount || 0;
  const switches = rec.tabSwitches || 0;
  const spikes = (rec.fatigueSpikes || []).length;

  const hourlyFatigue = rec.hourlyFatigueScore || [];
  const peakHour = hourlyFatigue.indexOf(Math.max(...hourlyFatigue, 0));
  if (Math.max(...hourlyFatigue, 0) > 20) {
    insights.push(`🔴 Peak fatigue around ${fmtHour(peakHour)} today.`);
  }

  if (focusMins >= 120) {
    insights.push(`✅ Excellent — ${focusMins} min focused today.`);
  } else if (focusMins > 0) {
    insights.push(`⏱ ${focusMins} min focused. Aim for 90+ min.`);
  } else {
    insights.push(`💡 No sessions yet. Try a 25-min focus block.`);
  }

  if (breaks === 0) {
    insights.push(`☕ No breaks taken — a reset can sharpen your mind.`);
  } else if (breaks >= 4) {
    insights.push(`🌿 Good break rhythm — ${breaks} resets taken today.`);
  }

  if (switches > 60) {
    insights.push(`🔀 ${switches} tab switches today — consider blocking distractions.`);
  }

  return insights.slice(0, 3);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function dayKey(date = new Date()) {
  return `day_${date.toISOString().slice(0, 10)}`;
}

function emptyDayRecord() {
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

function emptyMeta() {
  return { streakDays: 0, lastActiveDate: null, totalFocusHours: 0, totalResets: 0 };
}

function computeDailyFocusScore(rec) {
  const focusMins = rec.focusMinutes || 0;
  const breaks = rec.breakCount || 0;
  const spikes = (rec.fatigueSpikes || []).length;
  const timeScore = Math.min(60, focusMins / 2);
  const breakScore = Math.min(20, breaks * 5);
  const penalty = Math.min(30, spikes * 10);
  return Math.max(0, Math.min(100, Math.round(timeScore + breakScore - penalty)));
}

function getCircadianContext() {
  const h = new Date().getHours();
  if (h >= 6 && h < 11) return 'morning';
  if (h >= 11 && h < 17) return 'afternoon';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}

function getCircadianPrompt() {
  const ctx = getCircadianContext();
  const prompts = {
    morning: ['Good morning — let\'s build a focused start.', 'Morning clarity awaits.', 'A fresh day, fresh focus.'],
    afternoon: ['Steady pace wins. Keep flowing.', 'Midday check — stay grounded.', 'You\'re doing well. Keep going.'],
    evening: ['Evening — wind down gently.', 'The day is slowing. Let your mind follow.', 'Evening calm is productive too.'],
    night: ['Night — be gentle with yourself.', 'Dim the mental load. Ease into stillness.', 'Rest well — recovery is part of focus.'],
  };
  const list = prompts[ctx];
  return list[Math.floor(Math.random() * list.length)];
}

function fmtHour(h) {
  if (h === 0) return '12am';
  if (h < 12) return `${h}am`;
  if (h === 12) return '12pm';
  return `${h - 12}pm`;
}

function chromeGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function chromeSet(data) {
  return new Promise((resolve) => chrome.storage.local.set(data, resolve));
}