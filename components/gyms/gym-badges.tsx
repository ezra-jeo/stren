'use client';

/**
 * Shared gym visuals for the gym hub (§5 U2) and the gym switcher (§5 U3):
 * a gym logo/initial avatar, a plain-language role label, and a status chip.
 *
 * Copy uses the CONTEXT.md vocabulary — "Owner"/"Member", "Waiting for
 * approval" — never internal words like "affiliation" or "pending".
 */

import Image from 'next/image';
import type { GymUserRole, GymUserStatus } from '@/lib/types';

export function GymAvatar({
  name,
  logoUrl,
  size = 40,
}: {
  name: string;
  logoUrl: string | null;
  size?: number;
}) {
  if (logoUrl) {
    return (
      <div
        className="overflow-hidden rounded-lg border shrink-0"
        style={{ width: size, height: size, borderColor: 'var(--color-surface)' }}
      >
        <Image src={logoUrl} alt={name} width={size} height={size} className="h-full w-full object-cover" />
      </div>
    );
  }
  return (
    <div
      className="rounded-lg flex items-center justify-center font-bold shrink-0"
      style={{
        width: size,
        height: size,
        backgroundColor: 'var(--color-primary)',
        color: 'var(--color-white)',
        fontSize: size * 0.4,
      }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

const ROLE_LABEL: Record<GymUserRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  staff: 'Staff',
  member: 'Member',
};

export function roleLabel(role: GymUserRole): string {
  return ROLE_LABEL[role] ?? 'Member';
}

export function RoleChip({ role }: { role: GymUserRole }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: 'var(--color-primary-glow)', color: 'var(--color-primary)' }}
    >
      {roleLabel(role)}
    </span>
  );
}

export function StatusChip({ status }: { status: GymUserStatus }) {
  if (status === 'active') return null;
  const isPending = status === 'pending';
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={
        isPending
          ? { backgroundColor: 'var(--color-warning-bg)', color: 'var(--color-warning)' }
          : { backgroundColor: 'var(--color-surface)', color: 'var(--color-text-muted)' }
      }
    >
      {isPending ? 'Waiting for approval' : 'Not joined'}
    </span>
  );
}
