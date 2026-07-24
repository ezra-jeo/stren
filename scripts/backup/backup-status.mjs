function toIso(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value > 10_000_000_000 ? value : value * 1000;
    return new Date(milliseconds).toISOString();
  }
  if (typeof value !== "string") return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

function extrema(entries) {
  const times = entries
    .map((entry) => toIso(entry.LastModified ?? entry.lastModified))
    .filter(Boolean)
    .sort();
  return {
    latestBackupAt: times.at(-1),
    oldestRetainedAt: times.at(0),
  };
}

function findValue(value, names) {
  if (!value || typeof value !== "object") return undefined;
  for (const [key, nested] of Object.entries(value)) {
    if (names.has(key) && nested !== undefined && nested !== null) return nested;
  }
  for (const nested of Object.values(value)) {
    if (nested && typeof nested === "object") {
      const found = findValue(nested, names);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

export function buildBackupStatus({
  generatedAt = new Date().toISOString(),
  offsiteInventory,
  storageExportStatus,
  providerBackups,
}) {
  const contents = Array.isArray(offsiteInventory?.Contents)
    ? offsiteInventory.Contents
    : [];
  const databaseEntries = contents.filter((entry) =>
    /(?:^|\/)database\.backup\.enc$/.test(entry.Key ?? ""),
  );
  const storageEntries = contents.filter((entry) =>
    /(?:^|\/)storage\.backup\.enc$/.test(entry.Key ?? ""),
  );
  const pitrEnabled = Boolean(
    findValue(
      providerBackups,
      new Set(["pitr_enabled", "is_pitr_enabled", "walg_enabled"]),
    ),
  );
  const latestRecoveryPointAt = toIso(
    findValue(
      providerBackups,
      new Set([
        "latest_recovery_point",
        "latest_recovery_point_at",
        "latest_restore_point",
        "latest_wal_at",
      ]),
    ),
  );

  return {
    generatedAt: toIso(generatedAt) ?? generatedAt,
    database: extrema(databaseEntries),
    storage: {
      ...extrema(storageEntries),
      coveredBuckets: Array.isArray(storageExportStatus?.coveredBuckets)
        ? [...storageExportStatus.coveredBuckets].sort()
        : [],
    },
    pitr: { enabled: pitrEnabled, latestRecoveryPointAt },
  };
}
