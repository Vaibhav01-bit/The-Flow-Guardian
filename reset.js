// reset.js
// Modern breathing animation using Canvas - Performance optimized

(() => {
  'use strict';

  const BREATH_IN = 4000;
  const HOLD = 2000;
  const BREATH_OUT = 6000;
  const REST = 1000;
  const TOTAL_CYCLE = BREATH_IN + HOLD + BREATH_OUT + REST;
  const MAX_CYCLES = 4;

  let canvas, ctx, breathingText, captionEl;
  let animationFrameId;
  let isActive = false;
  let startTime = 0;
  let currentCycleCount = 0;
  let lastState = '';
  let speechVoices = [];

  document.addEventListener('DOMContentLoaded', init);

  function loadVoices() {
    if (window.speechSynthesis) {
      speechVoices = window.speechSynthesis.getVoices();
    }
  }

  function init() {
    // --- Voice Synthesis Setup ---
    loadVoices();
    if (window.speechSynthesis && window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    // Directly get all required elements from the DOM.
    canvas = document.getElementById('breathing-canvas');
    breathingText = document.getElementById('breathing-text');
    captionEl = document.getElementById('captions');
    const startBtn = document.getElementById('start-reset');
    const closeBtn = document.getElementById('close-reset');

    // Perform robust checks to ensure all elements are loaded.
    let initFailed = false;
    if (!canvas) {
      console.error("The Flow Guardian: Could not find element #breathing-canvas.");
      initFailed = true;
    }
    if (!breathingText) {
      console.error("The Flow Guardian: Could not find element #breathing-text.");
      initFailed = true;
    }
    if (!startBtn) {
      console.error("The Flow Guardian: Could not find element #start-reset.");
      initFailed = true;
    }
    if (!captionEl) {
      console.error("The Flow Guardian: Could not find element #captions.");
      initFailed = true;
    }
    if (!closeBtn) {
      console.error("The Flow Guardian: Could not find element #close-reset.");
      initFailed = true;
    }

    if (initFailed) {
      // Display a user-friendly error on the page if initialization fails.
      document.body.innerHTML = '<div style="font-family: sans-serif; padding: 20px; text-align: center; color: #c00;">' +
        '<h3>Animation Failed to Load</h3>' +
        '<p>A required component of the page was not found. Please try reloading the extension.</p>' +
        '<p><i>Error code: INIT_FAILURE</i></p>' +
        '</div>';
      return;
    }

    // Get the canvas context.
    ctx = canvas.getContext('2d');

    // Attach event listeners.
    startBtn.addEventListener('click', () => {
      if (isActive) return;
      isActive = true;
      startBtn.style.display = 'none';
      startTime = Date.now();
      currentCycleCount = 0;
      lastState = '';
      speak("We will begin now.");
      animate();
    });

    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      isActive = false;
      cancelAnimationFrame(animationFrameId);
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      try {
        chrome.runtime.sendMessage({ type: 'resetFatigue' });
      } catch (err) {}
      window.close();
    });

    draw(0, 'Rest'); // Initial draw
  }

  function speak(text) {
    // Guard against unavailable Speech Synthesis API
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel(); // Stop current
      const utterance = new SpeechSynthesisUtterance(text);
      
      // Use the cached voice list
      const preferredVoice = speechVoices.find(v => 
        (v.name.includes('Female') || v.name.includes('Samantha') || v.name.includes('Natural')) && v.lang.startsWith('en')
      );

      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }
      
      utterance.rate = 0.85;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
    
    // Guard against missing caption element
    if (captionEl) {
      captionEl.textContent = text;
    }
  }

  function animate() {
    if (!isActive) return;

    const now = Date.now();
    const totalElapsed = now - startTime;
    
    // Check if finished
    if (currentCycleCount >= MAX_CYCLES && totalElapsed % TOTAL_CYCLE < 100) {
        isActive = false;
        breathingText.textContent = "Well done.";
        speak("You have finished. Well done.");
        return;
    }

    const cycleElapsed = totalElapsed % TOTAL_CYCLE;
    let progress = 0;
    let state = '';

    if (cycleElapsed < BREATH_IN) {
      progress = cycleElapsed / BREATH_IN;
      state = 'Inhale';
    } else if (cycleElapsed < BREATH_IN + HOLD) {
      progress = 1;
      state = 'Hold';
    } else if (cycleElapsed < BREATH_IN + HOLD + BREATH_OUT) {
      progress = 1 - (cycleElapsed - (BREATH_IN + HOLD)) / BREATH_OUT;
      state = 'Exhale';
    } else {
      progress = 0;
      state = 'Rest';
    }

    // Handle Word-for-Word Script
    if (state !== lastState) {
      if (state === 'Inhale') {
        currentCycleCount++;
        speak(`Cycle ${currentCycleCount}. Inhale... two... three... four.`);
      } else if (state === 'Hold') {
        speak("Hold.");
      } else if (state === 'Exhale') {
        speak("Exhale... two... three... four... five... six.");
      }
      lastState = state;
    }

    if (breathingText) {
      breathingText.textContent = state === 'Inhale' ? 'Inhale' : state === 'Hold' ? 'Hold' : state === 'Exhale' ? 'Exhale' : 'Rest';
    } else {
      console.error("breathingText element not found in animate function.");
    }
    
    draw(progress, state);
    animationFrameId = requestAnimationFrame(animate);
  }

  function draw(progress, state) {
    if (!ctx || !canvas) {
      console.error("Drawing context not available. Initialization likely failed.");
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    // Smooth easing (cubic for organic feel)
    const ease = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;

    // 1. Aura / Halo (Teal & Purple)
    const auraRadius = 120 + ease * 80;
    const auraAlpha = 0.15 + ease * 0.15;
    const gradient = ctx.createRadialGradient(centerX, centerY, 40, centerX, centerY, auraRadius);
    gradient.addColorStop(0, `rgba(79, 209, 197, ${auraAlpha})`);
    gradient.addColorStop(0.6, `rgba(159, 122, 234, ${auraAlpha * 0.5})`);
    gradient.addColorStop(1, 'rgba(159, 122, 234, 0)');

    ctx.beginPath();
    ctx.arc(centerX, centerY, auraRadius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    // 2. Character Setup
    ctx.save();
    ctx.translate(centerX, centerY + 80);
    
    // Subtle float
    const floatY = Math.sin(Date.now() / 2000) * 5;
    ctx.translate(0, floatY);

    // 3. Legs (Meditation Pose)
    ctx.fillStyle = '#2d3748';
    // Left Leg
    ctx.beginPath();
    ctx.ellipse(-50, 20, 60, 25, 0.2, 0, Math.PI * 2);
    ctx.fill();
    // Right Leg
    ctx.beginPath();
    ctx.ellipse(50, 20, 60, 25, -0.2, 0, Math.PI * 2);
    ctx.fill();

    // 4. Torso (Belly & Chest Expansion)
    const torsoScaleX = 1 + ease * 0.08;
    const torsoScaleY = 1 + ease * 0.05;
    const shoulderDrop = (1 - ease) * 8;

    ctx.save();
    ctx.scale(torsoScaleX, torsoScaleY);
    ctx.beginPath();
    ctx.moveTo(-45, 0);
    ctx.bezierCurveTo(-50, -80 - shoulderDrop, 50, -80 - shoulderDrop, 45, 0);
    ctx.lineTo(40, 30);
    ctx.bezierCurveTo(30, 50, -30, 50, -40, 30);
    ctx.closePath();
    ctx.fillStyle = '#4fd1c5'; // Teal shirt
    ctx.fill();
    ctx.restore();

    // 5. Head & Face
    ctx.save();
    const headY = -100 - ease * 5; // Head moves slightly with breath
    ctx.translate(0, headY);
    
    // Head shape
    ctx.beginPath();
    ctx.arc(0, 0, 35, 0, Math.PI * 2);
    ctx.fillStyle = '#fbd38d'; // Warm skin tone
    ctx.fill();

    // Hair
    ctx.beginPath();
    ctx.arc(0, -10, 38, Math.PI, 0);
    ctx.fillStyle = '#1a202c';
    ctx.fill();

    // Eyes (Closed, relaxed curves)
    ctx.strokeStyle = '#4a5568';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    
    // Left eye
    ctx.beginPath();
    ctx.arc(-12, 5, 6, 0.2, Math.PI - 0.2);
    ctx.stroke();
    // Right eye
    ctx.beginPath();
    ctx.arc(12, 5, 6, 0.2, Math.PI - 0.2);
    ctx.stroke();

    // Friendly Smile
    ctx.beginPath();
    ctx.arc(0, 15, 8, 0.2, Math.PI - 0.2);
    ctx.stroke();

    ctx.restore();

    // 6. Arms
    ctx.strokeStyle = '#fbd38d';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    
    // Left Arm (resting on knee)
    ctx.beginPath();
    ctx.moveTo(-45, -50 - ease * 2);
    ctx.quadraticCurveTo(-70, -10, -60, 25);
    ctx.stroke();
    
    // Right Arm (resting on knee)
    ctx.beginPath();
    ctx.moveTo(45, -50 - ease * 2);
    ctx.quadraticCurveTo(70, -10, 60, 25);
    ctx.stroke();

    ctx.restore();
  }
})();