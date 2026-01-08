// background.js

// --- State Management ---
// Local-only state (kept in-memory for fast access, persisted to chrome.storage.local)
let fatigueScore = 0;
let lastActiveTabId = null;
let focusStartTime = Date.now();
// Keep timestamps of recent tab switches (ms). We'll use sliding window (last 60s)
let tabSwitchTimes = [];
let scrollData = { distance: 0, lastScrollTime: Date.now() };

// --- Constants ---
const TICK_INTERVAL = 1; // minutes
const FATIGUE_THRESHOLD = 100;
const FOCUS_TIME_WEIGHT = 0.5;
const TAB_SWITCH_WEIGHT = 1.5;
const SCROLL_WEIGHT = 1.0;
const COOL_DOWN_FACTOR = 0.9;

// --- Initialization ---
chrome.runtime.onStartup.addListener(() => {
  console.log("The Flow Guardian: Startup");
  initializeState().then(() => {
    // ensure alarm exists on startup
    chrome.alarms.create("fatigue-tick", { periodInMinutes: TICK_INTERVAL });
  });
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("The Flow Guardian: Installed");
  initializeState().then(() => {
    // ensure alarm exists on install
    chrome.alarms.create("fatigue-tick", { periodInMinutes: TICK_INTERVAL });
  });
});

function initializeState() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      [
        "fatigueScore",
        "lastActiveTabId",
        "focusStartTime",
        "tabSwitchTimes",
        "scrollData",
      ],
      (result) => {
        fatigueScore = result.fatigueScore || 0;
        lastActiveTabId = result.lastActiveTabId || null;
        focusStartTime = result.focusStartTime || Date.now();
        tabSwitchTimes = result.tabSwitchTimes || [];
        scrollData = result.scrollData || {
          distance: 0,
          lastScrollTime: Date.now(),
        };
        console.log("State initialized from storage.", { fatigueScore, focusStartTime });
        resolve();
      }
    );
  });
}

// --- Event Listeners ---
// Event listeners
chrome.tabs.onActivated.addListener(handleTabActivation);
chrome.alarms.onAlarm.addListener(handleAlarm);
chrome.notifications.onButtonClicked.addListener(handleNotificationButton);

// Consolidate messages into one listener for clarity
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    if (!request || !request.type) return;
    if (request.type === "scrolling") {
      // update scrolling info
      scrollData = request.data || scrollData;
      console.log("Scroll data received:", scrollData);
      sendResponse({ ok: true });
      return; // sync response
    }

    if (request.type === "getFatigueState") {
        // ensure numeric values
        sendResponse({ score: Number(fatigueScore) || 0, threshold: Number(FATIGUE_THRESHOLD) || 100 });
      return; // sync response
    }

    if (request.type === "resetFatigue") {
      fatigueScore = 0;
      chrome.storage.local.set({ fatigueScore: 0 });
      sendResponse({ ok: true });
      return;
    }
  } catch (err) {
    console.error('Error in onMessage listener:', err && err.stack ? err.stack : err);
  }
});

// --- Core Logic ---
function handleTabActivation(activeInfo) {
  try {
    const now = Date.now();
    // Debug: log shapes to help find runtime errors
    console.log('updateFatigueScore() start', {
      fatigueScoreType: typeof fatigueScore,
      fatigueScoreValue: fatigueScore,
      focusStartTimeType: typeof focusStartTime,
      focusStartTimeValue: focusStartTime,
      tabSwitchTimesType: Array.isArray(tabSwitchTimes) ? 'array' : typeof tabSwitchTimes,
      tabSwitchTimesLen: Array.isArray(tabSwitchTimes) ? tabSwitchTimes.length : 0,
      scrollDataType: typeof scrollData,
      scrollDataSample: (scrollData && typeof scrollData === 'object') ? { distance: scrollData.distance, lastScrollTime: scrollData.lastScrollTime } : scrollData
    });
  // Push the timestamp and prune older than 60s
    if (!Array.isArray(tabSwitchTimes)) tabSwitchTimes = [];
    tabSwitchTimes.push(now);
  const WINDOW_MS = 60 * 1000;
  tabSwitchTimes = tabSwitchTimes.filter((t) => now - t <= WINDOW_MS);

  // tabSwitchFrequency is switches in last minute
  const tabSwitchFrequency = tabSwitchTimes.length;

  // Update focus tracking
  if (lastActiveTabId !== null) {
    const focusDuration = now - focusStartTime;
    // Optionally persist focus durations per-tab in storage in future
  }

    if (activeInfo && typeof activeInfo.tabId === 'number') {
      lastActiveTabId = activeInfo.tabId;
    } else {
      console.warn('handleTabActivation: activeInfo.tabId missing', activeInfo);
    }
    focusStartTime = now;
    console.log(`Tab switched. Frequency: ${tabSwitchFrequency} switches/min (last 60s).`);
  } catch (err) {
    console.error('Error in handleTabActivation:', err && err.stack ? err.stack : err);
  }
}

function handleAlarm(alarm) {
  try {
    if (!alarm) return;
    if (alarm.name === "fatigue-tick") {
      console.log("Fatigue tick...");
      updateFatigueScore();
    }
  } catch (err) {
    console.error('Error in handleAlarm:', err && err.stack ? err.stack : err);
  }
}

function updateFatigueScore() {
  try {
    const now = Date.now();

    // 1. Focus contribution (minutes since last focus change). Longer continuous focus increases the contribution.
    const focusDurationMinutes = Math.max(0, (now - focusStartTime) / (1000 * 60));
    const focusContribution = Math.min(focusDurationMinutes, 60) * FOCUS_TIME_WEIGHT; // cap to avoid runaway

    // 2. Tab switching contribution (switches in last minute)
    const WINDOW_MS = 60 * 1000;
    tabSwitchTimes = tabSwitchTimes.filter((t) => now - t <= WINDOW_MS);
    const switchContribution = tabSwitchTimes.length * TAB_SWITCH_WEIGHT;

    // 3. Scrolling contribution
    const timeSinceScroll = now - (scrollData.lastScrollTime || 0);
    let scrollContribution = 0;
    // If recent scrolling activity and meaningful distance, count it
    if (timeSinceScroll < 5000 && (scrollData.distance || 0) > 20) {
      // distance here is in pixels (or event-count proxy). Normalize modestly
      scrollContribution = (scrollData.distance / 100) * SCROLL_WEIGHT;
    }

    // 4. Combine and apply a cool-down so score decays a bit each tick
    const rawIncrease = (Number(focusContribution) || 0) + (Number(switchContribution) || 0) + (Number(scrollContribution) || 0);
    fatigueScore = Math.max(0, (Number(fatigueScore) || 0) * COOL_DOWN_FACTOR + rawIncrease);

    // Defensive numeric checks before formatting
    if (!isFinite(fatigueScore)) fatigueScore = 0;
    const safeFatigue = Number(fatigueScore) || 0;
    const safeFocus = Number(focusContribution) || 0;
    const safeSwitch = Number(switchContribution) || 0;
    const safeScroll = Number(scrollContribution) || 0;

    console.log('Fatigue Score Updated:', safeFatigue.toFixed(2));
    console.log(`  - Focus: ${safeFocus.toFixed(2)}, Switch: ${safeSwitch.toFixed(2)}, Scroll: ${safeScroll.toFixed(2)}`);

    // 5. Threshold check and gentle notification
    if (fatigueScore > FATIGUE_THRESHOLD) {
      triggerFatigueNotification();
      // Back off a bit to avoid immediate re-triggering
      fatigueScore = FATIGUE_THRESHOLD * 0.8;
    }

    // 6. Persist state locally (ensure numeric)
      try {
        chrome.storage.local.set({ fatigueScore: Number(fatigueScore) || 0, lastActiveTabId, focusStartTime }, () => {
          if (chrome.runtime.lastError) console.error('storage.set error:', chrome.runtime.lastError && chrome.runtime.lastError.message);
        });
      } catch (setErr) {
        console.error('Error calling storage.local.set:', setErr && setErr.stack ? setErr.stack : setErr);
      }
  } catch (err) {
    console.error('Error in updateFatigueScore:', err && err.stack ? err.stack : err);
  }
}


// --- Notifications & Actions ---
function triggerFatigueNotification() {
  const options = {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "Gentle Pause?",
    message: "A short 60s reset can restore your focus. Would you like to try?",
    buttons: [{ title: "Start Reset" }, { title: "Maybe Later" }],
    priority: 2,
    requireInteraction: false,
  };

  chrome.notifications.create("fatigue-alert", options, (notificationId) => {
    try {
      if (chrome.runtime.lastError) {
        console.error("Notification failed:", chrome.runtime.lastError && chrome.runtime.lastError.message);
        // Fallback: Open the reset page directly if notifications or permissions are restricted
        openResetPage();
      } else {
        console.log("Notification shown:", notificationId);
      }
    } catch (cbErr) {
      console.error('Error in notifications.create callback:', cbErr && cbErr.stack ? cbErr.stack : cbErr);
    }
  });
}

function handleNotificationButton(notificationId, buttonIndex) {
  if (notificationId === "fatigue-alert") {
    if (buttonIndex === 0) openResetPage();
    // buttonIndex === 1 -> dismiss
  }
}

function openResetPage() {
  chrome.tabs.create({ url: chrome.runtime.getURL("reset.html") });
  console.log("Reset page opened.");
}

// --- Getters for Popup ---
// Note: messages are handled by the consolidated listener above.