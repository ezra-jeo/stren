import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const PAGE_SIZE = 100;

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function requireSuccess(result, action) {
  if (result?.error) throw new Error(`${action} failed`);
  return result?.data;
}

async function listBucketObjects(supabase, bucketName) {
  const objects = [];
  const visit = async (prefix) => {
    let offset = 0;
    while (true) {
      const page = requireSuccess(
        await supabase.storage.from(bucketName).list(prefix, {
          limit: PAGE_SIZE,
          offset,
          sortBy: { column: "name", order: "asc" },
        }),
        "Storage object listing",
      ) ?? [];

      for (const item of page) {
        const name = prefix ? `${prefix}/${item.name}` : item.name;
        const isFolder = item.id == null && item.metadata == null;
        if (isFolder) await visit(name);
        else objects.push({ name, updatedAt: item.updated_at ?? null });
      }
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  };
  await visit("");
  return objects.sort((a, b) => a.name.localeCompare(b.name));
}

async function downloadBytes(supabase, bucketName, objectName) {
  const blob = requireSuccess(
    await supabase.storage.from(bucketName).download(objectName),
    "Storage object download",
  );
  if (!blob || typeof blob.arrayBuffer !== "function") {
    throw new Error("Storage object download returned no bytes");
  }
  return Buffer.from(await blob.arrayBuffer());
}

export async function exportStorageBackup({
  supabase,
  outputDirectory,
  completedAt = new Date().toISOString(),
}) {
  const buckets = requireSuccess(
    await supabase.storage.listBuckets(),
    "Storage bucket listing",
  ) ?? [];
  await mkdir(join(outputDirectory, "objects"), { recursive: true });

  const manifest = { version: 1, completedAt, buckets: [] };
  for (const bucket of [...buckets].sort((a, b) => a.name.localeCompare(b.name))) {
    const listed = await listBucketObjects(supabase, bucket.name);
    const bucketManifest = {
      name: bucket.name,
      public: Boolean(bucket.public),
      objects: [],
    };
    for (const object of listed) {
      const bytes = await downloadBytes(supabase, bucket.name, object.name);
      const file = `objects/${sha256(`${bucket.name}\0${object.name}`)}.bin`;
      await writeFile(join(outputDirectory, file), bytes);
      bucketManifest.objects.push({
        name: object.name,
        byteLength: bytes.byteLength,
        sha256: sha256(bytes),
        updatedAt: object.updatedAt,
        file,
      });
    }
    manifest.buckets.push(bucketManifest);
  }

  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(join(outputDirectory, "manifest.json"), serialized, "utf8");
  const summary = {
    completedAt,
    bucketCount: manifest.buckets.length,
    objectCount: manifest.buckets.reduce(
      (total, bucket) => total + bucket.objects.length,
      0,
    ),
    coveredBuckets: manifest.buckets.map((bucket) => bucket.name),
    manifestSha256: sha256(serialized),
  };
  await writeFile(
    join(outputDirectory, "status.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );
  return { manifest, summary };
}

export async function verifyStorageBackupFiles({ manifest, backupDirectory }) {
  const issues = [];
  for (const bucket of manifest?.buckets ?? []) {
    for (const object of bucket.objects ?? []) {
      try {
        const bytes = await readFile(join(backupDirectory, object.file));
        if (bytes.byteLength !== object.byteLength) {
          issues.push(`Backup byte-length mismatch in bucket ${bucket.name}`);
        }
        if (sha256(bytes) !== object.sha256) {
          issues.push(`Backup hash mismatch in bucket ${bucket.name}`);
        }
      } catch {
        issues.push(`Backup object bytes are missing in bucket ${bucket.name}`);
      }
    }
  }
  return { ok: issues.length === 0, issues };
}

export async function compareStorageManifest({ supabase, manifest, sampleSize = 25 }) {
  const issues = [];
  const samples = [];
  for (const bucket of manifest?.buckets ?? []) {
    const targetObjects = await listBucketObjects(supabase, bucket.name);
    if (targetObjects.length !== bucket.objects.length) {
      issues.push(`Storage object count mismatch in bucket ${bucket.name}`);
    }
    for (const object of bucket.objects) samples.push({ bucket: bucket.name, object });
  }

  samples.sort((a, b) =>
    `${a.bucket}/${a.object.name}`.localeCompare(`${b.bucket}/${b.object.name}`),
  );
  for (const sample of samples.slice(0, Math.max(0, sampleSize))) {
    try {
      const bytes = await downloadBytes(
        supabase,
        sample.bucket,
        sample.object.name,
      );
      if (sha256(bytes) !== sample.object.sha256) {
        issues.push(`Storage sampled hash mismatch in bucket ${sample.bucket}`);
      }
    } catch {
      issues.push(`Storage sampled object is missing in bucket ${sample.bucket}`);
    }
  }
  return {
    ok: issues.length === 0,
    issues,
    bucketCount: manifest?.buckets?.length ?? 0,
    objectCount: samples.length,
    sampledObjectCount: Math.min(samples.length, Math.max(0, sampleSize)),
  };
}

export async function restoreStorageBackup({
  supabase,
  manifest,
  backupDirectory,
}) {
  const existing = requireSuccess(
    await supabase.storage.listBuckets(),
    "Recovery-target bucket listing",
  ) ?? [];
  const existingNames = new Set(existing.map((bucket) => bucket.name));

  for (const bucket of manifest?.buckets ?? []) {
    if (!existingNames.has(bucket.name)) {
      requireSuccess(
        await supabase.storage.createBucket(bucket.name, { public: bucket.public }),
        "Recovery-target bucket creation",
      );
    }
    for (const object of bucket.objects ?? []) {
      const bytes = await readFile(join(backupDirectory, object.file));
      if (sha256(bytes) !== object.sha256) {
        throw new Error("Storage restore refused a backup object with a bad hash");
      }
      requireSuccess(
        await supabase.storage.from(bucket.name).upload(object.name, bytes, {
          upsert: true,
        }),
        "Recovery-target object upload",
      );
    }
  }
}
