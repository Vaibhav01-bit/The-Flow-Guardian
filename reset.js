// reset.js — The Flow Guardian v2.0
// 3-step flow: Mood Check → Reset Type → Breathing Session

(() => {
  'use strict';

  // ── State ────────────────────────────────────────────────────────────
  let _mood = null;
  let _resetType = 'mental';
  let _settings = {};
  let _profile = null; // breathing profile from BreathingEngine

  // Breathing session state
  let canvas, ctx, breathingText, captionEl, breathGlow, quoteEl;
  let animationFrameId;
  let isActive = false;
  let startTime = 0;
  let currentCycleCount = 0;
  let lastPhase = '';
  let speechVoices = [];
  let progressDots = [];
  let quoteInterval = null;
  let currentQuoteIndex = 0;

  // ── Reset type profiles ───────────────────────────────────────────────
  const PROFILES = {
    eye: {
      name: 'Eye Reset', emoji: '👁️',
      instruction: 'Softly close your eyes and let them rest.',
      breathIn: 4000, hold: 2000, breathOut: 6000, cycles: 4,
      accent: '#81e6d9', glow: 'rgba(129, 230, 217, 0.2)',
    },
    stretch: {
      name: 'Stretch Reset', emoji: '🧘',
      instruction: 'Roll your shoulders back and breathe into the stretch.',
      breathIn: 5000, hold: 3000, breathOut: 7000, cycles: 3,
      accent: '#b794f4', glow: 'rgba(183, 148, 244, 0.2)',
    },
    mental: {
      name: 'Mental Reset', emoji: '🧠',
      instruction: 'Let each exhale carry away a thought you don\'t need.',
      breathIn: 4000, hold: 4000, breathOut: 8000, cycles: 4,
      accent: '#68d391', glow: 'rgba(104, 211, 145, 0.2)',
    },
    energy: {
      name: 'Energy Reset', emoji: '⚡',
      instruction: 'Breathe in vitality. Breathe out fatigue.',
      breathIn: 3000, hold: 1000, breathOut: 5000, cycles: 5,
      accent: '#f6ad55', glow: 'rgba(246, 173, 85, 0.2)',
    },
  };

  // ── Quotes ────────────────────────────────────────────────────────────
  const QUOTES = {
    calm: [
      'Slow down. You are safe.', 'Breathe. This moment is enough.',
      'Rest is part of progress.', 'Calm brings clarity.',
      'One breath at a time.', 'Stillness is a form of strength.',
      'Let go of what you cannot control.', 'Peace begins with a single breath.',
    ],
    encouraging: [
      'You\'re doing well.', 'One step at a time.', 'You\'ve got this.',
      'Keep going gently.', 'Trust yourself.', 'Your effort matters.',
      'Small steps lead to big changes.', 'Your best is enough.',
    ],
    minimal: ['Pause.', 'Breathe.', 'Ease.', 'Rest.', 'Calm.', 'Peace.', 'Flow.', 'Release.'],
    off: [],
  };

  const COMPLETION_MSGS = [
    'Carry this calm with you.', 'Nice work. Take that calm back into your task.',
    'You\'re ready to continue.', 'That calm is yours to keep.',
    'You\'ve centered yourself well.', 'Return with this clarity.',
  ];

  // ── Boot ──────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    loadSettings().then(() => {
      applyTheme(_settings.theme || 'forest-calm');

      if (_settings.features && _settings.features.moodCheck === false) {
        // Skip mood check — go straight to type selector
        showStep('step-type');
      } else {
        showStep('step-mood');
      }

      setupMoodStep();
      setupTypeStep();
    });
  });

  async function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get('settings', (result) => {
        _settings = result.settings || {};
        resolve();
      });
    });
  }

  // ── Step Management ────────────────────────────────────────────────────
  function showStep(id) {
    ['step-mood', 'step-type', 'step-breathe'].forEach((s) => {
      const el = document.getElementById(s);
      if (el) {
        if (s === id) {
          el.style.display = '';
          el.classList.add('step--enter');
          setTimeout(() => el.classList.remove('step--enter'), 400);
        } else {
          el.style.display = 'none';
        }
      }
    });
  }

  // ── Step 1: Mood Check ─────────────────────────────────────────────────
  function setupMoodStep() {
    document.querySelectorAll('.mood-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        _mood = btn.dataset.mood;
        // Log mood to background
        safeSend({ type: 'logReset', mood: _mood, resetType: null });
        // Suggest reset type based on mood
        suggestResetType(_mood);
        showStep('step-type');
      });
    });

    const skipMood = document.getElementById('skip-mood');
    if (skipMood) skipMood.addEventListener('click', () => showStep('step-type'));
  }

  function suggestResetType(mood) {
    const suggestions = {
      happy: 'energy',
      neutral: 'mental',
      tired: 'eye',
      overwhelmed: 'mental',
    };
    const suggested = suggestions[mood] || 'mental';
    // Pre-highlight the suggestion
    document.querySelectorAll('.reset-type-btn').forEach((btn) => {
      btn.classList.toggle('reset-type-btn--suggested', btn.dataset.type === suggested);
    });
    const hint = document.getElementById('reset-type-hint');
    if (hint) hint.textContent = mood === 'tired' ? '👁️ Your eyes may need rest first.' : 'Based on your check-in:';
  }

  // ── Step 2: Reset Type ────────────────────────────────────────────────
  function setupTypeStep() {
    document.querySelectorAll('.reset-type-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        _resetType = btn.dataset.type;
        initBreathingSession();
        showStep('step-breathe');
      });
    });
  }

  // ── Step 3: Breathing ─────────────────────────────────────────────────
  function initBreathingSession() {
    _profile = buildProfile();
    applyProfileAccent(_profile);

    // Activate type label
    const label = document.getElementById('active-type-label');
    if (label) label.textContent = `${_profile.emoji} ${_profile.name}`;

    // Voice
    if (window.speechSynthesis) {
      speechVoices = window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        speechVoices = window.speechSynthesis.getVoices();
      };
    }

    canvas = document.getElementById('breathing-canvas');
    breathingText = document.getElementById('breathing-text');
    captionEl = document.getElementById('captions');
    quoteEl = document.getElementById('motivational-quote');
    breathGlow = document.getElementById('breath-glow');
    progressDots = document.querySelectorAll('.progress-dot');

    if (!canvas) return;
    ctx = canvas.getContext('2d');

    if (breathingText) breathingText.textContent = _profile.instruction;

    // Apply glow color
    if (breathGlow) breathGlow.style.background = `radial-gradient(circle at center, ${_profile.glow} 0%, transparent 80%)`;

    // Buttons
    const startBtn = document.getElementById('start-reset');
    const skipBtn = document.getElementById('skip-reset');
    const closeBtn = document.getElementById('close-reset');
    const returnBtn = document.getElementById('return-to-work');
    const anotherBtn = document.getElementById('another-breath');

    if (startBtn) {
      startBtn.addEventListener('click', () => {
        if (isActive) return;
        isActive = true;
        startBtn.classList.add('fade-out');
        setTimeout(() => { startBtn.style.display = 'none'; }, 300);
        setTimeout(() => { if (skipBtn) { skipBtn.style.display = 'block'; skipBtn.classList.add('fade-in'); } }, 2000);

        startTime = Date.now();
        currentCycleCount = 0;
        lastPhase = '';

        startAmbientSound();
        startQuoteRotation();
        updateBreathingText('Let\'s begin', true);

        // Log reset start
        safeSend({ type: 'logReset', resetType: _resetType, mood: _mood });

        speakWithPause('Let\'s begin.', 1500, () => animate());
      });
    }

    if (skipBtn) skipBtn.addEventListener('click', () => completeSession());
    if (returnBtn) returnBtn.addEventListener('click', () => closePageGently());
    if (anotherBtn) anotherBtn.addEventListener('click', () => location.reload());
    if (closeBtn) closeBtn.addEventListener('click', (e) => { e.preventDefault(); closePageGently(); });

    draw(0); // Initial draw
  }

  function buildProfile() {
    const base = PROFILES[_resetType] || PROFILES.mental;
    // Circadian modifier
    const h = new Date().getHours();
    let mult = 1.0;
    if (h < 6 || h >= 21) mult = 1.25;       // night: slower
    else if (h >= 17) mult = 1.1;             // evening: slightly slower

    return {
      ...base,
      breathIn: Math.round(base.breathIn * (h >= 17 || h < 6 ? mult : 1)),
      breathOut: Math.round(base.breathOut * mult),
      totalCycle: Math.round(base.breathIn * mult + base.hold + base.breathOut * mult),
    };
  }

  function applyProfileAccent(profile) {
    document.documentElement.style.setProperty('--accent', profile.accent);
    document.documentElement.style.setProperty('--teal-soft', profile.accent);
  }

  // ── Breathing Animation ───────────────────────────────────────────────
  function animate() {
    if (!isActive) return;
    const now = Date.now();
    const elapsed = now - startTime;
    const { breathIn, hold, breathOut, totalCycle, cycles } = _profile;
    const cycleElapsed = elapsed % totalCycle;
    let progress = 0;
    let phase = '';

    if (cycleElapsed < breathIn) {
      progress = easeInOutQuad(cycleElapsed / breathIn);
      phase = 'Inhale';
    } else if (cycleElapsed < breathIn + hold) {
      progress = 1;
      phase = 'Hold';
    } else {
      const t = (cycleElapsed - breathIn - hold) / breathOut;
      progress = 1 - easeOutQuart(t);
      phase = 'Exhale';
    }

    if (phase !== lastPhase) {
      if (phase === 'Inhale') {
        currentCycleCount++;
        updateProgressDots(currentCycleCount);
        if (currentCycleCount > cycles) { completeSession(); return; }
        speak('Inhale.');
        if (captionEl) captionEl.textContent = 'Breathe in slowly...';
      } else if (phase === 'Hold') {
        if (captionEl) captionEl.textContent = 'Hold gently...';
      } else if (phase === 'Exhale') {
        speak('Exhale.');
        if (captionEl) captionEl.textContent = 'Release slowly...';
      }
      lastPhase = phase;
      if (breathingText && breathingText.textContent !== phase) breathingText.textContent = phase;
    }

    if (breathGlow) breathGlow.style.opacity = 0.4 + progress * 0.35;
    draw(progress);
    animationFrameId = requestAnimationFrame(animate);
  }

  function easeInOutQuad(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function easeOutQuart(t) { return 1 - Math.pow(1 - t, 4); }

  // ── Draw (Canvas) ─────────────────────────────────────────────────────
  function draw(progress) {
    if (!ctx || !canvas) return;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;
    const accent = _profile ? _profile.accent : '#68d391';

    // Aura
    const auraR = 100 + progress * 110;
    const auraA = 0.12 + progress * 0.20;
    const auraG = ctx.createRadialGradient(cx, cy, 30, cx, cy, auraR);
    auraG.addColorStop(0, `${accent}${alpha(auraA * 1.2)}`);
    auraG.addColorStop(0.5, `${accent}${alpha(auraA * 0.7)}`);
    auraG.addColorStop(1, `${accent}00`);
    ctx.beginPath(); ctx.arc(cx, cy, auraR, 0, Math.PI * 2);
    ctx.fillStyle = auraG; ctx.fill();

    // Body
    ctx.save();
    ctx.translate(cx, cy + 80);
    const floatY = Math.sin(Date.now() / 3000) * 3;
    ctx.translate(0, floatY);

    // Legs
    ctx.fillStyle = '#2d3748';
    ctx.beginPath(); ctx.ellipse(-50, 20, 60, 25, 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(50, 20, 60, 25, -0.2, 0, Math.PI * 2); ctx.fill();

    // Torso
    const tx = 1 + progress * 0.12, ty = 1 + progress * 0.08;
    const shoulderDrop = (1 - progress) * 6;
    ctx.save(); ctx.scale(tx, ty);
    ctx.beginPath();
    ctx.moveTo(-45, 0);
    ctx.bezierCurveTo(-50, -80 - shoulderDrop, 50, -80 - shoulderDrop, 45, 0);
    ctx.lineTo(40, 30); ctx.bezierCurveTo(30, 50, -30, 50, -40, 30);
    ctx.closePath();
    ctx.fillStyle = accent; ctx.fill();
    ctx.restore();

    // Head
    ctx.save();
    ctx.translate(0, -100 - progress * 3);
    ctx.beginPath(); ctx.arc(0, 0, 35, 0, Math.PI * 2);
    ctx.fillStyle = '#fbd38d'; ctx.fill();
    ctx.beginPath(); ctx.arc(0, -10, 38, Math.PI, 0);
    ctx.fillStyle = '#1a202c'; ctx.fill();
    ctx.strokeStyle = '#2d3748'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(-12, 5, 6, 0.15, Math.PI - 0.15); ctx.stroke();
    ctx.beginPath(); ctx.arc(12, 5, 6, 0.15, Math.PI - 0.15); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 15, 9, 0.15, Math.PI - 0.15); ctx.stroke();
    ctx.restore();

    // Arms
    ctx.strokeStyle = '#fbd38d'; ctx.lineWidth = 14; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-45, -50 - progress * 1.5); ctx.quadraticCurveTo(-70, -10, -60, 25); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(45, -50 - progress * 1.5); ctx.quadraticCurveTo(70, -10, 60, 25); ctx.stroke();

    ctx.restore();
  }

  function alpha(a) {
    return Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0');
  }

  // ── Session Lifecycle ─────────────────────────────────────────────────
  function completeSession() {
    isActive = false;
    cancelAnimationFrame(animationFrameId);
    if (quoteInterval) { clearInterval(quoteInterval); quoteInterval = null; }
    if (window.speechSynthesis) window.speechSynthesis.cancel();

    const skipBtn = document.getElementById('skip-reset');
    if (skipBtn) skipBtn.style.display = 'none';
    const supportive = document.querySelector('.supportive-text');
    if (supportive) supportive.style.opacity = '0';
    if (breathingText) breathingText.textContent = '';
    if (captionEl) captionEl.textContent = '';
    if (quoteEl) quoteEl.textContent = '';

    setTimeout(() => {
      showCompletionMessage();
      setTimeout(() => showCompletionActions(), 3500);
      setTimeout(() => stopAmbientSound(), 500);
    }, 1200);
  }

  function showCompletionMessage() {
    const msg = COMPLETION_MSGS[Math.floor(Math.random() * COMPLETION_MSGS.length)];
    const el = document.createElement('div');
    el.className = 'completion-message';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => { if (document.body.contains(el)) el.classList.add('show'); }, 100);
    setTimeout(() => {
      if (document.body.contains(el)) { el.classList.remove('show'); setTimeout(() => document.body.removeChild(el), 1000); }
    }, 3000);
  }

  function showCompletionActions() {
    const actions = document.getElementById('completion-actions');
    const closeLink = document.getElementById('close-reset');
    if (actions) { actions.style.display = 'flex'; setTimeout(() => actions.classList.add('show'), 100); }
    if (closeLink) closeLink.style.opacity = '0';
  }

  function closePageGently() {
    document.body.classList.add('fade-out-page');
    isActive = false;
    cancelAnimationFrame(animationFrameId);
    if (quoteInterval) clearInterval(quoteInterval);
    stopAmbientSound();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setTimeout(() => {
      safeSend({ type: 'resetFatigue' });
      window.close();
    }, 1000);
  }

  // ── Progress Dots ─────────────────────────────────────────────────────
  function updateProgressDots(cycle) {
    progressDots.forEach((dot, i) => dot.classList.toggle('active', i < cycle));
  }

  // ── Quote Rotation ────────────────────────────────────────────────────
  function startQuoteRotation() {
    if (!quoteEl) return;
    const style = _settings.quoteStyle || 'calm';
    const quotes = QUOTES[style] || [];
    if (!quotes.length) return;
    showQuote(quotes, 0);
    quoteInterval = setInterval(() => {
      currentQuoteIndex = (currentQuoteIndex + 1) % quotes.length;
      showQuote(quotes, currentQuoteIndex);
    }, 8000);
  }

  function showQuote(quotes, idx) {
    if (!quoteEl || !quotes.length) return;
    if (idx === 0 && !quoteEl.textContent) { quoteEl.textContent = quotes[0]; quoteEl.style.opacity = '0.75'; return; }
    quoteEl.classList.add('fade-out');
    setTimeout(() => { quoteEl.textContent = quotes[idx]; quoteEl.classList.remove('fade-out'); quoteEl.classList.add('fade-in'); setTimeout(() => quoteEl.classList.remove('fade-in'), 1000); }, 1000);
  }

  // ── Breathing Text ────────────────────────────────────────────────────
  function updateBreathingText(text, smooth = true) {
    if (!breathingText) return;
    if (!smooth) { breathingText.textContent = text; return; }
    breathingText.classList.add('fade-out');
    setTimeout(() => { breathingText.textContent = text; breathingText.classList.remove('fade-out'); breathingText.classList.add('fade-in'); setTimeout(() => breathingText.classList.remove('fade-in'), 600); }, 300);
  }

  // ── Speech Synthesis ──────────────────────────────────────────────────
  function speak(text, onEnd = null) {
    if (!window.speechSynthesis) { if (onEnd) onEnd(); return; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const preferred = speechVoices.find((v) => (v.name.includes('Natural') || v.name.includes('Enhanced') || v.name.includes('Samantha')) && v.lang.startsWith('en'));
    if (preferred) u.voice = preferred;
    u.rate = 0.75; u.pitch = 1.0; u.volume = 0.9;
    if (onEnd) u.onend = onEnd;
    window.speechSynthesis.speak(u);
    if (captionEl) captionEl.textContent = text;
  }

  function speakWithPause(text, pause, cb) {
    speak(text, () => setTimeout(() => { if (cb) cb(); }, pause));
  }

  // ── Ambient Sound (Web Audio API) ─────────────────────────────────────
  let audioContext = null, ambientSource = null;

  function startAmbientSound() {
    if (!(_settings && _settings.ambientSound)) return;
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume();
      const o1 = audioContext.createOscillator();
      const o2 = audioContext.createOscillator();
      const gain = audioContext.createGain();
      o1.frequency.value = 220; o2.frequency.value = 330;
      o1.type = 'sine'; o2.type = 'sine';
      gain.gain.value = 0;
      o1.connect(gain); o2.connect(gain); gain.connect(audioContext.destination);
      o1.start(); o2.start();
      ambientSource = { o1, o2, gain, stopped: false };
      gain.gain.linearRampToValueAtTime(0.02, audioContext.currentTime + 3);
    } catch (e) { /* no audio available */ }
  }

  function stopAmbientSound() {
    if (!ambientSource || !audioContext || ambientSource.stopped) return;
    try {
      ambientSource.gain.gain.cancelScheduledValues(audioContext.currentTime);
      ambientSource.gain.gain.setValueAtTime(ambientSource.gain.gain.value, audioContext.currentTime);
      ambientSource.gain.gain.linearRampToValueAtTime(0, audioContext.currentTime + 2);
      ambientSource.stopped = true;
      setTimeout(() => {
        try { ambientSource.o1.stop(); ambientSource.o2.stop(); } catch (e) { }
        try { audioContext.close(); } catch (e) { }
        ambientSource = null; audioContext = null;
      }, 2100);
    } catch (e) { ambientSource = null; audioContext = null; }
  }

  // ── Theme ─────────────────────────────────────────────────────────────
  function applyTheme(name) {
    const themes = {
      'forest-calm': { a: '#68d391', b: '#4fd1c5', bg: '#0d1f0d' },
      'ocean-deep': { a: '#63b3ed', b: '#9f7aea', bg: '#0d1b2a' },
      'dusk-warm': { a: '#f6ad55', b: '#f56565', bg: '#1a0e0a' },
      'minimal-light': { a: '#6b7553', b: '#8b9467', bg: '#f7f3ef' },
    };
    const t = themes[name] || themes['forest-calm'];
    document.documentElement.style.setProperty('--teal-soft', t.a);
    document.documentElement.style.setProperty('--purple-soft', t.b);
    document.documentElement.style.setProperty('--bg-dark', t.bg);
    document.body.setAttribute('data-theme', name);
  }

  // ── Helpers ───────────────────────────────────────────────────────────
  function safeSend(msg) {
    try {
      chrome.runtime.sendMessage(msg, () => { void chrome.runtime.lastError; });
    } catch (e) { }
  }

})();