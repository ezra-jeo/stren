"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Html5Qrcode as Html5QrcodeType } from "html5-qrcode"
import {
  BadgeCheck,
  Camera,
  CreditCard,
  Check,
  CircleAlert,
  Info,
  Loader2,
  LogIn,
  LogOut,
  QrCode,
  RefreshCw,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
  WifiOff,
  X,
} from "lucide-react"
import { createClient } from "@/lib/supabase"
import { withTimeout } from "@/lib/async-guard"
import { useAuth } from "@/lib/auth-context"
import { useAccess } from "@/lib/access-context"
import { RfidPanel } from "@/components/kiosk/RfidPanel"
import { playKioskFeedback } from "@/lib/kiosk-feedback"
import {
  KIOSK_RESULT_EXIT_MS,
  KIOSK_RESULT_HOLD_MS,
  KioskScanGate,
} from "@/lib/kiosk-scan-gate"
import styles from "./kiosk.module.css"

const SCANNER_ELEMENT_ID = "kiosk-qr-reader"
const KIOSK_RPC_TIMEOUT_MS = 10_000
const SCANNER_START_TIMEOUT_MS = 8_000
const PROCESSING_DELAY_MS = 180
const SEARCH_DEBOUNCE_MS = 280

type KioskMode = "qr" | "rfid" | "search"
type CameraState = "starting" | "ready" | "denied" | "unavailable" | "unsupported"
type Presentation = "idle" | "processing" | "result" | "exiting" | "persistent"
type ResultKind = "checked_in" | "checked_out" | "unknown" | "inactive" | "offline" | "error"

interface KioskResult {
  kind: ResultKind
  memberName?: string
  avatarUrl?: string | null
  time?: Date
  occupancy?: number | null
}

interface KioskErrorResult {
  error: string
  message?: string
}

interface KioskCheckinResult {
  action: "checked_in" | "checked_out"
  attendance_id: string
  member_name?: string
  avatar_url?: string | null
}

interface SearchMember {
  id: string
  name: string
  email: string
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isKioskErrorResult(value: unknown): value is KioskErrorResult {
  return isJsonObject(value) && typeof value.error === "string"
}

function isKioskCheckinResult(value: unknown): value is KioskCheckinResult {
  return (
    isJsonObject(value)
    && (value.action === "checked_in" || value.action === "checked_out")
    && typeof value.attendance_id === "string"
  )
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (isJsonObject(error) && typeof error.message === "string") return error.message
  return String(error ?? "")
}

function isOfflineError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true
  return /network|failed to fetch|fetch failed|timeout|timed out|offline/i.test(errorMessage(error))
}

function cameraFailureFor(error: unknown): CameraState {
  const message = errorMessage(error).toLowerCase()
  if (/notallowed|permission|securityerror/.test(message)) return "denied"
  if (/notfound|no camera|device|notreadable|could not start video|overconstrained|constraint/.test(message)) return "unavailable"
  return "unsupported"
}

/**
 * Prefer a rear camera when the device exposes one, but do not turn that
 * preference into a hard kiosk failure. Some desktop webcams and embedded
 * camera drivers reject facingMode constraints even when a camera is usable.
 */
function canRetryWithDefaultCamera(error: unknown): boolean {
  return !/notallowed|permission|securityerror|notreadable|busy|in use|timeout|timed out/i.test(errorMessage(error))
}

function cameraDiagnosticFor(error: unknown): string {
  const message = errorMessage(error).toLowerCase()
  if (/timeout|timed out/.test(message)) return "START_TIMEOUT"
  if (/notallowed|permission|securityerror/.test(message)) return "PERMISSION_DENIED"
  if (/notreadable|busy|in use|could not start video/.test(message)) return "DEVICE_BUSY"
  if (/notfound|no camera|device not found/.test(message)) return "NO_CAMERA"
  if (/overconstrained|constraint/.test(message)) return "CONSTRAINT_REJECTED"
  if (/element.*not found|html element/.test(message)) return "SCANNER_HOST_MISSING"
  return "START_FAILED"
}

async function warmCameraForScanner(): Promise<void> {
  let stream: MediaStream | null = null
  try {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      })
    } catch (preferredCameraError) {
      if (!canRetryWithDefaultCamera(preferredCameraError)) throw preferredCameraError
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
    }
  } finally {
    stream?.getTracks().forEach((track) => track.stop())
  }
}

function cameraFailureCopy(state: CameraState): string {
  if (state === "denied") return "Camera permission was denied. Allow camera access for this site, then try again."
  if (state === "unavailable") return "No usable camera is available. Another tab or app may already be using it."
  return "This browser cannot start the kiosk camera here. Use a current browser on HTTPS, or search with staff."
}

function displayName(name: string | undefined): string {
  const first = name?.trim().split(/\s+/)[0]
  return first || "Member"
}

function formatTime(date: Date | undefined): string {
  if (!date) return "now"
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@")
  if (!domain) return "Hidden for privacy"
  return `${local.slice(0, 1) || "•"}${"•".repeat(Math.max(2, Math.min(5, local.length - 1)))}@${domain}`
}

export function KioskDisabledState() {
  return (
    <div className={styles.disabledState}>
      <h1>Check-ins are turned off</h1>
      <p>The owner has disabled kiosk check-ins for this gym.</p>
    </div>
  )
}

export default function KioskPage() {
  const supabase = useMemo(() => createClient(), [])
  const { activeGymId } = useAuth()
  const access = useAccess()
  const [pinnedGymId, setPinnedGymId] = useState<string | null>(null)
  const [kioskEnabled, setKioskEnabled] = useState<boolean | null>(null)
  const [mode, setMode] = useState<KioskMode>("qr")
  const [cameraState, setCameraState] = useState<CameraState>("starting")
  const [cameraDiagnostic, setCameraDiagnostic] = useState<string | null>(null)
  const [networkOnline, setNetworkOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false)
  const [presentation, setPresentation] = useState<Presentation>("idle")
  const [result, setResult] = useState<KioskResult | null>(null)
  const [occupancy, setOccupancy] = useState<number | null>(null)
  const [occupancyUnavailable, setOccupancyUnavailable] = useState(false)
  const [query, setQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchMember[]>([])
  const [searchState, setSearchState] = useState<"idle" | "searching" | "done" | "error">("idle")
  const [connectOpen, setConnectOpen] = useState(false)
  const [connectQr, setConnectQr] = useState("")
  const [connectUrl, setConnectUrl] = useState("")
  const [rfidProcessing, setRfidProcessing] = useState(false)

  const scannerRef = useRef<Html5QrcodeType | null>(null)
  const isStartingScannerRef = useRef(false)
  const isScannerActiveRef = useRef(false)
  const scanGateRef = useRef(new KioskScanGate())
  const processScanRef = useRef<(payload: string) => Promise<void>>(async () => {})
  const resultHoldTimerRef = useRef<number | null>(null)
  const resultExitTimerRef = useRef<number | null>(null)
  const presentationRef = useRef<Presentation>("idle")
  const userActivatedRef = useRef(false)
  const occupancyRef = useRef<number | null>(null)
  const occupancyEpochRef = useRef(0)
  const searchRequestRef = useRef(0)
  const runtimeRef = useRef({ gymId: null as string | null, enabled: false, mode: "qr" as KioskMode, online: true, presentation: "idle" as Presentation })

  useEffect(() => {
    runtimeRef.current = { gymId: pinnedGymId, enabled: kioskEnabled === true, mode, online: networkOnline, presentation }
    presentationRef.current = presentation
  }, [kioskEnabled, mode, networkOnline, pinnedGymId, presentation])

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current
    scannerRef.current = null
    isScannerActiveRef.current = false
    if (!scanner) return
    try { await scanner.stop() } catch { /* The stream may have failed before starting. */ }
    try { scanner.clear() } catch { /* Html5Qrcode can already be detached here. */ }
  }, [])

  const clearResultTimers = useCallback(() => {
    if (resultHoldTimerRef.current !== null) window.clearTimeout(resultHoldTimerRef.current)
    if (resultExitTimerRef.current !== null) window.clearTimeout(resultExitTimerRef.current)
    resultHoldTimerRef.current = null
    resultExitTimerRef.current = null
  }, [])

  const returnToScanning = useCallback(() => {
    clearResultTimers()
    presentationRef.current = "idle"
    setPresentation("idle")
    setResult(null)
    scanGateRef.current.settle()
  }, [clearResultTimers])

  const showResult = useCallback((nextResult: KioskResult, autoReturn = true) => {
    clearResultTimers()
    presentationRef.current = autoReturn ? "result" : "persistent"
    setResult(nextResult)
    setPresentation(autoReturn ? "result" : "persistent")

    if (nextResult.kind === "checked_in" || nextResult.kind === "checked_out") {
      playKioskFeedback("success", userActivatedRef.current)
    } else if (nextResult.kind !== "offline") {
      playKioskFeedback("error", userActivatedRef.current)
    }

    if (!autoReturn) return
    resultHoldTimerRef.current = window.setTimeout(() => {
      presentationRef.current = "exiting"
      setPresentation("exiting")
      resultExitTimerRef.current = window.setTimeout(returnToScanning, KIOSK_RESULT_EXIT_MS)
    }, KIOSK_RESULT_HOLD_MS)
  }, [clearResultTimers, returnToScanning])

  const setKnownOccupancy = useCallback((next: number | null) => {
    occupancyRef.current = next
    setOccupancy(next)
  }, [])

  const refreshOccupancy = useCallback(async () => {
    const gymId = runtimeRef.current.gymId
    if (!gymId || !runtimeRef.current.enabled || !runtimeRef.current.online) return

    const epochAtStart = occupancyEpochRef.current
    try {
      const { data, error } = await withTimeout(
        supabase.rpc("kiosk_get_occupancy", { p_gym_id: gymId }),
        KIOSK_RPC_TIMEOUT_MS,
        "Occupancy refresh timed out.",
      )
      if (error) throw error
      if (epochAtStart !== occupancyEpochRef.current) return
      if (typeof data === "number") {
        setKnownOccupancy(data)
        setOccupancyUnavailable(false)
      }
    } catch {
      if (epochAtStart === occupancyEpochRef.current) setOccupancyUnavailable(true)
    }
  }, [setKnownOccupancy, supabase])

  const refreshKioskAvailability = useCallback(async () => {
    const gymId = runtimeRef.current.gymId
    if (!gymId) return
    if (!runtimeRef.current.online) {
      setNetworkOnline(false)
      return
    }

    const { data, error } = await supabase.rpc("kiosk_access_allowed", { p_gym_id: gymId })
    if (error) {
      if (isOfflineError(error)) setNetworkOnline(false)
      else setKioskEnabled(false)
      return
    }
    setKioskEnabled(data === true)
  }, [supabase])

  const startScanner = useCallback(async () => {
    const runtime = runtimeRef.current
    if (
      isStartingScannerRef.current
      || isScannerActiveRef.current
      || !runtime.gymId
      || !runtime.enabled
      || !runtime.online
      || runtime.mode !== "qr"
    ) return

    if (typeof window === "undefined" || !window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCameraDiagnostic(typeof window !== "undefined" && !window.isSecureContext ? "INSECURE_CONTEXT" : "MEDIA_API_UNAVAILABLE")
      setCameraState("unsupported")
      return
    }

    isStartingScannerRef.current = true
    setCameraDiagnostic(null)
    setCameraState("starting")
    try {
      await warmCameraForScanner()
      const { Html5Qrcode } = await import("html5-qrcode")
      const startCamera = async (scanner: Html5QrcodeType, constraints: MediaTrackConstraints) => {
        await withTimeout(
          scanner.start(
            constraints,
            { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1 },
            (decodedText) => {
              const current = runtimeRef.current
              if (!current.enabled || !current.online || current.mode !== "qr" || current.presentation !== "idle") return
              if (!scanGateRef.current.tryLock(decodedText)) return
              void processScanRef.current(decodedText)
            },
            () => scanGateRef.current.recordEmptyFrame(),
          ),
          SCANNER_START_TIMEOUT_MS,
          "Camera initialization timed out.",
        )
      }
      const disposeScanner = async (scanner: Html5QrcodeType) => {
        try { await scanner.stop() } catch { /* The request may have failed before a stream was attached. */ }
        try { scanner.clear() } catch { /* The scanner host can already be detached. */ }
      }

      let scanner = new Html5Qrcode(SCANNER_ELEMENT_ID, { verbose: false })
      scannerRef.current = scanner
      try {
        await startCamera(scanner, { facingMode: "environment" })
      } catch (preferredCameraError) {
        if (!canRetryWithDefaultCamera(preferredCameraError)) throw preferredCameraError

        await disposeScanner(scanner)
        scanner = new Html5Qrcode(SCANNER_ELEMENT_ID, { verbose: false })
        scannerRef.current = scanner
        await startCamera(scanner, {})
      }
      isScannerActiveRef.current = true
      setCameraDiagnostic(null)
      setCameraState("ready")
    } catch (error) {
      await stopScanner()
      setCameraDiagnostic(cameraDiagnosticFor(error))
      setCameraState(cameraFailureFor(error))
    } finally {
      isStartingScannerRef.current = false
    }
  }, [stopScanner])

  const performScan = useCallback(async (qrCode: string) => {
    const gymId = runtimeRef.current.gymId
    if (!gymId) {
      scanGateRef.current.settle()
      return
    }

    let resolved = false
    const processingTimer = window.setTimeout(() => {
      if (!resolved) {
        presentationRef.current = "processing"
        setPresentation("processing")
      }
    }, PROCESSING_DELAY_MS)

    try {
      const { data, error } = await withTimeout(
        supabase.rpc("kiosk_checkin", { p_qr_code: qrCode, p_gym_id: gymId }),
        KIOSK_RPC_TIMEOUT_MS,
        "Kiosk request timed out.",
      )
      resolved = true
      window.clearTimeout(processingTimer)

      if (error) throw error
      if (isKioskErrorResult(data)) {
        if (data.error === "membership_inactive") {
          showResult({ kind: "inactive", occupancy: occupancyRef.current })
        } else if (data.error === "unknown_qr" || data.error === "not_found") {
          showResult({ kind: "unknown", occupancy: occupancyRef.current })
        } else {
          showResult({ kind: "error", occupancy: occupancyRef.current })
        }
        return
      }
      if (!isKioskCheckinResult(data)) {
        showResult({ kind: "error", occupancy: occupancyRef.current })
        return
      }

      const delta = data.action === "checked_in" ? 1 : -1
      const currentOccupancy = occupancyRef.current
      const nextOccupancy = currentOccupancy === null ? null : Math.max(0, currentOccupancy + delta)
      occupancyEpochRef.current += 1
      setKnownOccupancy(nextOccupancy)
      setOccupancyUnavailable(false)
      void refreshOccupancy()
      showResult({
        kind: data.action,
        memberName: data.member_name?.trim() || displayName(data.member_name),
        avatarUrl: typeof data.avatar_url === "string" ? data.avatar_url : null,
        time: new Date(),
        occupancy: nextOccupancy,
      })
    } catch (error) {
      resolved = true
      window.clearTimeout(processingTimer)
      if (isOfflineError(error)) {
        setNetworkOnline(false)
        showResult({ kind: "offline", occupancy: occupancyRef.current }, false)
      } else {
        showResult({ kind: "error", occupancy: occupancyRef.current })
      }
    }
  }, [refreshOccupancy, setKnownOccupancy, showResult, supabase])

  processScanRef.current = performScan

  const performSearch = useCallback(async (rawQuery: string) => {
    const q = rawQuery.trim()
    const gymId = runtimeRef.current.gymId
    if (q.length < 3 || !gymId || !runtimeRef.current.online) {
      setSearchResults([])
      setSearchState("idle")
      return
    }

    const request = ++searchRequestRef.current
    setSearchState("searching")
    try {
      const { data, error } = await withTimeout(
        supabase.rpc("kiosk_search_members", { p_query: q, p_gym_id: gymId }),
        KIOSK_RPC_TIMEOUT_MS,
        "Member search timed out.",
      )
      if (error) throw error
      if (request !== searchRequestRef.current) return
      setSearchResults(((data ?? []) as SearchMember[]).slice(0, 8))
      setSearchState("done")
    } catch (error) {
      if (request !== searchRequestRef.current) return
      if (isOfflineError(error)) {
        setNetworkOnline(false)
        setMode("qr")
        showResult({ kind: "offline", occupancy: occupancyRef.current }, false)
        return
      }
      setSearchResults([])
      setSearchState("error")
    }
  }, [showResult, supabase])

  const performRfidTap = useCallback(async (uid: string) => {
    if (!runtimeRef.current.gymId || rfidProcessing) return
    setRfidProcessing(true)
    try {
      const response = await fetch('/api/kiosk/rfid/tap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid }), cache: 'no-store' })
      const data = await response.json().catch(() => null) as Record<string, unknown> | null
      if (!response.ok || !data || (data.action !== 'checked_in' && data.action !== 'checked_out')) throw new Error('RFID tap failed')
      const action = data.action === 'checked_in' ? 'checked_in' : 'checked_out'
      const nextOccupancy = occupancyRef.current === null ? null : Math.max(0, occupancyRef.current + (action === 'checked_in' ? 1 : -1))
      setKnownOccupancy(nextOccupancy)
      showResult({ kind: action, memberName: typeof data.member_name === 'string' ? data.member_name : 'Member', avatarUrl: typeof data.avatar_url === 'string' ? data.avatar_url : null, time: new Date(), occupancy: nextOccupancy })
      void refreshOccupancy()
    } catch { showResult({ kind: 'error', occupancy: occupancyRef.current }) }
    finally { setRfidProcessing(false) }
  }, [refreshOccupancy, rfidProcessing, setKnownOccupancy, showResult])

  useEffect(() => {
    if (pinnedGymId) return
    let stored: string | null = null
    try { stored = window.localStorage.getItem("stren.kiosk.gymId") } catch { /* Storage can be disabled on kiosks. */ }
    const nextGymId = stored || activeGymId
    if (!nextGymId) return
    try { window.localStorage.setItem("stren.kiosk.gymId", nextGymId) } catch { /* Keep the in-memory pin. */ }
    setPinnedGymId(nextGymId)
  }, [activeGymId, pinnedGymId])

  useEffect(() => {
    if (!pinnedGymId) return
    void refreshKioskAvailability()
    const interval = window.setInterval(refreshKioskAvailability, 30_000)
    return () => window.clearInterval(interval)
  }, [pinnedGymId, refreshKioskAvailability])

  useEffect(() => {
    if (!pinnedGymId || kioskEnabled !== true) return
    void refreshOccupancy()
    const interval = window.setInterval(refreshOccupancy, 60_000)
    return () => window.clearInterval(interval)
  }, [kioskEnabled, pinnedGymId, refreshOccupancy])

  useEffect(() => {
    if (mode !== "qr" || kioskEnabled !== true || !networkOnline || !pinnedGymId) {
      void stopScanner()
      return
    }
    const timer = window.setTimeout(() => { void startScanner() }, 40)
    return () => window.clearTimeout(timer)
  }, [kioskEnabled, mode, networkOnline, pinnedGymId, startScanner, stopScanner])

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void stopScanner()
      } else if (runtimeRef.current.mode === "qr" && runtimeRef.current.enabled && runtimeRef.current.online) {
        void startScanner()
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => document.removeEventListener("visibilitychange", onVisibilityChange)
  }, [startScanner, stopScanner])

  useEffect(() => {
    const markUserActivated = () => { userActivatedRef.current = true }
    window.addEventListener("pointerdown", markUserActivated, { once: true, capture: true })
    window.addEventListener("keydown", markUserActivated, { once: true, capture: true })
    return () => {
      window.removeEventListener("pointerdown", markUserActivated, true)
      window.removeEventListener("keydown", markUserActivated, true)
    }
  }, [])

  useEffect(() => {
    const onOffline = () => {
      setNetworkOnline(false)
      setMode("qr")
      showResult({ kind: "offline", occupancy: occupancyRef.current }, false)
    }
    const onOnline = () => {
      setNetworkOnline(true)
      if (presentationRef.current === "persistent") returnToScanning()
      void refreshKioskAvailability()
      void refreshOccupancy()
    }
    window.addEventListener("offline", onOffline)
    window.addEventListener("online", onOnline)
    return () => {
      window.removeEventListener("offline", onOffline)
      window.removeEventListener("online", onOnline)
    }
  }, [refreshKioskAvailability, refreshOccupancy, returnToScanning, showResult])

  useEffect(() => {
    if (mode !== "search") return
    const q = query.trim()
    if (q.length < 3) {
      setSearchResults([])
      setSearchState("idle")
      return
    }
    const timer = window.setTimeout(() => { void performSearch(q) }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [mode, performSearch, query])

  useEffect(() => {
    if (!connectOpen || typeof window === "undefined") return
    const url = `${window.location.origin}/auth?mode=signup`
    setConnectUrl(url)
    let active = true
    void import("qrcode")
      .then(({ default: QRCode }) => QRCode.toDataURL(url, { width: 256, margin: 1, errorCorrectionLevel: "M" }))
      .then((value) => { if (active) setConnectQr(value) })
      .catch(() => { if (active) setConnectQr("") })
    return () => { active = false }
  }, [connectOpen])

  useEffect(() => () => {
    clearResultTimers()
    void stopScanner()
  }, [clearResultTimers, stopScanner])

  const switchMode = (nextMode: KioskMode) => {
    if (nextMode === 'rfid' && !access.features.rfid_kiosk) return
    userActivatedRef.current = true
    clearResultTimers()
    scanGateRef.current.settle()
    setResult(null)
    presentationRef.current = "idle"
    setPresentation("idle")
    setMode(nextMode)
    if (pinnedGymId) try { window.localStorage.setItem(`stren.kiosk.mode.${pinnedGymId}`, nextMode) } catch { /* QR remains safe in memory. */ }
  }

  const openSearch = () => {
    if (!networkOnline) return
    switchMode("search")
  }
  const retryScanner = () => {
    userActivatedRef.current = true
    setCameraDiagnostic(null)
    setCameraState("starting")
    window.setTimeout(() => { void startScanner() }, 0)
  }

  if (kioskEnabled === false) return <KioskDisabledState />

  const rfidEnabled = access.features.rfid_kiosk === true && access.permissions.has('kiosk:use') && (access.role === 'owner' || access.role === 'admin')

  const hasCameraFailure = cameraState === "denied" || cameraState === "unavailable" || cameraState === "unsupported"
  const resultTitle = result?.kind === "checked_in"
    ? "Checked in successfully"
    : result?.kind === "checked_out"
      ? "Checked out successfully"
      : result?.kind === "unknown"
        ? "QR code not recognized"
        : result?.kind === "inactive"
          ? "Membership inactive"
          : result?.kind === "offline"
            ? "No connection"
            : "We couldn’t complete that scan"

  return (
    <div className={styles.kioskPage}>
      <section className={styles.kioskPanel} aria-busy={presentation === "processing"}>
        <p className={styles.welcome}><BadgeCheck size={17} aria-hidden="true" />Welcome to Stren</p>

        <div className={styles.modeTabs} role="tablist" aria-label="Kiosk mode">
          <button
            id="kiosk-qr-tab"
            type="button"
            role="tab"
            className={styles.modeTab}
            aria-selected={mode === "qr"}
            aria-controls="kiosk-qr-panel"
            onClick={() => switchMode("qr")}
          >
            <QrCode size={18} aria-hidden="true" />QR Scan
          </button>
          {rfidEnabled && <button id="kiosk-rfid-tab" type="button" role="tab" className={styles.modeTab} aria-selected={mode === "rfid"} aria-controls="kiosk-rfid-panel" onClick={() => switchMode("rfid")} disabled={!networkOnline}>
            <CreditCard size={18} aria-hidden="true" />RFID Tap
          </button>}
          <button
            id="kiosk-search-tab"
            type="button"
            role="tab"
            className={styles.modeTab}
            aria-selected={mode === "search"}
            aria-controls="kiosk-search-panel"
            onClick={() => switchMode("search")}
            disabled={!networkOnline}
          >
            <Search size={18} aria-hidden="true" />Search
          </button>
        </div>

        {mode === "qr" ? (
          <div id="kiosk-qr-panel" role="tabpanel" aria-labelledby="kiosk-qr-tab" className={styles.stage} data-stage={presentation}>
            <div className={styles.idleLayer}>
              <div className={styles.intro}>
                <h1>Check in or check out</h1>
                <p>Scan your Stren QR code to continue.</p>
              </div>

              {hasCameraFailure ? (
                <div className={styles.cameraFailure} role="alert">
                  <Camera className={styles.cameraFailureIcon} size={36} aria-hidden="true" />
                  <h2>{cameraState === "denied" ? "Camera permission needed" : "Camera unavailable"}</h2>
                  <p>{cameraFailureCopy(cameraState)}</p>
                  {cameraDiagnostic && <small className={styles.cameraDiagnostic}>Diagnostic code: {cameraDiagnostic}</small>}
                  <div className={styles.inlineActions}>
                    <button type="button" className={styles.primaryAction} onClick={retryScanner}>Retry camera</button>
                    <button type="button" className={styles.secondaryAction} onClick={openSearch}>Open Search</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className={styles.scannerFrame}>
                    <div id={SCANNER_ELEMENT_ID} className={styles.scannerMount} />
                    <span className={`${styles.corner} ${styles.cornerTopLeft}`} />
                    <span className={`${styles.corner} ${styles.cornerTopRight}`} />
                    <span className={`${styles.corner} ${styles.cornerBottomLeft}`} />
                    <span className={`${styles.corner} ${styles.cornerBottomRight}`} />
                    <div className={styles.cameraState}>
                      <span>
                        {cameraState === "ready" ? <Camera size={15} aria-hidden="true" /> : <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
                        {cameraState === "ready" ? "Camera ready" : "Preparing camera…"}
                      </span>
                    </div>
                    {presentation === "processing" && (
                      <div className={styles.processing}><span><Loader2 size={17} className="animate-spin" aria-hidden="true" />Checking membership…</span></div>
                    )}
                  </div>
                  <p className={styles.scanInstruction}><Info size={16} aria-hidden="true" />Hold your phone or printed QR code up to the camera.</p>
                </>
              )}
            </div>

            <div className={styles.resultLayer} aria-live="polite" aria-atomic="true">
              {result && (
                <div className={styles.resultCard} data-kind={result.kind}>
                  {(result.kind === "checked_in" || result.kind === "checked_out") ? (
                    <div className={styles.resultMemberPhoto}>
                      {result.avatarUrl
                        ? <img src={result.avatarUrl} alt={`${result.memberName ?? "Member"} profile photo`} />
                        : <span aria-label={`${result.memberName ?? "Member"} profile photo unavailable`}>{result.memberName?.slice(0, 1).toUpperCase() ?? "M"}</span>}
                      <i aria-hidden="true"><Check size={17} strokeWidth={3} /></i>
                    </div>
                  ) : (
                    <div className={styles.resultSymbol}>
                      {result.kind === "offline"
                          ? <WifiOff size={39} aria-hidden="true" />
                          : <CircleAlert size={39} aria-hidden="true" />}
                    </div>
                  )}
                  {(result.kind === "checked_in" || result.kind === "checked_out") && <p className={styles.verificationLabel}>Verify member photo</p>}
                  {result.kind === "checked_in" && <p className={styles.resultKicker}>Welcome in</p>}
                  {result.kind === "checked_out" && <p className={styles.resultKicker}>Visit complete</p>}
                  <h2>{resultTitle}</h2>
                  {result.kind === "checked_in" && <p className={styles.resultDetail}><strong>{result.memberName}</strong> checked in at <strong>{formatTime(result.time)}</strong>.</p>}
                  {result.kind === "checked_out" && <p className={styles.resultDetail}><strong>{result.memberName}</strong> checked out at <strong>{formatTime(result.time)}</strong>.</p>}
                  {result.kind === "unknown" && <p className={styles.resultDetail}>We couldn’t identify this code. Please try again or ask staff for help.</p>}
                  {result.kind === "inactive" && <p className={styles.resultDetail}>This membership is expired or inactive. Please see the front desk for assistance.</p>}
                  {result.kind === "offline" && <p className={styles.resultDetail}>The kiosk is temporarily offline. Please try again in a moment or ask staff for assistance.</p>}
                  {result.kind === "error" && <p className={styles.resultDetail}>Please try again, or ask staff for assistance.</p>}
                  {typeof result.occupancy === "number" && (
                    <>
                      <hr className={styles.resultDivider} />
                      <div className={styles.resultOccupancy}><Users size={22} aria-hidden="true" />{result.occupancy}<span>currently in the gym</span></div>
                    </>
                  )}
                  {result.kind === "checked_in" && <p className={styles.resultReassurance}><LogOut size={17} aria-hidden="true" />Your visit is active. Scan this QR again when you’re ready to leave.</p>}
                  {result.kind === "checked_out" && <p className={styles.resultReassurance}><LogIn size={17} aria-hidden="true" />You’re all set. Scan again next time to check in.</p>}
                  {result.kind === "inactive" && <p className={styles.resultReassurance}><ShieldCheck size={16} aria-hidden="true" />Manual search is available for staff verification.</p>}
                  {result.kind === "offline" && <p className={styles.reconnect}><RefreshCw size={17} className="animate-spin" aria-hidden="true" />Reconnecting…</p>}
                  {(result.kind === "unknown" || result.kind === "inactive" || result.kind === "error") && (
                    <div className={styles.resultActions}>
                      <button type="button" className={styles.primaryAction} onClick={returnToScanning}>Try scanning again</button>
                      <button type="button" className={styles.secondaryAction} onClick={openSearch}>Use manual search</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : mode === 'rfid' ? (
          <section id="kiosk-rfid-panel" role="tabpanel" aria-labelledby="kiosk-rfid-tab" className={styles.searchPanel}>
            <RfidPanel enabled={rfidEnabled && networkOnline} processing={rfidProcessing} onTap={performRfidTap} />
            {result && (result.kind === 'checked_in' || result.kind === 'checked_out') && <div className={styles.resultCard} data-kind={result.kind}><h2>{result.memberName}</h2><p className={styles.resultDetail}>{result.kind === 'checked_in' ? 'Check-in successful' : 'Check-out successful'} at {formatTime(result.time)}.</p></div>}
          </section>
        ) : (
          <section id="kiosk-search-panel" role="tabpanel" aria-labelledby="kiosk-search-tab" className={styles.searchPanel}>
            <h1>Manual search</h1>
            <p>Staff can look up a member by name or email.</p>
            <form className={styles.searchForm} onSubmit={(event) => { event.preventDefault(); void performSearch(query) }}>
              <Search size={19} aria-hidden="true" />
              <input
                type="search"
                className={styles.searchInput}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Enter at least 3 characters"
                aria-label="Search members by name or email"
                autoComplete="off"
              />
            </form>
            <small className={styles.searchHint}>{searchState === "searching" ? "Searching…" : "Results are limited and email addresses are masked."}</small>
            {searchState === "error" && <p className={styles.searchError} role="alert">Search is unavailable. Please ask a manager for help.</p>}
            {searchState === "done" && (
              searchResults.length > 0 ? (
                <div className={styles.searchResults} aria-live="polite">
                  {searchResults.map((member) => (
                    <div key={member.id} className={styles.searchResult}>
                      <span className={styles.searchIdentity} aria-hidden="true">{member.name.slice(0, 1).toUpperCase()}</span>
                      <div><p className={styles.searchResultName}>{member.name}</p><p className={styles.searchResultEmail}>{maskEmail(member.email)}</p></div>
                    </div>
                  ))}
                </div>
              ) : <p className={styles.searchEmpty}>No matching members found.</p>
            )}
            <p className={styles.staffNote}><ShieldCheck size={18} aria-hidden="true" />To protect members, a manager must confirm any manual check-in or check-out in Admin.</p>
          </section>
        )}

        <section className={styles.utilityRow} aria-label="Kiosk utilities">
          <div className={styles.utilityItem}>
            <span className={styles.utilityIcon}><Users size={21} aria-hidden="true" /></span>
            <div>
              {occupancyUnavailable && occupancy === null ? <strong>Occupancy unavailable</strong> : <strong><span className={styles.occupancyNumber}>{occupancy ?? "—"}</span> currently in the gym</strong>}
              <small>{networkOnline ? "Live occupancy" : occupancy === null ? "Waiting for a connection" : "Last known occupancy"}</small>
            </div>
          </div>
          <button type="button" className={styles.utilityButton} onClick={openSearch} disabled={!networkOnline}>
            <span className={styles.utilityIcon}><Search size={21} aria-hidden="true" /></span>
            <span><strong>Manual search</strong><small>Look up your account</small></span>
          </button>
          <button type="button" className={styles.utilityButton} onClick={() => { userActivatedRef.current = true; setConnectOpen(true) }}>
            <span className={styles.utilityIcon}><UserPlus size={21} aria-hidden="true" /></span>
            <span><strong>Create or connect account</strong><small>New here? Get started</small></span>
          </button>
        </section>
        <p className={styles.reassurance}><ShieldCheck size={16} aria-hidden="true" />Members will immediately see whether their membership is active.</p>
      </section>

      {connectOpen && (
        <div className={styles.connectDialog} role="dialog" aria-modal="true" aria-labelledby="connect-title">
          <div className={styles.connectCard}>
            <button type="button" className={styles.closeDialog} onClick={() => setConnectOpen(false)} aria-label="Close account connection options"><X size={19} aria-hidden="true" /></button>
            <h2 id="connect-title">Use your own phone</h2>
            <p>Scan this code to create a Stren account or connect to your gym without entering a password on the kiosk.</p>
            <div className={styles.connectQr}>{connectQr ? <img src={connectQr} alt="QR code for Stren account setup" /> : <Loader2 className="animate-spin" aria-label="Preparing account QR code" />}</div>
            {connectUrl && <code>{connectUrl.replace(/^https?:\/\//, "")}</code>}
          </div>
        </div>
      )}
    </div>
  )
}
