// modules/breathingEngine.js
// Breathing phase timing profiles mapped to reset types + circadian context

const BreathingEngine = (() => {
    // Base timing profiles per reset type (in milliseconds)
    const PROFILES = {
        eye: {
            name: 'Eye Reset',
            emoji: '👁️',
            description: 'Rest and refocus your eyes',
            instruction: 'Gently close your eyes and let them soften.',
            breathIn: 4000,
            hold: 2000,
            breathOut: 6000,
            cycles: 4,
            accentColor: '#81e6d9',  // soft teal
            glowColor: 'rgba(129, 230, 217, 0.2)',
        },
        stretch: {
            name: 'Stretch Reset',
            emoji: '🧘',
            description: 'Release body tension',
            instruction: 'Roll your shoulders back and breathe into the stretch.',
            breathIn: 5000,
            hold: 3000,
            breathOut: 7000,
            cycles: 3,
            accentColor: '#b794f4',  // soft purple
            glowColor: 'rgba(183, 148, 244, 0.2)',
        },
        mental: {
            name: 'Mental Reset',
            emoji: '🧠',
            description: 'Clear mental clutter',
            instruction: 'Let each exhale release a thought you don\'t need.',
            breathIn: 4000,
            hold: 4000,
            breathOut: 8000,
            cycles: 4,
            accentColor: '#68d391',  // soft green
            glowColor: 'rgba(104, 211, 145, 0.2)',
        },
        energy: {
            name: 'Energy Reset',
            emoji: '⚡',
            description: 'Refresh and re-energize',
            instruction: 'Breathe in vitality, breathe out fatigue.',
            breathIn: 3000,
            hold: 1000,
            breathOut: 5000,
            cycles: 5,
            accentColor: '#f6ad55',  // warm amber
            glowColor: 'rgba(246, 173, 85, 0.2)',
        },
    };

    // Circadian modifiers — applied on top of base profiles
    const CIRCADIAN_MODS = {
        morning: { breathInMult: 0.9, breathOutMult: 0.9 }, // slightly faster, energizing
        afternoon: { breathInMult: 1.0, breathOutMult: 1.0 }, // neutral
        evening: { breathInMult: 1.1, breathOutMult: 1.15 }, // slower, winding down
        night: { breathInMult: 1.2, breathOutMult: 1.3 },    // slowest, very calming
    };

    function getProfile(type, circadianContext = 'afternoon') {
        const base = PROFILES[type] || PROFILES.mental;
        const mod = CIRCADIAN_MODS[circadianContext] || CIRCADIAN_MODS.afternoon;

        return {
            ...base,
            breathIn: Math.round(base.breathIn * mod.breathInMult),
            breathOut: Math.round(base.breathOut * mod.breathOutMult),
            totalCycle: Math.round(
                base.breathIn * mod.breathInMult +
                base.hold +
                base.breathOut * mod.breathOutMult
            ),
        };
    }

    function getAllTypes() {
        return Object.entries(PROFILES).map(([key, p]) => ({
            key,
            name: p.name,
            emoji: p.emoji,
            description: p.description,
        }));
    }

    // Breathing state at a given time within a cycle
    function getPhase(elapsed, profile) {
        const { breathIn, hold, breathOut, totalCycle } = profile;
        const cycleElapsed = elapsed % totalCycle;

        if (cycleElapsed < breathIn) {
            return {
                phase: 'inhale',
                progress: cycleElapsed / breathIn,
                label: 'Inhale',
                caption: 'Breathe in slowly...',
            };
        } else if (cycleElapsed < breathIn + hold) {
            return {
                phase: 'hold',
                progress: 1,
                label: 'Hold',
                caption: 'Hold gently...',
            };
        } else {
            const t = (cycleElapsed - breathIn - hold) / breathOut;
            return {
                phase: 'exhale',
                progress: 1 - t,
                label: 'Exhale',
                caption: 'Release slowly...',
            };
        }
    }

    // How many complete cycles have elapsed
    function getCycleCount(elapsed, profile) {
        return Math.floor(elapsed / profile.totalCycle);
    }

    return {
        getProfile,
        getAllTypes,
        getPhase,
        getCycleCount,
    };
})();
