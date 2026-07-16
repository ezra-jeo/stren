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
import { Search, Plus, CreditCard, X, RotateCcw, SlidersHorizontal } from "lucide-react"

interface PaymentRow {
  id: string
  member_name: string
  member_id: string
  plan_name: string
  ledger_amount: number
  remaining_reversible_amount: number
  payment_method: "cash" | "gcash" | null
  occurred_at: string
  kind: "payment" | "refund" | "void" | "adjustment"
  reason: string | null
}

interface PaymentHistoryResponse {
  rows: PaymentRow[]
  total_count: number
  net_total: number
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
  const { profile, activeScope } = useAuth()
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [memberOptions, setMemberOptions] = useState<MemberOption[]>([])
  const [planOptions, setPlanOptions] = useState<PlanOption[]>([])
  const [promoOptions, setPromoOptions] = useState<PromoOption[]>([])
  const [methodFilter, setMethodFilter] = useState<string>("all")
  const [search, setSearch] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [netTotal, setNetTotal] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [reverseTarget, setReverseTarget] = useState<PaymentRow | null>(null)
  const [reverseKind, setReverseKind] = useState<"refund" | "void">("refund")
  const [reverseAmount, setReverseAmount] = useState("")
  const [reverseReason, setReverseReason] = useState("")
  const [revokeMembership, setRevokeMembership] = useState(false)
  const [reverseRequestKey, setReverseRequestKey] = useState("")
  const [reversing, setReversing] = useState(false)
  const [adjustmentOpen, setAdjustmentOpen] = useState(false)
  const [adjustmentMemberId, setAdjustmentMemberId] = useState("")
  const [adjustmentAmount, setAdjustmentAmount] = useState("")
  const [adjustmentReason, setAdjustmentReason] = useState("")
  const [adjustmentRequestKey, setAdjustmentRequestKey] = useState("")
  const [adjusting, setAdjusting] = useState(false)

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [memberSearch, setMemberSearch] = useState("")
  const [selectedMember, setSelectedMember] = useState<MemberOption | null>(null)
  const [selectedPlanId, setSelectedPlanId] = useState("")
  const [selectedPromoId, setSelectedPromoId] = useState("")
  const [payMethod, setPayMethod] = useState<"cash" | "gcash">("cash")
  const [paymentRequestKey, setPaymentRequestKey] = useState("")

  const fetchData = useCallback(async (offset = 0) => {
    if (offset > 0) setLoadingMore(true)
    const { data, error: paymentsError } = await supabase.rpc("financial_transaction_history", {
      p_member_id: undefined,
      p_limit: 100,
      p_offset: offset,
      p_method: methodFilter === "all" ? undefined : methodFilter,
      p_search: search.trim() || undefined,
      p_from_date: undefined,
      p_to_date: undefined,
    })

    if (paymentsError) console.error("payments fetch error:", paymentsError)
    const history = (data ?? { rows: [], total_count: 0, net_total: 0 }) as unknown as PaymentHistoryResponse
    setPayments((current) => offset === 0 ? history.rows : [...current, ...history.rows])
    setTotalCount(history.total_count)
    setNetTotal(history.net_total)

    if (offset > 0) {
      setLoadingMore(false)
      return
    }

    const { data: gymUsers } = await supabase
      .from("gym_users")
      .select("profiles!gym_users_user_id_fkey(id, name, contact_number)")
      .eq("gym_id", profile?.gymId ?? "")
      .eq("role", "member")
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
    setLoadingMore(false)
  }, [supabase, profile?.gymId, methodFilter, search])

  useEffect(() => { void fetchData(0) }, [fetchData])

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
    setPaymentRequestKey("")
  }

  function openReversal(payment: PaymentRow) {
    setReverseTarget(payment)
    setReverseKind("refund")
    setReverseAmount(String(payment.remaining_reversible_amount))
    setReverseReason("")
    setRevokeMembership(false)
    setReverseRequestKey(crypto.randomUUID())
  }

  function closeReversal() {
    setReverseTarget(null)
    setReverseReason("")
    setReverseAmount("")
    setReverseRequestKey("")
    setReversing(false)
  }

  async function handleReversePayment() {
    if (!reverseTarget) return
    const amount = reverseKind === "void"
      ? reverseTarget.remaining_reversible_amount
      : Number(reverseAmount)
    if (!Number.isFinite(amount) || amount <= 0 || amount > reverseTarget.remaining_reversible_amount) {
      toast.error("Enter an amount within the remaining reversible balance.")
      return
    }
    if (reverseReason.trim().length < 3) {
      toast.error("A reason is required.")
      return
    }

    setReversing(true)
    const idempotencyKey = reverseRequestKey || crypto.randomUUID()
    setReverseRequestKey(idempotencyKey)
    const { error } = await supabase.rpc("reverse_financial_transaction", {
      p_transaction_id: reverseTarget.id,
      p_kind: reverseKind,
      p_amount: amount,
      p_reason: reverseReason.trim(),
      p_revoke_membership: revokeMembership,
      p_idempotency_key: idempotencyKey,
    })
    if (error) {
      toast.error("Could not reverse the payment: " + error.message)
      setReversing(false)
      return
    }
    toast.success(reverseKind === "void" ? "Payment voided." : "Refund recorded.")
    closeReversal()
    void fetchData(0)
  }

  function openAdjustment() {
    setAdjustmentMemberId("")
    setAdjustmentAmount("")
    setAdjustmentReason("")
    setAdjustmentRequestKey(crypto.randomUUID())
    setAdjustmentOpen(true)
  }

  async function handleAdjustment() {
    const amount = Number(adjustmentAmount)
    if (!adjustmentMemberId) { toast.error("Please select a member."); return }
    if (!Number.isFinite(amount) || amount === 0) { toast.error("Enter a non-zero amount."); return }
    if (adjustmentReason.trim().length < 3) { toast.error("A reason is required."); return }

    setAdjusting(true)
    const idempotencyKey = adjustmentRequestKey || crypto.randomUUID()
    setAdjustmentRequestKey(idempotencyKey)
    const { error } = await supabase.rpc("record_financial_adjustment", {
      p_member_id: adjustmentMemberId,
      p_amount: amount,
      p_reason: adjustmentReason.trim(),
      p_idempotency_key: idempotencyKey,
      p_occurred_at: undefined,
    })
    if (error) {
      toast.error("Could not record the adjustment: " + error.message)
      setAdjusting(false)
      return
    }
    toast.success("Financial adjustment recorded.")
    setAdjustmentOpen(false)
    setAdjusting(false)
    void fetchData(0)
  }

  async function handleRecordPayment() {
    if (!selectedMember) { toast.error("Please select a member"); return }
    if (!selectedPlanId || !selectedPlan) { toast.error("Please select a plan"); return }

    setSaving(true)

    const idempotencyKey = paymentRequestKey || crypto.randomUUID()
    setPaymentRequestKey(idempotencyKey)
    const { error } = await supabase.rpc("record_membership_payment", {
      p_member_id: selectedMember.id,
      p_plan_id: selectedPlanId,
      p_payment_method: payMethod,
      p_idempotency_key: idempotencyKey,
      p_promo_id: selectedPromoId || undefined,
      p_requested_start_date: undefined,
    })

    if (error) {
      console.error("insert error:", error)
      toast.error("Failed to record payment: " + error.message)
      setSaving(false)
      return
    }

    toast.success(`Payment recorded for ${selectedMember.name}!`)
    setDialogOpen(false)
    resetDialog()
    void fetchData(0)
  }

  if (isLoading) {
    return <LoadingSkeleton rows={5} h={72} />
  }

  return (
    <div className="space-y-6" style={{ backgroundColor: A.bg }}>
      <PageHeader
        title="Payments"
        subtitle="All membership payments and renewals"
        action={
          <div className="flex flex-wrap gap-2">
            {activeScope?.role === "owner" && (
              <PrimaryBtn onClick={openAdjustment}>
                <SlidersHorizontal size={16} />
                Adjustment
              </PrimaryBtn>
            )}
            <PrimaryBtn onClick={() => { setPaymentRequestKey(crypto.randomUUID()); setDialogOpen(true) }}>
              <Plus size={16} />
              Record Payment
            </PrimaryBtn>
          </div>
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
            <p className="text-xs" style={{ color: A.muted }}>Net total ({totalCount} ledger events)</p>
            <p className="text-lg font-bold" style={{ color: A.text }}>₱{netTotal.toLocaleString()}</p>
          </div>
        </div>
      </ACard>

      {payments.length === 0 ? (
        <EmptyState
          icon={<CreditCard size={40} />}
          title="No payments found"
          subtitle="Record your first payment to populate this list"
        />
      ) : (
        <div className="space-y-2">
          {payments.map((p) => (
            <ACard key={p.id} className="p-4">
              <div className="flex items-center justify-between rounded-lg">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <Avatar name={p.member_name} size={9} />
                <div className="min-w-0">
                  <p className="font-medium text-sm" style={{ color: A.text }}>{p.member_name}</p>
                  <p className="text-xs" style={{ color: A.muted }}>
                    {p.plan_name} · {p.kind} · {p.occurred_at.split("T")[0]}
                    {p.reason ? ` · ${p.reason}` : ""}
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
                  {p.payment_method ?? "adjustment"}
                </span>
                <span className="font-semibold text-sm" style={{ color: A.text }}>
                  {p.ledger_amount < 0 ? "−" : ""}₱{Math.abs(p.ledger_amount).toLocaleString()}
                </span>
                {activeScope?.role === "owner" && p.kind === "payment" && p.remaining_reversible_amount > 0 && (
                  <button
                    type="button"
                    onClick={() => openReversal(p)}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold"
                    style={{ color: A.primary, border: `1px solid ${A.border}` }}
                  >
                    <RotateCcw size={12} />
                    Reverse
                  </button>
                )}
              </div>
              </div>
            </ACard>
          ))}
          {payments.length < totalCount && (
            <div className="flex justify-center pt-2">
              <PrimaryBtn onClick={() => void fetchData(payments.length)} disabled={loadingMore}>
                {loadingMore ? "Loading..." : `Load more (${payments.length} of ${totalCount})`}
              </PrimaryBtn>
            </div>
          )}
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

      <Modal open={reverseTarget !== null} onClose={closeReversal} title="Reverse Payment" width={520}>
        <div className="space-y-4">
          <ChoicePicker
            label="Correction type"
            value={reverseKind}
            onChange={(value) => {
              const kind = value as "refund" | "void"
              setReverseKind(kind)
              if (kind === "void" && reverseTarget) setReverseAmount(String(reverseTarget.remaining_reversible_amount))
            }}
            options={[
              { value: "refund", label: "Refund", sub: "Return some or all of the remaining payment" },
              { value: "void", label: "Void", sub: "Reverse the full remaining payment" },
            ]}
          />
          <label className="block text-sm font-medium" style={{ color: A.text2 }}>
            Amount
            <input
              type="number"
              min="0.01"
              step="0.01"
              max={reverseTarget?.remaining_reversible_amount}
              disabled={reverseKind === "void"}
              value={reverseAmount}
              onChange={(event) => setReverseAmount(event.target.value)}
              className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none disabled:opacity-60"
              style={{ backgroundColor: A.surface2, border: `1px solid ${A.border}`, color: A.text }}
            />
          </label>
          <label className="block text-sm font-medium" style={{ color: A.text2 }}>
            Reason
            <textarea
              value={reverseReason}
              onChange={(event) => setReverseReason(event.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{ backgroundColor: A.surface2, border: `1px solid ${A.border}`, color: A.text }}
            />
          </label>
          <label className="flex items-start gap-2 text-sm" style={{ color: A.text2 }}>
            <input type="checkbox" checked={revokeMembership} onChange={(event) => setRevokeMembership(event.target.checked)} />
            Also cancel the linked membership access. Leave unchecked to preserve access.
          </label>
          <PrimaryBtn onClick={handleReversePayment} disabled={reversing || !reverseReason.trim()}>
            {reversing ? "Recording..." : reverseKind === "void" ? "Record Void" : "Record Refund"}
          </PrimaryBtn>
        </div>
      </Modal>

      <Modal open={adjustmentOpen} onClose={() => { setAdjustmentOpen(false); setAdjusting(false) }} title="Financial Adjustment" width={520}>
        <div className="space-y-4">
          <ChoicePicker
            label="Member"
            value={adjustmentMemberId}
            onChange={setAdjustmentMemberId}
            options={memberOptions.map((member) => ({ value: member.id, label: member.name, sub: member.contact_number ?? undefined }))}
          />
          <label className="block text-sm font-medium" style={{ color: A.text2 }}>
            Signed amount
            <input
              type="number"
              step="0.01"
              value={adjustmentAmount}
              onChange={(event) => setAdjustmentAmount(event.target.value)}
              placeholder="Use a negative amount to reduce revenue"
              className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{ backgroundColor: A.surface2, border: `1px solid ${A.border}`, color: A.text }}
            />
          </label>
          <label className="block text-sm font-medium" style={{ color: A.text2 }}>
            Reason
            <textarea
              value={adjustmentReason}
              onChange={(event) => setAdjustmentReason(event.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{ backgroundColor: A.surface2, border: `1px solid ${A.border}`, color: A.text }}
            />
          </label>
          <PrimaryBtn onClick={handleAdjustment} disabled={adjusting || !adjustmentMemberId || !adjustmentReason.trim()}>
            {adjusting ? "Recording..." : "Record Adjustment"}
          </PrimaryBtn>
        </div>
      </Modal>
    </div>
  )
}
