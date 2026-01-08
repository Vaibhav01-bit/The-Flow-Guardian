// content.js

// content.js
// Tracks scrolling distance (in pixels) and sends periodic updates to the background service worker.

let lastY = window.scrollY || 0;
let accumulatedDistance = 0;
let lastScrollTime = Date.now();
let scrollTimer = null;
const THROTTLE_INTERVAL = 800; // ms

function sendScrollData() {
  chrome.runtime.sendMessage({
    type: "scrolling",
    data: {
      distance: Math.round(accumulatedDistance),
      lastScrollTime: lastScrollTime
    }
  });
  // reset accumulator
  accumulatedDistance = 0;
}

function onScroll() {
  const now = Date.now();
  const currentY = window.scrollY || 0;
  const delta = Math.abs(currentY - lastY);
  // accumulate pixel distance (robust across devices)
  accumulatedDistance += delta;
  lastY = currentY;
  lastScrollTime = now;

  // throttle: schedule send after user stops for THROTTLE_INTERVAL
  if (scrollTimer) clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => {
    try {
      sendScrollData();
    } catch (e) {
      console.warn('Failed to send scroll data', e);
    }
  }, THROTTLE_INTERVAL);
}

window.addEventListener('scroll', onScroll, { passive: true });
console.log('Flow Guardian content script loaded.');