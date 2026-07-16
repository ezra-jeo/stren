import { describe, expect, it } from "vitest";

import { evaluateBackupFreshness } from "../../scripts/backup/backup-freshness.mjs";
import { buildBackupStatus } from "../../scripts/backup/backup-status.mjs";

const NOW = "2026-07-16T08:00:00.000Z";

function healthyStatus() {
  return {
    generatedAt: NOW,
    database: {
      latestBackupAt: "2026-07-16T06:00:00.000Z",
      oldestRetainedAt: "2026-07-08T06:00:00.000Z",
    },
    storage: {
      latestBackupAt: "2026-07-16T05:00:00.000Z",
      oldestRetainedAt: "2026-07-08T05:00:00.000Z",
      coveredBuckets: ["gym-assets", "member-avatars"],
    },
    pitr: {
      enabled: true,
      latestRecoveryPointAt: "2026-07-16T07:55:00.000Z",
    },
  };
}

const policy = {
  maxBackupAgeHours: 26,
  minRetentionDays: 7,
  maxPitrAgeMinutes: 15,
  requirePitr: true,
  requiredStorageBuckets: ["gym-assets", "member-avatars"],
};

describe("backup freshness", () => {
  it("derives database and Storage retention plus PITR from non-sensitive inventories", () => {
    const status = buildBackupStatus({
      generatedAt: NOW,
      offsiteInventory: {
        Contents: [
          { Key: "stren/2026-07-08/database.backup.enc", LastModified: "2026-07-08T06:00:00Z" },
          { Key: "stren/2026-07-08/storage.backup.enc", LastModified: "2026-07-08T06:05:00Z" },
          { Key: "stren/2026-07-16/database.backup.enc", LastModified: "2026-07-16T06:00:00Z" },
          { Key: "stren/2026-07-16/storage.backup.enc", LastModified: "2026-07-16T06:05:00Z" },
        ],
      },
      storageExportStatus: { coveredBuckets: ["gym-assets"] },
      providerBackups: {
        pitr_enabled: true,
        latest_recovery_point: "2026-07-16T07:55:00Z",
      },
    });

    expect(status).toMatchObject({
      database: {
        latestBackupAt: "2026-07-16T06:00:00.000Z",
        oldestRetainedAt: "2026-07-08T06:00:00.000Z",
      },
      storage: {
        latestBackupAt: "2026-07-16T06:05:00.000Z",
        oldestRetainedAt: "2026-07-08T06:05:00.000Z",
        coveredBuckets: ["gym-assets"],
      },
      pitr: {
        enabled: true,
        latestRecoveryPointAt: "2026-07-16T07:55:00.000Z",
      },
    });
  });

  it("accepts fresh database, Storage, retention, bucket, and PITR evidence", () => {
    expect(evaluateBackupFreshness(healthyStatus(), policy, NOW)).toEqual({
      ok: true,
      issues: [],
    });
  });

  it.each([
    ["database", undefined, "Database backup evidence is missing"],
    ["storage", undefined, "Storage backup evidence is missing"],
  ])("detects missing %s backup evidence", (key, value, message) => {
    const status = healthyStatus() as Record<string, unknown>;
    status[key] = value;

    const result = evaluateBackupFreshness(status, policy, NOW);
    expect(result.ok).toBe(false);
    expect(result.issues).toContain(message);
  });

  it("detects stale database and Storage backups", () => {
    const status = healthyStatus();
    status.database.latestBackupAt = "2026-07-14T00:00:00.000Z";
    status.storage.latestBackupAt = "2026-07-14T00:00:00.000Z";

    const result = evaluateBackupFreshness(status, policy, NOW);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Database backup is stale"),
        expect.stringContaining("Storage backup is stale"),
      ]),
    );
  });

  it("detects insufficient retention and uncovered asset buckets", () => {
    const status = healthyStatus();
    status.database.oldestRetainedAt = "2026-07-12T06:00:00.000Z";
    status.storage.coveredBuckets = ["gym-assets"];

    const result = evaluateBackupFreshness(status, policy, NOW);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Database backup retention"),
        "Storage backup does not cover required bucket: member-avatars",
      ]),
    );
  });

  it("detects missing or stale PITR for the payment launch gate", () => {
    const missing = healthyStatus();
    missing.pitr.enabled = false;
    expect(evaluateBackupFreshness(missing, policy, NOW).issues).toContain(
      "PITR or an approved equivalent is not enabled for the payment launch gate",
    );

    const stale = healthyStatus();
    stale.pitr.latestRecoveryPointAt = "2026-07-16T07:30:00.000Z";
    expect(evaluateBackupFreshness(stale, policy, NOW).issues).toEqual(
      expect.arrayContaining([expect.stringContaining("PITR recovery point is stale")]),
    );
  });
});
