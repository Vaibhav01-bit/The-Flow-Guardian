// popup.js

document.addEventListener('DOMContentLoaded', () => {
  const fatigueScoreEl = document.getElementById('fatigue-score');
  const fatigueStateTextEl = document.getElementById('fatigue-state-text');
  const fatigueRingEl = document.getElementById('fatigue-ring');
  const resetButton = document.getElementById('reset-button');
  const settingsToggle = document.getElementById('settings-toggle');
  const settingsPanel = document.getElementById('settings-panel');
  const quoteStyleSelect = document.getElementById('quote-style');
  const ambientSoundCheckbox = document.getElementById('ambient-sound');
  const toggleText = document.querySelector('.toggle-text');

  // Load settings
  chrome.storage.local.get(['quoteStyle', 'ambientSound'], (result) => {
    if (quoteStyleSelect) {
      quoteStyleSelect.value = result.quoteStyle || 'calm';
    }
    if (ambientSoundCheckbox) {
      ambientSoundCheckbox.checked = result.ambientSound || false;
      updateToggleText(result.ambientSound || false);
    }
  });

  // Settings toggle
  if (settingsToggle) {
    settingsToggle.addEventListener('click', () => {
      const isVisible = settingsPanel.style.display !== 'none';
      settingsPanel.style.display = isVisible ? 'none' : 'block';
    });
  }

  // Quote style change
  if (quoteStyleSelect) {
    quoteStyleSelect.addEventListener('change', (e) => {
      chrome.storage.local.set({ quoteStyle: e.target.value });
    });
  }

  // Ambient sound toggle
  if (ambientSoundCheckbox) {
    ambientSoundCheckbox.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      chrome.storage.local.set({ ambientSound: enabled });
      updateToggleText(enabled);
    });
  }

  function updateToggleText(enabled) {
    if (toggleText) {
      toggleText.textContent = enabled ? 'On' : 'Off';
    }
  }

  function requestState() {
    chrome.runtime.sendMessage({ type: 'getFatigueState' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        fatigueScoreEl.textContent = '—';
        fatigueStateTextEl.textContent = 'Unable to load';
        return;
      }
      updateUI(response.score, response.threshold);
    });
  }

  // initial
  requestState();

  // react to storage changes
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.fatigueScore) requestState();
  });

  resetButton.addEventListener('click', () => {
    // Open the reset page, which will handle the reset logic
    chrome.tabs.create({ url: chrome.runtime.getURL('reset.html') }, () => {
      window.close();
    });
  });

  function updateUI(score, threshold) {
    const pct = Math.min(Math.round((score / threshold) * 100), 100);
    fatigueScoreEl.textContent = pct;

    // set ring progress and color
    fatigueRingEl.style.setProperty('--ring-progress', `${pct}%`);

    let stateText = 'In the Flow';
    let ringColor = 'var(--flow-color)';

    if (pct > 75) {
      stateText = 'Take a deep breath — you deserve it';
      ringColor = 'var(--reset-color)';
    } else if (pct > 40) {
      stateText = 'Focus is dipping — time to pause';
      ringColor = 'var(--fatigue-color)';
    }

    fatigueStateTextEl.textContent = stateText;
    fatigueRingEl.style.setProperty('--ring-color', ringColor);
  }
});