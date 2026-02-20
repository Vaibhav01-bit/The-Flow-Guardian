// modules/uiRenderer.js
// Shared DOM utilities — canvas charts, animated counters, theme management

const UIRenderer = (() => {
    // ── Theme Management ───────────────────────────────────────────────────────

    const THEMES = {
        'forest-calm': {
            '--bg-dark': '#0d1f0d',
            '--bg-mid': '#1a3a1a',
            '--accent': '#68d391',
            '--accent-soft': '#9ae6b4',
            '--accent-glow': 'rgba(104, 211, 145, 0.25)',
            '--grad-a': '#68d391',
            '--grad-b': '#4fd1c5',
            '--text-primary': '#f0fff4',
            '--text-muted': '#9abba5',
            '--glass-border': 'rgba(104, 211, 145, 0.15)',
            '--card-bg': 'rgba(255, 255, 255, 0.04)',
        },
        'ocean-deep': {
            '--bg-dark': '#0d1b2a',
            '--bg-mid': '#1b3a5c',
            '--accent': '#63b3ed',
            '--accent-soft': '#90cdf4',
            '--accent-glow': 'rgba(99, 179, 237, 0.25)',
            '--grad-a': '#63b3ed',
            '--grad-b': '#9f7aea',
            '--text-primary': '#ebf8ff',
            '--text-muted': '#90afc5',
            '--glass-border': 'rgba(99, 179, 237, 0.15)',
            '--card-bg': 'rgba(255, 255, 255, 0.04)',
        },
        'dusk-warm': {
            '--bg-dark': '#1a0e0a',
            '--bg-mid': '#3d1f14',
            '--accent': '#f6ad55',
            '--accent-soft': '#fbd38d',
            '--accent-glow': 'rgba(246, 173, 85, 0.25)',
            '--grad-a': '#f6ad55',
            '--grad-b': '#f56565',
            '--text-primary': '#fffaf0',
            '--text-muted': '#c9a882',
            '--glass-border': 'rgba(246, 173, 85, 0.15)',
            '--card-bg': 'rgba(255, 255, 255, 0.04)',
        },
        'minimal-light': {
            '--bg-dark': '#f7f3ef',
            '--bg-mid': '#ede8e3',
            '--accent': '#6b7553',
            '--accent-soft': '#8b9467',
            '--accent-glow': 'rgba(107, 117, 83, 0.2)',
            '--grad-a': '#8b9467',
            '--grad-b': '#6b7553',
            '--text-primary': '#2d3748',
            '--text-muted': '#718096',
            '--glass-border': 'rgba(107, 117, 83, 0.2)',
            '--card-bg': 'rgba(0, 0, 0, 0.04)',
        },
    };

    function setTheme(themeName) {
        const theme = THEMES[themeName] || THEMES['forest-calm'];
        const root = document.documentElement;
        Object.entries(theme).forEach(([prop, val]) => root.style.setProperty(prop, val));
        document.body.setAttribute('data-theme', themeName);
    }

    function getThemeList() {
        return [
            { key: 'forest-calm', label: '🌿 Forest Calm' },
            { key: 'ocean-deep', label: '🌊 Ocean Deep' },
            { key: 'dusk-warm', label: '🌅 Dusk Warm' },
            { key: 'minimal-light', label: '☀️ Minimal Light' },
        ];
    }

    // ── Animated Counter ───────────────────────────────────────────────────────

    function animateCount(el, from, to, duration = 600) {
        if (!el) return;
        const start = performance.now();
        const diff = to - from;

        function tick(now) {
            const t = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - t, 3); // ease out cubic
            el.textContent = Math.round(from + diff * eased);
            if (t < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
    }

    // ── Canvas Bar Chart ───────────────────────────────────────────────────────
    // Minimal, no-library bar chart for the Insights page

    function renderBarChart(canvas, data, labels, options = {}) {
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;

        const {
            accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#68d391',
            mutedColor = 'rgba(255,255,255,0.08)',
            labelColor = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#9abba5',
            maxValue,
            showLabels = true,
        } = options;

        ctx.clearRect(0, 0, W, H);

        const padL = 4;
        const padR = 4;
        const padT = 8;
        const padB = showLabels ? 22 : 4;

        const chartW = W - padL - padR;
        const chartH = H - padT - padB;
        const n = data.length;
        const gap = 4;
        const barW = Math.max(4, (chartW - gap * (n - 1)) / n);
        const max = maxValue || Math.max(...data, 1);

        data.forEach((val, i) => {
            const x = padL + i * (barW + gap);
            const barH = Math.max(2, (val / max) * chartH);
            const y = padT + chartH - barH;

            // Draw empty bar background
            ctx.beginPath();
            ctx.roundRect(x, padT, barW, chartH, 3);
            ctx.fillStyle = mutedColor;
            ctx.fill();

            // Draw filled bar
            const grad = ctx.createLinearGradient(x, y + barH, x, y);
            grad.addColorStop(0, accentColor + '66');
            grad.addColorStop(1, accentColor);
            ctx.beginPath();
            ctx.roundRect(x, y, barW, barH, 3);
            ctx.fillStyle = grad;
            ctx.fill();

            // Draw label
            if (showLabels && labels && labels[i]) {
                ctx.fillStyle = labelColor;
                ctx.font = '9px Inter, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(labels[i], x + barW / 2, H - 4);
            }
        });
    }

    // ── Fatigue Ring Progress ──────────────────────────────────────────────────

    function updateFatigueRing(ringEl, scoreEl, stateEl, pct) {
        if (!ringEl) return;
        ringEl.style.setProperty('--ring-progress', `${pct}%`);

        let color = 'var(--accent)';
        let stateText = 'In the Flow';

        if (pct > 75) {
            color = '#f56565';
            stateText = 'Take a deep breath — you deserve it';
        } else if (pct > 45) {
            color = '#f6ad55';
            stateText = 'Focus is dipping — time to pause';
        }

        ringEl.style.setProperty('--ring-color', color);
        if (scoreEl) scoreEl.textContent = pct;
        if (stateEl) stateEl.textContent = stateText;
    }

    // ── View Transition ────────────────────────────────────────────────────────

    function switchView(views, activeId) {
        views.forEach((v) => {
            if (v.id === activeId) {
                v.classList.add('view--active');
                v.classList.remove('view--hidden');
            } else {
                v.classList.remove('view--active');
                v.classList.add('view--hidden');
            }
        });
    }

    // ── Misc Helpers ───────────────────────────────────────────────────────────

    function formatMinutes(mins) {
        if (mins < 60) return `${mins}m`;
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }

    function formatHour(h) {
        if (h === 0) return '12a';
        if (h < 12) return `${h}a`;
        if (h === 12) return '12p';
        return `${h - 12}p`;
    }

    // Generate last-N-days short labels like "Mon", "Tue"
    function getWeekDayLabels(n = 7) {
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

    function createEl(tag, classNames = '', html = '') {
        const el = document.createElement(tag);
        if (classNames) el.className = classNames;
        if (html) el.innerHTML = html;
        return el;
    }

    return {
        setTheme,
        getThemeList,
        animateCount,
        renderBarChart,
        updateFatigueRing,
        switchView,
        formatMinutes,
        formatHour,
        getWeekDayLabels,
        createEl,
    };
})();
