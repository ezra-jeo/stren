import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { playKioskFeedback } from '@/lib/kiosk-feedback';

describe('kiosk feedback', () => {
  const originalAudioContext = Object.getOwnPropertyDescriptor(window, 'AudioContext');
  const originalVibrate = Object.getOwnPropertyDescriptor(navigator, 'vibrate');
  let oscillator: {
    frequency: { setValueAtTime: ReturnType<typeof vi.fn> };
    connect: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    addEventListener: ReturnType<typeof vi.fn>;
    type: OscillatorType;
  };
  let vibrate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const close = vi.fn(async () => undefined);
    oscillator = {
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      addEventListener: vi.fn((_name: string, callback: () => void) => callback()),
      type: 'sine',
    };
    const gain = {
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
    };
    const context = { currentTime: 0, createOscillator: vi.fn(() => oscillator), createGain: vi.fn(() => gain), destination: {}, close };
    const AudioContextMock = vi.fn(function AudioContextMock() { return context; });
    Object.defineProperty(window, 'AudioContext', { value: AudioContextMock, configurable: true });
    vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
  });

  afterEach(() => {
    if (originalAudioContext) Object.defineProperty(window, 'AudioContext', originalAudioContext);
    else delete (window as typeof window & { AudioContext?: typeof AudioContext }).AudioContext;
    if (originalVibrate) Object.defineProperty(navigator, 'vibrate', originalVibrate);
    else delete (navigator as Navigator & { vibrate?: Navigator['vibrate'] }).vibrate;
  });

  it('does nothing before browser interaction has unlocked optional feedback', () => {
    playKioskFeedback('success', false);

    expect(oscillator.start).not.toHaveBeenCalled();
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('plays one short success tone and pulse after interaction', () => {
    playKioskFeedback('success', true);

    expect(oscillator.frequency.setValueAtTime).toHaveBeenCalledWith(720, 0);
    expect(oscillator.start).toHaveBeenCalledTimes(1);
    expect(oscillator.stop).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledWith(60);
  });

  it('uses a distinct, short error signal', () => {
    playKioskFeedback('error', true);

    expect(oscillator.frequency.setValueAtTime).toHaveBeenCalledWith(220, 0);
    expect(vibrate).toHaveBeenCalledWith([35, 50, 35]);
  });
});
