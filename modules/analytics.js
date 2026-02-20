// modules/analytics.js
// Local-only event logger and analytics aggregator
// All data stored in chrome.storage.local — no external calls ever

const Analytics = (() => {
    // Must be called after Storage is defined (both loaded in same page via script tags)

    async function logTabSwitch() {
        const hour = new Date().getHours();
        await Storage.updateDayRecord((rec) => {
            rec.tabSwitches = (rec.tabSwitches || 0) + 1;
            if (!rec.hourlyTabSwitches) rec.hourlyTabSwitches = new Array(24).fill(0);
            rec.hourlyTabSwitches[hour] = (rec.hourlyTabSwitches[hour] || 0) + 1;
            return rec;
        });
    }

    async function logScrollBurst() {
        await Storage.updateDayRecord((rec) => {
            rec.scrollBursts = (rec.scrollBursts || 0) + 1;
            return rec;
        });
    }

    async function logMood(mood) {
        // mood: 'happy' | 'neutral' | 'tired' | 'overwhelmed'
        await Storage.updateDayRecord((rec) => {
            if (!rec.moodLog) rec.moodLog = [];
            rec.moodLog.push({ time: Date.now(), mood });
            return rec;
        });
    }

    async function logReset(type) {
        // type: 'eye' | 'stretch' | 'mental' | 'energy'
        await Storage.updateDayRecord((rec) => {
            if (!rec.resetLog) rec.resetLog = [];
            rec.resetLog.push({ time: Date.now(), type });
            rec.breakCount = (rec.breakCount || 0) + 1;
            return rec;
        });
        await Storage.updateMeta((meta) => {
            meta.totalResets = (meta.totalResets || 0) + 1;
            return meta;
        });
    }

    async function logFocusSession(minutes) {
        await Storage.updateDayRecord((rec) => {
            rec.focusMinutes = (rec.focusMinutes || 0) + minutes;
            return rec;
        });
        await Storage.updateMeta((meta) => {
            meta.totalFocusHours = +(((meta.totalFocusHours || 0) + minutes / 60).toFixed(2));
            return meta;
        });
    }

    async function logFatigueScore(score) {
        const hour = new Date().getHours();
        await Storage.updateDayRecord((rec) => {
            if (!rec.hourlyFatigueScore) rec.hourlyFatigueScore = new Array(24).fill(0);
            // Rolling max — keep highest score recorded this hour
            rec.hourlyFatigueScore[hour] = Math.max(rec.hourlyFatigueScore[hour] || 0, Math.round(score));
            if (score >= 85) {
                if (!rec.fatigueSpikes) rec.fatigueSpikes = [];
                rec.fatigueSpikes.push({ time: Date.now(), score: Math.round(score) });
            }
            return rec;
        });
    }

    async function updateStreak() {
        const today = new Date().toISOString().slice(0, 10);
        await Storage.updateMeta((meta) => {
            const last = meta.lastActiveDate;
            if (last === today) return meta; // already counted today

            if (last) {
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const yStr = yesterday.toISOString().slice(0, 10);
                if (last === yStr) {
                    meta.streakDays = (meta.streakDays || 0) + 1;
                } else {
                    // Streak broken
                    meta.streakDays = 1;
                }
            } else {
                meta.streakDays = 1;
            }
            meta.lastActiveDate = today;
            return meta;
        });
    }

    async function getDailyStats() {
        const [rec, meta] = await Promise.all([Storage.getDayRecord(), Storage.getMeta()]);
        const focusScore = computeDailyFocusScore(rec);
        return {
            focusScore,
            focusMinutes: rec.focusMinutes || 0,
            breakCount: rec.breakCount || 0,
            tabSwitches: rec.tabSwitches || 0,
            streakDays: meta.streakDays || 0,
            totalFocusHours: meta.totalFocusHours || 0,
            totalResets: meta.totalResets || 0,
            lastMood: rec.moodLog && rec.moodLog.length > 0
                ? rec.moodLog[rec.moodLog.length - 1].mood
                : null,
        };
    }

    function computeDailyFocusScore(rec) {
        // Focus score: based on focus time, break ratio, fatigue spikes
        const focusMins = rec.focusMinutes || 0;
        const breaks = rec.breakCount || 0;
        const spikes = (rec.fatigueSpikes || []).length;

        // Base from focus time (up to 60 for 2h+)
        const timeScore = Math.min(60, focusMins / 2);
        // Bonus for breaks (healthy rhythm, up to 20)
        const breakScore = Math.min(20, breaks * 5);
        // Penalty for fatigue spikes (up to -30)
        const spikesPenalty = Math.min(30, spikes * 10);

        return Math.max(0, Math.min(100, Math.round(timeScore + breakScore - spikesPenalty)));
    }

    async function getWeeklyPatterns() {
        const days = await Storage.getRecentDays(7);
        return {
            dailyFocusScores: days.map(computeDailyFocusScore).reverse(),
            dailyFocusMinutes: days.map((d) => d.focusMinutes || 0).reverse(),
            dailyTabSwitches: days.map((d) => d.tabSwitches || 0).reverse(),
            dailyBreaks: days.map((d) => d.breakCount || 0).reverse(),
        };
    }

    async function getTodayHourlyData() {
        const rec = await Storage.getDayRecord();
        return {
            hourlyFatigueScore: rec.hourlyFatigueScore || new Array(24).fill(0),
            hourlyTabSwitches: rec.hourlyTabSwitches || new Array(24).fill(0),
        };
    }

    // Generate simple text insights from patterns
    async function generateInsights() {
        const [stats, hourly] = await Promise.all([getDailyStats(), getTodayHourlyData()]);
        const insights = [];

        // Peak fatigue hour
        const peakHour = hourly.hourlyFatigueScore.indexOf(Math.max(...hourly.hourlyFatigueScore));
        if (Math.max(...hourly.hourlyFatigueScore) > 20) {
            insights.push(`🔴 You tend to fatigue most around ${_formatHour(peakHour)}.`);
        }

        // Focus time feedback
        if (stats.focusMinutes >= 120) {
            insights.push(`✅ Great effort — ${stats.focusMinutes} mins of focus today.`);
        } else if (stats.focusMinutes > 0) {
            insights.push(`⏱ ${stats.focusMinutes} mins focused so far. Aim for 90+ mins.`);
        } else {
            insights.push(`💡 No focus sessions logged yet today. Try a 25-min session.`);
        }

        // Break habit
        if (stats.breakCount === 0) {
            insights.push(`☕ No breaks taken yet — a short reset can restore clarity.`);
        } else if (stats.breakCount >= 4) {
            insights.push(`🌿 Good break rhythm today — ${stats.breakCount} resets taken.`);
        }

        // Tab switches
        if (stats.tabSwitches > 60) {
            insights.push(`🔀 High tab-switching (${stats.tabSwitches}×) detected — consider focus mode.`);
        }

        return insights.slice(0, 3); // max 3 insights
    }

    function _formatHour(h) {
        if (h === 0) return '12am';
        if (h < 12) return `${h}am`;
        if (h === 12) return '12pm';
        return `${h - 12}pm`;
    }

    return {
        logTabSwitch,
        logScrollBurst,
        logMood,
        logReset,
        logFocusSession,
        logFatigueScore,
        updateStreak,
        getDailyStats,
        getWeeklyPatterns,
        getTodayHourlyData,
        generateInsights,
    };
})();
