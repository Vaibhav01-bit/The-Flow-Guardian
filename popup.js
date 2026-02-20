// popup.js — The Flow Guardian v2.0
// Single-Page App router + view renderers

'use strict';

(function () {
  // ── Constants ──────────────────────────────────────────────────────────

  const MOOD_MAP = { happy: '🙂', neutral: '😐', tired: '😞', overwhelmed: '😵' };

  let _selectedDurationMins = 25;
  let _focusIntervalId = null;
  let _settings = {};

  // ── Boot ───────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', async () => {
    _settings = await getSettings();
    applyTheme(_settings.theme || 'forest-calm');
    setupTabNav();
    await renderToday();
  });

  // ── Tab Navigation ─────────────────────────────────────────────────────

  function setupTabNav() {
    const tabs = document.querySelectorAll('.tab-btn');
    const views = document.querySelectorAll('.view');

    tabs.forEach((tab) => {
      tab.addEventListener('click', async () => {
        const viewId = tab.dataset.view;
        tabs.forEach((t) => { t.classList.remove('tab-btn--active'); t.setAttribute('aria-selected', 'false'); });
        tab.classList.add('tab-btn--active');
        tab.setAttribute('aria-selected', 'true');

        views.forEach((v) => {
          if (v.id === `view-${viewId}`) {
            v.classList.add('view--active');
            v.classList.remove('view--hidden');
          } else {
            v.classList.remove('view--active');
            v.classList.add('view--hidden');
          }
        });

        // Lazy-render each view
        clearInterval(_focusIntervalId);
        if (viewId === 'today') await renderToday();
        if (viewId === 'focus') await renderFocus();
        if (viewId === 'insights') await renderInsights();
        if (viewId === 'settings') await renderSettings();
      });
    });
  }

  // ── TODAY VIEW ─────────────────────────────────────────────────────────

  async function renderToday() {
    // Fetch dashboard from background
    const data = await sendMsg({ type: 'getDashboard' });
    if (!data) return;

    // Greeting
    const greetEl = document.getElementById('greeting-text');
    if (greetEl) greetEl.textContent = data.circadianPrompt || '';

    // Fatigue ring (use fatigue score as %)
    const fatiguePct = Math.min(100, Math.round(data.fatigueScore || 0));
    updateRing(fatiguePct);

    // Badge
    const badgeEl = document.getElementById('badge-score');
    if (badgeEl) animateCount(badgeEl, 0, fatiguePct, 600);

    // Stats
    setCount('stat-focus-mins', data.focusMinutes || 0);
    setCount('stat-breaks', data.breakCount || 0);
    setCount('stat-streak', data.streakDays || 0);

    // Last mood
    if (data.lastMood) {
      const moodRow = document.getElementById('last-mood-row');
      const moodEmoji = document.getElementById('last-mood-emoji');
      if (moodRow) moodRow.style.display = 'flex';
      if (moodEmoji) moodEmoji.textContent = MOOD_MAP[data.lastMood] || '';
    }

    // Wellness Reset button
    const btn = document.getElementById('start-reset-btn');
    if (btn) {
      btn.onclick = () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('wellness.html') });
        window.close();
      };
    }

    // Listen for live score changes
    chrome.storage.onChanged.addListener((changes, ns) => {
      if (ns === 'local') {
        // Refresh ring if fatigue data changes
        if (changes.bgFatigueScore) {
          const s = Math.round(changes.bgFatigueScore.newValue || 0);
          const pct = Math.min(100, s);
          updateRing(pct);
          if (badgeEl) badgeEl.textContent = pct;
        }
      }
    });
  }

  function updateRing(pct) {
    const ring = document.getElementById('fatigue-ring');
    const scoreEl = document.getElementById('fatigue-score');
    const stateEl = document.getElementById('fatigue-state-text');
    if (!ring) return;

    ring.style.setProperty('--ring-progress', `${pct}%`);

    let color = 'var(--accent)';
    let text = 'In the Flow';
    if (pct > 75) { color = '#f56565'; text = 'Time for a reset'; }
    else if (pct > 45) { color = '#f6ad55'; text = 'Focus dipping — pause soon'; }

    ring.style.setProperty('--ring-color', color);
    if (scoreEl) scoreEl.textContent = pct;
    if (stateEl) stateEl.textContent = text;
  }

  // ── FOCUS VIEW ─────────────────────────────────────────────────────────

  async function renderFocus() {
    // Duration pills
    const pills = document.querySelectorAll('.pill');
    pills.forEach((pill) => {
      pill.classList.remove('pill--active');
      if (parseInt(pill.dataset.mins) === _selectedDurationMins) pill.classList.add('pill--active');
      pill.onclick = () => {
        pills.forEach((p) => p.classList.remove('pill--active'));
        pill.classList.add('pill--active');
        _selectedDurationMins = parseInt(pill.dataset.mins);
        const customInput = document.getElementById('custom-mins');
        if (customInput) customInput.value = '';
      };
    });

    const customInput = document.getElementById('custom-mins');
    if (customInput) {
      customInput.oninput = () => {
        const val = parseInt(customInput.value);
        if (val >= 5 && val <= 180) {
          _selectedDurationMins = val;
          pills.forEach((p) => p.classList.remove('pill--active'));
        }
      };
    }

    // Check for active session
    const sessionResp = await sendMsg({ type: 'getFocusSession' });
    const active = sessionResp && sessionResp.session;

    const actionBtn = document.getElementById('focus-action-btn');
    const timerDisplay = document.getElementById('timer-display');
    const focusNote = document.getElementById('focus-note');

    if (active) {
      showActiveTimer(active, actionBtn, timerDisplay, focusNote);
    } else {
      if (timerDisplay) timerDisplay.style.display = 'none';
      if (focusNote) focusNote.style.display = 'none';
      if (actionBtn) {
        actionBtn.textContent = '▶ Start Session';
        actionBtn.onclick = startFocusSession;
      }
    }

    // Sound setting
    const soundSel = document.getElementById('focus-sound');
    const settings = await getSettings();
    if (soundSel && settings.ambientSound !== undefined) {
      soundSel.value = settings.lastFocusSound || 'none';
    }
  }

  function showActiveTimer(session, actionBtn, timerDisplay, focusNote) {
    const endTime = session.startTime + session.durationMins * 60000;
    if (timerDisplay) timerDisplay.style.display = 'flex';
    if (focusNote) focusNote.style.display = 'block';
    if (actionBtn) {
      actionBtn.textContent = '⏹ End Session';
      actionBtn.onclick = stopFocusSession;
    }

    updateTimer(session.startTime, endTime);
    _focusIntervalId = setInterval(() => {
      if (Date.now() >= endTime) {
        clearInterval(_focusIntervalId);
        renderFocus();
      } else {
        updateTimer(session.startTime, endTime);
      }
    }, 1000);
  }

  function updateTimer(startTime, endTime) {
    const remaining = Math.max(0, endTime - Date.now());
    const totalMs = endTime - startTime;
    const progress = 1 - remaining / totalMs;

    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    const timeEl = document.getElementById('timer-time');
    if (timeEl) timeEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    // Update SVG ring
    const fill = document.getElementById('timer-ring-fill');
    if (fill) {
      const circumference = 2 * Math.PI * 34;
      fill.style.strokeDasharray = circumference;
      fill.style.strokeDashoffset = circumference * progress;
    }
  }

  async function startFocusSession() {
    const soundSel = document.getElementById('focus-sound');
    const soundChoice = soundSel ? soundSel.value : 'none';

    // Save last sound choice
    const s = await getSettings();
    s.lastFocusSound = soundChoice;
    await saveSettings(s);

    await sendMsg({ type: 'startFocusSession', durationMins: _selectedDurationMins, soundChoice });
    await renderFocus();
  }

  async function stopFocusSession() {
    clearInterval(_focusIntervalId);
    await sendMsg({ type: 'endFocusSession' });
    await renderFocus();
  }

  // ── INSIGHTS VIEW ──────────────────────────────────────────────────────

  async function renderInsights() {
    const data = await sendMsg({ type: 'getAnalytics' });
    if (!data) return;

    // Insight cards
    const cardsEl = document.getElementById('insight-cards');
    if (cardsEl) {
      cardsEl.innerHTML = '';
      const insights = data.insights || ['No insights yet — keep browsing and taking breaks.'];
      insights.forEach((text) => {
        const card = document.createElement('div');
        card.className = 'insight-card';
        card.textContent = text;
        cardsEl.appendChild(card);
      });
    }

    // Weekly focus chart
    const focusCanvas = document.getElementById('chart-focus');
    if (focusCanvas && data.weekly) {
      const labels = getWeekDayLabels(7);
      drawBarChart(focusCanvas, data.weekly.focusScores || [], labels, {
        accentColor: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
        maxValue: 100,
      });
    }

    // Hourly tabs chart (show hours 6–22)
    const tabsCanvas = document.getElementById('chart-tabs');
    if (tabsCanvas && data.today) {
      const hourly = (data.today.hourlyTabSwitches || []).slice(6, 23);
      const labels = Array.from({ length: 17 }, (_, i) => (i + 6) % 12 === 0 ? (i + 6 < 12 ? '12a' : '12p') : `${(i + 6) % 12}${i + 6 < 12 ? 'a' : 'p'}`);
      drawBarChart(tabsCanvas, hourly, labels, {
        accentColor: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
      });
    }
  }

  // ── SETTINGS VIEW ──────────────────────────────────────────────────────

  async function renderSettings() {
    const s = await getSettings();

    // Sensitivity slider
    const slider = document.getElementById('sensitivity-slider');
    if (slider) {
      slider.value = Math.round((s.fatigueSensitivity || 0.6) * 10);
      slider.oninput = () => autoSaveSetting('fatigueSensitivity', slider.value / 10);
    }

    // Theme pills
    const themePills = document.querySelectorAll('.theme-pill');
    themePills.forEach((pill) => {
      pill.classList.toggle('theme-pill--active', pill.dataset.theme === (s.theme || 'forest-calm'));
      pill.onclick = () => {
        themePills.forEach((p) => p.classList.remove('theme-pill--active'));
        pill.classList.add('theme-pill--active');
        applyTheme(pill.dataset.theme);
        autoSaveSetting('theme', pill.dataset.theme);
      };
    });

    // Notification toggle
    bindToggle('setting-notifications', s.notificationsEnabled !== false, (v) => autoSaveSetting('notificationsEnabled', v));

    // Feature toggles
    const f = s.features || {};
    bindToggle('feat-mood', f.moodCheck !== false, (v) => autoSaveFeature('moodCheck', v));
    bindToggle('feat-circadian', f.circadianPrompts !== false, (v) => autoSaveFeature('circadianPrompts', v));
    bindToggle('feat-focus', f.focusMode !== false, (v) => autoSaveFeature('focusMode', v));

    // Quote style
    const quoteSel = document.getElementById('quote-style');
    if (quoteSel) {
      quoteSel.value = s.quoteStyle || 'calm';
      quoteSel.onchange = () => autoSaveSetting('quoteStyle', quoteSel.value);
    }
  }

  function bindToggle(id, checked, onChange) {
    const el = document.getElementById(id);
    if (!el) return;
    el.checked = checked;
    el.onchange = () => onChange(el.checked);
  }

  async function autoSaveSetting(key, value) {
    const s = await getSettings();
    s[key] = value;
    await saveSettings(s);
    showSaveHint();
  }

  async function autoSaveFeature(featureKey, value) {
    const s = await getSettings();
    if (!s.features) s.features = {};
    s.features[featureKey] = value;
    await saveSettings(s);
    showSaveHint();
  }

  function showSaveHint() {
    const el = document.getElementById('save-hint');
    if (!el) return;
    el.textContent = '✓ Saved';
    setTimeout(() => { el.textContent = ''; }, 1500);
  }

  // ── Theme ──────────────────────────────────────────────────────────────

  const THEMES = {
    'forest-calm': { a: '#68d391', b: '#4fd1c5', bg: '#0d1f0d', mid: '#1a3a1a', muted: '#9abba5' },
    'ocean-deep': { a: '#63b3ed', b: '#9f7aea', bg: '#0d1b2a', mid: '#1b3a5c', muted: '#90afc5' },
    'dusk-warm': { a: '#f6ad55', b: '#f56565', bg: '#1a0e0a', mid: '#3d1f14', muted: '#c9a882' },
    'minimal-light': { a: '#6b7553', b: '#8b9467', bg: '#f7f3ef', mid: '#ede8e3', muted: '#718096' },
  };

  function applyTheme(name) {
    const t = THEMES[name] || THEMES['forest-calm'];
    const r = document.documentElement;
    r.style.setProperty('--accent', t.a);
    r.style.setProperty('--accent-b', t.b);
    r.style.setProperty('--bg-dark', t.bg);
    r.style.setProperty('--bg-mid', t.mid);
    r.style.setProperty('--text-muted', t.muted);
    // Update gradient variables used by existing style
    r.style.setProperty('--teal-soft', t.a);
    r.style.setProperty('--purple-soft', t.b);
    document.body.setAttribute('data-theme', name);
  }

  // ── Storage Helpers ────────────────────────────────────────────────────

  function getSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get('settings', (result) => {
        resolve(result.settings || defaultSettings());
      });
    });
  }

  function saveSettings(data) {
    return new Promise((resolve) => chrome.storage.local.set({ settings: data }, resolve));
  }

  function defaultSettings() {
    return {
      fatigueSensitivity: 0.6,
      theme: 'forest-calm',
      notificationsEnabled: true,
      quoteStyle: 'calm',
      ambientSound: false,
      features: { focusMode: true, ambientSounds: true, distractionBlocking: false, moodCheck: true, circadianPrompts: true },
    };
  }

  // ── Message Helper ─────────────────────────────────────────────────────

  function sendMsg(msg) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (resp) => {
          if (chrome.runtime.lastError) return resolve(null);
          resolve(resp || null);
        });
      } catch (e) {
        resolve(null);
      }
    });
  }

  // ── UI Utilities ───────────────────────────────────────────────────────

  function setCount(id, val) {
    const el = document.getElementById(id);
    if (el) animateCount(el, 0, val, 500);
  }

  function animateCount(el, from, to, duration) {
    if (!el) return;
    const start = performance.now();
    const diff = to - from;
    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(from + diff * eased);
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function drawBarChart(canvas, data, labels, options = {}) {
    if (!canvas || !data.length) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const { accentColor = '#68d391', maxValue, mutedColor = 'rgba(255,255,255,0.07)' } = options;

    ctx.clearRect(0, 0, W, H);
    const padL = 2, padR = 2, padT = 4, padB = 18;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;
    const n = data.length;
    const gap = 3;
    const barW = Math.max(3, (chartW - gap * (n - 1)) / n);
    const max = maxValue || Math.max(...data, 1);

    data.forEach((val, i) => {
      const x = padL + i * (barW + gap);
      const barH = Math.max(2, (val / max) * chartH);
      const y = padT + chartH - barH;

      ctx.beginPath();
      ctx.roundRect(x, padT, barW, chartH, 2);
      ctx.fillStyle = mutedColor;
      ctx.fill();

      const grad = ctx.createLinearGradient(x, y + barH, x, y);
      grad.addColorStop(0, accentColor + '55');
      grad.addColorStop(1, accentColor);
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, 2);
      ctx.fillStyle = grad;
      ctx.fill();

      if (labels && labels[i] && (i % Math.ceil(n / 7) === 0 || i === n - 1)) {
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#888';
        ctx.font = '8px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(labels[i], x + barW / 2, H - 3);
      }
    });
  }

  function getWeekDayLabels(n) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const labels = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      labels.push(i === 0 ? 'Today' : days[d.getDay()]);
    }
    return labels;
  }

})();