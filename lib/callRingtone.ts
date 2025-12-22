// Generate a simple ringtone sound using Web Audio API
export const playIncomingCallRingtone = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Create oscillators for a pleasant ringing sound (2-note pattern)
    const now = audioContext.currentTime;
    
    // Primary note (800Hz)
    const osc1 = audioContext.createOscillator();
    const gain1 = audioContext.createGain();
    osc1.frequency.value = 800;
    osc1.type = 'sine';
    osc1.connect(gain1);
    
    // Secondary note (1200Hz)
    const osc2 = audioContext.createOscillator();
    const gain2 = audioContext.createGain();
    osc2.frequency.value = 1200;
    osc2.type = 'sine';
    osc2.connect(gain2);
    
    // Master gain
    const masterGain = audioContext.createGain();
    gain1.connect(masterGain);
    gain2.connect(masterGain);
    masterGain.connect(audioContext.destination);
    
    // Set initial gain to 0
    masterGain.gain.setValueAtTime(0, now);
    
    // Fade in slowly (200ms instead of 100ms)
    masterGain.gain.linearRampToValueAtTime(0.2, now + 0.2);
    
    // Ring pattern: 0.8s on, 0.5s off, repeat (slower and longer pauses)
    const patternLength = 1.3; // 800ms ring + 500ms silence
    const totalDuration = 30; // 30 seconds max
    
    for (let i = 0; i < totalDuration / patternLength; i++) {
      const startTime = now + i * patternLength;
      const ringSilenceTime = startTime + 0.8; // 800ms ring
      
      if (startTime < now + totalDuration) {
        masterGain.gain.setValueAtTime(0.2, startTime);
      }
      
      if (ringSilenceTime < now + totalDuration) {
        // Fade down to silence over 100ms
        masterGain.gain.linearRampToValueAtTime(0.03, ringSilenceTime + 0.1);
      }
    }
    
    // Fade out at the end
    const endTime = now + totalDuration;
    masterGain.gain.linearRampToValueAtTime(0, endTime);
    
    // Start oscillators
    osc1.start(now);
    osc2.start(now);
    
    // Stop oscillators
    osc1.stop(endTime);
    osc2.stop(endTime);
    
    return {
      stop: () => {
        try {
          masterGain.gain.cancelScheduledValues(audioContext.currentTime);
          masterGain.gain.setValueAtTime(0, audioContext.currentTime);
          osc1.stop(audioContext.currentTime + 0.1);
          osc2.stop(audioContext.currentTime + 0.1);
        } catch (e) {}
      },
      context: audioContext
    };
  } catch (e) {
    console.error('Failed to play ringtone:', e);
    return null;
  }
};

// Generate outgoing call tone (ringback tone) - dial tone pattern
export const playOutgoingCallTone = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Create oscillators for ringback tone (single frequency, pulsed)
    const now = audioContext.currentTime;
    
    // Single note (440Hz - A4)
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.frequency.value = 440;
    osc.type = 'sine';
    osc.connect(gain);
    
    gain.connect(audioContext.destination);
    
    // Set initial gain to 0
    gain.gain.setValueAtTime(0, now);
    
    // Fade in slowly
    gain.gain.linearRampToValueAtTime(0.18, now + 0.25);
    
    // Ringback pattern: 1.2s on, 0.8s off, repeat (slower)
    const patternLength = 2; // 1200ms ring + 800ms silence
    const totalDuration = 30; // 30 seconds max
    
    for (let i = 0; i < totalDuration / patternLength; i++) {
      const startTime = now + i * patternLength;
      const ringSilenceTime = startTime + 1.2; // 1200ms ring
      
      if (startTime < now + totalDuration) {
        gain.gain.setValueAtTime(0.18, startTime);
      }
      
      if (ringSilenceTime < now + totalDuration) {
        // Fade down to silence over 150ms
        gain.gain.linearRampToValueAtTime(0.02, ringSilenceTime + 0.15);
      }
    }
    
    // Fade out at the end
    const endTime = now + totalDuration;
    gain.gain.linearRampToValueAtTime(0, endTime);
    
    // Start oscillator
    osc.start(now);
    
    // Stop oscillator
    osc.stop(endTime);
    
    return {
      stop: () => {
        try {
          gain.gain.cancelScheduledValues(audioContext.currentTime);
          gain.gain.setValueAtTime(0, audioContext.currentTime);
          osc.stop(audioContext.currentTime + 0.1);
        } catch (e) {}
      },
      context: audioContext
    };
  } catch (e) {
    console.error('Failed to play outgoing tone:', e);
    return null;
  }
};

export const stopRingtone = (ringtone: any) => {
  if (ringtone && typeof ringtone.stop === 'function') {
    ringtone.stop();
  }
};
