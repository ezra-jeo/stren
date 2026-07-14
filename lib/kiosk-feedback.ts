export type KioskFeedbackKind = 'success' | 'error';

type AudioContextConstructor = new () => AudioContext;

/**
 * Best-effort, deliberately quiet kiosk feedback. Browser autoplay policies
 * mean callers must only opt in after a real user gesture; failures are never
 * allowed to interrupt a confirmed kiosk result.
 */
export function playKioskFeedback(kind: KioskFeedbackKind, userActivated: boolean): void {
  if (typeof window === 'undefined' || !userActivated) return;

  try {
    const AudioContextClass = (window.AudioContext
      ?? (window as typeof window & { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext) as AudioContextConstructor | undefined;
    if (AudioContextClass) {
      const context = new AudioContextClass();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const startedAt = context.currentTime;
      const duration = kind === 'success' ? 0.09 : 0.14;

      oscillator.type = kind === 'success' ? 'sine' : 'triangle';
      oscillator.frequency.setValueAtTime(kind === 'success' ? 720 : 220, startedAt);
      gain.gain.setValueAtTime(0.045, startedAt);
      gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startedAt);
      oscillator.stop(startedAt + duration);
      oscillator.addEventListener('ended', () => { void context.close(); }, { once: true });
    }
  } catch {
    // Sound is optional and may be blocked by browser policy.
  }

  try {
    navigator.vibrate?.(kind === 'success' ? 60 : [35, 50, 35]);
  } catch {
    // Vibration is optional and unavailable on many desktop devices.
  }
}
