import { describe, expect, it } from 'vitest';
import {
  powershellExecutable,
  formatChildProcessFailure,
} from '../../scripts/process-utils.mjs';

describe('database child-process diagnostics', () => {
  it('selects PowerShell executable for runner platform', () => {
    expect(powershellExecutable('win32')).toBe('powershell');
    expect(powershellExecutable('linux')).toBe('pwsh');
  });

  it('reports launch errors when child stderr is unavailable', () => {
    const error = new Error('spawn powershell ENOENT');
    const message = formatChildProcessFailure(
      { status: null, error, stdout: undefined, stderr: undefined },
      'attendance concurrency',
    );

    expect(message).toContain('attendance concurrency failed');
    expect(message).toContain('exit code unavailable');
    expect(message).toContain('spawn powershell ENOENT');
  });
});
