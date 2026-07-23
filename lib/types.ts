// ============================================
// Original types (kept for backward compatibility)
// ============================================

export type MembershipPlanId = "monthly" | "weekly" | "walkin"

export interface MembershipPlan {
  id: MembershipPlanId
  name: string
  price: number
  durationDays: number
}

export type MemberStatus = "active" | "expired" | "frozen"
export type PaymentMethod = "cash" | "gcash"

export interface Member {
  id: string
  name: string
  contactNumber: string
  membershipPlanId: MembershipPlanId
  startDate: string // ISO date
  endDate: string // ISO date
  status: MemberStatus
  createdAt: string // ISO date
}

export interface Payment {
  id: string
  memberId: string
  amount: number
  method: PaymentMethod
  description: string
  date: string // ISO date
}

export interface CheckIn {
  id: string
  memberId: string
  checkInTime: string // ISO datetime
  checkOutTime: string | null // ISO datetime or null if still checked in
}

// ============================================
// Engagement types (GymPulse pivot)
// ============================================

export type GymUserRole = "member" | "admin" | "staff" | "owner"
export type GymUserStatus =
  | "pending"
  | "active"
  | "rejected"
  | "disabled"
  | "withdrawn"
  | "expired"
  | "banned"
export type UserRole = GymUserRole
export type ProfileStatus = GymUserStatus

export interface Gym {
  id: string
  name: string
  code: string
  address: string | null
  phone: string | null
  createdAt: string
}

export interface AccountProfile {
  id: string
  email: string
  name: string
  contactNumber: string | null
  avatarUrl: string | null
  avatarUpdatedAt: string | null
  avatarChangeLockedUntil: string | null
  avatarChangeCount: number
  qrCode: string
  createdAt: string
}

export interface MyGym {
  gymId: string
  code: string
  name: string
  logoUrl: string | null
  role: GymUserRole
  status: GymUserStatus
}

/** A public gym the signed-in account bookmarked. Saving never grants access. */
export interface SavedGym {
  gymId: string
  code: string
  name: string
  address: string | null
  logoUrl: string | null
  savedAt: string
}

/** Calm account-facing view of a pending membership record. */
export interface MembershipVerification {
  gymId: string
  code: string
  name: string
  address: string | null
  logoUrl: string | null
  status: Extract<
    GymUserStatus,
    "pending" | "rejected" | "withdrawn" | "expired"
  >
  submittedAt: string
  lastRemindedAt: string | null
  nextReminderAt: string | null
  canRemind: boolean
}

export interface Membership {
  id: string
  memberId: string
  planId: string
  startDate: string
  endDate: string
  status: MemberStatus
  paymentMethod: PaymentMethod
  amountPaid: number
  createdAt: string
}

export interface Attendance {
  id: string
  memberId: string
  checkIn: string
  checkOut: string | null
  durationMin: number | null
}

export interface Streak {
  id: string
  memberId: string
  currentStreak: number
  bestStreak: number
  lastVisitDate: string | null
}

export type FeedItemType = "check_in" | "check_out" | "announcement" | "streak_milestone"

export interface FeedItem {
  id: string
  memberId: string
  type: FeedItemType
  title: string
  description: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
  // Joined data (optional, populated by queries)
  memberName?: string
  memberAvatar?: string | null
}

export interface Announcement {
  id: string
  title: string
  body: string
  createdBy: string
  createdAt: string
}

// ============================================
// Engagement Stats (derived, for UI)
// ============================================

export interface MemberStats {
  totalVisits: number
  monthlyVisits: number
  currentStreak: number
  bestStreak: number
  avgSessionMinutes: number
  leaderboardRank: number | null
}

export interface LeaderboardEntry {
  memberId: string
  memberName: string
  avatarUrl: string | null
  value: number // visits, minutes, or streak count
  rank: number
}
