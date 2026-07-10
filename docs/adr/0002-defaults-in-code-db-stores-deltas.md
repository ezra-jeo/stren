# Defaults live in code catalogs; the database stores only deltas

Feature-toggle defaults live in the TypeScript catalog (`lib/features.ts`) and are mirrored inside the SQL helper `gym_feature_enabled()`; the `gym_feature_settings` table stores only per-gym deviations (missing row or missing key ⇒ default). Permission defaults likewise live in `lib/permissions.ts`, seeded into `gym_role_permission_defaults`, with `gym_user_permission_overrides` storing only per-user deviations.

Chosen over materializing a full row per gym/user because it makes rollout safe with **zero backfill** — every existing gym and user keeps current behavior the moment the migration lands — and adding a future feature key is a code change, not a data migration.

## Consequences

- The TS and SQL copies of the defaults can drift; a checked-in fixture (`tests/fixtures/role-permission-defaults.json`) plus a CI parity test is mandatory, not optional.
- The permission-defaults table doubles as the canonical key registry (an `owner` row exists for every key), which is what enables the loud unknown-key error for non-owners.
