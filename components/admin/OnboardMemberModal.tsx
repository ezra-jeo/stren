"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import QRCode from "qrcode"
import { toast } from "sonner"
import { Camera, CheckCircle2, Copy, RotateCcw, Upload } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { createClient } from "@/lib/supabase"
import { A, ChoicePicker, GhostBtn, Modal, PrimaryBtn, SummaryBox } from "@/lib/admin-ui"

interface PlanOption {
  id: string
  name: string
  price: number
  duration_days: number
}

interface OnboardResponse {
  memberId: string
  membershipId: string
  qrCode: string
  magicLink: string | null
  redirectTo?: string
  emailSent?: boolean
  emailError?: string
}

type Step = "details" | "photo" | "confirm" | "done"

type FormState = {
  name: string
  email: string
  planId: string
  paymentMethod: "cash" | "gcash"
  idempotencyKey: string
}

const INITIAL_FORM: FormState = {
  name: "",
  email: "",
  planId: "",
  paymentMethod: "cash",
  idempotencyKey: "",
}

const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024
const AVATAR_BUCKET_CANDIDATES = ["member-avatars", "gym-assets"] as const

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

function buildOnboardPhotoPath() {
  const random = Math.random().toString(36).slice(2)
  return `avatars/${Date.now()}-${random}.jpg`
}

function blobFromDataUrl(dataUrl: string): Promise<Blob> {
  return fetch(dataUrl).then((response) => response.blob())
}

function createRequestTimeout(timeoutMs: number) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  return {
    signal: controller.signal,
    clear: () => window.clearTimeout(timer),
  }
}

function isBucketNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const maybeMessage = "message" in error ? String((error as { message?: unknown }).message ?? "") : ""
  const maybeCode = "statusCode" in error ? String((error as { statusCode?: unknown }).statusCode ?? "") : ""
  return maybeCode === "404" || /bucket not found/i.test(maybeMessage)
}

export function OnboardMemberModal({ open, onClose, onSuccess }: Props) {
  const { profile } = useAuth()
  const supabase = useMemo(() => createClient(), [])
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const objectUrlRef = useRef<string | null>(null)

  const [step, setStep] = useState<Step>("details")
  const [plans, setPlans] = useState<PlanOption[]>([])
  const [loadingPlans, setLoadingPlans] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [photoDataUrl, setPhotoDataUrl] = useState("")
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState("")
  const [result, setResult] = useState<OnboardResponse | null>(null)
  const [resultQrDataUrl, setResultQrDataUrl] = useState("")
  const [submitError, setSubmitError] = useState("")

  const selectedPlan = useMemo(() => plans.find((plan) => plan.id === form.planId) ?? null, [form.planId, plans])

  const resetDraft = useCallback(() => {
    setStep("details")
    setPlans([])
    setLoadingPlans(false)
    setSubmitting(false)
    setForm(INITIAL_FORM)
    setPhotoDataUrl("")
    setCameraActive(false)
    setCameraError("")
    setResult(null)
    setResultQrDataUrl("")
    setSubmitError("")
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }, [])

  const stopCamera = useCallback(async () => {
    const stream = streamRef.current
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    setCameraActive(false)

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [])

  const loadPlans = useCallback(async () => {
    if (!profile?.gymId) return

    setLoadingPlans(true)
    try {
      const { data, error } = await supabase
        .from("membership_plans")
        .select("id, name, price, duration_days")
        .eq("gym_id", profile.gymId)
        .eq("is_active", true)
        .order("price")

      if (error) {
        throw error
      }

      const nextPlans = (data ?? []) as PlanOption[]
      setPlans(nextPlans)
      setForm((current) => ({
        ...current,
        planId: current.planId || nextPlans[0]?.id || "",
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load plans"
      toast.error(message)
    } finally {
      setLoadingPlans(false)
    }
  }, [profile?.gymId, supabase])

  useEffect(() => {
    if (!open) {
      void stopCamera()
      resetDraft()
      return
    }

    setStep("details")
    void loadPlans()
    setTimeout(() => nameInputRef.current?.focus(), 0)

    return () => {
      void stopCamera()
    }
  }, [loadPlans, open, resetDraft, stopCamera])

  useEffect(() => {
    if (!result?.qrCode) {
      setResultQrDataUrl("")
      return
    }

    let active = true
    void QRCode.toDataURL(result.qrCode, {
      width: 220,
      margin: 2,
      color: { dark: "#2C2C2C", light: "#FFFFFF" },
    }).then((dataUrl) => {
      if (active) setResultQrDataUrl(dataUrl)
    })

    return () => {
      active = false
    }
  }, [result?.qrCode])

  useEffect(() => {
    return () => {
      void stopCamera()
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
    }
  }, [stopCamera])

  async function startCamera() {
    if (cameraActive) return

    setCameraError("")
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCameraActive(true)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to access camera"
      setCameraError(message)
      toast.error(message)
    }
  }

  async function capturePhoto() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    const width = video.videoWidth || 1280
    const height = video.videoHeight || 720
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext("2d")
    if (!context) return

    context.drawImage(video, 0, 0, width, height)
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92)
    setPhotoDataUrl(dataUrl)
    await stopCamera()
    setStep("confirm")
  }

  async function handleFileSelect(file: File | null) {
    if (!file) return

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file")
      return
    }

    if (file.size > MAX_PHOTO_SIZE_BYTES) {
      toast.error("Photo must be 5MB or smaller")
      return
    }

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }

    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "")
      setPhotoDataUrl(dataUrl)
      setStep("confirm")
    }
    reader.readAsDataURL(file)
  }

  function clearPhoto() {
    setPhotoDataUrl("")
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  async function uploadPhoto(dataUrl: string) {
    if (!profile?.gymId) {
      throw new Error("Missing gym context")
    }

    const blob = await blobFromDataUrl(dataUrl)
    const path = `${profile.gymId}/${buildOnboardPhotoPath()}`
    let selectedBucket: (typeof AVATAR_BUCKET_CANDIDATES)[number] | null = null

    for (const bucket of AVATAR_BUCKET_CANDIDATES) {
      const uploadResult = await supabase.storage.from(bucket).upload(path, blob, {
        upsert: true,
        contentType: "image/jpeg",
      })

      if (!uploadResult.error) {
        selectedBucket = bucket
        break
      }

      if (!isBucketNotFoundError(uploadResult.error)) {
        throw new Error(uploadResult.error.message)
      }
    }

    if (!selectedBucket) {
      throw new Error("Avatar storage bucket is missing. Please create member-avatars or gym-assets.")
    }

    const { data } = supabase.storage.from(selectedBucket).getPublicUrl(path)
    return `${data.publicUrl}?t=${Date.now()}`
  }

  async function handleContinueFromDetails() {
    const trimmedName = form.name.trim()
    const trimmedEmail = form.email.trim().toLowerCase()

    if (trimmedName.length < 2) {
      toast.error("Member name must be at least 2 characters")
      return
    }

    if (!trimmedEmail) {
      toast.error("Email is required")
      return
    }

    if (!form.planId) {
      toast.error("Please select a membership plan")
      return
    }

    setForm((current) => ({ ...current, name: trimmedName, email: trimmedEmail }))
    setStep("photo")
  }

  async function handleSaveMember() {
    const trimmedName = form.name.trim()
    const trimmedEmail = form.email.trim().toLowerCase()

    if (!trimmedName || !trimmedEmail || !form.planId) {
      toast.error("Please complete the member details first")
      setStep("details")
      return
    }

    if (!photoDataUrl) {
      toast.error("A member photo is required")
      setStep("photo")
      return
    }

    setSubmitting(true)
    setSubmitError("")
    try {
      const avatarUrl = await uploadPhoto(photoDataUrl)
      const idempotencyKey = form.idempotencyKey || crypto.randomUUID()
      setForm((current) => ({ ...current, idempotencyKey }))
      const payload = {
        name: trimmedName,
        email: trimmedEmail,
        avatarUrl,
        planId: form.planId,
        paymentMethod: form.paymentMethod,
        idempotencyKey,
      }

      const timeout = createRequestTimeout(20000)
      const response = await fetch("/api/admin/members/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: timeout.signal,
      }).catch((error) => {
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error("Onboarding request timed out. Member may still have been created; please retry or check member list.")
        }
        throw error
      }).finally(() => {
        timeout.clear()
      })

      const data = (await response.json().catch(() => ({}))) as Partial<OnboardResponse> & { error?: string }

      if (!response.ok && response.status !== 207) {
        throw new Error(data.error ?? "Failed to onboard member")
      }

      const nextResult: OnboardResponse = {
        memberId: data.memberId ?? "",
        membershipId: data.membershipId ?? "",
        qrCode: data.qrCode ?? "",
        magicLink: data.magicLink ?? null,
        redirectTo: typeof data.redirectTo === "string" ? data.redirectTo : undefined,
        emailSent: data.emailSent,
        emailError: data.emailError,
      }

      setResult(nextResult)
      setStep("done")
      onSuccess()

      if (nextResult.qrCode) {
        // Result QR is rendered in the done step.
      }

      if (nextResult.emailError) {
        toast.warning("Member onboarded, but email delivery failed")
      } else {
        toast.success("Member onboarded successfully")
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown onboarding error"
      setSubmitError(message)
      toast.error(`Failed to onboard member: ${message}`)
    } finally {
      setSubmitting(false)
    }
  }

  function copyText(text: string, successMessage: string) {
    void (async () => {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text)
        } else {
          const input = document.createElement("textarea")
          input.value = text
          input.style.position = "fixed"
          input.style.opacity = "0"
          document.body.appendChild(input)
          input.select()
          document.execCommand("copy")
          document.body.removeChild(input)
        }
        toast.success(successMessage)
      } catch {
        toast.error("Failed to copy text")
      }
    })()
  }

  const selectedPlanLabel = selectedPlan
    ? `${selectedPlan.name} · ${selectedPlan.duration_days} days · ₱${selectedPlan.price.toLocaleString()}`
    : ""

  const steps: Step[] = ["details", "photo", "confirm", "done"]
  const stepIndex = steps.indexOf(step)

  return (
    <Modal
      open={open}
      onClose={() => {
        void stopCamera()
        onClose()
        resetDraft()
      }}
      title="Onboard New Member"
      width={760}
    >
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          {steps.map((entry, index) => (
            <div
              key={entry}
              className="flex h-2.5 flex-1 rounded-full"
              style={{
                backgroundColor: index <= stepIndex ? A.primary : A.border,
              }}
            />
          ))}
        </div>

        {step === "details" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-medium" style={{ color: A.muted }}>Member Name</label>
                <input
                  ref={nameInputRef}
                  value={form.name}
                  onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
                  placeholder="Juan Dela Cruz"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ backgroundColor: A.surface2, border: `1px solid ${A.border}`, color: A.text }}
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-medium" style={{ color: A.muted }}>Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))}
                  placeholder="member@email.com"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ backgroundColor: A.surface2, border: `1px solid ${A.border}`, color: A.text }}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium" style={{ color: A.muted }}>Membership Plan</label>
                <select
                  value={form.planId}
                  onChange={(e) => setForm((current) => ({ ...current, planId: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ backgroundColor: A.surface2, border: `1px solid ${A.border}`, color: A.text }}
                  disabled={loadingPlans}
                >
                  {loadingPlans ? (
                    <option value="">Loading plans...</option>
                  ) : plans.length === 0 ? (
                    <option value="">No active plans available</option>
                  ) : (
                    plans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name} · {plan.duration_days} days · ₱{plan.price.toLocaleString()}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium" style={{ color: A.muted }}>Payment Method</label>
                <ChoicePicker
                  value={form.paymentMethod}
                  onChange={(value) => setForm((current) => ({ ...current, paymentMethod: value }))}
                  options={[
                    { value: "cash", label: "Cash" },
                    { value: "gcash", label: "GCash" },
                  ]}
                />
              </div>

              <p className="sm:col-span-2 text-xs" style={{ color: A.muted }}>
                The final amount is calculated securely from the selected plan and any configured discount.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2">
              <GhostBtn onClick={onClose}>Cancel</GhostBtn>
              <PrimaryBtn onClick={handleContinueFromDetails} disabled={loadingPlans || plans.length === 0}>
                Continue
              </PrimaryBtn>
            </div>
          </div>
        )}

        {step === "photo" && (
          <div className="space-y-4">
            <div className="rounded-xl p-4" style={{ backgroundColor: A.surface2, border: `1px solid ${A.border}` }}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium" style={{ color: A.text }}>Member Photo</p>
                  <p className="text-xs" style={{ color: A.muted }}>Capture with camera or upload a photo. This will be stored in the member-avatars bucket.</p>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium"
                  style={{ color: A.primary, border: `1px solid ${A.border}` }}
                >
                  <Upload className="h-3 w-3" />
                  Upload
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void handleFileSelect(e.target.files?.[0] ?? null)}
              />

              <canvas ref={canvasRef} className="hidden" />

              {photoDataUrl ? (
                <div className="overflow-hidden rounded-lg" style={{ border: `1px solid ${A.border}` }}>
                  <img src={photoDataUrl} alt="Member preview" className="h-64 w-full object-cover" />
                </div>
              ) : cameraActive ? (
                <div className="space-y-3">
                  <div className="overflow-hidden rounded-lg" style={{ border: `1px solid ${A.border}` }}>
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="h-64 w-full object-cover"
                      style={{ transform: "scaleX(-1)" }}
                    />
                  </div>
                  <p className="text-xs" style={{ color: A.muted }}>
                    Camera preview is mirrored for easier framing.
                  </p>
                </div>
              ) : (
                <div
                  className="flex h-40 items-center justify-center rounded-lg text-sm"
                  style={{ border: `1px dashed ${A.border}`, color: A.muted }}
                >
                  Photo not selected yet
                </div>
              )}

              {cameraError && (
                <p className="mt-3 text-xs" style={{ color: "var(--color-danger)" }}>
                  {cameraError}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {!cameraActive && !photoDataUrl && (
                  <PrimaryBtn onClick={() => void startCamera()}>
                    <Camera className="h-4 w-4" />
                    Camera
                  </PrimaryBtn>
                )}
                {cameraActive && (
                  <PrimaryBtn onClick={() => void capturePhoto()}>
                    <Camera className="h-4 w-4" />
                    Capture
                  </PrimaryBtn>
                )}
                {photoDataUrl && (
                  <GhostBtn onClick={clearPhoto}>
                    <RotateCcw className="h-3.5 w-3.5" />
                    Retake
                  </GhostBtn>
                )}
              </div>

              <div className="flex items-center gap-2">
                <GhostBtn
                  onClick={() => {
                    void stopCamera()
                    setStep("details")
                  }}
                >
                  Back
                </GhostBtn>
                <PrimaryBtn disabled={!photoDataUrl} onClick={() => setStep("confirm") }>
                  Continue
                </PrimaryBtn>
              </div>
            </div>
          </div>
        )}

        {step === "confirm" && (
          <div className="space-y-4">
            <SummaryBox
              rows={[
                { label: "Name", value: form.name || "-" },
                { label: "Email", value: form.email || "-" },
                { label: "Plan", value: selectedPlanLabel || "-" },
                { label: "Payment", value: form.paymentMethod === "cash" ? "Cash" : "GCash" },
                { label: "Amount", value: `₱${Number(selectedPlan?.price || 0).toLocaleString()}` },
              ]}
            />

            <div className="rounded-xl p-4" style={{ backgroundColor: A.surface2, border: `1px solid ${A.border}` }}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-sm font-medium" style={{ color: A.text }}>Photo Preview</p>
                <button
                  type="button"
                  onClick={() => {
                    setStep("photo")
                    if (!photoDataUrl) {
                      void startCamera()
                    }
                  }}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium"
                  style={{ color: A.primary, border: `1px solid ${A.border}` }}
                >
                  Change
                </button>
              </div>

              {photoDataUrl ? (
                <div className="overflow-hidden rounded-lg" style={{ border: `1px solid ${A.border}` }}>
                  <img src={photoDataUrl} alt="Member preview" className="h-64 w-full object-cover" />
                </div>
              ) : (
                <div className="flex h-40 items-center justify-center rounded-lg text-sm" style={{ border: `1px dashed ${A.border}`, color: A.muted }}>
                  No photo selected
                </div>
              )}
            </div>

            <p className="text-xs" style={{ color: A.muted }}>
              Required photo will be uploaded to the member-avatars bucket before the member record is created.
            </p>
            <p className="text-xs" style={{ color: A.muted }}>
              After saving, you will be able to onboard another member immediately.
            </p>

            {submitError && (
              <p className="text-xs" style={{ color: "var(--color-danger)" }}>
                {submitError}
              </p>
            )}

            <div className="flex items-center justify-end gap-2">
              <GhostBtn onClick={() => setStep("photo")}>Back</GhostBtn>
              <PrimaryBtn onClick={() => void handleSaveMember()} disabled={submitting}>
                {submitting ? "Creating..." : "Create Member"}
              </PrimaryBtn>
            </div>
          </div>
        )}

        {step === "done" && result && (
          <div className="space-y-4 rounded-xl p-4" style={{ backgroundColor: A.surface2, border: `1px solid ${A.border}` }}>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" style={{ color: A.primary }} />
              <p className="text-sm font-semibold" style={{ color: A.text }}>Member Onboarded</p>
            </div>

            {resultQrDataUrl ? (
              <div className="rounded-lg bg-white p-3 inline-block">
                <img src={resultQrDataUrl} alt="Member QR code" className="h-44 w-44" />
              </div>
            ) : (
              <p className="text-xs" style={{ color: A.muted }}>QR preview not available.</p>
            )}

            <SummaryBox
              rows={[
                { label: "Member ID", value: result.memberId || "-" },
                { label: "Membership ID", value: result.membershipId || "-" },
                { label: "Email Delivery", value: result.emailError ? "Failed (manual share needed)" : "Sent" },
              ]}
            />

            {result.emailError && (
              <p className="text-xs" style={{ color: "var(--admin-expired-text)" }}>
                {result.emailError}
              </p>
            )}

            {result.magicLink && (
              <div>
                <p className="mb-1 text-xs font-medium" style={{ color: A.muted }}>Magic Link (fallback copy)</p>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={result.magicLink}
                    className="w-full rounded-lg px-3 py-2 text-xs outline-none"
                    style={{ backgroundColor: "#fff", border: `1px solid ${A.border}`, color: A.text }}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <button
                    type="button"
                    onClick={() => copyText(result.magicLink ?? "", "Magic link copied")}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-2 text-xs font-medium"
                    style={{ color: A.primary, border: `1px solid ${A.border}` }}
                  >
                    <Copy className="h-3 w-3" />
                    Copy
                  </button>
                </div>
              </div>
            )}

            {result.redirectTo && (
              <div>
                <p className="mb-1 text-xs font-medium" style={{ color: A.muted }}>Magic Link Redirect Target</p>
                <input
                  readOnly
                  value={result.redirectTo}
                  className="w-full rounded-lg px-3 py-2 text-xs outline-none"
                  style={{ backgroundColor: "#fff", border: `1px solid ${A.border}`, color: A.text }}
                  onFocus={(e) => e.currentTarget.select()}
                />
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
              <GhostBtn
                onClick={() => {
                  resetDraft()
                  void loadPlans()
                  onClose()
                }}
              >
                Close
              </GhostBtn>
              <PrimaryBtn
                onClick={() => {
                  resetDraft()
                  void loadPlans()
                  setTimeout(() => nameInputRef.current?.focus(), 0)
                  setStep("details")
                }}
                size="sm"
              >
                Onboard Another
              </PrimaryBtn>
            </div>
          </div>
        )}

        {cameraActive && (
          <canvas ref={canvasRef} className="hidden" />
        )}
      </div>
    </Modal>
  )
}
