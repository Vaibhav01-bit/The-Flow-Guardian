// wellness.js — The Flow Guardian · Wellness Reset v1.1
// Navigation uses inline style.display — no CSS class fights
'use strict';

(function () {

    // ── Screen IDs ────────────────────────────────────────────────────────────
    const SCREEN_IDS = ['home', 'eye', 'stretch', 'mental', 'energy'];

    // ── Navigation ───────────────────────────────────────────────────────────
    function showScreen(id) {
        SCREEN_IDS.forEach(sid => {
            const el = document.getElementById(`screen-${sid}`);
            if (!el) return;
            el.style.display = (sid === id) ? 'block' : 'none';
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        stopAllTimers();
    }

    // Home screen special case — it uses flex
    function showHome() {
        SCREEN_IDS.forEach(sid => {
            const el = document.getElementById(`screen-${sid}`);
            if (!el) return;
            el.style.display = (sid === 'home') ? 'flex' : 'none';
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        stopAllTimers();
    }

    document.querySelectorAll('.card').forEach(card => {
        card.addEventListener('click', () => {
            const section = card.dataset.section;
            showScreen(section);
            logWellnessReset(section);
        });
    });

    // ── Log reset to background (for popup break history) ─────────────────────
    function logWellnessReset(resetType) {
        try {
            chrome.runtime.sendMessage({ type: 'logReset', resetType, mood: null }, () => {
                void chrome.runtime.lastError;
            });
        } catch (e) { /* extension context may be invalidated */ }
    }

    document.querySelectorAll('.btn-back').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.target === 'home') showHome();
            else showScreen(btn.dataset.target);
        });
    });

    const btnBackHome = document.getElementById('btn-back-home');
    if (btnBackHome) btnBackHome.addEventListener('click', () => {
        try { window.close(); } catch (e) { showHome(); }
    });

    // ── Tab panel switcher (generic) ──────────────────────────────────────────
    function setupTabs(tabSelector, getPanelId, defaultFlex) {
        const tabs = document.querySelectorAll(tabSelector);
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('tool-tab--active'));
                tab.classList.add('tool-tab--active');
                const targetId = getPanelId(tab);
                tabs.forEach(t => {
                    const panelId = getPanelId(t);
                    const panel = document.getElementById(panelId);
                    if (!panel) return;
                    panel.style.display = (panelId === targetId) ? (defaultFlex ? 'flex' : 'block') : 'none';
                });
            });
        });
    }

    // Eye tabs
    setupTabs('[data-eye-tab]', tab => `eye-panel-${tab.dataset.eyeTab}`, true);
    // Mental tabs
    setupTabs('[data-mental-tab]', tab => `mental-panel-${tab.dataset.mentalTab}`, true);
    // Energy tabs
    setupTabs('[data-energy-tab]', tab => `energy-panel-${tab.dataset.energyTab}`, true);

    // ── Timer cleanup ─────────────────────────────────────────────────────────
    const _timers = [];
    const _rafs = [];

    function registerTimer(id) { _timers.push(id); }
    function registerRaf(id) { _rafs.push(id); }

    function stopAllTimers() {
        _timers.forEach(id => { clearInterval(id); clearTimeout(id); });
        _timers.length = 0;
        _rafs.forEach(cancelAnimationFrame);
        _rafs.length = 0;
        stopEyeMove();
        stopBlinkGuide();
        stopMentalBreath();
        stopFastBreath();
        stopEye2020();
        stopStretch();
        stopMentalCd();
        stopEnergyMove();
    }

    // ── Ring timer helpers ────────────────────────────────────────────────────
    function makeRingTimer(total, fillEl, valEl, onTick, onDone) {
        const circum = 2 * Math.PI * 52;
        if (fillEl) { fillEl.style.strokeDasharray = circum; fillEl.style.strokeDashoffset = 0; }
        if (valEl) valEl.textContent = total;
        let remaining = total;

        const id = setInterval(() => {
            remaining--;
            if (valEl) valEl.textContent = Math.max(0, remaining);
            if (fillEl) fillEl.style.strokeDashoffset = circum * (1 - remaining / total);
            if (onTick) onTick(remaining);
            if (remaining <= 0) { clearInterval(id); if (onDone) onDone(); }
        }, 1000);
        registerTimer(id);
        return id;
    }

    function makeCircProgress(total, fillEl, valEl, onDone) {
        const circum = 2 * Math.PI * 70;
        if (fillEl) { fillEl.style.strokeDasharray = circum; fillEl.style.strokeDashoffset = 0; }
        if (valEl) valEl.textContent = total;
        let remaining = total;
        const id = setInterval(() => {
            remaining--;
            if (valEl) valEl.textContent = Math.max(0, remaining);
            if (fillEl) fillEl.style.strokeDashoffset = circum * (1 - remaining / total);
            if (remaining <= 0) { clearInterval(id); if (onDone) onDone(); }
        }, 1000);
        registerTimer(id);
        return id;
    }

    // ── Toast ─────────────────────────────────────────────────────────────────
    function showToast(msg = 'Reset complete. Carry this calm with you.', resetType = null) {
        const t = document.getElementById('completion-toast');

        const m = document.getElementById('toast-msg');
        if (!t) return;
        if (m) m.textContent = msg;
        t.classList.add('toast--show');
        const id = setTimeout(() => t.classList.remove('toast--show'), 3500);
        registerTimer(id);
        // ⑤ Save reset to storage so popup history can show it
        if (resetType) {
            try {
                chrome.runtime.sendMessage({ type: 'logReset', resetType, mood: null }, () => {
                    void chrome.runtime.lastError;
                });
            } catch (e) { /* ignore */ }
        }
    }

    // ── Sound ─────────────────────────────────────────────────────────────────
    let _audioCtx = null;
    let _soundEnabled = {};

    function toggleSound(key, btnEl) {
        _soundEnabled[key] = !_soundEnabled[key];
        btnEl.textContent = _soundEnabled[key] ? '🔔' : '🔕';
    }

    function playTone(freq = 432, dur = 0.5, vol = 0.04) {
        try {
            if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (_audioCtx.state === 'suspended') _audioCtx.resume();
            const osc = _audioCtx.createOscillator();
            const gain = _audioCtx.createGain();
            osc.frequency.value = freq;
            osc.type = 'sine';
            gain.gain.setValueAtTime(vol, _audioCtx.currentTime);
            gain.gain.linearRampToValueAtTime(0, _audioCtx.currentTime + dur);
            osc.connect(gain); gain.connect(_audioCtx.destination);
            osc.start(); osc.stop(_audioCtx.currentTime + dur);
        } catch (e) { /* no audio */ }
    }

    let _droneNode = null, _droneGain = null;

    function startDrone(freq = 110) {
        try {
            if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (_audioCtx.state === 'suspended') _audioCtx.resume();
            if (_droneNode) return;
            _droneNode = _audioCtx.createOscillator();
            _droneGain = _audioCtx.createGain();
            _droneNode.frequency.value = freq;
            _droneNode.type = 'sine';
            _droneGain.gain.setValueAtTime(0, _audioCtx.currentTime);
            _droneGain.gain.linearRampToValueAtTime(0.025, _audioCtx.currentTime + 2);
            _droneNode.connect(_droneGain); _droneGain.connect(_audioCtx.destination);
            _droneNode.start();
        } catch (e) { _droneNode = null; }
    }

    function stopDrone() {
        try {
            if (_droneGain) _droneGain.gain.linearRampToValueAtTime(0, _audioCtx.currentTime + 1);
            if (_droneNode) {
                setTimeout(() => {
                    try { _droneNode.stop(); } catch (e) { }
                    _droneNode = null; _droneGain = null;
                }, 1100);
            }
        } catch (e) { _droneNode = null; _droneGain = null; }
    }

    // ──────────────────────────────────────────────────────────────────────────
    //  👁️  EYE RESET ENGINE
    // ──────────────────────────────────────────────────────────────────────────

    // 20-20-20 timer
    let _eye2020Timer = null;
    function stopEye2020() { if (_eye2020Timer) { clearInterval(_eye2020Timer); _eye2020Timer = null; } }

    const eye2020StartBtn = document.getElementById('eye-2020-start');
    const eye2020Fill = document.getElementById('eye-2020-fill');
    const eye2020Val = document.getElementById('eye-2020-val');
    const eye2020Inst = document.getElementById('eye-2020-inst');

    if (eye2020StartBtn) {
        eye2020StartBtn.addEventListener('click', () => {
            stopEye2020();
            eye2020StartBtn.disabled = true;
            eye2020StartBtn.textContent = 'Looking...';
            if (eye2020Inst) eye2020Inst.textContent = '👀 Find something 20 feet away — a window, a wall...';
            playTone(528, 0.6, 0.05);

            _eye2020Timer = makeRingTimer(20, eye2020Fill, eye2020Val, (rem) => {
                if (rem === 10 && eye2020Inst) eye2020Inst.textContent = '10 seconds remaining — keep gazing...';
                if (rem === 5 && eye2020Inst) eye2020Inst.textContent = '5 seconds — almost there...';
            }, () => {
                if (eye2020Inst) eye2020Inst.textContent = '✅ Done — blink gently and return.';
                playTone(440, 0.8, 0.06);
                eye2020StartBtn.textContent = '↻ Again';
                eye2020StartBtn.disabled = false;
                showToast('20-20-20 complete. Your eyes thank you.');
            });
        });
    }

    const eyeSoundBtn = document.getElementById('eye-sound-toggle');
    if (eyeSoundBtn) eyeSoundBtn.addEventListener('click', () => toggleSound('eye', eyeSoundBtn));

    // Blink guide
    let _blinkTimer = null, _blinkCount = 0, _blinkAutoId = null;
    function stopBlinkGuide() { clearInterval(_blinkTimer); clearInterval(_blinkAutoId); }

    const blinkStartBtn = document.getElementById('blink-start');
    const blinkManualBtn = document.getElementById('blink-manual');
    const blinkLabel = document.getElementById('blink-label');
    const blinkCountEl = document.getElementById('blink-count');
    const blinkEye = document.getElementById('blink-eye');

    function doBlink() {
        if (!blinkEye) return;
        blinkEye.classList.add('blink-eye--blink');
        const id = setTimeout(() => blinkEye.classList.remove('blink-eye--blink'), 250);
        registerTimer(id);
        if (_soundEnabled['eye']) playTone(330, 0.15, 0.03);
        _blinkCount++;
        if (blinkCountEl) blinkCountEl.textContent = Math.min(_blinkCount, 20);
        if (blinkLabel) blinkLabel.textContent = `Blink ${_blinkCount} of 20`;
        if (_blinkCount >= 20) {
            clearInterval(_blinkAutoId);
            if (blinkLabel) blinkLabel.textContent = '✅ Done! Your eyes are refreshed.';
            showToast('Blink routine complete!');
        }
    }

    if (blinkStartBtn) {
        blinkStartBtn.addEventListener('click', () => {
            _blinkCount = 0;
            if (blinkCountEl) blinkCountEl.textContent = 0;
            if (blinkLabel) blinkLabel.textContent = 'Follow the rhythm...';
            clearInterval(_blinkAutoId);
            _blinkAutoId = setInterval(() => { if (_blinkCount < 20) doBlink(); }, 1000);
            registerTimer(_blinkAutoId);
        });
    }
    if (blinkManualBtn) blinkManualBtn.addEventListener('click', doBlink);

    // Eye movement
    let _eyeMoveRaf = null, _eyeMoveRunning = false;
    function stopEyeMove() { _eyeMoveRunning = false; cancelAnimationFrame(_eyeMoveRaf); }

    const eyeMoveDot = document.getElementById('eye-move-dot');
    const eyeMoveStart = document.getElementById('eye-move-start');
    const eyeMoveStop = document.getElementById('eye-move-stop');

    const MOVE_PATHS = [
        (t) => ({ x: Math.sin(t * 1.5) * 38, y: Math.sin(t * 3) * 20 }),
        (t) => ({ x: Math.cos(t) * 35, y: Math.sin(t) * 22 }),
        (t) => ({ x: Math.sin(t * 2) * 20, y: Math.cos(t) * 32 }),
    ];
    let _movePath = 0, _moveT = 0;

    function animateEyeMove() {
        if (!_eyeMoveRunning) return;
        _moveT += 0.025;
        const { x, y } = MOVE_PATHS[_movePath](_moveT);
        if (eyeMoveDot) eyeMoveDot.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
        _eyeMoveRaf = requestAnimationFrame(animateEyeMove);
    }

    if (eyeMoveStart) {
        eyeMoveStart.addEventListener('click', () => {
            _eyeMoveRunning = true;
            _moveT = 0;
            _movePath = (_movePath + 1) % MOVE_PATHS.length;
            eyeMoveStart.style.display = 'none';
            if (eyeMoveStop) eyeMoveStop.style.display = '';
            animateEyeMove();
        });
    }
    if (eyeMoveStop) {
        eyeMoveStop.addEventListener('click', () => {
            stopEyeMove();
            if (eyeMoveStart) eyeMoveStart.style.display = '';
            eyeMoveStop.style.display = 'none';
        });
    }

    // Dim / Blue-light toggles
    const dimToggle = document.getElementById('toggle-dim');
    const bluelightToggle = document.getElementById('toggle-bluelight');
    const dimOverlay = document.getElementById('dim-overlay');
    const bluelightOv = document.getElementById('bluelight-overlay');

    if (dimToggle && dimOverlay) dimToggle.addEventListener('change', () => dimOverlay.classList.toggle('active', dimToggle.checked));
    if (bluelightToggle && bluelightOv) bluelightToggle.addEventListener('change', () => bluelightOv.classList.toggle('active', bluelightToggle.checked));

    // ──────────────────────────────────────────────────────────────────────────
    //  🧘  STRETCH ENGINE
    // ──────────────────────────────────────────────────────────────────────────

    const STRETCH_ROUTINES = {
        neck: {
            icon: '🌀', title: 'Neck Roll', duration: 30,
            desc: 'Slowly roll your head: chin to chest, right ear to shoulder, back, left. 3 cycles each direction.',
            steps: ['Drop chin to chest', 'Roll right slowly', 'Head back', 'Roll left slowly', 'Return to centre']
        },
        shoulder: {
            icon: '🔁', title: 'Shoulder Roll', duration: 45,
            desc: 'Roll both shoulders back 5 times, then forward 5 times. Feel the tension release.',
            steps: ['Lift both shoulders', 'Roll them backward', 'Lower and release', 'Roll forward now', 'Let them drop']
        },
        wrist: {
            icon: '🤲', title: 'Wrist Stretch', duration: 30,
            desc: 'Extend one arm, pull fingers back with other hand. Hold 10s each side. Then rotate wrists.',
            steps: ['Extend right arm', 'Pull fingers back', 'Hold 10 seconds', 'Switch to left', 'Rotate both wrists']
        },
        posture: {
            icon: '🪑', title: 'Posture Reset', duration: 60,
            desc: 'Sit on the edge of your seat, feet flat. Draw shoulder blades together, chin tucked, ears over shoulders.',
            steps: ['Sit on seat edge', 'Feet flat on floor', 'Squeeze shoulder blades', 'Tuck chin slightly', 'Hold & breathe']
        },
    };

    let _currentRoutine = 'neck';
    let _stretchTimer = null, _stretchStepIdx = 0, _stretchRunning = false;

    function stopStretch() {
        _stretchRunning = false;
        if (_stretchTimer) { clearInterval(_stretchTimer); _stretchTimer = null; }
    }

    const routineBtns = document.querySelectorAll('.routine-btn');
    const stretchCpFill = document.getElementById('stretch-cp');
    const stretchCpVal = document.getElementById('stretch-cp-val');
    const stretchIcon = document.getElementById('stretch-icon-big');
    const stretchTitle = document.getElementById('stretch-cue-title');
    const stretchDesc = document.getElementById('stretch-cue-desc');
    const stretchStart = document.getElementById('stretch-start');
    const stretchSkip = document.getElementById('stretch-skip');
    const stretchSound = document.getElementById('stretch-sound');

    function loadRoutine(key) {
        const r = STRETCH_ROUTINES[key];
        _currentRoutine = key;
        if (stretchIcon) stretchIcon.textContent = r.icon;
        if (stretchTitle) stretchTitle.textContent = r.title;
        if (stretchDesc) stretchDesc.textContent = r.desc;
        if (stretchCpVal) stretchCpVal.textContent = r.duration;
        const circum = 2 * Math.PI * 70;
        if (stretchCpFill) { stretchCpFill.style.strokeDasharray = circum; stretchCpFill.style.strokeDashoffset = 0; }
    }

    routineBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            routineBtns.forEach(b => b.classList.remove('routine-btn--active'));
            btn.classList.add('routine-btn--active');
            stopStretch();
            loadRoutine(btn.dataset.routine);
            if (stretchStart) { stretchStart.textContent = '▶ Start Routine'; stretchStart.disabled = false; }
            if (stretchSkip) stretchSkip.style.display = 'none';
        });
    });

    if (stretchStart) {
        stretchStart.addEventListener('click', () => {
            stopStretch();
            _stretchRunning = true;
            _stretchStepIdx = 0;
            if (stretchSkip) stretchSkip.style.display = '';
            stretchStart.disabled = true;
            const r = STRETCH_ROUTINES[_currentRoutine];
            if (_soundEnabled['stretch']) startDrone(110);

            _stretchTimer = makeCircProgress(r.duration, stretchCpFill, stretchCpVal, () => {
                stopDrone();
                stretchStart.disabled = false;
                stretchStart.textContent = '↻ Again';
                if (stretchSkip) stretchSkip.style.display = 'none';
                if (stretchDesc) stretchDesc.textContent = '✅ Stretch complete. Feel your body loosen.';
                showToast('Stretch done! Sit tall and carry it forward.');
                if (_soundEnabled['stretch']) playTone(528, 0.8, 0.05);
            });

            function advanceCue() {
                const steps = r.steps;
                if (_stretchStepIdx < steps.length) {
                    if (stretchDesc) stretchDesc.textContent = steps[_stretchStepIdx];
                    _stretchStepIdx++;
                    const stepDur = (r.duration / steps.length) * 1000;
                    const id = setTimeout(advanceCue, stepDur);
                    registerTimer(id);
                }
            }
            advanceCue();
        });
    }

    if (stretchSkip) stretchSkip.addEventListener('click', () => { stopStretch(); loadRoutine(_currentRoutine); if (stretchStart) { stretchStart.disabled = false; } });
    if (stretchSound) stretchSound.addEventListener('click', () => toggleSound('stretch', stretchSound));

    loadRoutine('neck');

    // ──────────────────────────────────────────────────────────────────────────
    //  🧠  MENTAL ENGINE
    // ──────────────────────────────────────────────────────────────────────────

    // Breathing (canvas-driven)
    let _mentalBreathRaf = null, _mentalBreathRunning = false, _mentalBreathStart = 0;
    function stopMentalBreath() { _mentalBreathRunning = false; cancelAnimationFrame(_mentalBreathRaf); stopDrone(); }

    const mentalBreathCanvas = document.getElementById('mental-breath-canvas');
    const mentalBreathLabel = document.getElementById('mental-breath-label');
    const mentalBreathStart = document.getElementById('mental-breathe-start');
    const mentalSound = document.getElementById('mental-sound');
    let _mentalBreathCtx = null;

    if (mentalBreathCanvas) _mentalBreathCtx = mentalBreathCanvas.getContext('2d');

    const MENTAL_CYCLE = 16000;
    const MENTAL_PHASES = [
        { label: 'Inhale', dur: 4000, colour: '#68d391' },
        { label: 'Hold', dur: 4000, colour: '#4fd1c5' },
        { label: 'Exhale', dur: 8000, colour: '#9f7aea' },
    ];

    function getMentalPhase(t) {
        const cycle = t % MENTAL_CYCLE;
        let cum = 0;
        for (const p of MENTAL_PHASES) {
            if (cycle < cum + p.dur) return { phase: p, progress: (cycle - cum) / p.dur };
            cum += p.dur;
        }
        return { phase: MENTAL_PHASES[2], progress: 1 };
    }

    function drawMentalBreath(progress, color) {
        if (!_mentalBreathCtx) return;
        const c = _mentalBreathCtx, W = 200, H = 200, cx = W / 2, cy = H / 2;
        c.clearRect(0, 0, W, H);
        const r = 30 + progress * 55;
        const g = c.createRadialGradient(cx, cy, 5, cx, cy, r + 20);
        g.addColorStop(0, color + 'aa');
        g.addColorStop(1, color + '00');
        c.beginPath(); c.arc(cx, cy, r + 20, 0, Math.PI * 2);
        c.fillStyle = g; c.fill();
        c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2);
        c.fillStyle = color + '22'; c.fill();
        c.strokeStyle = color; c.lineWidth = 2.5; c.stroke();
    }

    function animateMentalBreath() {
        if (!_mentalBreathRunning) return;
        const elapsed = Date.now() - _mentalBreathStart;
        const { phase, progress } = getMentalPhase(elapsed);
        if (mentalBreathLabel && mentalBreathLabel.textContent !== phase.label) mentalBreathLabel.textContent = phase.label;
        const ep = phase.label === 'Inhale' ? progress * progress : phase.label === 'Exhale' ? 1 - (1 - progress) * (1 - progress) : 1;
        drawMentalBreath(ep, phase.colour);
        _mentalBreathRaf = requestAnimationFrame(animateMentalBreath);
    }

    if (mentalBreathStart) {
        mentalBreathStart.addEventListener('click', () => {
            if (_mentalBreathRunning) { stopMentalBreath(); mentalBreathStart.textContent = '▶ Begin'; return; }
            _mentalBreathRunning = true;
            _mentalBreathStart = Date.now();
            mentalBreathStart.textContent = '⏹ Stop';
            if (_soundEnabled['mental']) startDrone(164);
            animateMentalBreath();
            const id = setTimeout(() => {
                stopMentalBreath();
                mentalBreathStart.textContent = '▶ Begin';
                showToast('Mental reset complete. Mind cleared.');
            }, MENTAL_CYCLE * 5);
            registerTimer(id);
        });
    }

    if (mentalSound) mentalSound.addEventListener('click', () => toggleSound('mental', mentalSound));

    // Journal prompts
    const JOURNAL_PROMPTS = [
        'What is one thing taking up mental space right now? Write it out and let it go.',
        'What would "done for now" look like? Describe it in 2 sentences.',
        'Name 3 things you\'ve accomplished today — even small ones.',
        'What\'s one thing you can let go of in the next 5 minutes?',
        'If your phone was dead, what would feel most important right now?',
        'What does your body need right now? What does your mind need?',
        'Write the next single step — not the plan, just the next step.',
        'What would your calmer self say to you right now?',
    ];

    let _journalIdx = 0;
    const journalPromptEl = document.getElementById('journal-prompt');
    const journalRefresh = document.getElementById('journal-refresh');
    const journalText = document.getElementById('journal-text');
    const journalWordCt = document.getElementById('journal-word-count');

    if (journalPromptEl) journalPromptEl.textContent = JOURNAL_PROMPTS[0];
    if (journalRefresh) {
        journalRefresh.addEventListener('click', () => {
            _journalIdx = (_journalIdx + 1) % JOURNAL_PROMPTS.length;
            if (journalPromptEl) {
                journalPromptEl.style.opacity = '0';
                const id = setTimeout(() => { journalPromptEl.textContent = JOURNAL_PROMPTS[_journalIdx]; journalPromptEl.style.opacity = '1'; }, 300);
                registerTimer(id);
            }
        });
    }
    if (journalText && journalWordCt) {
        journalText.addEventListener('input', () => {
            journalWordCt.textContent = journalText.value.trim().split(/\s+/).filter(Boolean).length;
        });
    }

    // Focus countdown
    let _mentalCdTimer = null;
    function stopMentalCd() { if (_mentalCdTimer) { clearInterval(_mentalCdTimer); _mentalCdTimer = null; } }

    const mentalCdFill = document.getElementById('mental-cd-fill');
    const mentalCdVal = document.getElementById('mental-cd-val');
    const mentalCdCue = document.getElementById('mental-cd-cue');
    const mentalCdStart = document.getElementById('mental-cd-start');

    const CD_CUES = [
        [60, 'One minute of pure presence'],
        [50, 'Let every thought drift past like clouds'],
        [40, 'Your only job right now: breathe'],
        [30, 'Halfway — well done, keep going'],
        [20, 'Twenty seconds left — you\'re grounded'],
        [10, 'Almost there — breathe in fully'],
        [5, 'Five — you\'ve got this'],
        [0, '✅ Clear mind. Return refreshed.'],
    ];

    if (mentalCdStart) {
        mentalCdStart.addEventListener('click', () => {
            mentalCdStart.disabled = true;
            mentalCdStart.textContent = 'Running...';
            if (_soundEnabled['mental']) startDrone(220);
            _mentalCdTimer = makeRingTimer(60, mentalCdFill, mentalCdVal, (rem) => {
                const cue = CD_CUES.find(c => c[0] === rem);
                if (cue && mentalCdCue) mentalCdCue.textContent = cue[1];
            }, () => {
                stopDrone();
                mentalCdStart.disabled = false;
                mentalCdStart.textContent = '↻ Again';
                playTone(528, 1, 0.06);
                showToast('Focus reset complete. Return clear-headed.');
            });
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    //  ⚡  ENERGY ENGINE
    // ──────────────────────────────────────────────────────────────────────────

    const CHALLENGES = [
        { icon: '🤸', title: 'Jumping Jacks', desc: '20 reps · Gets blood flowing fast', dur: 45 },
        { icon: '🦵', title: 'High Knees', desc: '30 seconds · Boosts heart rate', dur: 30 },
        { icon: '💪', title: 'Desk Push-ups', desc: '10 reps · Arms against desk', dur: 40 },
        { icon: '🕺', title: 'Dance Break', desc: '30 seconds · Just move freely!', dur: 30 },
        { icon: '🧘', title: 'Standing Sway', desc: '20 seconds · Gentle movement', dur: 20 },
    ];
    const MOTIVATIONS = [
        'You\'re one move away from feeling better.',
        'Movement is medicine. Go!',
        'Your future self thanks you for this.',
        'Energy is created, not found. Make it now.',
        'A body in motion stays sharp.',
    ];

    let _challengeIdx = 0, _energyMoveTimer = null, _energyMoveRunning = false;
    function stopEnergyMove() { _energyMoveRunning = false; if (_energyMoveTimer) { clearInterval(_energyMoveTimer); _energyMoveTimer = null; } }

    const energyMoveIcon = document.getElementById('energy-move-icon');
    const energyMoveTitle = document.getElementById('energy-move-title');
    const energyMoveDesc = document.getElementById('energy-move-desc');
    const energyMoveFill = document.getElementById('energy-move-fill');
    const energyMoveVal = document.getElementById('energy-move-val');
    const energyMoveStart = document.getElementById('energy-move-start');
    const energyMoveNext = document.getElementById('energy-move-next');
    const energyMotivation = document.getElementById('energy-motivation-text');

    function loadChallenge(idx) {
        const c = CHALLENGES[idx % CHALLENGES.length];
        if (energyMoveIcon) energyMoveIcon.textContent = c.icon;
        if (energyMoveTitle) energyMoveTitle.textContent = c.title;
        if (energyMoveDesc) energyMoveDesc.textContent = c.desc;
        if (energyMoveVal) energyMoveVal.textContent = c.dur;
        if (energyMotivation) energyMotivation.textContent = MOTIVATIONS[idx % MOTIVATIONS.length];
        const circum = 2 * Math.PI * 52;
        if (energyMoveFill) { energyMoveFill.style.strokeDasharray = circum; energyMoveFill.style.strokeDashoffset = 0; }
    }

    if (energyMoveStart) {
        energyMoveStart.addEventListener('click', () => {
            stopEnergyMove();
            _energyMoveRunning = true;
            energyMoveStart.disabled = true;
            if (energyMoveNext) energyMoveNext.style.display = 'none';
            const c = CHALLENGES[_challengeIdx % CHALLENGES.length];
            playTone(440, 0.4, 0.05);
            _energyMoveTimer = makeRingTimer(c.dur, energyMoveFill, energyMoveVal, null, () => {
                _energyMoveRunning = false;
                energyMoveStart.disabled = false;
                energyMoveStart.textContent = '↻ Restart';
                if (energyMoveNext) energyMoveNext.style.display = '';
                playTone(528, 0.8, 0.06);
                showToast('Challenge done! Feel that energy?');
            });
        });
    }

    if (energyMoveNext) {
        energyMoveNext.addEventListener('click', () => {
            _challengeIdx++;
            loadChallenge(_challengeIdx);
            if (energyMoveStart) { energyMoveStart.textContent = '▶ Start'; energyMoveStart.disabled = false; }
            energyMoveNext.style.display = 'none';
        });
    }

    loadChallenge(0);

    // Fast breath (5-0-5)
    let _fastBreathRaf = null, _fastBreathRunning = false, _fastBreathStart = 0;
    function stopFastBreath() { _fastBreathRunning = false; cancelAnimationFrame(_fastBreathRaf); }

    const fastBreathBar = document.getElementById('fast-breath-bar');
    const fastBreathLabel = document.getElementById('fast-breath-label');
    const energyBreathStart = document.getElementById('energy-breath-start');
    const FAST_CYCLE = 10000;

    function animateFastBreath() {
        if (!_fastBreathRunning) return;
        const t = (Date.now() - _fastBreathStart) % FAST_CYCLE;
        const inhaling = t < 5000;
        const progress = inhaling ? t / 5000 : 1 - (t - 5000) / 5000;
        if (fastBreathBar) {
            fastBreathBar.style.height = `${progress * 100}%`;
            fastBreathBar.style.background = inhaling
                ? 'linear-gradient(to top, #f6ad55, #f56565)'
                : 'linear-gradient(to top, #68d391, #4fd1c5)';
        }
        if (fastBreathLabel) fastBreathLabel.textContent = inhaling ? 'Inhale deeply...' : 'Exhale fully...';
        _fastBreathRaf = requestAnimationFrame(animateFastBreath);
    }

    if (energyBreathStart) {
        energyBreathStart.addEventListener('click', () => {
            if (_fastBreathRunning) { stopFastBreath(); energyBreathStart.textContent = '▶ Breathe'; return; }
            _fastBreathRunning = true;
            _fastBreathStart = Date.now();
            energyBreathStart.textContent = '⏹ Stop';
            animateFastBreath();
            const id = setTimeout(() => {
                stopFastBreath();
                energyBreathStart.textContent = '▶ Breathe';
                showToast('Energising breath done! You\'re back.');
            }, FAST_CYCLE * 8);
            registerTimer(id);
        });
    }

    // Hydrate
    const hydrateDone = document.getElementById('hydrate-done');
    if (hydrateDone) {
        hydrateDone.addEventListener('click', () => {
            hydrateDone.textContent = '💧 Hydrated! Nice work.';
            hydrateDone.disabled = true;
            playTone(528, 0.5, 0.04);
            showToast('Hydration logged. Your brain and body thank you.');
        });
    }

    // ── Particle system ───────────────────────────────────────────────────────
    const particleContainer = document.getElementById('particles');
    if (particleContainer) {
        for (let i = 0; i < 12; i++) {
            const p = document.createElement('div');
            p.className = 'particle';
            p.style.cssText = `
        left: ${Math.random() * 100}%;
        width: ${2 + Math.random() * 4}px;
        height: ${2 + Math.random() * 4}px;
        animation-duration: ${10 + Math.random() * 20}s;
        animation-delay: ${Math.random() * 15}s;
      `;
            particleContainer.appendChild(p);
        }
    }

    // ── Init ──────────────────────────────────────────────────────────────────
    showHome();

})();
