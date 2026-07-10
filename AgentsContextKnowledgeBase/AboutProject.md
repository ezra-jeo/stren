# About Stren

_This document is the project's memory of what it is and why. Agents propose edits; only the user approves changes to mission/north-star wording._

## What Stren is

Stren is a **multi-tenant gym management platform** for small, independent gyms (initial market: the Philippines — cash and GCash are the payment methods that matter). Each gym gets, out of the box:

- an **admin panel** (`/admin`) — members, payments, plans, promos, announcements, reports, dashboard
- a **member portal** (`/member`) — home, activity feed, leaderboard, profile/QR, settings
- a **front-desk kiosk** (`/kiosk`) — QR check-in/out terminal
- a **public gym page** (`/gym/{code}`) — a polished landing page with contact/pricing/locate subpages, customized by the owner through the Gym Page Studio

Stack: Next.js App Router + Supabase (Postgres/RLS/Auth) + TypeScript. Conventions live in `CLAUDE.md`; vocabulary in `CONTEXT.md`.

## Mission

Give small gym owners the operations software **and** the professional public presence of a big chain — without needing a manager, a designer, or a manual.

## North star

> **A non-technical, ~40-year-old gym owner can run their entire gym and look professional online without ever feeling like they're "using software."**

Every product decision gets tested against this sentence. If a feature needs explaining, it's not done. If it exposes a technical term to an owner, it's wrong.

## Who we build for (priority order)

1. **The owner** — ~40 years old, runs the gym personally, not a power user. Wants things to work, look good, and stay simple. Explicitly confirmed product stance: *simplicity beats power and beats least-privilege purity* (see `docs/adr/0003`).
2. **Admins & staff** — front-desk operators. Admins run day-to-day operations (finance visible by default); staff do check-ins and member lookup.
3. **Members** — check in, see their streaks/feed/leaderboard, feel part of the gym.

## Product principles

1. **Simplicity is the top priority** (user-stated). One obvious action per screen; flat lists over hierarchies; fewer options over more.
2. **Plain language, always.** Owners never see keys like `leaderboards` or `gym_page:edit` — only labels like "Show leaderboard to members."
3. **Guided, never freeform.** The public page layout is Stren's; owners choose content (photos, copy, colors, visibility). No drag-and-drop builder — that's the point, they can't break it.
4. **Enforcement lives in the database.** UI hiding is a courtesy; RLS/RPC checks are the truth (see `docs/adr/0001`).
5. **Preview-first editing.** Owners see the real public output while they edit, on desktop and phone.
6. **Tease the roadmap.** Coming-soon features appear (owner-facing only) as disabled rows: currently Trainer bookings, Friends & Chat, Workout routines, Posts.

## What Stren is NOT

- Not a website builder (no fonts, spacing, or layout controls — ever)
- Not an enterprise ERP (no departments, approval chains, or role editors)
- Not a social network (feed/leaderboard are gym-community perks, not the product)
