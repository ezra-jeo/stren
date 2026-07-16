function parseInstant(value) {
  if (typeof value !== "string" || value.length === 0) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function ageInMinutes(now, value) {
  const instant = parseInstant(value);
  return instant === undefined ? undefined : (now - instant) / 60_000;
}

export function evaluateBackupFreshness(status, policy, nowValue = new Date().toISOString()) {
  const issues = [];
  const now = parseInstant(nowValue);
  if (now === undefined) {
    return { ok: false, issues: ["Backup monitor clock is invalid"] };
  }

  const maxBackupAgeMinutes = Number(policy?.maxBackupAgeHours) * 60;
  const minRetentionMinutes = Number(policy?.minRetentionDays) * 24 * 60;
  const maxPitrAgeMinutes = Number(policy?.maxPitrAgeMinutes);

  if (!status?.database) {
    issues.push("Database backup evidence is missing");
  } else {
    const latestAge = ageInMinutes(now, status.database.latestBackupAt);
    if (latestAge === undefined) {
      issues.push("Database latest-backup timestamp is missing or invalid");
    } else if (latestAge < 0 || latestAge > maxBackupAgeMinutes) {
      issues.push(
        `Database backup is stale (${Math.max(0, latestAge / 60).toFixed(1)} hours old)`,
      );
    }

    const oldestAge = ageInMinutes(now, status.database.oldestRetainedAt);
    if (oldestAge === undefined || oldestAge < minRetentionMinutes) {
      issues.push(
        `Database backup retention is below ${policy.minRetentionDays} days`,
      );
    }
  }

  if (!status?.storage) {
    issues.push("Storage backup evidence is missing");
  } else {
    const latestAge = ageInMinutes(now, status.storage.latestBackupAt);
    if (latestAge === undefined) {
      issues.push("Storage latest-backup timestamp is missing or invalid");
    } else if (latestAge < 0 || latestAge > maxBackupAgeMinutes) {
      issues.push(
        `Storage backup is stale (${Math.max(0, latestAge / 60).toFixed(1)} hours old)`,
      );
    }

    const oldestAge = ageInMinutes(now, status.storage.oldestRetainedAt);
    if (oldestAge === undefined || oldestAge < minRetentionMinutes) {
      issues.push(`Storage backup retention is below ${policy.minRetentionDays} days`);
    }

    const covered = new Set(
      Array.isArray(status.storage.coveredBuckets)
        ? status.storage.coveredBuckets
        : [],
    );
    for (const bucket of policy.requiredStorageBuckets ?? []) {
      if (!covered.has(bucket)) {
        issues.push(`Storage backup does not cover required bucket: ${bucket}`);
      }
    }
  }

  if (policy?.requirePitr) {
    if (!status?.pitr?.enabled) {
      issues.push(
        "PITR or an approved equivalent is not enabled for the payment launch gate",
      );
    } else {
      const pitrAge = ageInMinutes(now, status.pitr.latestRecoveryPointAt);
      if (pitrAge === undefined) {
        issues.push("PITR latest recovery-point timestamp is missing or invalid");
      } else if (pitrAge < 0 || pitrAge > maxPitrAgeMinutes) {
        issues.push(
          `PITR recovery point is stale (${Math.max(0, pitrAge).toFixed(1)} minutes old)`,
        );
      }
    }
  }

  return { ok: issues.length === 0, issues };
}
