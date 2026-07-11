"use client"

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { createClient } from "@/lib/supabase"
import { withTimeout } from "@/lib/async-guard"
import { type CheckInResult } from "@/lib/engagement-hooks"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import type { Html5Qrcode as Html5QrcodeType } from "html5-qrcode"
import {
  LogIn,
  LogOut,
  Search,
  User,
  Phone,
  Calendar,
  Clock,
  Camera,
  Loader2,
  AlertCircle,
} from "lucide-react"

const SCANNER_ELEMENT_ID = "kiosk-qr-reader"
const KIOSK_RPC_TIMEOUT_MS = 10000
const SCANNER_START_TIMEOUT_MS = 8000

type KioskMode = "qr" | "search"

interface CheckedInEntry {
  attendanceId: string
  memberId: string
  memberName: string
  checkIn: string
}

type KioskErrorResult = {
  error: string
  message?: string
  member_name?: string
}

type KioskCheckinResult = {
  action: "checked_in" | "checked_out"
  attendance_id: string
  member_name?: string
  duration_min?: number
}

type KioskCheckoutResult = {
  duration_min?: number
}

async function requestCameraPreflight(): Promise<void> {
  if (typeof window === "undefined") return

  if (!window.isSecureContext) {
    throw new Error("Camera requires a secure context (HTTPS or localhost).")
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera API is unavailable in this browser.")
  }

  let stream: MediaStream | null = null
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    })
  } catch {
    // Fallback for devices that can't satisfy facingMode=environment.
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
  } finally {
    stream?.getTracks().forEach((track) => track.stop())
  }
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isKioskErrorResult(value: unknown): value is KioskErrorResult {
  return isJsonObject(value) && typeof value.error === "string"
}

function isKioskCheckinResult(value: unknown): value is KioskCheckinResult {
  return (
    isJsonObject(value) &&
    (value.action === "checked_in" || value.action === "checked_out") &&
    typeof value.attendance_id === "string"
  )
}

function isKioskCheckoutResult(value: unknown): value is KioskCheckoutResult {
  return (
    isJsonObject(value) &&
    (!("duration_min" in value) || typeof value.duration_min === "number")
  )
}

export function KioskDisabledState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="text-3xl font-bold">Check-ins are turned off</h1>
      <p className="mt-3 max-w-md text-sm text-white/60">
        The owner has disabled kiosk check-ins for this gym.
      </p>
    </div>
  )
}

export default function KioskPage() {
  const supabase = useMemo(() => createClient(), [])
  const [mode, setMode] = useState<KioskMode>("qr")
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<
    {
      id: string
      name: string
      email: string
      contactNumber: string | null
      membershipStatus: string
      planName: string
      endDate: string
    }[]
  >([])
  const [searched, setSearched] = useState(false)
  const [checkedIn, setCheckedIn] = useState<CheckedInEntry[]>([])
  const [scanResult, setScanResult] = useState<(CheckInResult & { memberName: string }) | null>(null)
  const [scanStatus, setScanStatus] = useState<"initializing" | "scanning" | "processing" | "error">("initializing")
  const [scanErrorMessage, setScanErrorMessage] = useState<string>("")
  const [isSearching, setIsSearching] = useState(false)
  const [actionPendingByMember, setActionPendingByMember] = useState<Record<string, "checkin" | "checkout">>({})
  const [isLoadingCheckedIn, setIsLoadingCheckedIn] = useState(false)
  const [kioskEnabled, setKioskEnabled] = useState<boolean | null>(null)
  const scannerRef = useRef<Html5QrcodeType | null>(null)
  const isStartingScannerRef = useRef(false)
  const isScannerActiveRef = useRef(false)
  const isProcessingRef = useRef(false)
  const isRefreshingCheckedInRef = useRef(false)
  const refreshQueuedRef = useRef(false)

  useEffect(() => {
    void refreshKioskAvailability()
    const availabilityInterval = setInterval(refreshKioskAvailability, 30000)

    return () => {
      clearInterval(availabilityInterval)
    }
  }, [supabase])

  useEffect(() => {
    if (kioskEnabled !== true) return

    loadCheckedIn()
    const interval = setInterval(loadCheckedIn, 60000)

    const channel = supabase
      .channel('kiosk-attendance')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance' },
        () => { void loadCheckedIn() }
      )
      .subscribe()

    return () => {
      clearInterval(interval)
      void supabase.removeChannel(channel)
    }
  }, [supabase, kioskEnabled])

  async function refreshKioskAvailability() {
    const { data, error } = await supabase.rpc('get_my_access')
    if (error || !isJsonObject(data)) {
      setKioskEnabled(false)
      void stopScanner()
      return
    }
    const features = isJsonObject(data.features) ? data.features : null
    const enabled = features?.kiosk_checkin !== false
    setKioskEnabled(enabled)
    if (!enabled) void stopScanner()
  }

  async function loadCheckedIn() {
    if (isRefreshingCheckedInRef.current) {
      refreshQueuedRef.current = true
      return
    }

    isRefreshingCheckedInRef.current = true
    setIsLoadingCheckedIn(true)
    try {
      const { data, error } = await withTimeout(
        supabase.rpc("kiosk_get_checked_in"),
        KIOSK_RPC_TIMEOUT_MS,
        "Loading checked-in members timed out.",
      )
      if (data && !error) {
        setCheckedIn(
          (data as { attendance_id: string; member_id: string; member_name: string; check_in: string }[]).map((d) => ({
            attendanceId: d.attendance_id,
            memberId: d.member_id,
            memberName: d.member_name,
            checkIn: d.check_in,
          }))
        )
      }
    } catch {
      toast.error("Could not refresh checked-in members. Please try again.")
    } finally {
      setIsLoadingCheckedIn(false)
      isRefreshingCheckedInRef.current = false

      if (refreshQueuedRef.current) {
        refreshQueuedRef.current = false
        void loadCheckedIn()
      }
    }
  }

  const startScanner = useCallback(async () => {
    if (isStartingScannerRef.current || isScannerActiveRef.current) return

    isStartingScannerRef.current = true
    setScanStatus("initializing")
    setScanErrorMessage("")

    await stopScanner()

    try {
      await requestCameraPreflight()
      const { Html5Qrcode } = await import("html5-qrcode")
      const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID, { verbose: false })
      scannerRef.current = scanner

      await withTimeout(
        scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1 },
          async (decodedText) => {
            if (isProcessingRef.current) return
            isProcessingRef.current = true
            setScanStatus("processing")

            try {
              await handleQrScan(decodedText)
            } catch (err) {
              toast.error("Check-in failed. Please try again.")
              console.error("[Kiosk] scan error:", err)
              setScanResult(null)
            } finally {
              setTimeout(() => {
                isProcessingRef.current = false
                setScanStatus("scanning")
              }, 3000)
            }
          },
          () => { /* ignore non-QR frames */ }
        ),
        SCANNER_START_TIMEOUT_MS,
        "Camera initialization timed out.",
      )

      isScannerActiveRef.current = true
      setScanStatus("scanning")
    } catch (err) {
      console.error("[Kiosk] Scanner failed to start:", err)
      setScanStatus("error")

      if (scannerRef.current) {
        try {
          await scannerRef.current.stop()
        } catch {
          // Ignore stop failures when start did not complete.
        }
        try {
          await scannerRef.current.clear()
        } catch {
          // Ignore clear failures when scanner did not render yet.
        }
        scannerRef.current = null
      }
      isScannerActiveRef.current = false

      const name =
        typeof err === "object" && err !== null && "name" in err
          ? String((err as { name?: unknown }).name ?? "")
          : ""

      const message =
        typeof err === "object" && err !== null && "message" in err
          ? String((err as { message?: unknown }).message ?? "")
          : ""

      const normalized = `${name} ${message}`.toLowerCase()
      const blockedByPermission = normalized.includes("notallowederror") || normalized.includes("permission denied")
      const insecureContext = typeof window !== "undefined" && !window.isSecureContext
      const cameraBusy = normalized.includes("notreadableerror") || normalized.includes("could not start video source")

      const nextMessage = blockedByPermission
        ? "Camera access is blocked. Allow camera permission for this site, then retry."
        : cameraBusy
          ? "Camera is already in use by another tab or app. Close other camera users, then retry."
        : insecureContext
          ? "Camera requires a secure context (HTTPS or localhost)."
          : "Could not access camera. Use manual search instead."

      setScanErrorMessage(nextMessage)
      toast.error(nextMessage)
    } finally {
      isStartingScannerRef.current = false
    }
  }, [])

  async function stopScanner() {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop()
      } catch { /* already stopped */ }

      try {
        await scannerRef.current.clear()
      } catch {
        // Ignore clear errors when scanner was never fully started.
      }

      scannerRef.current = null
    }

    isScannerActiveRef.current = false
  }

  useEffect(() => {
    if (!kioskEnabled) {
      void stopScanner()
      return () => { void stopScanner() }
    }
    if (mode === "qr") {
      const timer = setTimeout(() => startScanner(), 100)
      return () => {
        clearTimeout(timer)
        void stopScanner()
      }
    } else {
      void stopScanner()
    }
    return () => { void stopScanner() }
  }, [mode, startScanner, kioskEnabled])

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void stopScanner()
        return
      }

      if (mode === "qr" && kioskEnabled) {
        void startScanner()
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [mode, startScanner, kioskEnabled])

  async function handleQrScan(qrCode: string) {
    const { data, error } = await withTimeout(
      supabase.rpc("kiosk_checkin", { p_qr_code: qrCode }),
      KIOSK_RPC_TIMEOUT_MS,
      "QR check-in timed out.",
    )

    if (error) {
      console.error("[Kiosk] RPC error:", error)
      throw new Error(error.message)
    }

    if (isKioskErrorResult(data)) {
      if (data.error === "unknown_qr") {
        toast.error("Unknown QR code.")
      } else if (data.error === "rejected") {
        const rejectedMemberName =
          typeof data.member_name === "string" && data.member_name.trim().length > 0
            ? data.member_name
            : "this member"
        toast.error(`Cannot check in — ${rejectedMemberName}'s account has been rejected.`)
      } else {
        toast.error(
          typeof data.message === "string" ? data.message : "Check-in failed."
        )
      }
      return
    }

    if (!isKioskCheckinResult(data)) {
      toast.error("Unexpected kiosk response.")
      return
    }

    const memberName =
      typeof data.member_name === "string" && data.member_name.trim().length > 0
        ? data.member_name
        : "Member"

    const checkInResult: CheckInResult & { memberName: string } = {
      status: data.action === "checked_in" ? "checked_in" : "checked_out",
      attendanceId: data.attendance_id,
      memberName,
      streak: null,
      durationMin: typeof data.duration_min === "number" ? data.duration_min : null,
    }

    setScanResult(checkInResult)

    if (data.action === "checked_in") {
      toast.success(`${memberName} checked in!`)
    } else {
      const durationText =
        typeof data.duration_min === "number" ? ` (${data.duration_min} min)` : ""
      toast.success(`${memberName} checked out!${durationText}`)
      setCheckedIn((prev) => prev.filter((c) => c.attendanceId !== data.attendance_id))
    }

    window.setTimeout(() => {
      void loadCheckedIn()
    }, 150)
    setTimeout(() => setScanResult(null), 5000)
  }

  async function handleManualByMember(memberId: string, memberName: string, pendingKind: "checkin" | "checkout") {
    if (actionPendingByMember[memberId]) return
    setActionPendingByMember((prev) => ({ ...prev, [memberId]: pendingKind }))

    try {
      const { data, error } = await withTimeout(
        supabase.rpc("kiosk_checkin_by_member", { p_member_id: memberId }),
        KIOSK_RPC_TIMEOUT_MS,
        pendingKind === "checkout" ? "Manual check-out timed out." : "Manual check-in timed out.",
      )

      if (error) throw error
      if (isKioskErrorResult(data)) {
        toast.error(typeof data.message === "string" ? data.message : "Kiosk action failed.")
        return
      }

      if (!isKioskCheckinResult(data)) {
        toast.error("Unexpected kiosk response.")
        return
      }

      setScanResult({
        status: data.action === "checked_in" ? "checked_in" : "checked_out",
        attendanceId: data.attendance_id,
        memberName,
        streak: null,
        durationMin: typeof data.duration_min === "number" ? data.duration_min : null,
      })

      if (data.action === "checked_in") {
        toast.success(`${memberName} checked in!`)
        setCheckedIn((prev) => {
          const next = prev.filter((c) => c.memberId !== memberId && c.attendanceId !== data.attendance_id)
          return [{ attendanceId: data.attendance_id, memberId, memberName, checkIn: new Date().toISOString() }, ...next]
        })
      } else {
        const durationText = typeof data.duration_min === "number" ? ` (${data.duration_min} min)` : ""
        toast.success(`${memberName} checked out!${durationText}`)
        toast.success(`See you next time, ${memberName}!`)
        setCheckedIn((prev) => prev.filter((c) => c.memberId !== memberId && c.attendanceId !== data.attendance_id))
      }

      window.setTimeout(() => {
        void loadCheckedIn()
      }, 150)

      setQuery("")
      setResults([])
      setSearched(false)
      setTimeout(() => setScanResult(null), 5000)
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : pendingKind === "checkout"
          ? "Check-out failed."
          : "Check-in failed."
      toast.error(message)
    } finally {
      setActionPendingByMember((prev) => {
        const next = { ...prev }
        delete next[memberId]
        return next
      })
    }
  }

  async function handleManualCheckIn(memberId: string, memberName: string) {
    await handleManualByMember(memberId, memberName, "checkin")
  }

  async function handleManualCheckOut(memberId: string, memberName: string, _knownAttendanceId?: string) {
    await handleManualByMember(memberId, memberName, "checkout")
  }

  async function handleSearch() {
    if (isSearching) return

    const q = query.trim()
    if (!q) return

    setIsSearching(true)

    try {
      const { data, error } = await withTimeout(
        supabase.rpc("kiosk_search_members", { p_query: q }),
        KIOSK_RPC_TIMEOUT_MS,
        "Member search timed out.",
      )

      if (error) {
        toast.error("Search failed.")
        return
      }

      setResults(
        ((data ?? []) as {
          id: string; name: string; email: string; contact_number: string | null;
          membership_status: string | null; plan_name: string | null; end_date: string | null;
        }[]).map((p) => ({
          id: p.id,
          name: p.name,
          email: p.email,
          contactNumber: p.contact_number,
          membershipStatus: p.membership_status ?? "none",
          planName: p.plan_name ?? "No plan",
          endDate: p.end_date ?? "—",
        }))
      )
      setSearched(true)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Search failed."
      toast.error(message)
    } finally {
      setIsSearching(false)
    }
  }

  const isCurrentlyCheckedIn = (memberId: string) =>
    checkedIn.some((c) => c.memberId === memberId)

  const membershipBadgeClass = (status: string) => {
    if (status === "active") return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
    if (status === "none" || status === "pending") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
    return "bg-red-500/20 text-red-400 border-red-500/30"
  }

  if (kioskEnabled !== true) return <KioskDisabledState />

  return (
    <div className="flex flex-1 flex-col items-center gap-10 px-6 py-12">

      {/* Scan result banner */}
      {scanResult && (
        <div
          className="w-full max-w-lg rounded-xl p-5 text-center animate-in fade-in slide-in-from-top-2"
          style={{
            background:
              scanResult.status === "checked_in"
                ? "linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%)"
                : "linear-gradient(135deg, #4A5568 0%, #2D3748 100%)",
            color: "white",
          }}
        >
          <p className="text-2xl font-bold" style={{ fontFamily: "var(--font-heading)" }}>
            {scanResult.status === "checked_in" ? "Welcome!" : "See you next time!"}
          </p>
          <p className="text-lg opacity-90 mt-1">{scanResult.memberName}</p>
          {scanResult.durationMin != null && (
            <p className="mt-2 text-sm opacity-80">Session: {scanResult.durationMin} min</p>
          )}
        </div>
      )}

      {/* Mode toggle */}
      <div
        className="flex items-center gap-2 p-1 rounded-full"
        style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
      >
        {(["qr", "search"] as KioskMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all"
            style={{
              backgroundColor: mode === m ? "var(--color-primary)" : "transparent",
              color: mode === m ? "white" : "rgba(255,255,255,0.7)",
            }}
          >
            {m === "qr" ? <Camera size={16} /> : <Search size={16} />}
            {m === "qr" ? "QR Scan" : "Search"}
          </button>
        ))}
      </div>

      {/* QR Scanner */}
      {mode === "qr" && (
        <div className="w-full max-w-lg text-center">
          <h1 className="mb-2 text-3xl font-bold" style={{ fontFamily: "var(--font-heading)" }}>
            Scan QR Code
          </h1>
          <p className="mb-6 text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
            Hold your QR code up to the camera
          </p>
          <div
            className="relative max-w-sm mx-auto rounded-2xl overflow-hidden border-2"
            style={{ borderColor: "var(--color-primary)" }}
          >
            <div id={SCANNER_ELEMENT_ID} className="w-full" />
          </div>
          <div className="mt-4 flex items-center justify-center gap-2 text-sm">
            {scanStatus === "initializing" && (
              <>
                <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--color-primary)" }} />
                <span style={{ color: "rgba(255,255,255,0.6)" }}>Initializing camera...</span>
              </>
            )}
            {scanStatus === "scanning" && (
              <>
                <Camera className="h-4 w-4" style={{ color: "var(--color-primary)" }} />
                <span style={{ color: "rgba(255,255,255,0.6)" }}>Scanning... point camera at QR code</span>
              </>
            )}
            {scanStatus === "processing" && (
              <>
                <Loader2 className="h-4 w-4 animate-spin" style={{ color: "#48bb78" }} />
                <span style={{ color: "#48bb78" }}>QR detected! Processing...</span>
              </>
            )}
            {scanStatus === "error" && (
              <>
                <AlertCircle className="h-4 w-4" style={{ color: "#fc8181" }} />
                <span style={{ color: "#fc8181" }}>{scanErrorMessage || "Camera unavailable"}</span>
                <Button onClick={startScanner} size="sm" variant="outline" className="ml-2">
                  Retry
                </Button>
              </>
            )}
          </div>
          <p className="mt-3 text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
            No QR code?{" "}
            <button
              onClick={() => setMode("search")}
              className="underline"
              style={{ color: "var(--color-primary)" }}
            >
              Manual Search
            </button>
          </p>
        </div>
      )}

      {/* Search */}
      {mode === "search" && (
        <div className="w-full max-w-lg">
          <h1
            className="mb-2 text-3xl font-bold text-center"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Member Check-In / Out
          </h1>
          <p className="mb-6 text-sm text-center" style={{ color: "rgba(255,255,255,0.6)" }}>
            Search by name or contact number
          </p>
          <form
            onSubmit={(e) => { e.preventDefault(); handleSearch() }}
            className="flex gap-2"
          >
            <div className="relative flex-1">
              <Search
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                style={{ color: "rgba(255,255,255,0.4)" }}
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. Marco or 09171234567"
                className="pl-10"
                style={{
                  backgroundColor: "rgba(255,255,255,0.1)",
                  borderColor: "rgba(255,255,255,0.2)",
                  color: "white",
                }}
              />
            </div>
              <Button type="submit" disabled={isSearching} style={{ backgroundColor: "var(--color-primary)", color: "white" }}>
              {isSearching ? "Searching..." : "Search"}
            </Button>
          </form>

          {searched && (
            <div className="mt-4 space-y-2">
              {results.length === 0 ? (
                <p className="text-sm text-center py-4" style={{ color: "rgba(255,255,255,0.5)" }}>
                  No members found.
                </p>
              ) : (
                results.map((m) => {
                  const inGym = isCurrentlyCheckedIn(m.id)
                  return (
                    <div
                      key={m.id}
                      className="flex items-center justify-between rounded-lg p-4"
                      style={{
                        backgroundColor: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.1)",
                      }}
                    >
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4" style={{ color: "var(--color-primary)" }} />
                          <span className="font-medium">{m.name}</span>
                          <Badge variant="outline" className={membershipBadgeClass(m.membershipStatus)}>
                            {m.membershipStatus}
                          </Badge>
                        </div>
                        <div
                          className="flex items-center gap-4 text-xs"
                          style={{ color: "rgba(255,255,255,0.5)" }}
                        >
                          {m.contactNumber && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {m.contactNumber}
                            </span>
                          )}
                          {m.planName !== "No plan" && <span>{m.planName}</span>}
                          {m.endDate !== "—" && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Exp: {m.endDate}
                            </span>
                          )}
                        </div>
                      </div>
                      {inGym ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleManualCheckOut(
                            m.id,
                            m.name,
                            checkedIn.find((c) => c.memberId === m.id)?.attendanceId,
                          )}
                          disabled={!!actionPendingByMember[m.id]}
                          className="gap-1.5 border-red-500/40 bg-transparent text-red-400 hover:bg-red-500/20 hover:text-red-300"
                        >
                          <LogOut className="h-4 w-4" />
                          {actionPendingByMember[m.id] === "checkout" ? "Checking Out..." : "Check Out"}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handleManualCheckIn(m.id, m.name)}
                          disabled={!!actionPendingByMember[m.id]}
                          className="gap-1.5"
                          style={{ backgroundColor: "var(--color-primary)", color: "white" }}
                        >
                          <LogIn className="h-4 w-4" />
                          {actionPendingByMember[m.id] === "checkin" ? "Checking In..." : "Check In"}
                        </Button>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>
      )}

      {/* Currently in gym */}
      <div className="w-full max-w-2xl">
        <h2
          className="mb-4 flex items-center gap-2 text-xl font-semibold"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          <Clock className="h-5 w-5" style={{ color: "var(--color-primary)" }} />
          Currently in the Gym
          <Badge
            variant="outline"
            className="ml-1"
            style={{ borderColor: "rgba(212,149,106,0.4)", color: "var(--color-primary)" }}
          >
            {isLoadingCheckedIn ? "..." : checkedIn.length}
          </Badge>
        </h2>
        {checkedIn.length === 0 ? (
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
            No one is currently checked in.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {checkedIn.map((c) => (
              <div
                key={c.attendanceId}
                className="flex items-center justify-between rounded-lg p-3"
                style={{
                  backgroundColor: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              >
                <div>
                  <p className="font-medium">{c.memberName}</p>
                  <p className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
                    Since{" "}
                    {new Date(c.checkIn).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleManualCheckOut(c.memberId, c.memberName, c.attendanceId)}
                  disabled={!!actionPendingByMember[c.memberId]}
                  className="gap-1.5 border-red-500/40 bg-transparent text-red-400 hover:bg-red-500/20 hover:text-red-300"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  {actionPendingByMember[c.memberId] === "checkout" ? "Out..." : "Out"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
