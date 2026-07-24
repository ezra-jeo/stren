import { describe, expect, it } from 'vitest';
import { RfidScanGate } from '@/lib/rfid-scan-gate';

describe('RfidScanGate', () => {
  it('serializes one completed UID until settled', () => {
    const gate = new RfidScanGate();
    expect(gate.tryLock('04AB0C19')).toBe(true);
    expect(gate.tryLock('04AB0C19')).toBe(false);
    gate.settle();
    expect(gate.tryLock('04AB0C19')).toBe(true);
  });
});
