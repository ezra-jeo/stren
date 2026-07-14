/**
 * The scanner emits a successful decode on every video frame containing a QR.
 * This small stateful gate makes one physical presentation equal one kiosk
 * request. The same payload cannot toggle a member back out until the camera
 * has observed several non-QR frames.
 */
export const KIOSK_EMPTY_FRAMES_TO_REARM = 4;
export const KIOSK_RESULT_ENTER_MS = 160;
export const KIOSK_RESULT_READABLE_HOLD_MS = 1_000;
/** Includes the entrance crossfade so the fully rendered result remains readable for one second. */
export const KIOSK_RESULT_HOLD_MS = KIOSK_RESULT_ENTER_MS + KIOSK_RESULT_READABLE_HOLD_MS;
export const KIOSK_RESULT_EXIT_MS = 140;
export const KIOSK_RESULT_CYCLE_MS = KIOSK_RESULT_HOLD_MS + KIOSK_RESULT_EXIT_MS;

export class KioskScanGate {
  private locked = false;
  private visiblePayload: string | null = null;
  private emptyFrames = 0;

  tryLock(payload: string): boolean {
    if (this.locked || payload.length === 0 || payload === this.visiblePayload) return false;

    this.locked = true;
    this.visiblePayload = payload;
    this.emptyFrames = 0;
    return true;
  }

  /** Release the request lock without rearming the QR that is still visible. */
  settle(): void {
    this.locked = false;
  }

  /** Html5Qrcode calls this for frames where no QR can be decoded. */
  recordEmptyFrame(): void {
    if (!this.visiblePayload) return;

    this.emptyFrames += 1;
    if (this.emptyFrames >= KIOSK_EMPTY_FRAMES_TO_REARM) {
      this.visiblePayload = null;
      this.emptyFrames = 0;
    }
  }

  reset(): void {
    this.locked = false;
    this.visiblePayload = null;
    this.emptyFrames = 0;
  }
}
