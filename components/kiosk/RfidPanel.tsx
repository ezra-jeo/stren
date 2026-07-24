"use client";

import { CreditCard, Loader2 } from 'lucide-react';
import { useRfidKeyboardInput } from '@/hooks/use-rfid-keyboard-input';
import { normalizeRfidUid } from '@/lib/rfid';

export function RfidPanel({ enabled, processing, onTap }: { enabled: boolean; processing: boolean; onTap: (uid: string) => void }) {
  useRfidKeyboardInput({ enabled: enabled && !processing, onUid: (raw) => { const uid = normalizeRfidUid(raw); if (uid) onTap(uid); } });
  return <section className="rfidPanel" aria-busy={processing}><CreditCard size={42} aria-hidden="true" /><h2>{processing ? 'Checking access…' : 'Tap to check in or check out'}</h2><p>{processing ? 'Please wait for the result.' : 'Ready for RFID tap'}</p>{processing && <Loader2 className="animate-spin" aria-hidden="true" />}</section>;
}
