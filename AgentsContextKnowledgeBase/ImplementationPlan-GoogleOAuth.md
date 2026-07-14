# Google OAuth

**Status:** In progress - hosted provider is verified; app deployment and real-browser session verification remain.
**Branch:** `codex/auth-google-oauth`
**Depends on:** Unified Accounts migrations 019-021 and the existing `/auth/callback` PKCE exchange.

## Contract

Google is a second sign-in method for the existing global Stren account. It does not create a per-gym identity, change the `gym_users` access model, bypass membership verification, or add a database migration.

- Both panels of `/auth` show one working **Continue with Google** control. It starts `signInWithOAuth({ provider: 'google' })` through the browser Supabase client.
- The browser supplies `/auth/callback?flow=google` as the PKCE `redirectTo` URL. A legacy gym entry also preserves its gym code; the existing post-auth resolver still decides access and can never grant a gym from that code alone.
- The shared callback exchanges the authorization code into the server cookie session, then uses the existing membership-aware resolver. A cancelled or failed provider round trip returns to `/auth` with calm, non-technical copy and never puts provider detail in the URL.
- A new Google identity reaches the existing `handle_new_user` trigger, which creates the normal global profile. Existing access remains entirely controlled by `gym_users`, RLS, and the active-gym resolver.
- Supabase automatically links a verified Google identity with the same email to the existing global account. The real-browser check covers a confirmed email/password account so its gym access is retained rather than duplicated.
- The flow disables competing auth controls while launch is in progress and returns to an interactive Google button if Supabase cannot begin the redirect.

## Hosted configuration

The linked hosted project now reports `external.google = true`. Its Google client secret remains only in Supabase Auth and is not present in this repository or its environment.

Before enabling the release, create or obtain a Google **Web application** OAuth client. Its Google Cloud configuration must include:

- authorized JavaScript origin: `https://stren.netlify.app`;
- authorized redirect URI: `https://<SUPABASE_PROJECT_ID>.supabase.co/auth/v1/callback` (the Supabase callback, not the Stren app callback);
- for local testing: origin `http://127.0.0.1:3000` and redirect URI `http://127.0.0.1:54321/auth/v1/callback`.

Then, with `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`, `GOOGLE_OAUTH_CLIENT_ID`, and `GOOGLE_OAUTH_CLIENT_SECRET` set only in a secure shell or deployment secret store, PATCH the Management API with:

```json
{
  "external_google_enabled": true,
  "external_google_client_id": "<Google web client ID>",
  "external_google_secret": "<Google web client secret>"
}
```

Never use `supabase config push` for production: local `supabase/config.toml` deliberately has localhost redirect URLs. Local Supabase reads `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET` from the root `.env`; committed examples contain placeholders only.

## Verification

- `tests/integration/unified-auth-page.test.tsx` pins Google provider selection, PKCE callback construction, preserved gym code, and recoverable launch errors.
- `tests/integration/password-reset-callback.test.ts` pins callback cancellation/provider-failure handling without exposing provider details.
- `tests/unit/deployment-contract.test.ts` pins a failing deployment contract when `settings.external.google` is not true.
- `npm run verify:deployment` must pass after the Management API update; it now verifies email confirmation, Google OAuth, and the existing unified-account/membership-verification contract without logging credentials.
- Hosted verification completed on 2026-07-14: the deployment contract passes and the hosted authorization endpoint returns a 302 redirect to `accounts.google.com` for Stren's configured callback, without exposing credentials.
- Deploy this feature branch, then run one real browser Google sign-in for both a new account and a confirmed existing email/password account. Confirm the callback routes an account with no connected gym to `/gyms`, and an account with an active gym to its established surface. The current hosted app still serves the prior preview control, so it cannot exercise the new client code yet.
