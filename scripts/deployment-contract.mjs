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

  return { ok: true, issues: [] };
}
