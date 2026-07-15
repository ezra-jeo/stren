'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Loader2, Lock, Plus, ShieldCheck, Trash2, X } from 'lucide-react';
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
  addTeamPerson,
  fetchPersonOverrides,
  listAccessPeople,
  removeTeamPerson,
  saveOverridesBatch,
  type AccessPerson,
  type TeamRole,
} from '@/lib/access-data';
import { ViewportOverlay } from '@/components/ui/viewport-overlay';

/** Owner-only team management for the active gym. */
export function AccessClient() {
  const { profile, activeScope } = useAuth();
  const access = useAccess();
  const supabase = useMemo(() => createClient(), []);
  const gymId = activeScope?.gymId ?? null;
  const canManageAccess = access.permissions.has('roles:manage');

  const [people, setPeople] = useState<AccessPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [setupLink, setSetupLink] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: '', email: '', role: 'staff' as TeamRole });
  const closeAddDialog = useCallback(() => {
    if (!adding) setAddOpen(false);
  }, [adding]);

  const loadPeople = useCallback(async () => {
    if (!gymId || !canManageAccess) {
      setPeople([]);
      setLoadError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setPeople(await listAccessPeople(supabase, gymId));
      setLoadError(null);
    } catch {
      setLoadError('Could not load your team. Please try again.');
      toast.error('Could not load your team.');
    } finally {
      setLoading(false);
    }
  }, [gymId, supabase, canManageAccess]);

  useEffect(() => { void loadPeople(); }, [loadPeople]);

  const switchOn = (person: AccessPerson, sw: AccessSwitch) => {
    const set = resolvePermissions(person.role, person.overrides);
    return sw.permissions.every((key) => set.has(key));
  };

  async function flip(person: AccessPerson, sw: AccessSwitch) {
    if (!gymId) return;
    const rowKey = `${person.userId}:${sw.id}`;
    const next = !switchOn(person, sw);
    const previousOverrides = person.overrides;
    const grants: { permission: PermissionKey; granted: boolean }[] = [];
    const clears: PermissionKey[] = [];
    const nextOverrides = [...previousOverrides];

    for (const key of sw.permissions) {
      const granted = next === roleHasPermission(person.role, key) ? null : next;
      const index = nextOverrides.findIndex((override) => override.permission === key);
      if (granted === null) {
        clears.push(key);
        if (index >= 0) nextOverrides.splice(index, 1);
      } else {
        grants.push({ permission: key, granted });
        if (index >= 0) nextOverrides[index] = { permission: key, granted };
        else nextOverrides.push({ permission: key, granted });
      }
    }

    setSavingKey(rowKey);
    setPeople((current) => current.map((entry) => entry.userId === person.userId ? { ...entry, overrides: nextOverrides } : entry));
    try {
      await saveOverridesBatch(supabase, { gymId, userId: person.userId, grants, clears });
    } catch {
      try {
        const fresh = await fetchPersonOverrides(supabase, gymId, person.userId);
        setPeople((current) => current.map((entry) => entry.userId === person.userId ? { ...entry, overrides: fresh } : entry));
      } catch {
        setPeople((current) => current.map((entry) => entry.userId === person.userId ? { ...entry, overrides: previousOverrides } : entry));
      }
      toast.error('Could not update access — please try again.');
    } finally {
      setSavingKey(null);
    }
  }

  async function addPerson() {
    setAdding(true);
    setAddError(null);
    try {
      const result = await addTeamPerson({
        name: draft.name.trim(),
        email: draft.email.trim().toLowerCase(),
        role: draft.role,
      });
      setPeople((current) => {
        const withoutExisting = current.filter((person) => person.userId !== result.person.userId);
        return [...withoutExisting, result.person].sort((a, b) => a.name.localeCompare(b.name));
      });
      setExpanded(result.person.userId);
      setDraft({ name: '', email: '', role: 'staff' });
      if (result.magicLink) {
        setSetupLink(result.magicLink);
        toast.success('Teammate added. Share their setup link below.');
      } else {
        setAddOpen(false);
        toast.success('Teammate added.');
      }
    } catch (error) {
      setAddError(error instanceof Error ? error.message : 'Could not add this teammate.');
    } finally {
      setAdding(false);
    }
  }

  async function removePerson(person: AccessPerson) {
    if (!window.confirm(`Remove ${person.name || person.email} from this gym’s team? Their Stren account will remain available.`)) return;
    setRemovingId(person.userId);
    try {
      await removeTeamPerson(person.userId);
      setPeople((current) => current.filter((entry) => entry.userId !== person.userId));
      setExpanded((current) => current === person.userId ? null : current);
      toast.success('Teammate removed.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove this teammate.');
    } finally {
      setRemovingId(null);
    }
  }

  if (!canManageAccess) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-heading)' }}>People &amp; access</h1>
        <section className="rounded-xl border p-10 text-center" style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--color-background)' }}><Lock size={22} style={{ color: 'var(--color-text-muted)' }} /></div>
          <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Only the owner can manage people &amp; access.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-heading)' }}>People &amp; access</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>Add your team, choose what they can do, or remove their gym access.</p>
      </div>

      <section className="rounded-xl border p-5" style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>Your team</h2>
          <button type="button" onClick={() => { setAddError(null); setSetupLink(null); setAddOpen(true); }} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-white" style={{ backgroundColor: 'var(--color-primary)' }}><Plus size={16} />Add teammate</button>
        </div>

        {profile && (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border px-4 py-3" style={{ borderColor: 'var(--color-surface)', backgroundColor: 'var(--color-background)' }}>
            <div className="min-w-0"><p className="truncate text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{profile.name || 'Owner'}</p><p className="truncate text-xs" style={{ color: 'var(--color-text-muted)' }}>{profile.email}</p></div>
            <span className="inline-flex flex-none items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold" style={{ backgroundColor: 'var(--color-primary-glow)', color: 'var(--color-primary)' }}><ShieldCheck size={14} /> Owner — full access</span>
          </div>
        )}

        {loading ? <p className="py-6 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading team…</p> : loadError ? <div className="py-6 text-center"><p role="alert" className="text-sm" style={{ color: 'var(--color-danger)' }}>{loadError}</p><button type="button" onClick={() => void loadPeople()} className="mt-3 min-h-10 rounded-lg border px-3 text-sm font-semibold" style={{ borderColor: 'var(--color-surface)', color: 'var(--color-text-primary)' }}>Retry</button></div> : people.length === 0 ? <p className="py-6 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>No admin or staff accounts yet.</p> : (
          <div className="flex flex-col gap-2">
            {people.map((person) => {
              const open = expanded === person.userId;
              return (
                <div key={person.userId} className="rounded-lg border" style={{ borderColor: 'var(--color-surface)' }}>
                  <button type="button" aria-expanded={open} onClick={() => setExpanded(open ? null : person.userId)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{person.name || person.email}</p><p className="truncate text-xs" style={{ color: 'var(--color-text-muted)' }}>{person.email}</p></div>
                    <span className="flex-none rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize" style={{ backgroundColor: 'var(--color-background)', color: 'var(--color-text-secondary)' }}>{person.role}</span>
                    <ChevronDown size={17} className="flex-none transition-transform" style={{ color: 'var(--color-text-muted)', transform: open ? 'rotate(180deg)' : 'none' }} />
                  </button>
                  {open && (
                    <div className="border-t px-4 py-3" style={{ borderColor: 'var(--color-surface)' }}>
                      <p className="mb-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>These switches apply only to {person.name || person.email} at this gym.</p>
                      <div className="flex flex-col divide-y" style={{ borderColor: 'var(--color-surface)' }}>
                        {ACCESS_SWITCHES.map((sw) => {
                          const on = switchOn(person, sw);
                          const saving = savingKey === `${person.userId}:${sw.id}`;
                          return <div key={sw.id} className="flex items-center justify-between gap-3 py-2.5"><span className="text-[13px]" style={{ color: 'var(--color-text-primary)' }}>{sw.label}</span><span className="flex flex-none items-center gap-2">{saving && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--color-text-muted)' }} />}<button type="button" role="switch" aria-checked={on} aria-label={sw.label} disabled={saving} onClick={() => void flip(person, sw)} className="relative h-6 w-11 rounded-full transition-colors disabled:opacity-60" style={{ backgroundColor: on ? 'var(--color-success)' : 'var(--color-surface)' }}><span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all" style={{ left: on ? '22px' : '2px' }} /></button></span></div>;
                        })}
                      </div>
                      <button type="button" onClick={() => void removePerson(person)} disabled={removingId === person.userId} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm font-semibold disabled:opacity-60" style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}><Trash2 size={15} />{removingId === person.userId ? 'Removing…' : `Remove ${person.role}`}</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>Owners always have full access. These switches apply to this gym only.</p>
      </section>

      {addOpen && (
        <ViewportOverlay onClose={closeAddDialog} labelledBy="add-teammate-title" panelClassName="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4"><div><h2 id="add-teammate-title" className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>Add teammate</h2><p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>Use their Stren email if they already have an account.</p></div><button type="button" aria-label="Close" onClick={closeAddDialog}><X size={20} /></button></div>
            {setupLink ? <div className="mt-5 space-y-3"><p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Their account is ready. Copy this one-time setup link and send it to them.</p><input readOnly value={setupLink} onFocus={(event) => event.currentTarget.select()} className="w-full rounded-lg border p-2 text-xs" style={{ borderColor: 'var(--color-surface)' }} /><button type="button" onClick={() => { setSetupLink(null); setAddOpen(false); }} className="min-h-10 rounded-lg px-4 text-sm font-semibold text-white" style={{ backgroundColor: 'var(--color-primary)' }}>Done</button></div> : <div className="mt-5 space-y-4"><label className="block text-sm font-medium">Name<input aria-label="Teammate name" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} className="mt-1 w-full rounded-lg border p-2" style={{ borderColor: 'var(--color-surface)' }} /></label><label className="block text-sm font-medium">Email<input aria-label="Teammate email" type="email" value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} className="mt-1 w-full rounded-lg border p-2" style={{ borderColor: 'var(--color-surface)' }} /></label><label className="block text-sm font-medium">Role<select aria-label="Teammate role" value={draft.role} onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value as TeamRole }))} className="mt-1 w-full rounded-lg border p-2" style={{ borderColor: 'var(--color-surface)' }}><option value="staff">Staff — kiosk and member lookup</option><option value="admin">Admin — day-to-day gym operations</option></select></label>{addError && <p role="alert" className="text-sm" style={{ color: 'var(--color-danger)' }}>{addError}</p>}<div className="flex justify-end gap-2"><button type="button" onClick={() => setAddOpen(false)} className="min-h-10 px-3 text-sm font-semibold">Cancel</button><button type="button" disabled={adding || !draft.name.trim() || !draft.email.trim()} onClick={() => void addPerson()} className="min-h-10 rounded-lg px-4 text-sm font-semibold text-white disabled:opacity-60" style={{ backgroundColor: 'var(--color-primary)' }}>{adding ? 'Adding…' : 'Add to team'}</button></div></div>}
        </ViewportOverlay>
      )}
    </div>
  );
}
