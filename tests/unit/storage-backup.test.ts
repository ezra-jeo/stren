import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  compareStorageManifest,
  exportStorageBackup,
  verifyStorageBackupFiles,
} from "../../scripts/backup/storage-backup.mjs";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true })));
});

function fakeSupabase(contents: Record<string, Record<string, string>>) {
  return {
    storage: {
      listBuckets: async () => ({
        data: Object.keys(contents).map((name) => ({ id: name, name, public: true })),
        error: null,
      }),
      from: (bucket: string) => ({
        list: async (prefix: string) => {
          const base = prefix ? `${prefix}/` : "";
          const folders = new Set<string>();
          const files: Array<Record<string, unknown>> = [];
          for (const fullName of Object.keys(contents[bucket] ?? {})) {
            if (!fullName.startsWith(base)) continue;
            const remainder = fullName.slice(base.length);
            const separator = remainder.indexOf("/");
            if (separator >= 0) folders.add(remainder.slice(0, separator));
            else {
              files.push({
                id: `${bucket}:${fullName}`,
                name: remainder,
                updated_at: "2026-07-16T00:00:00Z",
              });
            }
          }
          return {
            data: [
              ...[...folders].map((name) => ({ id: null, metadata: null, name })),
              ...files,
            ],
            error: null,
          };
        },
        download: async (name: string) => ({
          data: new Blob([contents[bucket]?.[name] ?? ""]),
          error: null,
        }),
      }),
    },
  };
}

describe("Storage backup and restore evidence", () => {
  it("exports every bucket with object hashes and verifies local backup bytes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stren-storage-backup-"));
    directories.push(directory);
    const supabase = fakeSupabase({
      "gym-assets": {
        "cover.jpg": "cover-bytes",
        "gallery/inside.jpg": "inside-bytes",
      },
      "member-avatars": { "avatar.png": "avatar-bytes" },
    });

    const result = await exportStorageBackup({
      supabase,
      outputDirectory: directory,
      completedAt: "2026-07-16T08:00:00.000Z",
    });

    expect(result.summary).toMatchObject({
      bucketCount: 2,
      objectCount: 3,
      coveredBuckets: ["gym-assets", "member-avatars"],
    });
    expect(result.manifest.buckets.flatMap((bucket) => bucket.objects)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "cover.jpg", byteLength: 11 }),
        expect.objectContaining({ name: "gallery/inside.jpg", byteLength: 12 }),
        expect.objectContaining({ name: "avatar.png", byteLength: 12 }),
      ]),
    );
    await expect(
      verifyStorageBackupFiles({ manifest: result.manifest, backupDirectory: directory }),
    ).resolves.toEqual({ ok: true, issues: [] });
  });

  it("detects corrupted backup bytes and a mismatched restored object hash", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stren-storage-backup-"));
    directories.push(directory);
    const source = fakeSupabase({ "gym-assets": { "cover.jpg": "cover-bytes" } });
    const result = await exportStorageBackup({
      supabase: source,
      outputDirectory: directory,
      completedAt: "2026-07-16T08:00:00.000Z",
    });

    const object = result.manifest.buckets[0].objects[0];
    await writeFile(join(directory, object.file), "corrupted");
    expect(
      (await verifyStorageBackupFiles({
        manifest: result.manifest,
        backupDirectory: directory,
      })).ok,
    ).toBe(false);

    const restored = fakeSupabase({ "gym-assets": { "cover.jpg": "wrong-bytes" } });
    const comparison = await compareStorageManifest({
      supabase: restored,
      manifest: result.manifest,
      sampleSize: 10,
    });
    expect(comparison.ok).toBe(false);
    expect(comparison.issues).toEqual(
      expect.arrayContaining([expect.stringContaining("hash mismatch")]),
    );

    const savedManifest = JSON.parse(
      await readFile(join(directory, "manifest.json"), "utf8"),
    );
    expect(savedManifest.version).toBe(1);
  });
});
