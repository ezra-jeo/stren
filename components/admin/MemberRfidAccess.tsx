"use client";

import { useCallback, useEffect, useState } from 'react';
import { CreditCard } from 'lucide-react';
import { useRfidKeyboardInput } from '@/hooks/use-rfid-keyboard-input';
import { normalizeRfidUid } from '@/lib/rfid';

type Card = { id: string; masked_id: string; status: string; assigned_at: string };
export function MemberRfidAccess({ memberId, canManage }: { memberId: string; canManage: boolean }) {
  const [card, setCard] = useState<Card | null>(null); const [capturing, setCapturing] = useState(false); const [uid, setUid] = useState<string | null>(null); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { const response = await fetch(`/api/admin/members/${memberId}/rfid`, { cache: 'no-store' }); const body = await response.json().catch(() => ({})); if (response.ok) setCard(body.card ?? null); }, [memberId]);
  useEffect(() => { void load(); }, [load]);
  useRfidKeyboardInput({ enabled: capturing, onUid: (raw) => { const next = normalizeRfidUid(raw); if (next) setUid(next); } });
  const assign = async () => { if (!uid) return; setError(null); const response = await fetch(`/api/admin/members/${memberId}/rfid`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid }) }); const body = await response.json().catch(() => ({})); if (!response.ok) { setError(body.error ?? 'Could not assign card.'); return; } setCard(body.card); setUid(null); setCapturing(false); };
  if (!canManage) return null;
  return <section className="rounded-xl p-4" style={{ border: '1px solid var(--admin-border)', background: 'var(--admin-surface-2)' }}>
    <div className="flex items-center gap-2"><CreditCard size={17} aria-hidden="true" /><strong>RFID access</strong></div>
    {card ? <p className="mt-2 text-sm">{card.masked_id} · {card.status}</p> : <p className="mt-2 text-sm">No RFID card assigned</p>}
    {!capturing ? <button type="button" className="mt-3 rounded-lg px-3 py-2 text-sm font-semibold" style={{ background: 'var(--color-primary)', color: 'white' }} onClick={() => setCapturing(true)}>{card ? 'Replace card' : 'Assign card'}</button> : <div className="mt-3 space-y-2"><p className="text-sm">Tap the card to assign.</p>{uid && <p className="text-sm">Card read. Confirm assignment?</p>}<div className="flex gap-2"><button type="button" disabled={!uid} onClick={() => void assign()}>Assign card</button><button type="button" onClick={() => { setCapturing(false); setUid(null); }}>Cancel</button></div></div>}
    {error && <p className="mt-2 text-sm" role="alert">{error}</p>}
  </section>;
}
