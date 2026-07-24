/** Serializes reader submissions while the server owns attendance truth. */
export class RfidScanGate {
  private locked = false;

  tryLock(_uid: string): boolean {
    if (this.locked) return false;
    this.locked = true;
    return true;
  }

  settle(): void {
    this.locked = false;
  }
}
