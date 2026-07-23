export const EXPECTED_DEPLOYMENT_SCHEMA = Object.freeze({
  migrations: [
    "000", "001", "005", "006", "007", "008", "009", "010", "011",
    "012", "013", "014", "015", "016", "017", "018", "019", "020",
    "021", "022", "023", "024", "025", "026", "027", "028", "029", "030",
  ],
  columns: [
    "public.gyms.id", "public.gyms.code", "public.gyms.name",
    "public.gyms.brand_color", "public.gyms.secondary_color",
    "public.gyms.is_published", "public.gyms.branch_name", "public.gyms.cover_focal",
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
    "public.attendance.check_out", "public.attendance.source",
    "public.attendance.recorded_by", "public.attendance.closed_by",
    "public.attendance.corrected_by", "public.attendance.correction_reason",
    "public.privileged_audit_events.id", "public.privileged_audit_events.gym_id",
    "public.privileged_audit_events.actor_id", "public.privileged_audit_events.actor_snapshot",
    "public.privileged_audit_events.action", "public.privileged_audit_events.target_type",
    "public.privileged_audit_events.target_id", "public.privileged_audit_events.before_state",
    "public.privileged_audit_events.after_state", "public.privileged_audit_events.reason",
    "public.gym_membership_verifications.gym_id",
    "public.gym_membership_verifications.user_id",
    "public.gym_membership_verifications.status",
    "public.member_onboarding_workflows.id",
    "public.member_onboarding_workflows.gym_id",
    "public.member_onboarding_workflows.idempotency_key",
    "public.member_onboarding_workflows.request_fingerprint",
    "public.member_onboarding_workflows.status",
    "public.member_onboarding_workflows.failure_stage",
    "public.member_onboarding_workflows.failure_code",
    "public.member_onboarding_events.workflow_id",
    "public.member_onboarding_events.delivery_status",
    "public.member_onboarding_events.failure_code",
    "public.financial_transactions.id",
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
    "public.financial_idempotency_requests.gym_id",
    "public.financial_idempotency_requests.idempotency_key",
    "public.financial_idempotency_requests.operation",
    "public.financial_idempotency_requests.request_fingerprint",
    "public.financial_idempotency_requests.transaction_id",
    "public.saved_gyms.user_id", "public.saved_gyms.gym_id",
    "public.gym_feature_settings.gym_id", "public.gym_feature_settings.flags",
    "public.gym_user_permission_overrides.gym_id",
    "public.gym_user_permission_overrides.user_id",
    "public.gym_user_permission_overrides.permission",
    "public.notifications.gym_id", "public.notifications.member_id",
    "public.member_notification_preferences.gym_id",
    "public.member_notification_preferences.member_id",
    "public.gym_claim_invites.id", "public.gym_claim_invites.gym_id",
    "public.gym_claim_invites.invited_email", "public.gym_claim_invites.invited_role",
    "public.gym_claim_invites.invited_name", "public.gym_claim_invites.token_hash",
    "public.gym_claim_invites.expires_at", "public.gym_claim_invites.created_by",
    "public.gym_claim_invites.consumed_at", "public.gym_claim_invites.superseded_at",
    "public.gym_claim_invites.delivery_status", "public.gym_claim_invites.consent_method",
    "public.gym_claim_invites.created_at", "public.gym_claim_invites.updated_at",
    "public.provisioning_runs.idempotency_key", "public.provisioning_runs.request_fingerprint",
    "public.provisioning_runs.created_by", "public.provisioning_runs.status",
    "public.provisioning_runs.auth_resolution", "public.provisioning_runs.gym_id",
    "public.provisioning_runs.result", "public.provisioning_runs.failure_code",
    "public.provisioning_runs.created_at", "public.provisioning_runs.updated_at",
  ],
  functions: [
    "public.get_my_gyms()", "public.get_my_access()",
    "public.set_active_gym(uuid)", "public.get_gym_by_code(text)",
    "public.search_gyms(text)", "public.get_my_saved_gyms()",
    "public.get_my_membership_verifications()",
    "public.get_gym_directory()", "public.get_gym_member_directory()",
    "public.assign_gym_user_role(uuid, public.user_role, text)",
    "public.set_gym_user_status(uuid, text, text)",
    "public.verify_gym_membership(uuid)", "public.save_gym(uuid)",
    "public.unsave_gym(uuid)", "public.member_weekly_streak(uuid, uuid)",
    "public.member_best_weekly_streak(uuid, uuid)", "public.my_weekly_streak()",
    "public.leaderboard_week_streak(integer)",
    "public.kiosk_access_allowed(uuid)", "public.kiosk_checkin(text, uuid)",
    "public.kiosk_checkin_by_member(uuid, uuid)",
    "public.kiosk_get_occupancy(uuid)", "public.kiosk_search_members(text, uuid)",
    "public.record_attendance_override(uuid, timestamp with time zone, timestamp with time zone, text)",
    "public.correct_attendance_session(uuid, timestamp with time zone, timestamp with time zone, text)",
    "public.close_attendance_session(uuid, text)",
    "public.decide_membership_verification(uuid, text, text)",
    "public.withdraw_membership_verification(uuid)",
    "public.preflight_member_onboarding(text, uuid, public.payment_method, text, date)",
    "public.complete_member_onboarding(uuid, uuid)",
    "public.mark_member_onboarding_failure(uuid, text, text)",
    "public.record_member_onboarding_delivery(uuid, text, text)",
    "public.provision_gym_staff(uuid, public.user_role, text)",
    "public.record_platform_provisioning_auth_state(uuid, text, text, jsonb, text)",
    "public.provision_gym_workspace(jsonb, text, uuid, text)",
    "public.claim_gym_ownership(text)",
    "public.supersede_claim_invite(uuid, text, timestamp with time zone)",
    "public.mark_claim_invite_delivery(uuid, text, text)",
    "public.get_platform_claim_invite(uuid)",
    "public.get_platform_account_resolution(text)",
    "public.get_claim_invite_preview(text)",
    "public.manila_business_date(timestamp with time zone)",
    "public.record_membership_payment(uuid, uuid, public.payment_method, text, uuid, date)",
    "public.reverse_financial_transaction(uuid, text, numeric, text, boolean, text)",
    "public.record_financial_adjustment(uuid, numeric, text, text, timestamp with time zone)",
    "public.paid_membership_end_date(date, integer)",
    "public.effective_membership_status(uuid, uuid, date)",
    "public.admin_membership_status_export()",
    "public.financial_transaction_history(uuid, integer, integer, text, text, date, date)",
    "public.admin_dashboard_stats()", "public.admin_reports_data(integer)",
    "public.financial_reconciliation(date, date)",
    "public.deployment_contract_snapshot()",
  ],
  policies: [
    "public.gym_users.gym_users_select",
    "public.profiles.profiles_select_self", "public.profiles.profiles_update_self",
    "public.attendance.attendance_select",
    "public.privileged_audit_events.privileged_audit_events_select",
    "public.gym_membership_verifications.gym_membership_verifications_select",
    "public.member_onboarding_workflows.member_onboarding_workflows_select",
    "public.member_onboarding_events.member_onboarding_events_select",
    "public.financial_transactions.financial_transactions_select",
    "storage.objects.gym_assets_owner_upload",
    "storage.objects.gym_assets_owner_update",
    "storage.objects.gym_assets_owner_delete",
  ],
  rlsTables: [
    "public.profiles", "public.gym_users", "public.memberships",
    "public.attendance", "public.financial_transactions",
    "public.financial_idempotency_requests",
    "public.privileged_audit_events", "public.gym_membership_verifications",
    "public.member_onboarding_workflows", "public.member_onboarding_events",
    "public.gym_claim_invites", "public.provisioning_runs",
    "storage.objects",
  ],
  grants: [
    "public.financial_transactions:authenticated:SELECT",
    "public.financial_transactions:service_role:SELECT",
    "public.financial_transactions:service_role:INSERT",
    "public.financial_idempotency_requests:service_role:SELECT",
    "public.payments:authenticated:SELECT",
    "public.payments:service_role:SELECT",
    "public.profiles:authenticated:SELECT",
    "public.profiles:authenticated:INSERT",
    "public.profiles:authenticated:UPDATE",
    "public.gym_users:authenticated:SELECT",
    "public.attendance:authenticated:SELECT",
    "public.privileged_audit_events:authenticated:SELECT",
    "public.gym_membership_verifications:authenticated:SELECT",
    "public.member_onboarding_workflows:authenticated:SELECT",
    "public.member_onboarding_events:authenticated:SELECT",
    "public.gym_claim_invites:service_role:SELECT",
    "public.provisioning_runs:service_role:SELECT",
  ],
  functionGrants: [
    "public.record_membership_payment:authenticated:EXECUTE",
    "public.reverse_financial_transaction:authenticated:EXECUTE",
    "public.record_financial_adjustment:authenticated:EXECUTE",
    "public.financial_reconciliation:authenticated:EXECUTE",
    "public.admin_membership_status_export:authenticated:EXECUTE",
    "public.deployment_contract_snapshot:service_role:EXECUTE",
    "public.get_gym_directory:authenticated:EXECUTE",
    "public.get_gym_member_directory:authenticated:EXECUTE",
    "public.assign_gym_user_role:authenticated:EXECUTE",
    "public.set_gym_user_status:authenticated:EXECUTE",
    "public.record_attendance_override:authenticated:EXECUTE",
    "public.correct_attendance_session:authenticated:EXECUTE",
    "public.close_attendance_session:authenticated:EXECUTE",
    "public.decide_membership_verification:authenticated:EXECUTE",
    "public.withdraw_membership_verification:authenticated:EXECUTE",
    "public.preflight_member_onboarding:authenticated:EXECUTE",
    "public.complete_member_onboarding:authenticated:EXECUTE",
    "public.mark_member_onboarding_failure:authenticated:EXECUTE",
    "public.record_member_onboarding_delivery:authenticated:EXECUTE",
    "public.provision_gym_staff:authenticated:EXECUTE",
    "public.record_platform_provisioning_auth_state:authenticated:EXECUTE",
    "public.provision_gym_workspace:authenticated:EXECUTE",
    "public.claim_gym_ownership:authenticated:EXECUTE",
    "public.supersede_claim_invite:authenticated:EXECUTE",
    "public.mark_claim_invite_delivery:authenticated:EXECUTE",
    "public.get_platform_claim_invite:authenticated:EXECUTE",
    "public.get_platform_account_resolution:authenticated:EXECUTE",
    "public.get_claim_invite_preview:anon:EXECUTE",
    "public.get_claim_invite_preview:authenticated:EXECUTE",
  ],
  constraints: [
    "public.financial_transactions.financial_transactions_gym_idempotency_key",
    "public.financial_transactions.financial_transactions_event_shape",
    "public.financial_transactions.financial_transactions_amounts_finite",
    "public.financial_idempotency_requests.financial_idempotency_requests_pkey",
    "public.financial_idempotency_requests.financial_idempotency_requests_transaction_gym_fkey",
    "public.payments.payments_amount_finite_nonnegative",
    "public.membership_plans.membership_plans_price_finite_nonnegative",
    "public.promos.promos_discount_value_finite",
    "public.memberships.memberships_amount_paid_finite_nonnegative",
    "public.memberships.memberships_dates_ordered",
    "public.memberships.memberships_no_overlapping_paid_access",
    "public.attendance.attendance_gym_member_fkey",
    "public.attendance.attendance_time_order_check",
    "public.attendance.attendance_source_check",
    "public.gym_membership_verifications.gym_membership_verifications_consistent",
    "public.member_onboarding_workflows.member_onboarding_workflows_gym_id_idempotency_key_key",
    "public.gym_claim_invites.gym_claim_invites_owner_only",
    "public.gym_claim_invites.gym_claim_invites_delivery_status",
    "public.gym_claim_invites.gym_claim_invites_consent_method",
    "public.gym_claim_invites.gym_claim_invites_hash_format",
    "public.provisioning_runs.provisioning_runs_status",
    "public.provisioning_runs.provisioning_runs_fingerprint",
    "public.provisioning_runs.provisioning_runs_auth_resolution_object",
  ],
  triggers: [
    "public.financial_transactions.validate_financial_transaction_insert",
    "public.financial_transactions.reject_financial_transaction_update_delete",
    "public.privileged_audit_events.privileged_audit_events_immutable",
    "public.gym_users.guard_gym_user_privileged_change",
    "public.gym_membership_verifications.gym_membership_verifications_consistent",
    "public.gym_users.gym_users_verification_consistent",
    "public.member_onboarding_events.member_onboarding_events_immutable",
    "public.membership_plans.membership_plans_privileged_audit",
    "public.memberships.memberships_privileged_audit",
  ],
  buckets: ["gym-assets:public"],
  definitionHashes: Object.freeze({
    "function:admin_reports_data": "74cd67f1900c3c3e6a412e7e873aa5aa7764e385b7d5b9d4565f573541017dcc",
    "function:admin_dashboard_stats": "ace446a1e37bf88438cb15dac95fc3de640b90a984493383457fffd9fdead8f4",
    "function:financial_reconciliation": "1806b9b5203db167d80f47f7212789cb7fb801d7779cff5cc9287bb3a553f665",
    "function:record_membership_payment": "f5c1a34e8c8ab9431b4f2642180b474dfcae0569364c97635039ea803ced2400",
    "function:effective_membership_status": "0809c3d8096769ac9eec818b59f7a7370bb11378239bbfc03e72b4844aa92849",
    "function:record_financial_adjustment": "0c864283cd3211c1c0ed40724724518b98ec2b8571a809adbe921c931a483c80",
    "grants:protected_financial_boundaries": "ec91fb4d3125368bdc9dadc916785a37cba33d7468f321c03dc9bc134fc9d0e0",
    "function:has_member_portal_entitlement": "638e0b1ee8e7454f27bbb97be61cf2258936fa90cdb61c059ee0038793fc18be",
    "function:reverse_financial_transaction": "79278fbf7d4bbce41aa46d636d72704a142a9fb57fd17f545a9b9b87af31c0d4",
    "policy:public.payments.payments_select": "e031ad36956e1d0f824bf3a95cc7bfb1289b88e42d5916c7b81cc9b49324e081",
    "function:admin_membership_status_export": "b8cfb03126b401ce7d4a035655941aafc1ec589e88dc916b3f464ba5bb2b6b97",
    "policy:public.attendance.attendance_select": "afce65edb57f87e3517ac2bf0bb233b1b3e48ddff90927630f9ad0aa3e25f759",
    "policy:public.profiles.profiles_select_self": "82fc01c79cf15c4226cb95d709b5a521c667ed0409c66f2e799b13d972ec0941",
    "constraint:public.promos.promos_discount_value_finite": "171a04dc30be03e25c4a00db16c8ffeaf608f8e354a8c7b723d01835c94a5d35",
    "constraint:public.payments.payments_amount_nonnegative": "6202cc5e837e2b48e29737f4fa0a1e540597cf0a6c5bc1fedcd4dd1de5324b06",
    "constraint:public.payments.payments_amount_finite_nonnegative": "f3f4ce1362b1e840f5e91ceb39f9efbd066e7b0d9997ca8f190e7b8656a5882c",
    "constraint:public.memberships.memberships_dates_ordered": "46e249b36090bb1dafe8328ffbabb654309ae8eb224e981c3e46a6b99c09d9a1",
    "trigger:public.gym_users.guard_gym_user_privileged_change": "8a7f2a405fd0b478f8db9f0ce2000a7cf3fc301b091793628f55acf4ba86ebee",
    "trigger:public.memberships.prevent_overlapping_membership_access": "f01adeee90b3d6f0574d8d7135ffd9b0637930f211214cbe1566ceaa29dd48a9",
    "policy:public.financial_transactions.financial_transactions_select": "bd583f29d5dddbdbdd46b920080a42de93795e521404ac72114d49db97d2ac95",
    "constraint:public.memberships.memberships_no_overlapping_paid_access": "741664c06df767c7174b831006a46c12c072ddff685c5168e7ad762fe48c7fe6",
    "constraint:public.memberships.memberships_amount_paid_finite_nonnegative": "fe01776a03601fdc187d2227c23a6ab07bdb9ef1887b2d297d7211914e369096",
    "trigger:public.privileged_audit_events.privileged_audit_events_immutable": "9c1631dd455004108e60b26089c8e89d5e6460e1b2dc7d176e4ef57bf87d716b",
    "constraint:public.financial_transactions.financial_transactions_event_shape": "227dccd7acd5e7366085a746a78f7b64fcd113a6eebebb0123fe7704b6d3ecd2",
    "constraint:public.membership_plans.membership_plans_price_finite_nonnegative": "91aad536a3974d19f878122c7f45a4d15914146cdd329ca440076c0f35417912",
    "constraint:public.financial_transactions.financial_transactions_amounts_finite": "9d13189226d69f1e85eb3242bbfe6997a0f0594c5656d6082e2e88f930cc6a69",
    "trigger:public.financial_transactions.validate_financial_transaction_insert": "d495b7cc851f59cfaedbdb1d4d0892149740b82512dfe44191ddbf1e16e8404b",
    "trigger:public.financial_transactions.reject_financial_transaction_update_delete": "793155d51cfe534bb4efe7b987ed680e0f461bda1b85555948e7a78c48a7f5d8",
    "constraint:public.financial_idempotency_requests.financial_idempotency_requests_pkey": "649f8291b5da1adf3495d794b4410c23a5b8f36fd437ddc6ca3b8194c38e65dc",
    "constraint:public.financial_idempotency_requests.financial_idempotency_requests_operation_check": "e5e2df6f3f6d780c1171563e0cc18b6345e5290eb4dbebad71dfbb5656743cfd",
    "constraint:public.financial_idempotency_requests.financial_idempotency_requests_transaction_key": "0b5709ffbce113a8da3cf0e586147ce09ed659aba7f05e284b537e78e1d58bcd",
    "constraint:public.financial_idempotency_requests.financial_idempotency_requests_fingerprint_check": "b53cd02ba32a732b15186d9e6b715daea3194ba26fd999fcc0949b5356fc0cd3",
    "constraint:public.financial_idempotency_requests.financial_idempotency_requests_transaction_gym_fkey": "3cb1441638bc9ce9abd6eadfac5fbacc9b99e175f843ce6d6118298fb79a3c5a",
    "function:gym_feature_enabled": "e6b5162c7fc4639b80f9cfd8be13ec9f17eaad5b4f3ea638c06bf3202b36bcd6",
    "function:kiosk_checkin_by_member": "fc6dba35b18b7f601b0413b6fa48de49c6266042d0b437b88c888704572e0e83",
    "function:kiosk_get_occupancy": "0c9ebfb59366fc10ae9fbe12e8a66a6ae7e46cf3168bace2133a31e8b36e6d21",
    "function:get_my_access": "8c594406fb6e653ec46fe6a6f42d99bb9613804b21fb863eb7d3ff2a114c3a54",
    "function:record_platform_provisioning_auth_state": "705b65995b000484af49a004e39ef3e25707f4d47295a736ed9a9ee797fda594",
    "function:provision_gym_workspace": "3a2c722c61f7989579c4a38bd237b9fe073120b68620aa6e2551031f689ae4b3",
    "function:claim_gym_ownership": "abfb70e4d965a23910c23e02633df414ae7f2d10289bd400bc046cae666b42b2",
    "function:supersede_claim_invite": "63e6e9f1eddfde7f5376cc23eca40ace2c7c69ff81061d7b4aa5f0f62de2f1b7",
    "function:mark_claim_invite_delivery": "641b2f8e98e1f15877ed0bb6ba9afb67f895adfab8e1e4a9d9b3c17e51706537",
    "function:get_claim_invite_preview": "7898873381186d71ed50d90d84f798b844793fdd95d34dd3dac685ea61fa9601",
    "function:get_platform_claim_invite": "13535dd78ff4ac8ca498f16f6c0b83904778b744c56d2f21860e812dec4bfa92",
    "function:get_platform_account_resolution": "d2ac2247e1555c61779bb87bbe2da34ca19c2e1a0be543658a6e2ad5764e9e4f",
  }),
});

const FORBIDDEN_DEPLOYMENT_SCHEMA = Object.freeze({
  columns: ["public.profiles.gym_id", "public.profiles.role", "public.profiles.status"],
  policies: [
    "public.profiles.profiles_select", "public.profiles.profiles_update",
    "public.gym_users.gym_users_update", "public.attendance.attendance_insert",
    "public.attendance.attendance_update", "public.attendance.attendance_delete",
  ],
  grants: [
    "public.financial_transactions:authenticated:INSERT",
    "public.financial_transactions:authenticated:UPDATE",
    "public.financial_transactions:authenticated:DELETE",
    "public.payments:anon:INSERT",
    "public.payments:anon:UPDATE",
    "public.payments:anon:DELETE",
    "public.payments:anon:TRUNCATE",
    "public.payments:authenticated:INSERT",
    "public.payments:authenticated:UPDATE",
    "public.payments:authenticated:DELETE",
    "public.payments:authenticated:TRUNCATE",
    "public.payments:service_role:INSERT",
    "public.payments:service_role:UPDATE",
    "public.payments:service_role:DELETE",
    "public.payments:service_role:TRUNCATE",
    "public.financial_idempotency_requests:authenticated:INSERT",
    "public.financial_idempotency_requests:authenticated:UPDATE",
    "public.financial_idempotency_requests:authenticated:DELETE",
    "public.profiles:authenticated:DELETE",
    "public.profiles:authenticated:TRUNCATE",
    "public.gym_users:authenticated:INSERT",
    "public.gym_users:authenticated:UPDATE",
    "public.gym_users:authenticated:DELETE",
    "public.gym_users:authenticated:TRUNCATE",
    "public.attendance:authenticated:INSERT",
    "public.attendance:authenticated:UPDATE",
    "public.attendance:authenticated:DELETE",
    "public.attendance:authenticated:TRUNCATE",
    "public.privileged_audit_events:authenticated:INSERT",
    "public.privileged_audit_events:authenticated:UPDATE",
    "public.privileged_audit_events:authenticated:DELETE",
    "public.member_onboarding_workflows:authenticated:INSERT",
    "public.member_onboarding_workflows:authenticated:UPDATE",
    "public.member_onboarding_events:authenticated:INSERT",
    "public.member_onboarding_events:authenticated:UPDATE",
  ],
  functionGrants: [
    "public.deployment_contract_snapshot:anon:EXECUTE",
    "public.deployment_contract_snapshot:authenticated:EXECUTE",
  ],
});

export function expectedDeploymentSchemaSnapshot() {
  return Object.fromEntries(
    Object.entries(EXPECTED_DEPLOYMENT_SCHEMA).map(([key, values]) => [
      key,
      Array.isArray(values) ? [...values] : { ...values },
    ]),
  );
}

export function evaluateDeploymentSchemaSnapshot(snapshot) {
  const issues = [];
  for (const [category, expected] of Object.entries(EXPECTED_DEPLOYMENT_SCHEMA)) {
    if (category === "definitionHashes") {
      const actual = snapshot?.definitionHashes;
      for (const [key, expectedHash] of Object.entries(expected)) {
        if (actual?.[key] !== expectedHash) {
          issues.push(`Protected database definition drifted: ${key}`);
        }
      }
      continue;
    }
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
