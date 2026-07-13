"use client"

import React, { useState, useMemo, useEffect, useCallback, useRef } from "react"
import { createClient } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-context"
import { OnboardMemberModal } from "@/components/admin/OnboardMemberModal"
import {
  A,
  ACard,
  Avatar,
  ChoicePicker,
  EmptyState,
  GhostBtn,
  LoadingSkeleton,
  Modal,
  PageHeader,
  PrimaryBtn,
  SearchInput,
  StatusPill,
  SummaryBox,
} from "@/lib/admin-ui"
import { toast } from "sonner"
import { Snowflake, Play, AlertTriangle, Users, UserPlus } from "lucide-react"

interface MemberRow {
  profile_id: string
  name: string
  email: string
  contact_number: string | null
  profile_status: "pending" | "active" | "rejected"
  membership_id: string | null
  plan_name: string | null
  start_date: string | null
  end_date: string | null
  membership_status: "active" | "expired" | "frozen" | null
  created_at: string | null
}

interface PaymentRow {
  id: string
  amount_paid: number
  payment_method: "cash" | "gcash"
  created_at: string | null
  plan_name: string
}

interface PlanOption {
  id: string
  name: string
  price: number
  duration_days: number
}

interface OnboardResponse {
  memberId: string
  membershipId: string
  qrCode: string
  magicLink: string | null
  redirectTo?: string
  emailSent?: boolean
  emailError?: string
}

const MEMBERS_CACHE_TTL_MS = 30_000
const PLANS_CACHE_TTL_MS = 5 * 60_000
const MEMBERS_CACHE_PREFIX = "admin-members-cache:"

type MembersCachePayload = {
  gymId: string
  cachedAt: number
  members: MemberRow[]
}

function readMembersCache(gymId: string): MembersCachePayload | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.sessionStorage.getItem(`${MEMBERS_CACHE_PREFIX}${gymId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as MembersCachePayload
    if (!parsed || parsed.gymId !== gymId || !Array.isArray(parsed.members)) return null
    return parsed
  } catch {
    return null
  }
}

function writeMembersCache(gymId: string, members: MemberRow[]) {
  if (typeof window === "undefined") return
  const payload: MembersCachePayload = {
    gymId,
    cachedAt: Date.now(),
    members,
  }
  try {
    window.sessionStorage.setItem(`${MEMBERS_CACHE_PREFIX}${gymId}`, JSON.stringify(payload))
  } catch {
    // Ignore storage failures in restricted/private environments.
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    promise
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch((error) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}

export default function MembersPage() {
  const supabase = useMemo(() => createClient(), [])
  const { profile } = useAuth()
  const [members, setMembers] = useState<MemberRow[]>([])
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [selectedPayments, setSelectedPayments] = useState<PaymentRow[]>([])
  const [renewOpen, setRenewOpen] = useState(false)
  const [renewMember, setRenewMember] = useState<MemberRow | null>(null)
  const [renewPlans, setRenewPlans] = useState<PlanOption[]>([])
  const [renewPlanId, setRenewPlanId] = useState("")
  const [renewPaymentMethod, setRenewPaymentMethod] = useState<"cash" | "gcash">("cash")
  const [renewLoading, setRenewLoading] = useState(false)
  const [onboardOpen, setOnboardOpen] = useState(false)
  const plansCacheRef = useRef<{ gymId: string; cachedAt: number; plans: PlanOption[] } | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const getActivePlans = useCallback(async (forceRefresh = false): Promise<PlanOption[]> => {
    if (!profile?.gymId) return []

    const cached = plansCacheRef.current
    const isCachedValid =
      cached &&
      cached.gymId === profile.gymId &&
      Date.now() - cached.cachedAt < PLANS_CACHE_TTL_MS

    if (!forceRefresh && isCachedValid) {
      return cached.plans
    }

    const query = supabase
      .from("membership_plans")
      .select("id, name, price, duration_days")
      .eq("gym_id", profile.gymId)
      .eq("is_active", true)
      .order("price")

    const { data, error } = await query

    if (error) {
      throw new Error(error.message)
    }

    const plans = (data ?? []) as PlanOption[]
    plansCacheRef.current = {
      gymId: profile.gymId,
      cachedAt: Date.now(),
      plans,
    }
    return plans
  }, [profile?.gymId, supabase])

  const fetchMembers = useCallback(async (forceRefresh = false) => {
    if (!profile?.gymId) {
      setMembers([])
      setIsLoading(false)
      return
    }

    let usedCachedSnapshot = false
    if (!forceRefresh) {
      const cached = readMembersCache(profile.gymId)
      if (cached) {
        setMembers(cached.members)
        setIsLoading(false)
        usedCachedSnapshot = true
        if (Date.now() - cached.cachedAt < MEMBERS_CACHE_TTL_MS) {
          return
        }
      }
    }

    try {
      const memberQueries = Promise.all([
        supabase
          .from("gym_users")
          .select("user_id, status, profiles!gym_users_user_id_fkey(id, name, email, contact_number, created_at)")
          .eq("role", "member")
          .eq("gym_id", profile.gymId),
        supabase
          .from("memberships")
          .select("id, member_id, start_date, end_date, status, amount_paid, payment_method, created_at, membership_plans!memberships_plan_id_fkey(name)")
          .eq("gym_id", profile.gymId)
          .order("created_at", { ascending: false }),
      ])

      const [{ data: profilesData }, { data: membershipsData }] = await withTimeout(
        memberQueries,
        15000,
        "Loading members timed out",
      )

      const membershipMap = new Map<string, (typeof membershipsData extends (infer T)[] | null ? T : never)>()
      for (const m of membershipsData ?? []) {
        if (!m.member_id) continue
        if (!membershipMap.has(m.member_id)) membershipMap.set(m.member_id, m)
      }

      const nextMembers: MemberRow[] = (profilesData ?? []).flatMap((gymUser) => {
          const p = gymUser.profiles as unknown as { id: string; name: string; email: string; contact_number: string | null; created_at: string | null } | null
          if (!p) return []
          const m = membershipMap.get(p.id)
          return {
            profile_id: p.id,
            name: p.name,
            email: p.email,
            contact_number: p.contact_number,
            profile_status: gymUser.status === "pending" ? "pending" : gymUser.status === "rejected" ? "rejected" : "active",
            membership_id: m?.id ?? null,
            plan_name: m ? ((m.membership_plans as unknown as { name: string })?.name ?? "Unknown") : null,
            start_date: m?.start_date ?? null,
            end_date: m?.end_date ?? null,
            membership_status: m?.status ?? null,
            created_at: p.created_at,
          } satisfies MemberRow
        })

      setMembers(nextMembers)
      writeMembersCache(profile.gymId, nextMembers)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown members load error"
      if (!usedCachedSnapshot) {
        toast.error(`Failed to load members: ${message}`)
        setMembers([])
      }
    } finally {
      setIsLoading(false)
    }
  }, [profile?.gymId, supabase])

  useEffect(() => { void fetchMembers(false) }, [fetchMembers])

  async function fetchPayments(memberId: string) {
    const { data } = await supabase
      .from("memberships")
      .select("id, amount_paid, payment_method, created_at, membership_plans!memberships_plan_id_fkey(name)")
      .eq("member_id", memberId)
      .order("created_at", { ascending: false })
    setSelectedPayments(
      (data ?? []).map((p) => ({
        id: p.id,
        amount_paid: p.amount_paid,
        payment_method: p.payment_method,
        created_at: p.created_at,
        plan_name: (p.membership_plans as unknown as { name: string })?.name ?? "Unknown",
      }))
    )
  }

  const filtered = useMemo(() => {
    let list = [...members]
    if (statusFilter === "verification") list = list.filter((m) => m.profile_status === "pending")
    else if (statusFilter === "banned") list = list.filter((m) => m.profile_status === "rejected")
    else if (statusFilter === "no_plan") list = list.filter((m) => m.membership_status === null)
    else if (statusFilter !== "all") list = list.filter((m) => m.membership_status === statusFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q) ||
          (m.contact_number && m.contact_number.includes(q))
      )
    }
    return list.sort((a, b) => a.name.localeCompare(b.name))
  }, [members, statusFilter, search])

  const selectedMember = members.find((m) => m.profile_id === selectedMemberId)

  async function handleStatusChange(membershipId: string, status: "active" | "frozen") {
    const { error } = await supabase.from("memberships").update({ status }).eq("id", membershipId)
    if (error) { toast.error("Failed to update status"); return }
    toast.success(status === "frozen" ? "Membership frozen." : "Membership activated.")
    void fetchMembers(true)
  }

  async function handleProfileStatusChange(memberId: string, status: "active" | "rejected") {
    const { error } = await supabase.from("gym_users").update({ status }).eq("gym_id", profile!.gymId!).eq("user_id", memberId)
    if (error) {
      toast.error(status === "rejected" ? "Failed to ban member" : "Failed to unban member")
      return
    }
    toast.success(status === "rejected" ? "Member has been banned." : "Member has been unbanned.")
    void fetchMembers(true)
  }

  async function confirmMembershipVerification(memberId: string) {
    if (!profile?.gymId) return
    const { error } = await supabase.rpc("confirm_membership_verification", {
      p_gym_id: profile.gymId,
      p_user_id: memberId,
    })
    if (error) {
      toast.error("Could not confirm this membership.")
      return
    }
    toast.success("Membership confirmed. The member now has gym access.")
    void fetchMembers(true)
  }

  async function openRenewDialog(member: MemberRow) {
    setRenewMember(member)
    setRenewPaymentMethod("cash")
    setRenewPlans([])
    setRenewPlanId("")
    setRenewOpen(true)
    try {
      const plans = await getActivePlans(false)
      setRenewPlans(plans)
      setRenewPlanId(plans[0]?.id ?? "")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load plans"
      toast.error(message)
    }
  }

  async function handleRenewMembership() {
    if (!renewMember) return
    const plan = renewPlans.find((p) => p.id === renewPlanId)
    if (!plan) { toast.error("Please select a membership plan"); return }

    setRenewLoading(true)
    const startDate = new Date()
    const endDate = new Date()
    endDate.setDate(endDate.getDate() + plan.duration_days)
    const startDateValue = startDate.toISOString().split("T")[0]

    const { error: insertError } = await supabase.from("memberships").insert({
      member_id: renewMember.profile_id,
      plan_id: plan.id,
      start_date: startDateValue,
      end_date: endDate.toISOString().split("T")[0],
      status: "active",
      payment_method: renewPaymentMethod,
      amount_paid: plan.price,
      gym_id: profile?.gymId ?? null,
    })

    if (insertError) { toast.error("Failed to renew: " + insertError.message); setRenewLoading(false); return }

    await supabase
      .from("memberships")
      .update({ status: "expired" })
      .eq("member_id", renewMember.profile_id)
      .eq("status", "active")
      .neq("start_date", startDateValue)

    toast.success(renewMember.name + " renewed successfully!")
    setRenewLoading(false)
    setRenewOpen(false)
    setRenewMember(null)
    setRenewPlans([])
    setRenewPlanId("")
    setRenewPaymentMethod("cash")
    void fetchMembers(true)
  }

  const expiredMembers = members.filter((m) => m.profile_status === "active" && m.membership_status === "expired")

  if (isLoading) {
    return <LoadingSkeleton rows={6} h={68} />
  }

  return (
    <div className="space-y-6" style={{ backgroundColor: A.bg }}>
      <PageHeader
        title="Members"
        subtitle={`${members.length} member account${members.length !== 1 ? "s" : ""}`}
        action={
          <PrimaryBtn onClick={() => setOnboardOpen(true)}>
            <UserPlus className="h-4 w-4" />
            Add member
          </PrimaryBtn>
        }
      />

      {expiredMembers.length > 0 && (
        <div
          className="flex items-center gap-3 rounded-lg p-4"
          style={{ backgroundColor: "var(--admin-expired-bg)", border: "1px solid var(--admin-expired-border)" }}
        >
          <AlertTriangle className="h-5 w-5 shrink-0" style={{ color: "var(--admin-expired-text)" }} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium" style={{ color: "var(--admin-expired-text)" }}>
              {expiredMembers.length} expired membership{expiredMembers.length > 1 ? "s" : ""}
            </p>
            <p className="text-xs truncate" style={{ color: A.text2 }}>
              {expiredMembers.map((m) => m.name).join(", ")}
            </p>
          </div>
          <GhostBtn onClick={() => setStatusFilter("expired")} color="var(--admin-expired-text)">View</GhostBtn>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by name, email, or contact..." />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg px-3 py-2 text-sm outline-none"
          style={{ backgroundColor: A.surface2, border: `1px solid ${A.border}`, color: A.text, minWidth: 170 }}
        >
          <option value="all">All Members</option>
          <option value="verification">Membership Verification</option>
          <option value="active">Active Plan</option>
          <option value="expired">Expired</option>
          <option value="frozen">Frozen</option>
          <option value="banned">Banned</option>
          <option value="no_plan">No Plan</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Users size={40} />}
          title="No members found"
          subtitle="Try adjusting your search or status filter"
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((m) => (
            <ACard key={m.profile_id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <Avatar name={m.name} size={9} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedMemberId(m.profile_id)
                          fetchPayments(m.profile_id)
                          setDetailOpen(true)
                        }}
                        className="font-medium hover:underline text-sm text-left"
                        style={{ color: A.primary }}
                      >
                        {m.name}
                      </button>
                      {m.profile_status === "rejected" && (
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{ backgroundColor: "var(--admin-expired-bg)", color: "var(--admin-expired-text)", border: "1px solid var(--admin-expired-border)" }}
                        >
                          Banned
                        </span>
                      )}
                      {m.profile_status === "pending" && (
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{ backgroundColor: "var(--color-warning-bg)", color: "var(--color-warning)", border: "1px solid var(--color-warning)" }}
                        >
                          Verify membership
                        </span>
                      )}
                      <StatusPill status={m.membership_status} />
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: A.muted }}>
                      {m.contact_number ?? m.email}
                      {m.plan_name && ` · ${m.plan_name}`}
                      {m.end_date && ` · Exp ${m.end_date}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0 ml-3">
                  {m.profile_status === "pending" ? (
                    <PrimaryBtn onClick={() => confirmMembershipVerification(m.profile_id)}>
                      Verify membership
                    </PrimaryBtn>
                  ) : (
                    <GhostBtn onClick={() => openRenewDialog(m)} color={A.primary} disabled={m.profile_status === "rejected"}>
                      Renew
                    </GhostBtn>
                  )}
                  {m.membership_id && m.membership_status === "active" && m.profile_status !== "rejected" && (
                    <GhostBtn onClick={() => handleStatusChange(m.membership_id!, "frozen")} color="var(--admin-frozen-text)">
                      <Snowflake className="h-3 w-3" />
                      Freeze
                    </GhostBtn>
                  )}
                  {m.membership_id && (m.membership_status === "frozen" || m.membership_status === "expired") && m.profile_status !== "rejected" && (
                    <GhostBtn onClick={() => handleStatusChange(m.membership_id!, "active")} color="var(--admin-active-text)">
                      <Play className="h-3 w-3" />
                      Activate
                    </GhostBtn>
                  )}
                  {m.profile_status === "pending" ? null : m.profile_status === "rejected" ? (
                    <GhostBtn onClick={() => handleProfileStatusChange(m.profile_id, "active")} color="var(--admin-active-text)">
                      Unban
                    </GhostBtn>
                  ) : (
                    <GhostBtn onClick={() => handleProfileStatusChange(m.profile_id, "rejected")} color="var(--admin-expired-text)">
                      Ban
                    </GhostBtn>
                  )}
                </div>
              </div>
            </ACard>
          ))}
        </div>
      )}

      <p className="text-xs" style={{ color: A.muted }}>Showing {filtered.length} of {members.length} members</p>

      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={selectedMember?.name ?? "Member Details"}
        width={560}
      >
        {selectedMember && (
          <div className="space-y-4">
            <div
              className="grid grid-cols-2 gap-3 rounded-xl p-4 text-sm"
              style={{ backgroundColor: A.surface2, border: `1px solid ${A.border}` }}
            >
              <div><p style={{ color: A.muted }}>Email</p><p style={{ color: A.text }}>{selectedMember.email}</p></div>
              <div><p style={{ color: A.muted }}>Contact</p><p style={{ color: A.text }}>{selectedMember.contact_number ?? "N/A"}</p></div>
              <div><p style={{ color: A.muted }}>Plan</p><p style={{ color: A.text }}>{selectedMember.plan_name ?? "No plan"}</p></div>
              <div><p style={{ color: A.muted }}>Status</p><StatusPill status={selectedMember.membership_status} /></div>
              <div><p style={{ color: A.muted }}>Start</p><p style={{ color: A.text }}>{selectedMember.start_date ?? "-"}</p></div>
              <div><p style={{ color: A.muted }}>End</p><p style={{ color: A.text }}>{selectedMember.end_date ?? "-"}</p></div>
              <div><p style={{ color: A.muted }}>Member Since</p><p style={{ color: A.text }}>{selectedMember.created_at ? selectedMember.created_at.split("T")[0] : "-"}</p></div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium" style={{ color: A.muted }}>Payment History</p>
              {selectedPayments.length === 0 ? (
                <p className="text-xs" style={{ color: A.muted }}>No payments recorded.</p>
              ) : (
                <div className="max-h-48 space-y-2 overflow-y-auto">
                  {selectedPayments.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-lg px-3 py-2 text-xs"
                      style={{ backgroundColor: A.surface2, border: `1px solid ${A.border}` }}
                    >
                      <span style={{ color: A.text }}>{p.plan_name}</span>
                      <span className="flex items-center gap-2">
                        <span
                          className="rounded-full px-2 py-0.5"
                          style={{
                            backgroundColor: p.payment_method === "gcash" ? "#EFF6FF" : "#ECFDF3",
                            color: p.payment_method === "gcash" ? "#2563EB" : "#16A34A",
                            border: `1px solid ${p.payment_method === "gcash" ? "#BFDBFE" : "#BBF7D0"}`,
                          }}
                        >
                          {p.payment_method}
                        </span>
                        <span className="font-semibold" style={{ color: A.text }}>₱{p.amount_paid.toLocaleString()}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={renewOpen}
        onClose={() => {
          setRenewOpen(false)
          setRenewLoading(false)
          setRenewMember(null)
        }}
        title="Renew Membership"
        width={620}
      >
        {renewMember && (
          <div className="space-y-5">
            <SummaryBox
              rows={[
                { label: "Member", value: renewMember.name },
                { label: "Current Plan", value: renewMember.plan_name ?? "No plan" },
                { label: "Expiry", value: renewMember.end_date ?? "-" },
              ]}
            />

            <ChoicePicker
              label="Membership Plan"
              value={renewPlanId}
              onChange={setRenewPlanId}
              options={renewPlans.map((plan) => ({
                value: plan.id,
                label: plan.name,
                sub: `${plan.duration_days} days`,
                right: `₱${plan.price.toLocaleString()}`,
              }))}
            />

            <ChoicePicker
              label="Payment Method"
              value={renewPaymentMethod}
              onChange={(v: "cash" | "gcash") => setRenewPaymentMethod(v)}
              options={[
                { value: "cash", label: "Cash" },
                { value: "gcash", label: "GCash" },
              ]}
            />

            {renewPlanId && (
              <SummaryBox
                rows={[
                  { label: "Selected Plan", value: renewPlans.find((p) => p.id === renewPlanId)?.name ?? "-" },
                  { label: "Method", value: renewPaymentMethod === "cash" ? "Cash" : "GCash" },
                  { label: "Amount", value: `₱${(renewPlans.find((p) => p.id === renewPlanId)?.price ?? 0).toLocaleString()}` },
                ]}
              />
            )}

            <PrimaryBtn
              onClick={handleRenewMembership}
              disabled={renewLoading || !renewPlanId || renewPlans.length === 0}
            >
              {renewLoading ? "Renewing..." : "Renew and Record Payment"}
            </PrimaryBtn>
          </div>
        )}
      </Modal>

      <OnboardMemberModal
        open={onboardOpen}
        onClose={() => setOnboardOpen(false)}
        onSuccess={() => void fetchMembers(true)}
      />
    </div>
  )
}
