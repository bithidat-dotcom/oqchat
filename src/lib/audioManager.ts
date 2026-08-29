// Custom Web Audio API synthesizer for notification and call ringing sounds
// This ensures offline capability, ultra-low latency, and perfect runtime compatibility without static files.

type NotificationSoundType = 'standard' | 'chime' | 'digital' | 'bubble';
type RingtoneSoundType = 'classic' | 'marimba' | 'melody' | 'electronic' | 'toon';

let audioCtx: AudioContext | null = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// 1. Synthesize Notification Sounds
export function playNotificationSound(type: NotificationSoundType = 'standard') {
  try {
    const enabled = localStorage.getItem('setting_msg_sounds') !== 'false';
    if (!enabled) return;

    const ctx = getAudioContext();
    const now = ctx.currentTime;

    if (type === 'standard') {
      // Clean sweet pop sound
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.exponentialRampToValueAtTime(1046.50, now + 0.15); // C6
      
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(now);
      osc.stop(now + 0.2);
    } 
    else if (type === 'chime') {
      // Elegant dual-tone chime (ding-dong)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      const gain2 = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880.00, now); // A5
      gain1.gain.setValueAtTime(0.15, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1108.73, now + 0.08); // C#6
      gain2.gain.setValueAtTime(0.15, now + 0.08);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);

      osc1.start(now);
      osc1.stop(now + 0.4);
      osc2.start(now + 0.08);
      osc2.stop(now + 0.5);
    }
    else if (type === 'digital') {
      // Retro digital ping
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1320, now);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(now);
      osc.stop(now + 0.1);
    }
    else if (type === 'bubble') {
      // Bubble pop sound
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.12);
      
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.13);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(now);
      osc.stop(now + 0.15);
    }
  } catch (error) {
    console.warn("Audio Context playback failed or blocked by browser:", error);
  }
}

// Store active ringing oscillators for stopping call alerts
let activeRingtoneSources: { osc1: OscillatorNode; osc2?: OscillatorNode; gain: GainNode }[] = [];
let ringtoneIntervalId: NodeJS.Timeout | null = null;

// 2. Synthesize Ringing Call Sounds
export function startRingtoneSound(type: RingtoneSoundType = 'classic') {
  try {
    const enabled = localStorage.getItem('setting_call_alerts') !== 'false';
    if (!enabled) return;

    // Stop existing first
    stopRingtoneSound();

    const ctx = getAudioContext();
    
    const playCycle = () => {
      const now = ctx.currentTime;
      const mainGain = ctx.createGain();
      mainGain.gain.setValueAtTime(0.25, now);
      mainGain.connect(ctx.destination);

      if (type === 'classic') {
        // Double-ring classic telephone frequency mix (440Hz + 480Hz modulated)
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        
        osc1.type = 'sine';
        osc1.frequency.value = 440;
        
        osc2.type = 'sine';
        osc2.frequency.value = 480;

        osc1.connect(mainGain);
        osc2.connect(mainGain);

        osc1.start(now);
        osc2.start(now);

        // Standard classic ringing pattern: 1.2s ring, then quiet
        mainGain.gain.setValueAtTime(0.25, now);
        mainGain.gain.setValueAtTime(0, now + 0.4);
        mainGain.gain.setValueAtTime(0.25, now + 0.6);
        mainGain.gain.setValueAtTime(0, now + 1.2);

        osc1.stop(now + 1.3);
        osc2.stop(now + 1.3);

        activeRingtoneSources.push({ osc1, osc2, gain: mainGain });
      }
      else if (type === 'marimba') {
        // Bright wooden marimba rhythm (arpeggio C5 - E5 - G5 - C6)
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, index) => {
          const osc = ctx.createOscillator();
          const noteGain = ctx.createGain();
          
          osc.type = 'triangle';
          osc.frequency.value = freq;
          
          noteGain.gain.setValueAtTime(0, now);
          noteGain.gain.linearRampToValueAtTime(0.25, now + (index * 0.12));
          noteGain.gain.exponentialRampToValueAtTime(0.01, now + (index * 0.12) + 0.25);
          
          osc.connect(noteGain);
          noteGain.connect(ctx.destination);
          
          osc.start(now);
          osc.stop(now + 1.5);
          
          activeRingtoneSources.push({ osc1: osc, gain: noteGain });
        });
      }
      else if (type === 'melody') {
        // Soothing modern chord progression (D5 - F#5 - A5 - C#6)
        const notes = [587.33, 739.99, 880.00, 1108.73];
        notes.forEach((freq, index) => {
          const osc = ctx.createOscillator();
          const noteGain = ctx.createGain();
          
          osc.type = 'sine';
          osc.frequency.value = freq;
          
          noteGain.gain.setValueAtTime(0, now);
          noteGain.gain.linearRampToValueAtTime(0.15, now + (index * 0.15));
          noteGain.gain.exponentialRampToValueAtTime(0.01, now + (index * 0.15) + 0.6);
          
          osc.connect(noteGain);
          noteGain.connect(ctx.destination);
          
          osc.start(now);
          osc.stop(now + 1.8);
          
          activeRingtoneSources.push({ osc1: osc, gain: noteGain });
        });
      }
      else if (type === 'electronic') {
        // Cybernetic high-tech call pulse
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = 80;
        
        // Modulator for a cool vibrato effect
        const mod = ctx.createOscillator();
        const modGain = ctx.createGain();
        mod.frequency.value = 12; // 12Hz vibrato
        modGain.gain.value = 35; // depth of modulation
        
        mod.connect(modGain);
        modGain.connect(osc.frequency);
        
        osc.connect(mainGain);
        
        mod.start(now);
        osc.start(now);
        
        // Pulse pattern
        mainGain.gain.setValueAtTime(0.25, now);
        mainGain.gain.setValueAtTime(0, now + 0.2);
        mainGain.gain.setValueAtTime(0.25, now + 0.4);
        mainGain.gain.setValueAtTime(0, now + 0.6);
        mainGain.gain.setValueAtTime(0.25, now + 0.8);
        mainGain.gain.setValueAtTime(0, now + 1.2);
        
        mod.stop(now + 1.3);
        osc.stop(now + 1.3);
        
        activeRingtoneSources.push({ osc1: osc, gain: mainGain });
      }
      else if (type === 'toon') {
        // Playful, bouncing "Toon" sound (rising boops)
        const notes = [440, 554, 659, 880, 1108, 1318];
        notes.forEach((freq, index) => {
          const osc = ctx.createOscillator();
          const noteGain = ctx.createGain();
          
          osc.type = 'square'; // Buzzier, more cartoonish sound
          osc.frequency.setValueAtTime(freq, now + (index * 0.08));
          osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + (index * 0.08) + 0.1);
          
          noteGain.gain.setValueAtTime(0, now + (index * 0.08));
          noteGain.gain.linearRampToValueAtTime(0.15, now + (index * 0.08) + 0.01);
          noteGain.gain.exponentialRampToValueAtTime(0.01, now + (index * 0.08) + 0.12);
          
          osc.connect(noteGain);
          noteGain.connect(ctx.destination);
          
          osc.start(now + (index * 0.08));
          osc.stop(now + (index * 0.08) + 0.15);
          
          activeRingtoneSources.push({ osc1: osc, gain: noteGain });
        });
      }
    };

    // Play immediately, then repeat cycle every 3 seconds
    playCycle();
    ringtoneIntervalId = setInterval(playCycle, 3000);
  } catch (error) {
    console.warn("Ringtone playback error:", error);
  }
}

export function stopRingtoneSound() {
  if (ringtoneIntervalId) {
    clearInterval(ringtoneIntervalId);
    ringtoneIntervalId = null;
  }
  activeRingtoneSources.forEach(src => {
    try {
      src.osc1.stop();
      if (src.osc2) src.osc2.stop();
    } catch (e) {}
  });
  activeRingtoneSources = [];
}
