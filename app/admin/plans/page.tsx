'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { A, ACard, EmptyState, LoadingSkeleton, PageHeader, PrimaryBtn } from '@/lib/admin-ui'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, PackageOpen } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { planSchema } from '@/lib/validations'
import type { z } from 'zod'

interface Plan {
  id: string
  name: string
  price: number
  duration_days: number
  description: string | null
  benefits: unknown
  is_active: boolean | null
  sort_order: number | null
}

type PlanFormData = z.infer<typeof planSchema>

const EMPTY_FORM: PlanFormData = { name: '', price: 0, duration_days: 30, description: '', benefits: '' }

function planBenefits(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export default function PlansPage() {
  const { profile } = useAuth()
  const supabase = useMemo(() => createClient(), [])

  const [plans, setPlans] = useState<Plan[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<PlanFormData>({
    resolver: zodResolver(planSchema),
    defaultValues: EMPTY_FORM,
  })

  useEffect(() => {
    void loadPlans()
  }, [])

  async function loadPlans() {
    const { data } = await supabase
      .from('membership_plans')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('price', { ascending: true })
    setPlans(data ?? [])
    setIsLoading(false)
  }

  function openCreate() {
    setEditId(null)
    reset(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(p: Plan) {
    setEditId(p.id)
    reset({
      name: p.name,
      price: p.price,
      duration_days: p.duration_days,
      description: p.description ?? '',
      benefits: planBenefits(p.benefits).join('\n'),
    })
    setShowForm(true)
  }

  function cancel() {
    setShowForm(false)
    setEditId(null)
    reset(EMPTY_FORM)
  }

  const onSubmit = async (data: PlanFormData) => {
    if (!profile?.gymId) return
    setSaving(true)

    const payload = {
      name: data.name.trim(),
      price: data.price,
      duration_days: data.duration_days,
      description: data.description?.trim() || null,
      benefits: (data.benefits ?? '').split('\n').map((benefit) => benefit.trim()).filter(Boolean),
      gym_id: profile.gymId,
    }

    const { error } = editId
      ? await supabase.from('membership_plans').update(payload).eq('id', editId)
      : await supabase.from('membership_plans').insert(payload)

    if (error) {
      toast.error(`Failed to save plan: ${error.message}`)
      setSaving(false)
      return
    }

    toast.success(editId ? 'Plan updated!' : 'Plan created!')
    cancel()
    await loadPlans()
    setSaving(false)
  }

  async function toggleActive(plan: Plan) {
    const { error } = await supabase
      .from('membership_plans')
      .update({ is_active: !plan.is_active })
      .eq('id', plan.id)
    if (error) {
      toast.error('Failed to update plan')
      return
    }
    toast.success(plan.is_active ? 'Plan deactivated' : 'Plan activated')
    await loadPlans()
  }

  async function deletePlan(id: string) {
    const { error } = await supabase.from('membership_plans').delete().eq('id', id)
    if (error) {
      toast.error('Cannot delete — plan may be in use')
      return
    }
    toast.success('Plan deleted')
    await loadPlans()
  }

  if (isLoading) {
    return <LoadingSkeleton rows={5} h={76} />
  }

  return (
    <div className="space-y-6" style={{ backgroundColor: A.bg }}>
      <PageHeader
        title="Membership Plans"
        subtitle="Configure the plans available to your members"
        action={
          <PrimaryBtn onClick={openCreate}>
            <Plus size={16} />
            New Plan
          </PrimaryBtn>
        }
      />

      {showForm && (
        <ACard className="p-4">
          <p className="text-base font-semibold mb-4" style={{ color: A.text }}>
            {editId ? 'Edit Plan' : 'Create Plan'}
          </p>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm" style={{ color: A.text2 }}>Plan Name</label>
                <input
                  {...register('name')}
                  placeholder="e.g. Monthly"
                  className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ backgroundColor: A.surface2, border: `1px solid ${A.border}`, color: A.text }}
                />
                {errors.name && <p className="text-xs mt-1" style={{ color: 'var(--color-danger)' }}>{errors.name.message}</p>}
              </div>
              <div>
                <label className="text-sm" style={{ color: A.text2 }}>Price (P)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  {...register('price')}
                  className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ backgroundColor: A.surface2, border: `1px solid ${A.border}`, color: A.text }}
                />
                {errors.price && <p className="text-xs mt-1" style={{ color: 'var(--color-danger)' }}>{errors.price.message}</p>}
              </div>
              <div>
                <label className="text-sm" style={{ color: A.text2 }}>Duration (days)</label>
                <input
                  type="number"
                  min="1"
                  {...register('duration_days')}
                  className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ backgroundColor: A.surface2, border: `1px solid ${A.border}`, color: A.text }}
                />
                {errors.duration_days && <p className="text-xs mt-1" style={{ color: 'var(--color-danger)' }}>{errors.duration_days.message}</p>}
              </div>
              <div>
                <label className="text-sm" style={{ color: A.text2 }}>Description (optional)</label>
                <input
                  {...register('description')}
                  placeholder="e.g. Full access, unlimited visits"
                  className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ backgroundColor: A.surface2, border: `1px solid ${A.border}`, color: A.text }}
                />
                {errors.description && <p className="text-xs mt-1" style={{ color: 'var(--color-danger)' }}>{errors.description.message}</p>}
              </div>
              <div className="sm:col-span-2">
                <label className="text-sm" style={{ color: A.text2 }}>Included benefits (one per line)</label>
                <textarea
                  {...register('benefits')}
                  rows={3}
                  placeholder={'Unlimited visits\nLocker access'}
                  className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ backgroundColor: A.surface2, border: `1px solid ${A.border}`, color: A.text }}
                />
                {errors.benefits && <p className="text-xs mt-1" style={{ color: 'var(--color-danger)' }}>{errors.benefits.message}</p>}
              </div>
            </div>
            <div className="flex gap-2">
              <PrimaryBtn type="submit" disabled={saving}>
                {saving ? 'Saving...' : editId ? 'Save Changes' : 'Create Plan'}
              </PrimaryBtn>
              <button
                type="button"
                onClick={cancel}
                className="rounded-lg px-3 py-2 text-sm"
                style={{ backgroundColor: A.surface2, color: A.text2, border: `1px solid ${A.border}` }}
              >
                Cancel
              </button>
            </div>
          </form>
        </ACard>
      )}

      {plans.length === 0 ? (
        <EmptyState
          icon={<PackageOpen size={40} />}
          title="No membership plans yet"
          subtitle="Create your first plan to get started"
        />
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => (
            <ACard
              key={plan.id}
              style={{ opacity: plan.is_active ? 1 : 0.5 }}
              className="p-4"
            >
              <div className="flex items-center justify-between">
                <div className="space-y-0.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium" style={{ color: A.text }}>{plan.name}</p>
                    {!plan.is_active && (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ border: `1px solid ${A.border}`, color: A.muted }}>
                        Inactive
                      </span>
                    )}
                  </div>
                  <p className="text-sm" style={{ color: A.text2 }}>
                    P{plan.price.toLocaleString()} - {plan.duration_days} days
                    {plan.description && ` - ${plan.description}`}
                  </p>
                  {planBenefits(plan.benefits).length > 0 && (
                    <p className="text-xs" style={{ color: A.muted }}>
                      {planBenefits(plan.benefits).join(' · ')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-4">
                  <button
                    type="button"
                    onClick={() => openEdit(plan)}
                    className="h-8 w-8 rounded-md grid place-items-center"
                    style={{ color: A.text2 }}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleActive(plan)}
                    className="rounded-md px-2 py-1 text-xs"
                    style={{ color: A.text2 }}
                  >
                    {plan.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    type="button"
                    onClick={() => deletePlan(plan.id)}
                    className="h-8 w-8 rounded-md grid place-items-center"
                    style={{ color: 'var(--admin-expired-text)' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </ACard>
          ))}
        </div>
      )}
    </div>
  )
}
