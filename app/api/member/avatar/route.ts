import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase-admin"
import { createServerSupabaseClient } from "@/lib/supabase-server"

interface AvatarCooldownResult {
  updated?: boolean
  nextAllowedAt?: string | null
  next_allowed_at?: string | null
  message?: string | null
}

const AVATAR_BUCKET_CANDIDATES = ["member-avatars", "gym-assets"] as const

export function isAllowedSupabaseStorageUrl(candidate: string, supabaseUrl: string): boolean {
  try {
    const url = new URL(candidate)
    const configured = new URL(supabaseUrl)
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      url.origin === configured.origin &&
      url.username === "" &&
      url.password === "" &&
      url.pathname.startsWith("/storage/v1/object/")
    )
  } catch {
    return false
  }
}

function isBucketNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const maybeMessage = "message" in error ? String((error as { message?: unknown }).message ?? "") : ""
  const maybeCode = "statusCode" in error ? String((error as { statusCode?: unknown }).statusCode ?? "") : ""
  return maybeCode === "404" || /bucket not found/i.test(maybeMessage)
}

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
])

// Maximum avatar upload size: 2 MB (base64-encoded data URL is ~4/3 the binary size)
const MAX_AVATAR_BYTES = 2 * 1024 * 1024

// Validate image magic bytes (first 4-8 bytes of decoded buffer)
function isValidImageBuffer(buffer: Buffer, contentType: string): boolean {
  if (buffer.length < 4) return false
  const b = buffer

  if (contentType === "image/jpeg") {
    return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
  }
  if (contentType === "image/png") {
    return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
  }
  if (contentType === "image/gif") {
    return b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46
  }
  if (contentType === "image/webp") {
    return buffer.length >= 12 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  }
  return false
}

function parseDataUrl(dataUrl: string): { contentType: string; buffer: Buffer } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) {
    throw new Error("Invalid avatar image payload.")
  }

  const contentType = match[1].toLowerCase()

  if (!ALLOWED_IMAGE_MIME_TYPES.has(contentType)) {
    throw new Error(`Unsupported image type. Allowed types: jpeg, png, gif, webp.`)
  }

  const buffer = Buffer.from(match[2], "base64")

  if (buffer.length > MAX_AVATAR_BYTES) {
    throw new Error(`Avatar exceeds the 2 MB size limit.`)
  }

  if (!isValidImageBuffer(buffer, contentType)) {
    throw new Error(`Image data does not match the declared content type.`)
  }

  return { contentType, buffer }
}

function buildAvatarPath(userId: string): string {
  const random = Math.random().toString(36).slice(2)
  return `avatars/${userId}/${Date.now()}-${random}.jpg`
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const admin = createAdminClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  }

  let body: { avatarUrl?: string; avatarDataUrl?: string }
  try {
    body = (await request.json()) as { avatarUrl?: string; avatarDataUrl?: string }
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 })
  }

  const avatarDataUrl = typeof body.avatarDataUrl === "string" ? body.avatarDataUrl.trim() : ""
  const avatarUrl = typeof body.avatarUrl === "string" ? body.avatarUrl.trim() : ""

  if (
    !avatarDataUrl &&
    avatarUrl &&
    !isAllowedSupabaseStorageUrl(avatarUrl, process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")
  ) {
    return NextResponse.json(
      { error: "Avatar URL must point to this gym's Supabase storage." },
      { status: 400 },
    )
  }

  let publicUrl = avatarUrl
  let uploadedPath: string | null = null

  if (avatarDataUrl) {
    let contentType: string
    let buffer: Buffer
    try {
      ;({ contentType, buffer } = parseDataUrl(avatarDataUrl))
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Invalid image payload." },
        { status: 400 },
      )
    }
    const uploadPath = buildAvatarPath(user.id)

    for (const bucket of AVATAR_BUCKET_CANDIDATES) {
      const { error: uploadError } = await admin.storage.from(bucket).upload(uploadPath, buffer, {
        upsert: true,
        contentType,
      })

      if (!uploadError) {
        uploadedPath = uploadPath
        publicUrl = admin.storage.from(bucket).getPublicUrl(uploadPath).data.publicUrl
        break
      }

      if (!isBucketNotFoundError(uploadError)) {
        return NextResponse.json({ error: uploadError.message }, { status: 400 })
      }
    }

    if (!publicUrl) {
      return NextResponse.json({ error: "Avatar storage bucket is missing. Please create member-avatars or gym-assets." }, { status: 500 })
    }
  }

  const { data, error } = await (supabase as any).rpc('set_member_avatar_with_cooldown', {
    p_member_id: user.id,
    p_avatar_url: publicUrl,
    p_lock_days: 14,
  });

  if (error) {
    console.error("RPC Error:", error.message);
  } else {
    console.log("Success:", data);
  }

  if (error) {
    if (uploadedPath) {
      for (const bucket of AVATAR_BUCKET_CANDIDATES) {
        void admin.storage.from(bucket).remove([uploadedPath])
      }
    }
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const payload = Array.isArray(data) ? (data[0] as AvatarCooldownResult | undefined) : (data as AvatarCooldownResult | null)
  const updated = typeof payload?.updated === "boolean" ? payload.updated : true
  const nextAllowedAt = payload?.nextAllowedAt ?? payload?.next_allowed_at ?? null
  const message = payload?.message ?? (updated ? "Avatar updated successfully." : "Avatar change is on cooldown.")

  return NextResponse.json({
    updated,
    nextAllowedAt,
    message,
    avatarUrl: publicUrl,
  })
}
