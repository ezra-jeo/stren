import { describe, expect, it } from 'vitest';
import {
  KIOSK_RESULT_ENTER_MS,
  KIOSK_RESULT_CYCLE_MS,
  KIOSK_RESULT_READABLE_HOLD_MS,
  KioskScanGate,
} from '@/lib/kiosk-scan-gate';

describe('KioskScanGate', () => {
  it('does not accept a continuously visible QR code again after a result', () => {
    const gate = new KioskScanGate();

    expect(gate.tryLock('member-qr')).toBe(true);
    gate.settle();

    expect(gate.tryLock('member-qr')).toBe(false);
    expect(gate.tryLock('another-member-qr')).toBe(true);
  });

  it('allows the same QR after it has left the camera frame', () => {
    const gate = new KioskScanGate();

    expect(gate.tryLock('member-qr')).toBe(true);
    gate.settle();
    gate.recordEmptyFrame();
    gate.recordEmptyFrame();
    gate.recordEmptyFrame();
    gate.recordEmptyFrame();

    expect(gate.tryLock('member-qr')).toBe(true);
  });

  it('holds the verified member photo long enough for staff without stalling the kiosk', () => {
    expect(KIOSK_RESULT_ENTER_MS).toBe(160);
    expect(KIOSK_RESULT_READABLE_HOLD_MS).toBe(3_000);
    expect(KIOSK_RESULT_CYCLE_MS).toBeGreaterThanOrEqual(3_240);
    expect(KIOSK_RESULT_CYCLE_MS).toBeLessThan(3_500);
  });
});
