// lib/admin-ui.tsx
"use client"

import React from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

export const A = {
  bg:          "hsl(var(--admin-bg))",
  surface:     "hsl(var(--admin-surface))",
  surface2:    "hsl(var(--admin-surface-2))",
  border:      "hsl(var(--admin-border))",
  borderFocus: "hsl(var(--admin-border-focus))",
  text:        "hsl(var(--admin-text))",
  text2:       "hsl(var(--admin-text-2))",
  muted:       "hsl(var(--admin-text-muted))",
  primary:     "hsl(var(--primary))",
  primaryGlow: "hsl(var(--primary-glow))",
  primaryDark: "hsl(var(--primary-dark))",
  danger:      "hsl(var(--destructive))",
} as const

export function statusStyle(s: string | null): React.CSSProperties {
  if (s === "active")  return { backgroundColor: "hsl(var(--admin-active-bg))",  color: "hsl(var(--admin-active-text))",  border: "1px solid hsl(var(--admin-active-border))"  }
  if (s === "expired") return { backgroundColor: "hsl(var(--admin-expired-bg))", color: "hsl(var(--admin-expired-text))", border: "1px solid hsl(var(--admin-expired-border))" }
  if (s === "frozen")  return { backgroundColor: "hsl(var(--admin-frozen-bg))",  color: "hsl(var(--admin-frozen-text))",  border: "1px solid hsl(var(--admin-frozen-border))"  }
  return               { backgroundColor: "hsl(var(--admin-noplan-bg))",  color: "hsl(var(--admin-noplan-text))",  border: "1px solid hsl(var(--admin-noplan-border))"  }
}

export function StatusPill({ status }: { status: string | null }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize" style={statusStyle(status)}>
      {status ?? "no plan"}
    </span>
  )
}

export function Avatar({ name, size = 9 }: { name: string; size?: number }) {
  const px = size * 4
  return (
    <div className="rounded-full flex items-center justify-center font-bold shrink-0"
      style={{ width: px, height: px, backgroundColor: "hsl(var(--primary-glow))", color: "hsl(var(--primary))", fontSize: size <= 8 ? 12 : 14 }}>
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-lg font-semibold" style={{ color: "hsl(var(--admin-text))" }}>{title}</h2>
        {subtitle && <p className="text-sm mt-0.5" style={{ color: "hsl(var(--admin-text-2))" }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function ACard({ children, className = "", style }: { children?: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`rounded-xl ${className}`} style={{ backgroundColor: "hsl(var(--admin-surface))", border: "1px solid hsl(var(--admin-border))", ...style }}>
      {children}
    </div>
  )
}

export function PrimaryBtn({ children, onClick, disabled, type = "button", size = "md" }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit"; size?: "sm" | "md"
}) {
  return (
    <Button type={type} onClick={onClick} disabled={disabled} variant="admin" size={size === "sm" ? "sm" : "default"}>
      {children}
    </Button>
  )
}

export function GhostBtn({ children, onClick, color, disabled }: { children: React.ReactNode; onClick?: () => void; color?: string; disabled?: boolean }) {
  return (
    <Button type="button" onClick={onClick} disabled={disabled} variant="ghost" size="sm" style={color ? { color } : undefined}>
      {children}
    </Button>
  )
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "hsl(var(--admin-text-muted))" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? "Search..."}
        className="w-full pl-9 pr-3 py-2 text-sm rounded-lg outline-none transition-all"
        style={{ backgroundColor: "hsl(var(--admin-surface-2))", border: "1px solid hsl(var(--admin-border))", color: "hsl(var(--admin-text))" }} />
    </div>
  )
}

export function Modal({ open, onClose, title, children, width = 480 }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode; width?: number
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "hsl(0 0% 0% / 0.4)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
        style={{ backgroundColor: "hsl(var(--admin-surface))", maxWidth: width }}>
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: "1px solid hsl(var(--admin-border))" }}>
          <h3 className="text-base font-semibold" style={{ color: "hsl(var(--admin-text))" }}>{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 transition-colors hover:bg-black/5" style={{ color: "hsl(var(--admin-text-muted))" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  )
}

export function ChoicePicker<T extends string>({ label, value, onChange, options }: {
  label?: string; value: T; onChange: (v: T) => void
  options: { value: T; label: string; sub?: string; right?: string }[]
}) {
  return (
    <div>
      {label && <label className="block text-sm font-medium mb-2" style={{ color: "hsl(var(--admin-text-2))" }}>{label}</label>}
      <div className="space-y-2">
        {options.map((opt) => {
          const selected = value === opt.value
          return (
            <button key={opt.value} type="button" onClick={() => onChange(opt.value)}
              className="w-full flex items-center justify-between rounded-xl px-4 py-3 text-left transition-all"
              style={{ backgroundColor: selected ? "hsl(24 57% 63% / 0.07)" : "hsl(var(--admin-surface-2))", border: selected ? "1.5px solid hsl(var(--primary))" : "1px solid hsl(var(--admin-border))" }}>
              <div>
                <p className="text-sm font-medium" style={{ color: "hsl(var(--admin-text))" }}>{opt.label}</p>
                {opt.sub && <p className="text-xs mt-0.5" style={{ color: "hsl(var(--admin-text-muted))" }}>{opt.sub}</p>}
              </div>
              <div className="flex items-center gap-2 ml-3 shrink-0">
                {opt.right && <span className="text-sm font-bold" style={{ color: selected ? "hsl(var(--primary))" : "hsl(var(--admin-text))" }}>{opt.right}</span>}
                {selected && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-4 w-4" style={{ color: "hsl(var(--primary))" }}>
                    <path d="M20 6 9 17l-5-5"/>
                  </svg>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function LoadingSkeleton({ rows = 3, h = 16 }: { rows?: number; h?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-xl animate-pulse" style={{ height: h, backgroundColor: "hsl(var(--admin-surface-2))" }} />
      ))}
    </div>
  )
}

export function EmptyState({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4" style={{ color: "hsl(var(--admin-text-muted))" }}>{icon}</div>
      <p className="text-base font-medium" style={{ color: "hsl(var(--admin-text-2))" }}>{title}</p>
      {subtitle && <p className="text-sm mt-1" style={{ color: "hsl(var(--admin-text-muted))" }}>{subtitle}</p>}
    </div>
  )
}

export function SummaryBox({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <div className="rounded-xl px-4 py-3 space-y-1.5" style={{ backgroundColor: "hsl(var(--admin-surface-2))", border: "1px solid hsl(var(--admin-border))" }}>
      {rows.map((r, i) => (
        <div key={i} className="flex justify-between text-sm">
          <span style={{ color: "hsl(var(--admin-text-muted))" }}>{r.label}</span>
          <span className="font-medium" style={{ color: "hsl(var(--admin-text))" }}>{r.value}</span>
        </div>
      ))}
    </div>
  )
}

export function Spinner() {
  return <Loader2 className="h-5 w-5 animate-spin" style={{ color: "hsl(var(--primary))" }} />
}