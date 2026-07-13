# Stren

Multi-tenant gym management platform. Each gym gets a staff-side admin panel, a member portal, a front-desk kiosk, and a public landing page — all scoped per gym.

## Language

### Accounts & gyms

**Account**:
One global Stren identity — email + password, created once through `/auth?mode=signup`. People sign in to Stren, not to a gym; gyms attach to the account.
_Avoid_: user account per gym, login (as a noun), profile (that's the DB row)

**Gym user**:
One account's tie to one gym: a `gym_users` row holding that gym's role and status. An account has any number of them.
_Avoid_: membership (reserved for the billing subscription), affiliation, link

**Active gym**:
The one gym an account is currently operating in (`profiles.active_gym_id`, set only via `set_active_gym`). Every `/admin`, `/member`, and `/kiosk` surface reads it; all data access is pinned to it.
_Avoid_: current tenant, workspace, context

**Gym switcher**:
The shell control that swaps the active gym. Gyms switch — the account never does.
_Avoid_: account switcher

**Gym hub**:
The account's home at `/gyms`: active gyms with role/status, or a useful member home for an account that is not connected yet. It includes public gym discovery, saved gyms, and membership verification. Gym organizations are provisioned by Stren through assisted onboarding, never created here.
_Avoid_: gym select, gym picker, dashboard

**Membership verification**:
The process started when an account says “I’m already a member” at a gym. A verified existing member record connects immediately; otherwise the gym-user row stays pending while staff check the member record. The database may call the state `pending`, but member-facing copy is calm and factual.
_Avoid_: join request, application, approval request, pending review

**Saved gym**:
A public gym bookmarked by an account for later. Saving is independent of gym-user access and can never unlock private gym data.
_Avoid_: followed gym, joined gym

**Demo member dashboard**:
A clearly labeled, non-mutating preview made only from sample data. It shows what connection can unlock without representing the account or a real gym.
_Avoid_: personal mode, trial gym, real dashboard

**Lapsed member**:
A member whose gym-user row is active but whose subscription has expired. Sees the renewal lock screen (saved stats named, never deleted), can't check in, off the leaderboard until renewal.
_Avoid_: expired member (ambiguous with the subscription row), churned

### Access control

**Permission**:
A per-user capability answering "can this user perform this action?" Identified by a namespaced key (e.g. `payments:create`).
_Avoid_: right, privilege, ability

**Role**:
One of `owner`, `admin`, `staff`, `member` — an account's base position **at one gym** (lives on the gym-user row; the same account can hold different roles at different gyms). Determines default permissions; owner always has every permission.
_Avoid_: user type, level

**Manager**:
Any staff-side role (owner, admin, or staff). Matches the SQL helper `is_manager()`.
_Avoid_: admin (as an umbrella term — admin is one specific role)

**Override**:
A stored per-user grant or revocation of one permission in one gym. Beats the role default. Only owners create them.
_Avoid_: exception, custom permission

**Access switch**:
One plain-language toggle in People & access that writes overrides for one or more permissions at once (e.g. "Can record payments" covers `payments:create` + `payments:view`). The only way overrides are surfaced in the UI.
_Avoid_: permission toggle, grant

**People & access**:
The owner-only screen listing the gym's team, with the Access switches per admin.
_Avoid_: roles page, permissions page

### Features

**Feature toggle**:
A per-gym on/off answering "is this capability enabled for this gym?" Applies to everyone at the gym, including the owner. Distinct from and checked before permissions.
_Avoid_: feature flag, module

**Teaser**:
A coming-soon feature shown to owners in the Features panel with no switch and no functionality — display only.
_Avoid_: placeholder feature, upsell

### Gym page

**Public gym page**:
The anonymously visible gym landing page (`/gym/{code}`) and its subpages (contact, pricing, locate).
_Avoid_: landing page, microsite

**Gym Page Studio** (Studio):
The owner-facing, preview-first editor for the public gym page. Replaces the old long-form gym-profile page.
_Avoid_: gym profile, customization page, page builder

**Publish**:
Making the public gym page visible to anonymous visitors. A separate explicit action from Save; requires a tagline; owner-only.
_Avoid_: go live, activate

**Section visibility**:
An owner's choice to show or hide one home-page content block (amenities, hours, contact). Page content, not a feature toggle.
_Avoid_: section toggle (reserve "toggle" for features)

**Focal point**:
The stored point of interest on the cover photo (x/y percentages) that positions the crop on every device. Metadata only — never re-crops the image.
_Avoid_: crop, center point

**Essentials checklist**:
The five-item completion checklist in the Studio (cover, logo, tagline, contact info, join button).
_Avoid_: onboarding, setup wizard
