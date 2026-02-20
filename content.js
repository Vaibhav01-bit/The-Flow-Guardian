// content.js — The Flow Guardian v2.0
// Tracks scrolling, rapid scroll bursts, and visibility changes

'use strict';

let _lastY = window.scrollY || 0;
let _accumulated = 0;
let _lastScrollTime = Date.now();
let _scrollTimer = null;
let _rapidScrollWindow = [];
const THROTTLE = 800;       // ms
const BURST_THRESHOLD = 200; // px
const BURST_WINDOW = 500;   // ms

// ── Scroll Detection ───────────────────────────────────────────────────────

function onScroll() {
  const now = Date.now();
  const currentY = window.scrollY || 0;
  const delta = Math.abs(currentY - _lastY);

  _accumulated += delta;
  _lastY = currentY;
  _lastScrollTime = now;

  // Rapid scroll burst detection
  _rapidScrollWindow.push({ time: now, delta });
  _rapidScrollWindow = _rapidScrollWindow.filter((e) => now - e.time <= BURST_WINDOW);
  const windowDelta = _rapidScrollWindow.reduce((s, e) => s + e.delta, 0);

  if (windowDelta > BURST_THRESHOLD) {
    // Burst threshold crossed — notify background (rate-limited: max once per 10s)
    if (!_burstCooldown) {
      _burstCooldown = true;
      safeSend({ type: 'scrollBurst' });
      setTimeout(() => { _burstCooldown = false; }, 10000);
    }
  }

  // Throttled send of raw scroll data (legacy compat)
  if (_scrollTimer) clearTimeout(_scrollTimer);
  _scrollTimer = setTimeout(() => {
    safeSend({
      type: 'scrolling',
      data: {
        distance: Math.round(_accumulated),
        lastScrollTime: _lastScrollTime,
      },
    });
    _accumulated = 0;
  }, THROTTLE);
}

let _burstCooldown = false;

window.addEventListener('scroll', onScroll, { passive: true });

// ── Visibility Change ──────────────────────────────────────────────────────

document.addEventListener('visibilitychange', () => {
  safeSend({
    type: 'visibilityChange',
    hidden: document.hidden,
  });
});

// ── Safe Message Send ──────────────────────────────────────────────────────

function safeSend(msg) {
  try {
    chrome.runtime.sendMessage(msg, () => {
      // Suppress "no receiver" errors when background is inactive
      void chrome.runtime.lastError;
    });
  } catch (e) {
    // Extension context may be invalidated — ignore
  }
}

console.log('Flow Guardian v2 content script loaded.');