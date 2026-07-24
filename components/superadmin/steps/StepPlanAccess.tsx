'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { A, PrimaryBtn, GhostBtn } from '@/lib/admin-ui';
import { useWizard } from '@/lib/onboarding/state';
import {
  plansStepSchema, validateOperatingHours, DAY_KEYS, DAY_LABELS,
  type PlanEntryData, type OperatingHours,
} from '@/lib/onboarding/schemas';
import { MemberImportSection } from '@/components/superadmin/MemberImportSection';

let planIdCounter = 0;
function nextPlanId() {
  planIdCounter += 1;
  return `plan-${Date.now()}-${planIdCounter}`;
}

const SWITCH_ROWS: Array<{
  key: 'kioskCheckin' | 'generateInviteQr' | 'staffManualCheckin' | 'occupancyCount';
  label: string;
  help: string;
}> = [
  { key: 'kioskCheckin', label: 'Enable kiosk check-in', help: 'Front-desk kiosk can check members in and out.' },
  { key: 'generateInviteQr', label: 'Generate member invite QR', help: 'A scannable QR that lets people join this gym.' },
  { key: 'staffManualCheckin', label: 'Allow staff manual check-in', help: 'Staff can check a member in without a QR scan.' },
  { key: 'occupancyCount', label: 'Enable occupancy count', help: 'Track how many members are currently checked in.' },
];

export function StepPlanAccess({ onContinue, onBack, onSaveDraft }: { onContinue: () => void; onBack: () => void; onSaveDraft: () => void }) {
  const { state, dispatch } = useWizard();
  const { plans, operatingHours, switches } = state.draft;
  const [copySource, setCopySource] = useState<(typeof DAY_KEYS)[number]>('mon');
  const [copyTargets, setCopyTargets] = useState<Set<(typeof DAY_KEYS)[number]>>(new Set());

  function updatePlan(id: string, patch: Partial<PlanEntryData>) {
    dispatch({ type: 'setPlans', plans: plans.map((plan) => (plan.id === id ? { ...plan, ...patch } : plan)) });
  }

  function addPlan() {
    dispatch({
      type: 'setPlans',
      plans: [...plans, { id: nextPlanId(), name: '', price: 0, durationValue: 1, durationUnit: 'months', description: '', isActive: true }],
    });
  }

  function removePlan(id: string) {
    if (plans.length <= 1) {
      toast.error('Add another plan before removing the last one.');
      return;
    }
    dispatch({ type: 'setPlans', plans: plans.filter((plan) => plan.id !== id) });
  }

  function updateDay(day: (typeof DAY_KEYS)[number], patch: Partial<OperatingHours[typeof day]>) {
    dispatch({ type: 'setOperatingHours', hours: { ...operatingHours, [day]: { ...operatingHours[day], ...patch } } });
  }

  function applyCopy() {
    if (copyTargets.size === 0) return;
    const source = operatingHours[copySource];
    const next = { ...operatingHours };
    copyTargets.forEach((day) => { next[day] = { ...source }; });
    dispatch({ type: 'setOperatingHours', hours: next });
    toast.success(`Copied ${DAY_LABELS[copySource]}'s hours to ${copyTargets.size} day${copyTargets.size === 1 ? '' : 's'}.`);
  }

  function toggleCopyTarget(day: (typeof DAY_KEYS)[number]) {
    setCopyTargets((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day); else next.add(day);
      return next;
    });
  }

  function handleContinue() {
    const plansResult = plansStepSchema.safeParse(plans);
    if (!plansResult.success) {
      toast.error(plansResult.error.issues[0]?.message ?? 'Fix the membership plans before continuing.');
      return;
    }
    const hoursError = validateOperatingHours(operatingHours);
    if (hoursError) {
      toast.error(hoursError);
      return;
    }
    dispatch({ type: 'markStepComplete', step: 'planAccess' });
    onContinue();
  }

  return (
    <div className="onboarding-step-enter space-y-6">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold" style={{ color: A.text }}>Membership plans</h2>
          <button type="button" onClick={addPlan} className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium" style={{ color: A.primary, border: `1px solid ${A.border}` }}>
            <Plus className="h-3.5 w-3.5" /> Add plan
          </button>
        </div>

        {plans.map((plan, index) => (
          <div key={plan.id} className="rounded-xl p-3 space-y-3" style={{ backgroundColor: A.surface2, border: `1px solid ${A.border}` }}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium" style={{ color: A.text2 }}>Plan {index + 1}</p>
              <button type="button" onClick={() => removePlan(plan.id)} aria-label={`Remove plan ${index + 1}`} style={{ color: A.muted }}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor={`plan-${index}-name`} className="mb-1 block text-xs" style={{ color: A.muted }}>Plan name</label>
                <input
                  id={`plan-${index}-name`}
                  value={plan.name}
                  onChange={(e) => updatePlan(plan.id, { name: e.target.value })}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ backgroundColor: A.surface, border: `1px solid ${A.border}`, color: A.text }}
                />
              </div>
              <div>
                <label htmlFor={`plan-${index}-price`} className="mb-1 block text-xs" style={{ color: A.muted }}>Price (PHP)</label>
                <input
                  id={`plan-${index}-price`}
                  type="number"
                  min={0}
                  step="0.01"
                  value={plan.price}
                  onChange={(e) => updatePlan(plan.id, { price: Number(e.target.value) })}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ backgroundColor: A.surface, border: `1px solid ${A.border}`, color: A.text }}
                />
              </div>
              <div>
                <label htmlFor={`plan-${index}-duration`} className="mb-1 block text-xs" style={{ color: A.muted }}>Duration</label>
                <div className="flex gap-2">
                  <input
                    id={`plan-${index}-duration`}
                    type="number"
                    min={1}
                    value={plan.durationValue}
                    onChange={(e) => updatePlan(plan.id, { durationValue: Number(e.target.value) })}
                    className="w-20 rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ backgroundColor: A.surface, border: `1px solid ${A.border}`, color: A.text }}
                  />
                  <select
                    aria-label={`Plan ${index + 1} duration unit`}
                    value={plan.durationUnit}
                    onChange={(e) => updatePlan(plan.id, { durationUnit: e.target.value as 'days' | 'months' })}
                    className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ backgroundColor: A.surface, border: `1px solid ${A.border}`, color: A.text }}
                  >
                    <option value="days">Days</option>
                    <option value="months">Months</option>
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 self-end pb-2 text-xs" style={{ color: A.muted }}>
                <Switch checked={plan.isActive} onCheckedChange={(checked) => updatePlan(plan.id, { isActive: checked })} />
                Active
              </label>
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-3 pt-3" style={{ borderTop: `1px solid ${A.border}` }}>
        <h2 className="text-sm font-semibold" style={{ color: A.text }}>Operating hours</h2>
        <div className="space-y-2">
          {DAY_KEYS.map((day) => (
            <div key={day} className="flex flex-wrap items-center gap-2">
              <span className="w-24 text-xs" style={{ color: operatingHours[day].closed ? A.muted : A.text }}>{DAY_LABELS[day]}</span>
              <Switch
                checked={!operatingHours[day].closed}
                onCheckedChange={(checked) => updateDay(day, { closed: !checked })}
                aria-label={`${DAY_LABELS[day]} open`}
              />
              {operatingHours[day].closed ? (
                <span className="text-xs" style={{ color: A.muted }}>Closed</span>
              ) : (
                <>
                  <input
                    type="time"
                    aria-label={`${DAY_LABELS[day]} opening time`}
                    value={operatingHours[day].open}
                    onChange={(e) => updateDay(day, { open: e.target.value })}
                    className="rounded-lg px-2 py-1 text-xs outline-none"
                    style={{ backgroundColor: A.surface2, border: `1px solid ${A.border}`, color: A.text }}
                  />
                  <span className="text-xs" style={{ color: A.muted }}>to</span>
                  <input
                    type="time"
                    aria-label={`${DAY_LABELS[day]} closing time`}
                    value={operatingHours[day].close}
                    onChange={(e) => updateDay(day, { close: e.target.value })}
                    className="rounded-lg px-2 py-1 text-xs outline-none"
                    style={{ backgroundColor: A.surface2, border: `1px solid ${A.border}`, color: A.text }}
                  />
                </>
              )}
              <label className="ml-auto flex items-center gap-1 text-xs" style={{ color: A.muted }}>
                <input type="checkbox" checked={copyTargets.has(day)} onChange={() => toggleCopyTarget(day)} />
                copy target
              </label>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs" style={{ color: A.muted }}>Copy hours from</span>
          <select
            aria-label="Copy hours from day"
            value={copySource}
            onChange={(e) => setCopySource(e.target.value as (typeof DAY_KEYS)[number])}
            className="rounded-lg px-2 py-1 text-xs outline-none"
            style={{ backgroundColor: A.surface2, border: `1px solid ${A.border}`, color: A.text }}
          >
            {DAY_KEYS.map((day) => <option key={day} value={day}>{DAY_LABELS[day]}</option>)}
          </select>
          <GhostBtn onClick={applyCopy}>Copy to selected days</GhostBtn>
        </div>
      </section>

      <section className="space-y-3 pt-3" style={{ borderTop: `1px solid ${A.border}` }}>
        <h2 className="text-sm font-semibold" style={{ color: A.text }}>Access &amp; operational defaults</h2>
        {SWITCH_ROWS.map((row) => (
          <label key={row.key} className="flex items-center justify-between gap-3 py-1.5">
            <span>
              <span className="block text-xs font-medium" style={{ color: A.text }}>{row.label}</span>
              <span className="block text-xs" style={{ color: A.muted }}>{row.help}</span>
            </span>
            <Switch
              checked={switches[row.key]}
              onCheckedChange={(checked) => dispatch({ type: 'setSwitches', patch: { [row.key]: checked } })}
              aria-label={row.label}
            />
          </label>
        ))}
        <div className="flex items-center justify-between gap-3 py-1.5">
          <span>
            <span className="block text-xs font-medium" style={{ color: A.text }}>Default new-user role</span>
            <span className="block text-xs" style={{ color: A.muted }}>New joins start as Member.</span>
          </span>
          <span className="text-xs font-medium" style={{ color: A.muted }}>Member</span>
        </div>
      </section>

      <MemberImportSection />

      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-2">
          <GhostBtn onClick={onBack}>Back</GhostBtn>
          <GhostBtn onClick={onSaveDraft}>Save draft</GhostBtn>
        </div>
        <PrimaryBtn onClick={handleContinue}>Continue</PrimaryBtn>
      </div>
    </div>
  );
}
