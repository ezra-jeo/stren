export const EXPECTED_DEPLOYMENT_SCHEMA = Object.freeze({
  migrations: [
    "000", "001", "005", "006", "007", "008", "009", "010", "011",
    "012", "013", "014", "015", "016", "017", "018", "019", "020",
    "021", "022", "023", "024", "025", "026",
  ],
  columns: [
    "public.gyms.id", "public.gyms.code", "public.gyms.name",
    "public.gyms.brand_color", "public.gyms.secondary_color",
    "public.gyms.is_published", "public.gyms.cover_focal",
    "public.gyms.section_visibility", "public.profiles.id",
    "public.profiles.email", "public.profiles.name",
    "public.profiles.active_gym_id", "public.profiles.avatar_url",
    "public.profiles.qr_code", "public.gym_users.gym_id",
    "public.gym_users.user_id", "public.gym_users.role",
    "public.gym_users.status", "public.gym_users.added_by",
    "public.membership_plans.id", "public.membership_plans.gym_id",
    "public.membership_plans.price", "public.membership_plans.duration_days",
    "public.membership_plans.benefits", "public.memberships.id",
    "public.memberships.gym_id", "public.memberships.member_id",
    "public.memberships.start_date", "public.memberships.end_date",
    "public.memberships.cancelled_at", "public.memberships.financial_transaction_id",
    "public.attendance.id", "public.attendance.gym_id",
    "public.attendance.member_id", "public.attendance.check_in",
    "public.attendance.check_out", "public.financial_transactions.id",
    "public.financial_transactions.gym_id", "public.financial_transactions.member_id",
    "public.financial_transactions.membership_id",
    "public.financial_transactions.kind", "public.financial_transactions.ledger_amount",
    "public.financial_transactions.gross_amount",
    "public.financial_transactions.discount_amount",
    "public.financial_transactions.currency",
    "public.financial_transactions.plan_snapshot",
    "public.financial_transactions.discount_snapshot",
    "public.financial_transactions.actor_snapshot",
    "public.financial_transactions.snapshot_quality",
    "public.financial_transactions.actor_id",
    "public.financial_transactions.occurred_at",
    "public.financial_transactions.idempotency_key",
    "public.saved_gyms.user_id", "public.saved_gyms.gym_id",
    "public.gym_feature_settings.gym_id", "public.gym_feature_settings.flags",
    "public.gym_user_permission_overrides.gym_id",
    "public.gym_user_permission_overrides.user_id",
    "public.gym_user_permission_overrides.permission",
    "public.notifications.gym_id", "public.notifications.member_id",
    "public.member_notification_preferences.gym_id",
    "public.member_notification_preferences.member_id",
  ],
  functions: [
    "public.get_my_gyms()", "public.get_my_access()",
    "public.set_active_gym(uuid)", "public.get_gym_by_code(text)",
    "public.search_gyms(text)", "public.get_my_saved_gyms()",
    "public.get_my_membership_verifications()",
    "public.verify_gym_membership(uuid)", "public.save_gym(uuid)",
    "public.unsave_gym(uuid)", "public.member_weekly_streak(uuid, uuid)",
    "public.member_best_weekly_streak(uuid, uuid)", "public.my_weekly_streak()",
    "public.leaderboard_week_streak(integer)",
    "public.kiosk_access_allowed(uuid)", "public.kiosk_checkin(text, uuid)",
    "public.kiosk_checkin_by_member(uuid, uuid)",
    "public.kiosk_get_occupancy(uuid)", "public.kiosk_search_members(text, uuid)",
    "public.manila_business_date(timestamp with time zone)",
    "public.record_membership_payment(uuid, uuid, public.payment_method, text, uuid, date)",
    "public.reverse_financial_transaction(uuid, text, numeric, text, boolean, text)",
    "public.record_financial_adjustment(uuid, numeric, text, text, timestamp with time zone)",
    "public.financial_transaction_history(uuid, integer, integer, text, text, date, date)",
    "public.admin_dashboard_stats()", "public.admin_reports_data(integer)",
    "public.financial_reconciliation(date, date)",
    "public.deployment_contract_snapshot()",
  ],
  policies: [
    "public.gym_users.gym_users_select", "public.gym_users.gym_users_update",
    "public.profiles.profiles_select", "public.profiles.profiles_update",
    "public.financial_transactions.financial_transactions_select",
    "storage.objects.gym_assets_owner_upload",
    "storage.objects.gym_assets_owner_update",
    "storage.objects.gym_assets_owner_delete",
  ],
  rlsTables: [
    "public.profiles", "public.gym_users", "public.memberships",
    "public.attendance", "public.financial_transactions", "storage.objects",
  ],
  grants: [
    "public.financial_transactions:authenticated:SELECT",
    "public.financial_transactions:service_role:SELECT",
    "public.financial_transactions:service_role:INSERT",
  ],
  functionGrants: [
    "public.record_membership_payment:authenticated:EXECUTE",
    "public.reverse_financial_transaction:authenticated:EXECUTE",
    "public.record_financial_adjustment:authenticated:EXECUTE",
    "public.financial_reconciliation:authenticated:EXECUTE",
    "public.deployment_contract_snapshot:service_role:EXECUTE",
  ],
  constraints: [
    "public.financial_transactions.financial_transactions_gym_idempotency_key",
    "public.financial_transactions.financial_transactions_event_shape",
    "public.memberships.memberships_dates_ordered",
  ],
  triggers: [
    "public.financial_transactions.validate_financial_transaction_insert",
    "public.financial_transactions.reject_financial_transaction_update_delete",
  ],
  buckets: ["gym-assets:public"],
});

const FORBIDDEN_DEPLOYMENT_SCHEMA = Object.freeze({
  columns: ["public.profiles.gym_id", "public.profiles.role", "public.profiles.status"],
  grants: [
    "public.financial_transactions:authenticated:INSERT",
    "public.financial_transactions:authenticated:UPDATE",
    "public.financial_transactions:authenticated:DELETE",
  ],
  functionGrants: [
    "public.deployment_contract_snapshot:anon:EXECUTE",
    "public.deployment_contract_snapshot:authenticated:EXECUTE",
  ],
});

export function expectedDeploymentSchemaSnapshot() {
  return Object.fromEntries(
    Object.entries(EXPECTED_DEPLOYMENT_SCHEMA).map(([key, values]) => [key, [...values]]),
  );
}

export function evaluateDeploymentSchemaSnapshot(snapshot) {
  const issues = [];
  for (const [category, expected] of Object.entries(EXPECTED_DEPLOYMENT_SCHEMA)) {
    const actual = new Set(Array.isArray(snapshot?.[category]) ? snapshot[category] : []);
    for (const value of expected) {
      if (!actual.has(value)) {
        issues.push(`Required deployment ${category} entry is missing: ${value}`);
      }
    }
  }

  for (const [category, forbidden] of Object.entries(FORBIDDEN_DEPLOYMENT_SCHEMA)) {
    const actual = new Set(Array.isArray(snapshot?.[category]) ? snapshot[category] : []);
    for (const value of forbidden) {
      if (actual.has(value)) {
        issues.push(`Forbidden deployment ${category} entry is present: ${value}`);
      }
    }
  }

  return { ok: issues.length === 0, issues };
}

/**
 * Verify the externally observable Supabase contract required by this build.
 * The function never returns or logs credentials, provider tokens, or response
 * payloads that could contain account data.
 */
export async function verifyDeploymentContract({
  supabaseUrl,
  anonKey,
  secretKey,
  email,
  password,
  requestTimeoutMs = 10_000,
  fetch: fetchImpl = globalThis.fetch,
}) {
  const baseUrl = supabaseUrl.replace(/\/+$/, "");
  const request = (url, init = {}) =>
    fetchImpl(url, {
      ...init,
      headers: {
        "user-agent": "Stren-Server-Deployment-Check/1.0",
        ...init.headers,
      },
      signal: AbortSignal.timeout(requestTimeoutMs),
    });

  const response = await request(`${baseUrl}/auth/v1/settings`, {
    headers: { apikey: anonKey },
  });

  if (!response.ok) {
    return {
      ok: false,
      issues: ["Supabase Auth settings could not be verified."],
    };
  }

  const settings = await response.json();
  if (settings.mailer_autoconfirm === true) {
    return {
      ok: false,
      issues: [
        "Email confirmation is disabled; new accounts are being auto-confirmed.",
      ],
    };
  }

  if (settings.external?.google !== true) {
    return {
      ok: false,
      issues: ["Google OAuth is not enabled in Supabase Auth."],
    };
  }

  let accessToken = secretKey;
  let restApiKey = secretKey;
  if (!secretKey) {
    const authResponse = await request(
      `${baseUrl}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          apikey: anonKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      },
    );
    if (!authResponse.ok) {
      return {
        ok: false,
        issues: ["The deployment-check account could not authenticate."],
      };
    }

    const authResult = await authResponse.json();
    accessToken = authResult.access_token;
    restApiKey = anonKey;
  }

  if (typeof accessToken !== "string" || accessToken.length === 0) {
    return {
      ok: false,
      issues: ["The deployment-check account returned no access token."],
    };
  }

  const gymsResponse = await request(
    `${baseUrl}/rest/v1/rpc/get_my_gyms`,
    {
      method: "POST",
      headers: {
        apikey: restApiKey,
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: "{}",
    },
  );
  if (!gymsResponse.ok) {
    const error = await gymsResponse.json().catch(() => ({}));
    if (error.code === "PGRST202") {
      return {
        ok: false,
        issues: ["Unified-account RPC public.get_my_gyms() is missing."],
      };
    }

    return {
      ok: false,
      issues: ["Unified-account gym access could not be verified."],
    };
  }

  const accessResponse = await request(
    `${baseUrl}/rest/v1/rpc/get_my_access`,
    {
      method: "POST",
      headers: {
        apikey: restApiKey,
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: "{}",
    },
  );
  if (!accessResponse.ok) {
    const error = await accessResponse.json().catch(() => ({}));
    if (error.code === "PGRST202") {
      return {
        ok: false,
        issues: ["Unified-account RPC public.get_my_access() is missing."],
      };
    }
    const expectedServiceDenial =
      Boolean(secretKey) &&
      error.code === "P0001" &&
      error.message === "permission denied";
    if (!expectedServiceDenial) {
      return {
        ok: false,
        issues: ["Unified-account permissions could not be verified."],
      };
    }
  }

  const profileResponse = await request(
    `${baseUrl}/rest/v1/profiles?select=active_gym_id&limit=0`,
    {
      headers: {
        apikey: restApiKey,
        authorization: `Bearer ${accessToken}`,
      },
    },
  );
  if (!profileResponse.ok) {
    const error = await profileResponse.json().catch(() => ({}));
    if (error.code === "42703") {
      return {
        ok: false,
        issues: [
          "Unified-account column public.profiles.active_gym_id is missing.",
        ],
      };
    }

    return {
      ok: false,
      issues: ["Unified-account profile schema could not be verified."],
    };
  }

  const verificationsResponse = await request(
    `${baseUrl}/rest/v1/rpc/get_my_membership_verifications`,
    {
      method: "POST",
      headers: {
        apikey: restApiKey,
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: "{}",
    },
  );
  if (!verificationsResponse.ok) {
    const error = await verificationsResponse.json().catch(() => ({}));
    if (error.code === "PGRST202") {
      return {
        ok: false,
        issues: [
          "Membership-verification RPC public.get_my_membership_verifications() is missing.",
        ],
      };
    }

    return {
      ok: false,
      issues: ["Membership-verification access could not be verified."],
    };
  }

  if (secretKey) {
    const snapshotResponse = await request(
      `${baseUrl}/rest/v1/rpc/deployment_contract_snapshot`,
      {
        method: "POST",
        headers: {
          apikey: restApiKey,
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: "{}",
      },
    );
    if (!snapshotResponse.ok) {
      const error = await snapshotResponse.json().catch(() => ({}));
      return {
        ok: false,
        issues: [
          error.code === "PGRST202"
            ? "Full deployment schema snapshot RPC is missing."
            : "Full deployment schema contract could not be verified.",
        ],
      };
    }

    const schemaResult = evaluateDeploymentSchemaSnapshot(
      await snapshotResponse.json(),
    );
    if (!schemaResult.ok) return schemaResult;
  }

  return { ok: true, issues: [] };
}
