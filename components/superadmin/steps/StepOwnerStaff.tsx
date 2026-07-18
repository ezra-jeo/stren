'use client';

import { useEffect, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { A, PrimaryBtn, GhostBtn, ChoicePicker } from '@/lib/admin-ui';
import { useWizard } from '@/lib/onboarding/state';
import { ownerStaffStepSchema, CONSENT_METHODS, type OwnerStaffStepData } from '@/lib/onboarding/schemas';
import type { EmailCheckResponse } from '@/app/api/superadmin/onboarding/email-check/route';

const CONSENT_LABELS: Record<(typeof CONSENT_METHODS)[number], string> = {
  in_person: 'In person',
  phone: 'Phone call',
  email: 'Email',
};

let staffIdCounter = 0;
function nextStaffId() {
  staffIdCounter += 1;
  return `staff-${Date.now()}-${staffIdCounter}`;
}

function useEmailCheck(email: string) {
  const [result, setResult] = useState<EmailCheckResponse | null>(null);
  useEffect(() => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) { setResult(null); return; }
    let active = true;
    const handle = window.setTimeout(() => {
      void fetch(`/api/superadmin/onboarding/email-check?email=${encodeURIComponent(trimmed)}`)
        .then((res) => res.json())
        .then((data: EmailCheckResponse) => { if (active) setResult(data); })
        .catch(() => { if (active) setResult(null); });
    }, 350);
    return () => { active = false; window.clearTimeout(handle); };
  }, [email]);
  return result;
}

export function StepOwnerStaff({ onContinue, onBack, onSaveDraft }: { onContinue: () => void; onBack: () => void; onSaveDraft: () => void }) {
  const { state, dispatch } = useWizard();
  const { owner, staff } = state.draft;

  const { register, control, handleSubmit, watch, formState: { errors } } = useForm<OwnerStaffStepData>({
    resolver: zodResolver(ownerStaffStepSchema),
    defaultValues: { owner: owner.consentMethod ? owner as OwnerStaffStepData['owner'] : { ...owner, consentMethod: 'in_person' }, staff },
    mode: 'onBlur',
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'staff' });
  const watched = watch();

  useEffect(() => {
    dispatch({ type: 'setOwner', patch: watched.owner });
  }, [watched.owner, dispatch]);

  useEffect(() => {
    dispatch({ type: 'setStaff', staff: watched.staff ?? [] });
  }, [watched.staff, dispatch]);

  const ownerEmailCheck = useEmailCheck(watched.owner?.email ?? '');

  function onValid() {
    dispatch({ type: 'markStepComplete', step: 'ownerStaff' });
    onContinue();
  }

  function onInvalid() {
    toast.error('Please complete the owner details before continuing.');
  }

  function addStaff() {
    append({ id: nextStaffId(), name: '', email: '', mobile: '', role: 'staff', inviteEnabled: true });
  }

  return (
    <form onSubmit={handleSubmit(onValid, onInvalid)} className="onboarding-step-enter space-y-6" noValidate>
      <section className="space-y-4">
        <h2 className="text-sm font-semibold" style={{ color: A.text }}>Owner</h2>

        <div>
          <label htmlFor="owner-name" className="mb-1.5 block text-xs font-medium" style={{ color: A.muted }}>Full name</label>
          <input
            id="owner-name"
            {...register('owner.name')}
            aria-invalid={!!errors.owner?.name}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{ backgroundColor: A.surface2, border: `1px solid ${errors.owner?.name ? A.danger : A.border}`, color: A.text }}
          />
          {errors.owner?.name && <p className="mt-1 text-xs" style={{ color: A.danger }}>{errors.owner.name.message}</p>}
        </div>

        <div>
          <label htmlFor="owner-email" className="mb-1.5 block text-xs font-medium" style={{ color: A.muted }}>Email address</label>
          <input
            id="owner-email"
            type="email"
            {...register('owner.email')}
            aria-invalid={!!errors.owner?.email}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{ backgroundColor: A.surface2, border: `1px solid ${errors.owner?.email ? A.danger : A.border}`, color: A.text }}
          />
          {errors.owner?.email && <p className="mt-1 text-xs" style={{ color: A.danger }}>{errors.owner.email.message}</p>}
          {ownerEmailCheck?.exists && (
            <p role="status" className="mt-1 text-xs" style={{ color: 'hsl(38 92% 40%)' }}>
              This email belongs to an existing Stren account — it will be reused, no duplicate account is created.
            </p>
          )}
          {!!ownerEmailCheck?.ownsOrManagesGymCount && (
            <p role="status" className="mt-1 text-xs" style={{ color: 'hsl(38 92% 40%)' }}>
              This account already manages {ownerEmailCheck.ownsOrManagesGymCount} other gym{ownerEmailCheck.ownsOrManagesGymCount === 1 ? '' : 's'} — it will gain access to this gym in addition to its existing ones.
            </p>
          )}
          {ownerEmailCheck?.pendingInvite && (
            <p role="status" className="mt-1 text-xs" style={{ color: 'hsl(38 92% 40%)' }}>
              This email already has a pending claim invitation for {ownerEmailCheck.pendingInvite.gymName}. Finishing this setup will not create a duplicate invite.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="owner-mobile" className="mb-1.5 block text-xs font-medium" style={{ color: A.muted }}>Philippine mobile number</label>
          <input
            id="owner-mobile"
            {...register('owner.mobile')}
            placeholder="09XX XXX XXXX"
            aria-invalid={!!errors.owner?.mobile}
            aria-describedby="owner-mobile-hint"
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{ backgroundColor: A.surface2, border: `1px solid ${errors.owner?.mobile ? A.danger : A.border}`, color: A.text }}
          />
          <p id="owner-mobile-hint" className="mt-1 text-xs" style={{ color: errors.owner?.mobile ? A.danger : A.muted }}>
            {errors.owner?.mobile?.message ?? 'Format: 09XX XXX XXXX or +639XX XXX XXXX'}
          </p>
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-medium" style={{ color: A.muted }}>Role</span>
          <ChoicePicker
            value={watched.owner?.role ?? 'owner'}
            onChange={(value) => dispatch({ type: 'setOwner', patch: { role: value } })}
            options={[
              { value: 'owner', label: 'Owner' },
              { value: 'admin', label: 'Manager' },
            ]}
          />
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-medium" style={{ color: A.muted }}>Consent method</span>
          <ChoicePicker
            value={watched.owner?.consentMethod ?? 'in_person'}
            onChange={(value) => dispatch({ type: 'setOwner', patch: { consentMethod: value } })}
            options={CONSENT_METHODS.map((method) => ({ value: method, label: CONSENT_LABELS[method] }))}
          />
          {errors.owner?.consentMethod && <p className="mt-1 text-xs" style={{ color: A.danger }}>Select how consent was obtained.</p>}
        </div>
      </section>

      <section className="space-y-3 pt-2" style={{ borderTop: `1px solid ${A.border}` }}>
        <div className="flex items-center justify-between pt-3">
          <h2 className="text-sm font-semibold" style={{ color: A.text }}>Staff <span className="font-normal" style={{ color: A.muted }}>(optional)</span></h2>
          <button
            type="button"
            onClick={addStaff}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium"
            style={{ color: A.primary, border: `1px solid ${A.border}` }}
          >
            <Plus className="h-3.5 w-3.5" /> Add staff
          </button>
        </div>

        {fields.map((field, index) => (
          <div key={field.id} className="rounded-xl p-3 space-y-3" style={{ backgroundColor: A.surface2, border: `1px solid ${A.border}` }}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium" style={{ color: A.text2 }}>Staff member {index + 1}</p>
              <button type="button" onClick={() => remove(index)} aria-label={`Remove staff member ${index + 1}`} style={{ color: A.muted }}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor={`staff-${index}-name`} className="mb-1 block text-xs" style={{ color: A.muted }}>Full name</label>
                <input
                  id={`staff-${index}-name`}
                  {...register(`staff.${index}.name` as const)}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ backgroundColor: A.surface, border: `1px solid ${A.border}`, color: A.text }}
                />
                {errors.staff?.[index]?.name && <p className="mt-1 text-xs" style={{ color: A.danger }}>{errors.staff[index]?.name?.message}</p>}
              </div>
              <div>
                <label htmlFor={`staff-${index}-email`} className="mb-1 block text-xs" style={{ color: A.muted }}>Email</label>
                <input
                  id={`staff-${index}-email`}
                  type="email"
                  {...register(`staff.${index}.email` as const)}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ backgroundColor: A.surface, border: `1px solid ${A.border}`, color: A.text }}
                />
                {errors.staff?.[index]?.email && <p className="mt-1 text-xs" style={{ color: A.danger }}>{errors.staff[index]?.email?.message}</p>}
              </div>
              <div>
                <label htmlFor={`staff-${index}-mobile`} className="mb-1 block text-xs" style={{ color: A.muted }}>Mobile (optional)</label>
                <input
                  id={`staff-${index}-mobile`}
                  {...register(`staff.${index}.mobile` as const)}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ backgroundColor: A.surface, border: `1px solid ${A.border}`, color: A.text }}
                />
              </div>
              <div>
                <label htmlFor={`staff-${index}-role`} className="mb-1 block text-xs" style={{ color: A.muted }}>Access role</label>
                <select
                  id={`staff-${index}-role`}
                  {...register(`staff.${index}.role` as const)}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ backgroundColor: A.surface, border: `1px solid ${A.border}`, color: A.text }}
                >
                  <option value="admin">Admin</option>
                  <option value="staff">Staff</option>
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs" style={{ color: A.muted }}>
              <input type="checkbox" {...register(`staff.${index}.inviteEnabled` as const)} />
              Send invitation to this staff member
            </label>
          </div>
        ))}
      </section>

      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-2">
          <GhostBtn onClick={onBack}>Back</GhostBtn>
          <GhostBtn onClick={onSaveDraft}>Save draft</GhostBtn>
        </div>
        <PrimaryBtn type="submit">Continue</PrimaryBtn>
      </div>
    </form>
  );
}
