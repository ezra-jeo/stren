import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const scripts = [
  'run-attendance-concurrency.ps1',
  'run-financial-concurrency.ps1',
  'run-financial-reversal-concurrency.ps1',
  'run-membership-overlap-concurrency.ps1',
];

describe('PowerShell concurrency runners', () => {
  it('only uses WindowStyle on Windows PowerShell', () => {
    for (const script of scripts) {
      const source = readFileSync(
        resolve(process.cwd(), 'tests/database', script),
        'utf8',
      );

      expect(source).not.toMatch(/Start-Process[^\r\n]*-WindowStyle Hidden/);
      expect(source).toMatch(/\$env:OS\s+-eq\s+["']Windows_NT["']/);
    }
  });
});
