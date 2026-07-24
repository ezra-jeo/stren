"use client"

import React from "react"
import Link from "next/link"
import { Shield } from "lucide-react"
import { AccessProvider } from "@/lib/access-context"
import styles from "./kiosk.module.css"

export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return (
    <AccessProvider><div className={styles.kioskApp}>
      <header className={styles.kioskHeader}>
        <Link href="/kiosk" className={styles.brandLink} aria-label="Stren Kiosk home">
          <span className={styles.brandMark} aria-hidden="true">
            <img src="/stren-logo.png" alt="" />
          </span>
          <span className={styles.brandName}>Stren Kiosk</span>
        </Link>
        <Link
          href="/admin"
          className={styles.adminLink}
        >
          <Shield size={17} aria-hidden="true" />
          Admin
        </Link>
      </header>
      <main className={styles.kioskMain}>{children}</main>
    </div></AccessProvider>
  )
}
