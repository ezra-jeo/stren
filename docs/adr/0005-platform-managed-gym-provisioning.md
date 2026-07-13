# ADR 0005: Gym organizations are provisioned by Stren

Date: 2026-07-13

## Context

Unified Accounts originally let any authenticated account call `create_gym` and become owner. That made organization creation a self-serve product action, exposed a public `/gyms/new` form, and produced the captured PostgREST schema-cache failure when the UI and deployed migration state diverged.

Stren now promises assisted setup: the team configures the workspace, imports member records, and assigns staff access correctly before an owner begins using it.

## Decision

Public users cannot create gym organizations. Public owner-oriented actions lead to `/for-gym-owners`, which submits an assisted-onboarding inquiry.

The database remains the enforcement boundary. `create_gym` requires authenticated server-controlled `app_metadata.platform_role = 'platform_admin'`; ordinary members, staff, admins, and gym owners are denied even if they call the RPC directly. Existing owners can manage only gyms already attached to their account through the established permission model.

## Consequences

- Old public creation URLs permanently redirect to the inquiry page.
- There is no public create action or client form to drift from the deployed RPC signature.
- Stren staff must assign `platform_role` through trusted admin tooling and apply migration 020 before provisioning.
- Provisioning is intentionally higher-touch; self-serve organization creation can return only through a new decision and database authorization design.

## Rejected alternatives

- **Hide the button only:** direct RPC calls would remain possible.
- **Allow gym owners to create more gyms:** ownership of one gym is not platform-level authority.
- **Refresh the PostgREST schema cache and keep self-serve creation:** treats the screenshot symptom while preserving the product and authorization mismatch.
