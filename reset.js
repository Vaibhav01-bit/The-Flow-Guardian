// reset.js
// Modern breathing animation using Canvas - Performance optimized

(() => {
  'use strict';

  const BREATH_IN = 4000;   // 4 seconds - Inhale
  const HOLD = 4000;        // 4 seconds - Hold (doubled for deeper relaxation)
  const BREATH_OUT = 8000;  // 8 seconds - Exhale (slower, calmer)
  const TOTAL_CYCLE = BREATH_IN + HOLD + BREATH_OUT; // 16 seconds - Very calm / anxiety relief pattern
  const MAX_CYCLES = 4;

  let canvas, ctx, breathingText, captionEl, breathGlow;
  let animationFrameId;
  let isActive = false;
  let startTime = 0;
  let currentCycleCount = 0;
  let lastState = '';
  let speechVoices = [];
  let progressDots = [];

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
    breathGlow = document.querySelector('.breath-glow');
    const startBtn = document.getElementById('start-reset');
    const skipBtn = document.getElementById('skip-reset');
    const closeBtn = document.getElementById('close-reset');
    progressDots = document.querySelectorAll('.progress-dot');

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
      
      // Smooth button fade out
      startBtn.classList.add('fade-out');
      setTimeout(() => {
        startBtn.style.display = 'none';
      }, 300);
      
      // Show skip button after session starts
      setTimeout(() => {
        if (skipBtn) {
          skipBtn.style.display = 'block';
          skipBtn.classList.add('fade-in');
        }
      }, 2000);
      
      startTime = Date.now();
      currentCycleCount = 0;
      lastState = '';
      
      // Update text smoothly
      updateBreathingText("Let's begin", true);
      speak("Breathe with me.");
      
      // Start animation
      setTimeout(() => {
        animate();
      }, 1000);
    });

    // Skip button handler
    if (skipBtn) {
      skipBtn.addEventListener('click', () => {
        completeSession();
      });
    }

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

  function updateBreathingText(text, smooth = true) {
    if (!breathingText) return;
    
    if (smooth) {
      breathingText.classList.add('fade-out');
      setTimeout(() => {
        breathingText.textContent = text;
        breathingText.classList.remove('fade-out');
        breathingText.classList.add('fade-in');
        setTimeout(() => {
          breathingText.classList.remove('fade-in');
        }, 600);
      }, 300);
    } else {
      breathingText.textContent = text;
    }
  }

  function updateProgressIndicator(cycleNum) {
    progressDots.forEach((dot, index) => {
      if (index < cycleNum) {
        dot.classList.add('active');
      } else {
        dot.classList.remove('active');
      }
    });
  }

  function completeSession() {
    isActive = false;
    cancelAnimationFrame(animationFrameId);
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    updateBreathingText("You're centered and calm", true);
    speak("Well done. You are ready.");
    
    // Hide skip button
    const skipBtn = document.getElementById('skip-reset');
    if (skipBtn) {
      skipBtn.style.display = 'none';
    }
  }

  function speak(text) {
    // Guard against unavailable Speech Synthesis API
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel(); // Stop current
      const utterance = new SpeechSynthesisUtterance(text);
      
      // Find a warm, natural human voice
      const preferredVoice = speechVoices.find(v => 
        (v.name.includes('Natural') || v.name.includes('Premium') || 
         v.name.includes('Samantha') || v.name.includes('Female') ||
         v.name.includes('Enhanced')) && v.lang.startsWith('en')
      );

      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }
      
      // Warm, natural human voice settings - slower, softer
      utterance.rate = 0.75;  // Slower for calm, natural pacing
      utterance.pitch = 1.0;  // Natural pitch
      utterance.volume = 0.9; // Slightly softer
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
    const cycleElapsed = totalElapsed % TOTAL_CYCLE;
    let progress = 0;
    let state = '';

    if (cycleElapsed < BREATH_IN) {
      // Inhale phase: smooth expansion
      const t = cycleElapsed / BREATH_IN;
      progress = easeInOutQuad(t);
      state = 'Inhale';
    } else if (cycleElapsed < BREATH_IN + HOLD) {
      // Hold phase: completely still at full expansion
      progress = 1;
      state = 'Hold';
    } else if (cycleElapsed < BREATH_IN + HOLD + BREATH_OUT) {
      // Exhale phase: very gentle, slower contraction (8 seconds - much longer and calmer)
      const t = (cycleElapsed - (BREATH_IN + HOLD)) / BREATH_OUT;
      progress = 1 - easeOutQuart(t);
      state = 'Exhale';
    } else {
      // Seamless loop back to start
      progress = 0;
      state = 'Inhale';
    }

    // Natural voice guidance - minimal, aligned with animation timing
    if (state !== lastState) {
      if (state === 'Inhale') {
        currentCycleCount++;
        // Update progress indicator
        updateProgressIndicator(currentCycleCount);
        
        // Check if we should stop BEFORE announcing the next cycle
        if (currentCycleCount > MAX_CYCLES) {
          completeSession();
          return;
        }
        // Just say "Inhale" - minimal guidance
        speak("Inhale.");
        if (captionEl) captionEl.textContent = "Inhale slowly...";
      } else if (state === 'Hold') {
        // Silent hold - no voice, just visual feedback
        if (captionEl) captionEl.textContent = "Hold...";
      } else if (state === 'Exhale') {
        // Just say "Exhale" - then silence
        speak("Exhale.");
        if (captionEl) captionEl.textContent = "Exhale gently...";
      }
      lastState = state;
    }

    // Update main text display
    const stateText = state === 'Inhale' ? 'Inhale' : state === 'Hold' ? 'Hold' : 'Exhale';
    if (breathingText && breathingText.textContent !== stateText) {
      breathingText.textContent = stateText;
    }
    
    // Sync breath glow with animation
    if (breathGlow) {
      const glowIntensity = 0.4 + (progress * 0.3);
      breathGlow.style.opacity = glowIntensity;
    }
    
    draw(progress, state);
    animationFrameId = requestAnimationFrame(animate);
  }

  // Easing functions for organic, natural motion
  function easeInOutQuad(t) {
    // Gentle, smooth acceleration and deceleration for inhale
    // Less aggressive than standard quad for more natural feel
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function easeOutQuart(t) {
    // Very gentle, calming motion for exhale - slower throughout
    // Using quartic (power of 4) for ultra-smooth, prolonged deceleration
    return 1 - Math.pow(1 - t, 4);
  }

  function draw(progress, state) {
    if (!ctx || !canvas) {
      console.error("Drawing context not available. Initialization likely failed.");
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    // Use the progress directly (already eased in animate function)
    const ease = progress;

    // 1. Soft glowing aura / halo synchronized with breath (Pastel Teal & Purple)
    const auraRadius = 100 + ease * 110; // Expands more noticeably
    const auraAlpha = 0.12 + ease * 0.20; // More visible glow
    const auraGradient = ctx.createRadialGradient(centerX, centerY, 30, centerX, centerY, auraRadius);
    auraGradient.addColorStop(0, `rgba(79, 209, 197, ${auraAlpha * 1.2})`); // Brighter center
    auraGradient.addColorStop(0.4, `rgba(79, 209, 197, ${auraAlpha * 0.8})`); // Teal mid
    auraGradient.addColorStop(0.7, `rgba(159, 122, 234, ${auraAlpha * 0.5})`); // Purple transition
    auraGradient.addColorStop(1, 'rgba(159, 122, 234, 0)'); // Fade to transparent

    ctx.beginPath();
    ctx.arc(centerX, centerY, auraRadius, 0, Math.PI * 2);
    ctx.fillStyle = auraGradient;
    ctx.fill();

    // 2. Character Setup
    ctx.save();
    ctx.translate(centerX, centerY + 80);
    
    // Very subtle float for organic feel (gentler than before)
    const floatY = Math.sin(Date.now() / 3000) * 3;
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

    // 4. Torso (Belly & Chest Expansion) - more pronounced breathing
    const torsoScaleX = 1 + ease * 0.12; // More visible expansion
    const torsoScaleY = 1 + ease * 0.08;
    const shoulderDrop = (1 - ease) * 6; // Shoulders relax during inhale

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
    const headY = -100 - ease * 3; // Subtle head movement with breath (reduced)
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

    // Eyes (Gently closed, peaceful expression)
    ctx.strokeStyle = '#2d3748';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    
    // Left eye - gentle closed curve
    ctx.beginPath();
    ctx.arc(-12, 5, 6, 0.15, Math.PI - 0.15);
    ctx.stroke();
    // Right eye - gentle closed curve
    ctx.beginPath();
    ctx.arc(12, 5, 6, 0.15, Math.PI - 0.15);
    ctx.stroke();

    // Soft, calm smile
    ctx.beginPath();
    ctx.arc(0, 15, 9, 0.15, Math.PI - 0.15);
    ctx.stroke();

    ctx.restore();

    // 6. Arms (relaxed, minimal movement)
    ctx.strokeStyle = '#fbd38d';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    
    // Left Arm (resting peacefully on knee)
    ctx.beginPath();
    ctx.moveTo(-45, -50 - ease * 1.5);
    ctx.quadraticCurveTo(-70, -10, -60, 25);
    ctx.stroke();
    
    // Right Arm (resting peacefully on knee)
    ctx.beginPath();
    ctx.moveTo(45, -50 - ease * 1.5);
    ctx.quadraticCurveTo(70, -10, 60, 25);
    ctx.stroke();

    ctx.restore();
  }
})();