'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ShieldCheck, Lock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import { useAccess } from '@/lib/access-context';
import { createClient } from '@/lib/supabase';
import {
  ACCESS_SWITCHES,
  resolvePermissions,
  roleHasPermission,
  type AccessSwitch,
  type PermissionKey,
} from '@/lib/permissions';
import {
  listAccessPeople,
  saveOverridesBatch,
  fetchPersonOverrides,
  type AccessPerson,
} from '@/lib/access-data';

/**
 * People & access (ImplementationPlan.md §7.9). One flat list of plain-language
 * switches per admin — no roles, no permission matrix. The owner row is always
 * first with a full-access badge and no switches; staff rows are static.
 */
export function AccessClient() {
  const { profile } = useAuth();
  const access = useAccess();
  const supabase = useMemo(() => createClient(), []);
  const gymId = profile?.gymId ?? null;
  const canManageAccess = access.permissions.has('roles:manage');

  const [people, setPeople] = useState<AccessPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!gymId || !canManageAccess) {
      setLoading(false);
      return;
    }
    let active = true;
    listAccessPeople(supabase, gymId)
      .then((list) => { if (active) setPeople(list); })
      .catch(() => { /* degrade to empty */ })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [gymId, supabase, canManageAccess]);

  const admins = people.filter((p) => p.role === 'admin');
  const staff = people.filter((p) => p.role === 'staff');

  const switchOn = (person: AccessPerson, sw: AccessSwitch) => {
    const set = resolvePermissions(person.role, person.overrides);
    return sw.permissions.every((k) => set.has(k));
  };

  async function flip(person: AccessPerson, sw: AccessSwitch) {
    if (!gymId) return;
    const rowKey = `${person.userId}:${sw.id}`;
    const next = !switchOn(person, sw);
    const prevOverrides = person.overrides;

    // Split the switch's keys into one grant/revoke batch + one back-to-default
    // clear batch, applied atomically so a mid-flip failure can't half-flip the DB.
    const grants: { permission: PermissionKey; granted: boolean }[] = [];
    const clears: PermissionKey[] = [];
    const nextOverrides = [...prevOverrides];
    for (const key of sw.permissions) {
      const isDefault = roleHasPermission(person.role, key);
      const granted = next === isDefault ? null : next; // back to default ⇒ delete the row
      const idx = nextOverrides.findIndex((o) => o.permission === key);
      if (granted === null) {
        clears.push(key);
        if (idx >= 0) nextOverrides.splice(idx, 1);
      } else {
        grants.push({ permission: key, granted });
        if (idx >= 0) nextOverrides[idx] = { permission: key, granted };
        else nextOverrides.push({ permission: key, granted });
      }
    }

    setSavingKey(rowKey);
    setPeople((ps) => ps.map((p) => (p.userId === person.userId ? { ...p, overrides: nextOverrides } : p)));

    try {
      await saveOverridesBatch(supabase, { gymId, userId: person.userId, grants, clears });
    } catch {
      // A batch can partially apply server-side — resync to the DB truth rather
      // than assuming the pre-flip state; only guess (revert) if the refetch fails.
      try {
        const fresh = await fetchPersonOverrides(supabase, gymId, person.userId);
        setPeople((ps) => ps.map((p) => (p.userId === person.userId ? { ...p, overrides: fresh } : p)));
      } catch {
        setPeople((ps) => ps.map((p) => (p.userId === person.userId ? { ...p, overrides: prevOverrides } : p)));
      }
      toast.error('Could not update access — please try again.');
    } finally {
      setSavingKey(null);
    }
  }

  // Client courtesy layer over the server's `requirePermission('roles:manage')`
  // guard — defends the direct-render path (and tests) when only the owner may
  // manage people & access.
  if (!canManageAccess) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-heading)' }}>
            People &amp; access
          </h1>
        </div>
        <section className="rounded-xl border p-10 text-center" style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--color-background)' }}>
            <Lock size={22} style={{ color: 'var(--color-text-muted)' }} />
          </div>
          <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Only the owner can manage people &amp; access.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-heading)' }}>
          People &amp; access
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Control what your team can see and do.
        </p>
      </div>

      <section className="rounded-xl border p-5" style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}>
        <h2 className="mb-4 text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>Your team</h2>

        {/* Owner row — always first */}
        {profile && (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border px-4 py-3" style={{ borderColor: 'var(--color-surface)', backgroundColor: 'var(--color-background)' }}>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{profile.name || 'Owner'}</p>
              <p className="truncate text-xs" style={{ color: 'var(--color-text-muted)' }}>{profile.email}</p>
            </div>
            <span
              className="inline-flex flex-none items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
              style={{ backgroundColor: 'var(--color-primary-glow)', color: 'var(--color-primary)' }}
            >
              <ShieldCheck size={14} /> Owner — full access
            </span>
          </div>
        )}

        {loading ? (
          <p className="py-6 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading team…</p>
        ) : admins.length === 0 && staff.length === 0 ? (
          <p className="py-6 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>No admin or staff accounts yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {admins.map((person) => {
              const open = expanded === person.userId;
              return (
                <div key={person.userId} className="rounded-lg border" style={{ borderColor: 'var(--color-surface)' }}>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setExpanded(open ? null : person.userId)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{person.name || person.email}</p>
                      <p className="truncate text-xs" style={{ color: 'var(--color-text-muted)' }}>{person.email}</p>
                    </div>
                    <span className="flex-none rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize" style={{ backgroundColor: 'var(--color-background)', color: 'var(--color-text-secondary)' }}>
                      {person.role}
                    </span>
                    <ChevronDown size={17} className="flex-none transition-transform" style={{ color: 'var(--color-text-muted)', transform: open ? 'rotate(180deg)' : 'none' }} />
                  </button>

                  {open && (
                    <div className="border-t px-4 py-3" style={{ borderColor: 'var(--color-surface)' }}>
                      <div className="flex flex-col divide-y" style={{ borderColor: 'var(--color-surface)' }}>
                        {ACCESS_SWITCHES.map((sw) => {
                          const on = switchOn(person, sw);
                          const saving = savingKey === `${person.userId}:${sw.id}`;
                          return (
                            <div key={sw.id} className="flex items-center justify-between gap-3 py-2.5">
                              <span className="text-[13px]" style={{ color: 'var(--color-text-primary)' }}>{sw.label}</span>
                              <span className="flex flex-none items-center gap-2">
                                {saving && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--color-text-muted)' }} />}
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={on}
                                  aria-label={sw.label}
                                  disabled={saving}
                                  onClick={() => void flip(person, sw)}
                                  className="relative h-6 w-11 rounded-full transition-colors disabled:opacity-60"
                                  style={{ backgroundColor: on ? 'var(--color-success)' : 'var(--color-surface)' }}
                                >
                                  <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all" style={{ left: on ? '22px' : '2px' }} />
                                </button>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {staff.map((person) => (
              <div key={person.userId} className="rounded-lg border px-4 py-3" style={{ borderColor: 'var(--color-surface)' }}>
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{person.name || person.email}</p>
                    <p className="truncate text-xs" style={{ color: 'var(--color-text-muted)' }}>{person.email}</p>
                  </div>
                  <span className="flex-none rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize" style={{ backgroundColor: 'var(--color-background)', color: 'var(--color-text-secondary)' }}>
                    {person.role}
                  </span>
                </div>
                <p className="mt-1.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>Staff can use the kiosk and look up members.</p>
              </div>
            ))}
          </div>
        )}

        <p className="mt-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Owners always have full access. These switches apply to this gym only.
        </p>
      </section>
    </div>
  );
}
