# Stren

Multi-tenant gym management platform. Each gym gets a staff-side admin panel, a member portal, a front-desk kiosk, and a public landing page — all scoped per gym.

## Language

### Access control

**Permission**:
A per-user capability answering "can this user perform this action?" Identified by a namespaced key (e.g. `payments:create`).
_Avoid_: right, privilege, ability

**Role**:
One of `owner`, `admin`, `staff`, `member` — a user's base position that determines their default permissions. Owner always has every permission.
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
