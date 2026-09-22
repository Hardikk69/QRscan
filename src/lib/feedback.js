/** Short audio chirps (Web Audio, no files) and haptics for scan feedback. */

let audioCtx = null;

export function chirp(frequency = 880, duration = 0.08) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    audioCtx ??= new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch {
    // Audio blocked until user interaction; ignore
  }
}

/** Rising three-note melody for a verified transfer. */
export function successMelody() {
  chirp(523, 0.08);
  setTimeout(() => chirp(659, 0.08), 100);
  setTimeout(() => chirp(784, 0.14), 200);
}

export function haptic(ms = 40) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // Ignore
  }
}
