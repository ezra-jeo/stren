export function powershellExecutable(platformName = process.platform) {
  return platformName === 'win32' ? 'powershell' : 'pwsh';
}

function cleanOutput(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function formatChildProcessFailure(result, label) {
  const exitCode = typeof result?.status === 'number' ? result.status : 'unavailable';
  const details = [
    result?.error?.stack ?? result?.error?.message,
    cleanOutput(result?.stderr),
    cleanOutput(result?.stdout),
  ].filter(Boolean);

  return [
    `${label} failed (exit code ${exitCode}).`,
    ...details,
  ].join('\n');
}

export function formatCaughtError(error, label) {
  const details = error instanceof Error ? error.stack ?? error.message : String(error);
  return `${label} failed (exit code 1):\n${details}`;
}
