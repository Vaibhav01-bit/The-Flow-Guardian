// modules/fatigueEngine.js
// Adaptive fatigue scoring engine
// All signals are local — no external data ever leaves the device

const FatigueEngine = (() => {
    // In-memory rolling windows (not persisted — reset on service worker restart, that's fine)
    let _tabSwitchTimes = [];
    let _scrollBurstTimes = [];
    let _sessionStartTime = Date.now();
    let _lastBreakTime = Date.now();
    let _currentScore = 0;

    const WINDOW_5MIN = 5 * 60 * 1000;
    const WINDOW_60MIN = 60 * 60 * 1000;

    // Weights — tuned for a healthy browsing session baseline
    const BASE_WEIGHTS = {
        tabSwitch: 3.5,    // per switch in 5-min window
        scrollBurst: 1.2,  // per rapid scroll burst in 5-min window
        sessionAge: 0.4,   // per 10 min of continuous browsing
        noBreak: 6.0,      // flat penalty: no break in 90+ min
    };

    const COOL_DOWN = 0.88; // score decays each tick

    function recordTabSwitch() {
        _tabSwitchTimes.push(Date.now());
    }

    function recordScrollBurst() {
        _scrollBurstTimes.push(Date.now());
    }

    function recordBreak() {
        _lastBreakTime = Date.now();
        _sessionStartTime = Date.now(); // reset session clock after break
        // Decay score significantly on break
        _currentScore = _currentScore * 0.4;
    }

    function recordSessionStart() {
        _sessionStartTime = Date.now();
    }

    // Restore state after service worker wakes up
    function restoreState(saved) {
        if (!saved) return;
        _sessionStartTime = saved.sessionStartTime || Date.now();
        _lastBreakTime = saved.lastBreakTime || Date.now();
        _currentScore = saved.currentScore || 0;
        _tabSwitchTimes = saved.tabSwitchTimes || [];
        _scrollBurstTimes = saved.scrollBurstTimes || [];
    }

    function getPersistedState() {
        return {
            sessionStartTime: _sessionStartTime,
            lastBreakTime: _lastBreakTime,
            currentScore: _currentScore,
            tabSwitchTimes: _tabSwitchTimes,
            scrollBurstTimes: _scrollBurstTimes,
        };
    }

    async function computeScore() {
        const now = Date.now();
        const settings = await Storage.getSettings();
        const sensitivity = settings.fatigueSensitivity || 0.6;

        // Prune old events
        _tabSwitchTimes = _tabSwitchTimes.filter((t) => now - t <= WINDOW_5MIN);
        _scrollBurstTimes = _scrollBurstTimes.filter((t) => now - t <= WINDOW_5MIN);

        // 1. Tab switch contribution
        const switchScore = _tabSwitchTimes.length * BASE_WEIGHTS.tabSwitch;

        // 2. Scroll burst contribution
        const scrollScore = _scrollBurstTimes.length * BASE_WEIGHTS.scrollBurst;

        // 3. Session age contribution (per 10 min, capped at 60)
        const sessionMins = Math.min(60, (now - _sessionStartTime) / 60000);
        const ageScore = Math.floor(sessionMins / 10) * BASE_WEIGHTS.sessionAge;

        // 4. No-break penalty
        const timeSinceBreak = now - _lastBreakTime;
        const breakPenalty = timeSinceBreak > 90 * 60000 ? BASE_WEIGHTS.noBreak : 0;

        // Combine with cool-down on previous score
        const rawIncrease = switchScore + scrollScore + ageScore + breakPenalty;
        _currentScore = Math.max(0, _currentScore * COOL_DOWN + rawIncrease);

        // Clamp to 0–100 and apply sensitivity
        _currentScore = Math.min(100, _currentScore * sensitivity);

        if (!isFinite(_currentScore)) _currentScore = 0;

        return Math.round(_currentScore);
    }

    function getScore() {
        return Math.round(_currentScore);
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
            morning: [
                'Good morning — let\'s build a focused start.',
                'Morning clarity awaits. Begin with intention.',
                'A fresh day, a fresh mind. Let\'s go.',
            ],
            afternoon: [
                'Midday check — how\'s your energy?',
                'Steady pace wins. Keep flowing.',
                'You\'re doing well. Stay grounded.',
            ],
            evening: [
                'Evening — time to wind down gently.',
                'The day is slowing. Let your mind follow.',
                'Evening calm is productive too.',
            ],
            night: [
                'Night — rest well, your mind needs it.',
                'Dim the mental light. Ease into stillness.',
                'Late hours — be gentle with yourself.',
            ],
        };
        const list = prompts[ctx];
        return list[Math.floor(Math.random() * list.length)];
    }

    // Determine what nudge level to show
    // Returns: null | 'soft' | 'reset'
    function getNudgeLevel(score) {
        if (score >= 85) return 'reset';
        if (score >= 65) return 'soft';
        return null;
    }

    return {
        recordTabSwitch,
        recordScrollBurst,
        recordBreak,
        recordSessionStart,
        restoreState,
        getPersistedState,
        computeScore,
        getScore,
        getCircadianContext,
        getCircadianPrompt,
        getNudgeLevel,
    };
})();
