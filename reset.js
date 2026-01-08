// reset.js
// Modern breathing animation using Canvas - Performance optimized

(() => {
  'use strict';

  // Time-aware breathing constants (adjusted based on time of day)
  let BREATH_IN = 4000;   // 4 seconds - Inhale
  let HOLD = 4000;        // 4 seconds - Hold
  let BREATH_OUT = 8000;  // 8 seconds - Exhale
  let TOTAL_CYCLE = 16000; // 16 seconds base cycle
  const MAX_CYCLES = 4;
  
  // Apply time-of-day adjustments
  function applyTimeAwareness() {
    const timing = getBreathingTimingForTime();
    BREATH_IN = timing.breathIn;
    HOLD = timing.hold;
    BREATH_OUT = timing.breathOut;
    TOTAL_CYCLE = BREATH_IN + HOLD + BREATH_OUT;
  }

  let canvas, ctx, breathingText, captionEl, breathGlow, quoteEl;
  let animationFrameId;
  let isActive = false;
  let startTime = 0;
  let currentCycleCount = 0;
  let lastState = '';
  let speechVoices = [];
  let progressDots = [];
  let quoteInterval = null;
  let currentQuoteIndex = 0;

  // Categorized quotes for different preferences
  const quotesCalm = [
    "Slow down. You are safe.",
    "Breathe. This moment is enough.",
    "Rest is part of progress.",
    "Calm brings clarity.",
    "One breath at a time.",
    "You are exactly where you need to be.",
    "Trust the pace of your own growth.",
    "Stillness is a form of strength.",
    "Let go of what you cannot control.",
    "Peace begins with a single breath.",
    "You deserve this moment of rest.",
    "Gentle progress is still progress.",
    "Your well-being matters.",
    "This pause will serve you well.",
    "You don't need to rush."
  ];

  const quotesEncouraging = [
    "You're doing well.",
    "One step at a time.",
    "You've got this.",
    "Keep going gently.",
    "You're making progress.",
    "Trust yourself.",
    "You're exactly where you need to be.",
    "Your effort matters.",
    "You're growing every day.",
    "Believe in your journey.",
    "You're stronger than you think.",
    "Small steps lead to big changes.",
    "You're capable and calm.",
    "Your best is enough.",
    "You're doing great."
  ];

  const quotesMinimal = [
    "Pause.",
    "Breathe.",
    "Ease.",
    "Rest.",
    "Calm.",
    "Peace.",
    "Flow.",
    "Center.",
    "Ground.",
    "Release.",
    "Soften.",
    "Trust.",
    "Settle.",
    "Balance.",
    "Steady."
  ];

  // Completion messages (soft, supportive, non-gamified)
  const completionMessages = [
    "Nice work. Take that calm back into your task.",
    "Carry this calm with you.",
    "You're ready to continue.",
    "Take this peace forward.",
    "You've centered yourself well.",
    "Return to your work with this clarity.",
    "You're grounded and ready.",
    "That calm is yours to keep."
  ];

  let activeQuotes = quotesCalm; // Default
  let preferences = {
    quoteStyle: 'calm',
    ambientSound: false
  };
  let audioContext = null;
  let ambientSource = null;

  document.addEventListener('DOMContentLoaded', () => {
    // Apply time-of-day awareness
    applyTimeAwareness();
    
    // Load preferences first, then initialize
    chrome.storage.local.get(['quoteStyle', 'ambientSound'], (result) => {
      preferences.quoteStyle = result.quoteStyle || 'calm';
      preferences.ambientSound = result.ambientSound || false;
      
      // Set active quotes based on preference
      switch(preferences.quoteStyle) {
        case 'encouraging':
          activeQuotes = quotesEncouraging;
          break;
        case 'minimal':
          activeQuotes = quotesMinimal;
          break;
        case 'off':
          activeQuotes = [];
          break;
        default:
          activeQuotes = quotesCalm;
      }
      
      init();
    });
  });

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
    quoteEl = document.getElementById('motivational-quote');
    breathGlow = document.querySelector('.breath-glow');
    const startBtn = document.getElementById('start-reset');
    const skipBtn = document.getElementById('skip-reset');
    const closeBtn = document.getElementById('close-reset');
    const returnToWorkBtn = document.getElementById('return-to-work');
    const anotherBreathBtn = document.getElementById('another-breath');
    const completionActions = document.getElementById('completion-actions');
    const supportiveText = document.querySelector('.supportive-text');
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
      
      // Start ambient sound if enabled
      startAmbientSound();
      
      // Start quote rotation when session starts
      startQuoteRotation();
      
      // Update text smoothly
      updateBreathingText("Let's begin", true);
      
      // Speak introduction with proper timing
      speakWithPause("Let's begin.", 2000, () => {
        // After pause, start breathing animation
        animate();
      });
    });

    // Skip button handler
    if (skipBtn) {
      skipBtn.addEventListener('click', () => {
        completeSession();
      });
    }

    // Return to work button
    if (returnToWorkBtn) {
      returnToWorkBtn.addEventListener('click', () => {
        closePageGently();
      });
    }

    // Another breath button
    if (anotherBreathBtn) {
      anotherBreathBtn.addEventListener('click', () => {
        // Reset and restart session
        location.reload();
      });
    }

    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      closePageGently();
    });

    draw(0, 'Inhale'); // Initial draw
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
    
    // Clear quote rotation
    if (quoteInterval) {
      clearInterval(quoteInterval);
      quoteInterval = null;
    }
    
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    
    // Hide skip button and supportive text
    const skipBtn = document.getElementById('skip-reset');
    if (skipBtn) {
      skipBtn.style.display = 'none';
    }
    
    const supportiveText = document.querySelector('.supportive-text');
    if (supportiveText) {
      supportiveText.style.opacity = '0';
    }
    
    // Clear breathing text and captions
    if (breathingText) {
      breathingText.textContent = '';
    }
    if (captionEl) {
      captionEl.textContent = '';
    }
    if (quoteEl) {
      quoteEl.textContent = '';
    }
    
    // 1. Moment of stillness (1.5 seconds)
    setTimeout(() => {
      // 2. Show completion message
      showCompletionMessage();
      
      // 3. After completion message fades out, show action buttons
      setTimeout(() => {
        showCompletionActions();
      }, 4000); // After message shows for 3 seconds
      
      // 4. Stop ambient sound after completion message starts
      setTimeout(() => {
        stopAmbientSound();
      }, 500);
      
    }, 1500); // Stillness duration
  }

  function showCompletionActions() {
    const completionActions = document.getElementById('completion-actions');
    const closeLink = document.getElementById('close-reset');
    
    if (completionActions) {
      completionActions.style.display = 'flex';
      setTimeout(() => {
        completionActions.classList.add('show');
      }, 100);
    }
    
    // Hide the "Back to work" link since we have the button now
    if (closeLink) {
      closeLink.style.opacity = '0';
    }
  }

  function closePageGently() {
    // Fade out the entire page
    document.body.classList.add('fade-out-page');
    
    // Stop everything
    isActive = false;
    cancelAnimationFrame(animationFrameId);
    
    if (quoteInterval) {
      clearInterval(quoteInterval);
    }
    
    stopAmbientSound();
    
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    
    // Wait for fade animation, then close
    setTimeout(() => {
      try {
        chrome.runtime.sendMessage({ type: 'resetFatigue' });
      } catch (err) {}
      window.close();
    }, 1000);
  }

  function startQuoteRotation() {
    if (!quoteEl || activeQuotes.length === 0) return;
    
    // Show first quote
    showQuote(0);
    
    // Rotate quotes every 8 seconds (longer visibility)
    quoteInterval = setInterval(() => {
      currentQuoteIndex = (currentQuoteIndex + 1) % activeQuotes.length;
      showQuote(currentQuoteIndex);
    }, 8000);
  }

  function showQuote(index) {
    if (!quoteEl || activeQuotes.length === 0) return;
    
    // If this is the first quote, show it immediately without fade
    if (index === 0 && !quoteEl.textContent) {
      quoteEl.textContent = activeQuotes[index];
      quoteEl.style.opacity = '0.75';
      return;
    }
    
    // Fade out current quote (1s)
    quoteEl.classList.add('fade-out');
    
    // After fade out, change text and fade in (1s)
    setTimeout(() => {
      quoteEl.textContent = activeQuotes[index];
      quoteEl.classList.remove('fade-out');
      quoteEl.classList.add('fade-in');
      
      // Remove fade-in class after transition
      setTimeout(() => {
        quoteEl.classList.remove('fade-in');
      }, 1000);
    }, 1000);
  }

  // Time-of-day awareness
  function getTimeOfDay() {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 18) return 'afternoon';
    if (hour >= 18 && hour < 23) return 'evening';
    return 'night';
  }

  function getBreathingTimingForTime() {
    const timeOfDay = getTimeOfDay();
    
    // Evening/night: slightly slower, deeper calm
    if (timeOfDay === 'evening' || timeOfDay === 'night') {
      return {
        breathIn: 5000,   // 5 seconds
        hold: 4000,       // 4 seconds
        breathOut: 9000   // 9 seconds (extra slow)
      };
    }
    
    // Default (morning/afternoon): standard timing
    return {
      breathIn: 4000,   // 4 seconds
      hold: 4000,       // 4 seconds
      breathOut: 8000   // 8 seconds
    };
  }

  // Ambient sound generation (Web Audio API)
  function startAmbientSound() {
    if (!preferences.ambientSound) return;
    
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // Resume audio context if suspended (required on some browsers)
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }
      
      // Create a very subtle ambient pad sound
      const oscillator1 = audioContext.createOscillator();
      const oscillator2 = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      // Very low frequencies for calm ambient
      oscillator1.frequency.value = 220; // A3
      oscillator2.frequency.value = 330; // E4
      
      oscillator1.type = 'sine';
      oscillator2.type = 'sine';
      
      // Very low volume
      gainNode.gain.value = 0;
      
      // Connect nodes
      oscillator1.connect(gainNode);
      oscillator2.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // Start oscillators
      oscillator1.start();
      oscillator2.start();
      
      ambientSource = { oscillator1, oscillator2, gainNode, stopped: false };
      
      // Fade in over 3 seconds
      gainNode.gain.linearRampToValueAtTime(0.02, audioContext.currentTime + 3);
      
    } catch (err) {
      console.log('Ambient sound not available:', err);
    }
  }

  function stopAmbientSound() {
    if (!ambientSource || !audioContext) return;
    if (ambientSource.stopped) return; // Already stopped
    
    try {
      // Check if audio context is still valid
      if (audioContext.state === 'closed') {
        ambientSource = null;
        audioContext = null;
        return;
      }
      
      // Fade out over 2 seconds
      ambientSource.gainNode.gain.cancelScheduledValues(audioContext.currentTime);
      ambientSource.gainNode.gain.setValueAtTime(ambientSource.gainNode.gain.value, audioContext.currentTime);
      ambientSource.gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 2);
      
      // Mark as stopped to prevent double-stop
      ambientSource.stopped = true;
      
      setTimeout(() => {
        if (ambientSource) {
          try {
            ambientSource.oscillator1.stop();
            ambientSource.oscillator2.stop();
          } catch (e) {
            // Oscillators already stopped
          }
          ambientSource = null;
        }
        if (audioContext) {
          try {
            audioContext.close();
          } catch (e) {
            // Context already closed
          }
          audioContext = null;
        }
      }, 2100);
    } catch (err) {
      console.log('Error stopping ambient sound:', err);
      // Cleanup anyway
      ambientSource = null;
      audioContext = null;
    }
  }

  // Session completion feedback
  function showCompletionMessage() {
    if (!document.body) return; // Safety check
    
    const message = completionMessages[Math.floor(Math.random() * completionMessages.length)];
    
    // Create completion message element
    const completionEl = document.createElement('div');
    completionEl.className = 'completion-message';
    completionEl.textContent = message;
    document.body.appendChild(completionEl);
    
    // Fade in
    setTimeout(() => {
      if (document.body.contains(completionEl)) {
        completionEl.classList.add('show');
      }
    }, 100);
    
    // Fade out after 3 seconds
    setTimeout(() => {
      if (document.body.contains(completionEl)) {
        completionEl.classList.remove('show');
        setTimeout(() => {
          if (document.body.contains(completionEl)) {
            document.body.removeChild(completionEl);
          }
        }, 1000);
      }
    }, 3000);
  }

  function speak(text, onEnd = null) {
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
      
      // Call onEnd callback when speech finishes
      if (onEnd) {
        utterance.onend = onEnd;
      }
      
      window.speechSynthesis.speak(utterance);
    } else if (onEnd) {
      // If no speech synthesis, still call the callback
      onEnd();
    }
    
    // Guard against missing caption element
    if (captionEl) {
      captionEl.textContent = text;
    }
  }

  function speakWithPause(text, pauseDuration, callback) {
    // Speak the text
    speak(text, () => {
      // After speaking finishes, wait for the pause duration
      setTimeout(() => {
        if (callback) callback();
      }, pauseDuration);
    });
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