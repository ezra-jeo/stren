# Changelog

All notable changes to Stren are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)  
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

---

## [1.0.0] — 2026-06-08

### Added
- **Migration baseline** — `supabase/migrations/001_production_baseline.sql`: single idempotent file that reproduces the full production schema. Old draft migrations 001–004 archived.
- **Strict TypeScript** — `ignoreBuildErrors` flipped to `false`; all RPC Json casts typed explicitly.
- **Regenerated DB types** — `lib/database.types.ts` generated from live Supabase schema (not hand-maintained).
- **Performance** — Landing page images converted to WebP/WebM; chart components extracted; layout refactored.
- **Auth** — Improved logout routing; fixed cache-miss on new gyms.
- **Tests** — Integration and unit test coverage for gym auth flow, gym finder section, login-origin, and sign-out routing.
- **CLAUDE.md** — Developer guide: DB workflow rule, stack overview, migration structure, auth helpers, type safety conventions.
- **Versioning** — Semantic versioning, CHANGELOG, and auto-release GitHub Actions workflow.

### Changed
- `next.config.mjs`: `typescript.ignoreBuildErrors` → `false`.
- `lib/gym-public.ts`: exported `GymPublicData` type; fixed spread type error on RPC result.
- `app/admin/page.tsx`: fixed `admin_dashboard_stats` Json cast; fetch `kiosk_get_checked_in` separately.
- `app/admin/reports/page.tsx`: fixed `admin_reports_data` Json cast.
- `app/member/page.tsx`: fixed `member_home_stats` Json cast.
- `app/signup/member/page.tsx`: fixed `get_gym_by_code` Json cast.

### Fixed
- Removed spurious UTF-16 `database.types.ts` from repo root (broke ESLint).
- Removed committed binaries (`repomix-output.xml`, `b_*.zip`) from `.gitignore`.

---

## [0.1.0] — Initial release

Initial multi-tenant gym management platform with member check-in, QR codes, attendance tracking, and gym public pages.
