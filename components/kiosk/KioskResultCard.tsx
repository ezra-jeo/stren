"use client";

import { CheckCircle2, LogIn, LogOut } from 'lucide-react';
import { initialsForName } from '@/lib/rfid';

export type KioskResultCardProps = { action: 'checked_in' | 'checked_out'; memberName: string; avatarUrl?: string | null; durationMin?: number | null; occupancy?: number | null };
export function KioskResultCard({ action, memberName, avatarUrl, durationMin, occupancy }: KioskResultCardProps) {
  const entering = action === 'checked_in';
  return <div className="rfidResultCard" role="status" aria-live="polite">
    <div className="rfidAvatar">{avatarUrl ? <img src={avatarUrl} alt="" /> : initialsForName(memberName)}</div>
    <div><p className="verificationLabel">{entering ? 'Check-in successful' : 'Check-out successful'}</p><h2>{memberName}</h2><p>{entering ? <><LogIn size={16}/> Access granted</> : <><LogOut size={16}/> Visit complete{durationMin != null ? ` · ${durationMin} min` : ''}</>}</p>{occupancy != null && <p><CheckCircle2 size={16}/> {occupancy} in gym</p>}</div>
  </div>;
}
