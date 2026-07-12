"use client"

import React, { useState, useMemo, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"
import {
  A,
  ACard,
  Avatar,
  ChoicePicker,
  EmptyState,
  LoadingSkeleton,
  Modal,
  PageHeader,
  PrimaryBtn,
  SearchInput,
  SummaryBox,
} from "@/lib/admin-ui"
import { toast } from "sonner"
import { Search, Plus, CreditCard, Check, X } from "lucide-react"

interface PaymentRow {
  id: string
  member_name: string
  member_id: string
  plan_name: string
  amount_paid: number
  payment_method: "cash" | "gcash"
  created_at: string
}

interface MemberOption { id: string; name: string; contact_number: string | null }
interface PlanOption { id: string; name: string; price: number; duration_days: number; description: string | null }
interface PromoOption {
  id: string
  name: string
  discount_type: "percent" | "fixed"
  discount_value: number
  plan_id: string | null
  valid_from: string | null
  valid_until: string | null
}

export default function PaymentsPage() {
  const supabase = useMemo(() => createClient(), [])
  const { profile } = useAuth()
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [memberOptions, setMemberOptions] = useState<MemberOption[]>([])
  const [planOptions, setPlanOptions] = useState<PlanOption[]>([])
  const [promoOptions, setPromoOptions] = useState<PromoOption[]>([])
  const [methodFilter, setMethodFilter] = useState<string>("all")
  const [search, setSearch] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [memberSearch, setMemberSearch] = useState("")
  const [selectedMember, setSelectedMember] = useState<MemberOption | null>(null)
  const [selectedPlanId, setSelectedPlanId] = useState("")
  const [selectedPromoId, setSelectedPromoId] = useState("")
  const [payMethod, setPayMethod] = useState<"cash" | "gcash">("cash")

  const fetchData = useCallback(async () => {
    const { data, error: paymentsError } = await supabase
      .from("memberships")
      .select("id, member_id, amount_paid, payment_method, created_at, profiles!memberships_member_id_fkey(name), membership_plans!memberships_plan_id_fkey(name)")
      .order("created_at", { ascending: false })

    if (paymentsError) console.error("payments fetch error:", paymentsError)

    setPayments(
      (data ?? []).map((p) => ({
        id: p.id,
        member_name: (p.profiles as unknown as { name: string })?.name ?? "Unknown",
        member_id: p.member_id ?? "",
        plan_name: (p.membership_plans as unknown as { name: string })?.name ?? "Unknown",
        amount_paid: p.amount_paid,
        payment_method: p.payment_method,
        created_at: p.created_at ?? new Date().toISOString(),
      }))
    )

    const { data: gymUsers } = await supabase
      .from("gym_users")
      .select("profiles!gym_users_user_id_fkey(id, name, contact_number)")
      .eq("gym_id", profile?.gymId ?? "")
      .eq("status", "active")
    setMemberOptions((gymUsers ?? []).flatMap((row) => row.profiles ? [row.profiles as MemberOption] : []))

    const { data: plans } = await supabase
      .from("membership_plans")
      .select("id, name, price, duration_days, description")
      .order("price")
    setPlanOptions(plans ?? [])

    let promoQuery = supabase
      .from("promos")
      .select("id, name, discount_type, discount_value, plan_id, valid_from, valid_until")
      .eq("is_active", true)

    if (profile?.gymId) {
      promoQuery = promoQuery.eq("gym_id", profile.gymId)
    }

    const { data: promos } = await promoQuery.order("created_at", { ascending: false })
    setPromoOptions(
      (promos ?? []).map((promo) => ({
        id: promo.id,
        name: promo.name,
        discount_type: promo.discount_type === "fixed" ? "fixed" : "percent",
        discount_value: promo.discount_value,
        plan_id: promo.plan_id,
        valid_from: promo.valid_from,
        valid_until: promo.valid_until,
      })),
    )
    setIsLoading(false)
  }, [supabase, profile?.gymId])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredMembers = useMemo(() => {
    if (!memberSearch.trim()) return memberOptions
    const q = memberSearch.toLowerCase()
    return memberOptions.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.contact_number && m.contact_number.includes(q))
    )
  }, [memberOptions, memberSearch])

  const selectedPlan = planOptions.find((p) => p.id === selectedPlanId)

  const applicablePromos = useMemo(() => {
    if (!selectedPlanId) return []

    const today = new Date().toISOString().split("T")[0]
    return promoOptions.filter((promo) => {
      const matchesPlan = !promo.plan_id || promo.plan_id === selectedPlanId
      const startsOk = !promo.valid_from || promo.valid_from <= today
      const endsOk = !promo.valid_until || promo.valid_until >= today
      return matchesPlan && startsOk && endsOk
    })
  }, [promoOptions, selectedPlanId])

  const selectedPromo = applicablePromos.find((promo) => promo.id === selectedPromoId) ?? null

  const payableAmount = useMemo(() => {
    if (!selectedPlan) return 0

    const basePrice = selectedPlan.price
    if (!selectedPromo) return basePrice

    if (selectedPromo.discount_type === "percent") {
      return Math.max(0, Math.round((basePrice - basePrice * (selectedPromo.discount_value / 100)) * 100) / 100)
    }

    return Math.max(0, Math.round((basePrice - selectedPromo.discount_value) * 100) / 100)
  }, [selectedPlan, selectedPromo])

  useEffect(() => {
    if (!selectedPromoId) return
    const stillValid = applicablePromos.some((promo) => promo.id === selectedPromoId)
    if (!stillValid) setSelectedPromoId("")
  }, [selectedPromoId, applicablePromos])

  function resetDialog() {
    setMemberSearch("")
    setSelectedMember(null)
    setSelectedPlanId("")
    setSelectedPromoId("")
    setPayMethod("cash")
    setSaving(false)
  }

  async function handleRecordPayment() {
    if (!selectedMember) { toast.error("Please select a member"); return }
    if (!selectedPlanId || !selectedPlan) { toast.error("Please select a plan"); return }

    setSaving(true)

    const startDate = new Date()
    const endDate = new Date()
    endDate.setDate(endDate.getDate() + selectedPlan.duration_days)
    const startDateStr = startDate.toISOString().split("T")[0]
    const endDateStr = endDate.toISOString().split("T")[0]

    const { error } = await supabase.from("memberships").insert({
      member_id: selectedMember.id,
      plan_id: selectedPlanId,
      start_date: startDateStr,
      end_date: endDateStr,
      status: "active",
      payment_method: payMethod,
      amount_paid: payableAmount,
      gym_id: profile?.gymId ?? null,
      created_by: profile?.id ?? null,
    })

    if (error) {
      console.error("insert error:", error)
      toast.error("Failed to record payment: " + error.message)
      setSaving(false)
      return
    }

    // Expire any previous active membership for this member
    await supabase
      .from("memberships")
      .update({ status: "expired" })
      .eq("member_id", selectedMember.id)
      .eq("status", "active")
      .neq("start_date", startDateStr)

    toast.success(`Payment recorded for ${selectedMember.name}!`)
    setDialogOpen(false)
    resetDialog()
    fetchData()
  }

  const filtered = useMemo(() => {
    let list = payments
    if (methodFilter !== "all") list = list.filter((p) => p.payment_method === methodFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (p) => p.member_name.toLowerCase().includes(q) || p.plan_name.toLowerCase().includes(q)
      )
    }
    return list
  }, [payments, methodFilter, search])

  const totalFiltered = filtered.reduce((sum, p) => sum + p.amount_paid, 0)

  if (isLoading) {
    return <LoadingSkeleton rows={5} h={72} />
  }

  return (
    <div className="space-y-6" style={{ backgroundColor: A.bg }}>
      <PageHeader
        title="Payments"
        subtitle="All membership payments and renewals"
        action={
          <PrimaryBtn onClick={() => setDialogOpen(true)}>
            <Plus size={16} />
            Record Payment
          </PrimaryBtn>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by member or plan..." />
        </div>
        <select
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value)}
          className="rounded-lg px-3 py-2 text-sm outline-none"
          style={{ backgroundColor: A.surface2, border: `1px solid ${A.border}`, color: A.text, minWidth: 150 }}
        >
          <option value="all">All Methods</option>
          <option value="cash">Cash</option>
          <option value="gcash">GCash</option>
        </select>
      </div>

      <ACard className="p-4">
        <div className="flex items-center gap-3">
          <CreditCard className="h-5 w-5 shrink-0" style={{ color: A.primary }} />
        <div>
            <p className="text-xs" style={{ color: A.muted }}>Filtered total ({filtered.length} payments)</p>
            <p className="text-lg font-bold" style={{ color: A.text }}>₱{totalFiltered.toLocaleString()}</p>
          </div>
        </div>
      </ACard>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<CreditCard size={40} />}
          title="No payments found"
          subtitle="Record your first payment to populate this list"
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => (
            <ACard key={p.id} className="p-4">
              <div className="flex items-center justify-between rounded-lg">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <Avatar name={p.member_name} size={9} />
                <div className="min-w-0">
                  <p className="font-medium text-sm" style={{ color: A.text }}>{p.member_name}</p>
                  <p className="text-xs" style={{ color: A.muted }}>
                    {p.plan_name} · {p.created_at.split("T")[0]}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{
                    backgroundColor: p.payment_method === "gcash" ? "#EFF6FF" : "#ECFDF3",
                    color: p.payment_method === "gcash" ? "#2563EB" : "#16A34A",
                    border: `1px solid ${p.payment_method === "gcash" ? "#BFDBFE" : "#BBF7D0"}`,
                  }}
                >
                  {p.payment_method}
                </span>
                <span className="font-semibold text-sm" style={{ color: A.text }}>
                  ₱{p.amount_paid.toLocaleString()}
                </span>
              </div>
              </div>
            </ACard>
          ))}
        </div>
      )}

      <Modal
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false)
          resetDialog()
        }}
        title="Record Payment"
        width={640}
      >
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-sm font-medium" style={{ color: A.text2 }}>Member</p>

            {selectedMember ? (
              <div className="flex items-center justify-between rounded-lg px-4 py-3" style={{ backgroundColor: A.surface2, border: `1px solid ${A.border}` }}>
                <div>
                  <p className="text-sm font-medium" style={{ color: A.text }}>{selectedMember.name}</p>
                  {selectedMember.contact_number && (
                    <p className="text-xs" style={{ color: A.muted }}>{selectedMember.contact_number}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMember(null)
                    setMemberSearch("")
                  }}
                  className="rounded p-1 transition-colors hover:bg-black/5"
                  style={{ color: A.muted }}
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: A.muted }} />
                  <input
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="Search by name or contact..."
                    className="w-full rounded-lg py-2 pl-9 pr-3 text-sm outline-none"
                    style={{ backgroundColor: A.surface2, border: `1px solid ${A.border}`, color: A.text }}
                  />
                </div>

                {memberSearch.trim() && (
                  <div className="max-h-44 overflow-y-auto rounded-lg" style={{ backgroundColor: A.surface, border: `1px solid ${A.border}` }}>
                    {filteredMembers.length === 0 ? (
                      <p className="px-3 py-3 text-sm" style={{ color: A.muted }}>No members found</p>
                    ) : (
                      filteredMembers.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setSelectedMember(m)
                            setMemberSearch("")
                          }}
                          className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition-colors hover:bg-black/5"
                        >
                          <span style={{ color: A.text }}>{m.name}</span>
                          {m.contact_number && <span style={{ color: A.muted }}>{m.contact_number}</span>}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <ChoicePicker
            label="Membership Plan"
            value={selectedPlanId}
            onChange={setSelectedPlanId}
            options={planOptions.map((plan) => ({
              value: plan.id,
              label: plan.name,
              sub: `${plan.duration_days} days${plan.description ? ` · ${plan.description}` : ""}`,
              right: `₱${plan.price.toLocaleString()}`,
            }))}
          />

          <ChoicePicker
            label="Promo (Optional)"
            value={selectedPromoId}
            onChange={setSelectedPromoId}
            options={[
              { value: "", label: "No promo" },
              ...applicablePromos.map((promo) => ({
                value: promo.id,
                label: promo.name,
                sub: promo.discount_type === "percent"
                  ? `${promo.discount_value}% off`
                  : `₱${promo.discount_value.toLocaleString()} off`,
              })),
            ]}
          />

          <ChoicePicker
            label="Payment Method"
            value={payMethod}
            onChange={(v) => setPayMethod(v as "cash" | "gcash")}
            options={[
              { value: "cash", label: "Cash" },
              { value: "gcash", label: "GCash" },
            ]}
          />

          {selectedMember && selectedPlan && (
            <SummaryBox
              rows={[
                { label: "Member", value: selectedMember.name },
                { label: "Plan", value: `${selectedPlan.name} (${selectedPlan.duration_days}d)` },
                { label: "Promo", value: selectedPromo ? selectedPromo.name : "None" },
                { label: "Method", value: payMethod === "cash" ? "Cash" : "GCash" },
                { label: "Total", value: `₱${payableAmount.toLocaleString()}` },
              ]}
            />
          )}

          <PrimaryBtn onClick={handleRecordPayment} disabled={saving || !selectedMember || !selectedPlanId}>
            {saving ? "Recording..." : "Confirm and Record Payment"}
          </PrimaryBtn>
        </div>
      </Modal>
    </div>
  )
}
