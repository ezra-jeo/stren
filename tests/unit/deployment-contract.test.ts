import { describe, expect, it, vi } from "vitest";

import { verifyDeploymentContract } from "../../scripts/deployment-contract.mjs";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("deployment contract", () => {
  it("rejects an auth provider that automatically confirms new email accounts", async () => {
    const fetch = vi.fn(async () =>
      jsonResponse({ mailer_autoconfirm: true }),
    );

    const result = await verifyDeploymentContract({
      supabaseUrl: "https://project.supabase.co",
      anonKey: "public-anon-key",
      email: "deployment-check@example.com",
      password: "not-a-real-password",
      fetch,
    });

    expect(result).toEqual({
      ok: false,
      issues: [
        "Email confirmation is disabled; new accounts are being auto-confirmed.",
      ],
    });
  });

  it("rejects a deployment with Google OAuth disabled", async () => {
    const fetch = vi.fn(async () =>
      jsonResponse({ mailer_autoconfirm: false, external: { google: false } }),
    );

    const result = await verifyDeploymentContract({
      supabaseUrl: "https://project.supabase.co",
      anonKey: "public-anon-key",
      email: "deployment-check@example.com",
      password: "not-a-real-password",
      fetch,
    });

    expect(result).toEqual({
      ok: false,
      issues: ["Google OAuth is not enabled in Supabase Auth."],
    });
  });

  it("rejects a deployment without the unified-account gym-list RPC", async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = input.toString();
      if (url.endsWith("/auth/v1/settings")) {
        return jsonResponse({ mailer_autoconfirm: false, external: { google: true } });
      }
      if (url.includes("/auth/v1/token?grant_type=password")) {
        return jsonResponse({ access_token: "short-lived-access-token" });
      }
      if (url.endsWith("/rest/v1/rpc/get_my_gyms")) {
        return jsonResponse(
          {
            code: "PGRST202",
            message:
              "Could not find the function public.get_my_gyms without parameters in the schema cache",
          },
          404,
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    const result = await verifyDeploymentContract({
      supabaseUrl: "https://project.supabase.co",
      anonKey: "public-anon-key",
      email: "deployment-check@example.com",
      password: "not-a-real-password",
      fetch,
    });

    expect(result).toEqual({
      ok: false,
      issues: ["Unified-account RPC public.get_my_gyms() is missing."],
    });
  });

  it("rejects a deployment without the unified-account access RPC", async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = input.toString();
      if (url.endsWith("/auth/v1/settings")) {
        return jsonResponse({ mailer_autoconfirm: false, external: { google: true } });
      }
      if (url.includes("/auth/v1/token?grant_type=password")) {
        return jsonResponse({ access_token: "short-lived-access-token" });
      }
      if (url.endsWith("/rest/v1/rpc/get_my_gyms")) {
        return jsonResponse([]);
      }
      if (url.endsWith("/rest/v1/rpc/get_my_access")) {
        return jsonResponse({ code: "PGRST202" }, 404);
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    const result = await verifyDeploymentContract({
      supabaseUrl: "https://project.supabase.co",
      anonKey: "public-anon-key",
      email: "deployment-check@example.com",
      password: "not-a-real-password",
      fetch,
    });

    expect(result).toEqual({
      ok: false,
      issues: ["Unified-account RPC public.get_my_access() is missing."],
    });
  });

  it("rejects a deployment without profiles.active_gym_id", async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = input.toString();
      if (url.endsWith("/auth/v1/settings")) {
        return jsonResponse({ mailer_autoconfirm: false, external: { google: true } });
      }
      if (url.includes("/auth/v1/token?grant_type=password")) {
        return jsonResponse({ access_token: "short-lived-access-token" });
      }
      if (url.endsWith("/rest/v1/rpc/get_my_gyms")) {
        return jsonResponse([]);
      }
      if (url.endsWith("/rest/v1/rpc/get_my_access")) {
        return jsonResponse({ gym_id: null, role: null });
      }
      if (url.endsWith("/rest/v1/profiles?select=active_gym_id&limit=0")) {
        return jsonResponse(
          {
            code: "42703",
            message: "column profiles.active_gym_id does not exist",
          },
          400,
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    const result = await verifyDeploymentContract({
      supabaseUrl: "https://project.supabase.co",
      anonKey: "public-anon-key",
      email: "deployment-check@example.com",
      password: "not-a-real-password",
      fetch,
    });

    expect(result).toEqual({
      ok: false,
      issues: ["Unified-account column public.profiles.active_gym_id is missing."],
    });
  });

  it("accepts a deployment whose auth and unified-account contracts are live", async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = input.toString();
      if (url.endsWith("/auth/v1/settings")) {
        return jsonResponse({ mailer_autoconfirm: false, external: { google: true } });
      }
      if (url.includes("/auth/v1/token?grant_type=password")) {
        return jsonResponse({ access_token: "short-lived-access-token" });
      }
      if (url.endsWith("/rest/v1/rpc/get_my_gyms")) {
        return jsonResponse([
          { gym_id: "11111111-1111-1111-1111-111111111111", role: "member" },
        ]);
      }
      if (url.endsWith("/rest/v1/rpc/get_my_access")) {
        return jsonResponse({
          gym_id: "11111111-1111-1111-1111-111111111111",
          role: "member",
        });
      }
      if (url.endsWith("/rest/v1/profiles?select=active_gym_id&limit=0")) {
        return jsonResponse([]);
      }
      if (url.endsWith("/rest/v1/rpc/get_my_membership_verifications")) {
        return jsonResponse([]);
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    const result = await verifyDeploymentContract({
      supabaseUrl: "https://project.supabase.co/",
      anonKey: "public-anon-key",
      email: "deployment-check@example.com",
      password: "not-a-real-password",
      fetch,
    });

    expect(result).toEqual({ ok: true, issues: [] });
  });

  it("uses a server-only project secret without storing a test-user password", async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = input.toString();
      if (url.endsWith("/auth/v1/settings")) {
        return jsonResponse({ mailer_autoconfirm: false, external: { google: true } });
      }
      if (url.endsWith("/rest/v1/rpc/get_my_gyms")) {
        return jsonResponse([]);
      }
      if (url.endsWith("/rest/v1/rpc/get_my_access")) {
        return jsonResponse(
          { code: "P0001", message: "permission denied" },
          400,
        );
      }
      if (url.endsWith("/rest/v1/profiles?select=active_gym_id&limit=0")) {
        return jsonResponse([]);
      }
      if (url.endsWith("/rest/v1/rpc/get_my_membership_verifications")) {
        return jsonResponse([]);
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    const result = await verifyDeploymentContract({
      supabaseUrl: "https://project.supabase.co",
      anonKey: "public-anon-key",
      secretKey: "server-secret-key",
      fetch,
    });

    expect(result).toEqual({ ok: true, issues: [] });
    expect(fetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/auth/v1/token"),
      expect.anything(),
    );
  });

  it("rejects a deployment without the membership-verification read RPC", async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = input.toString();
      if (url.endsWith("/auth/v1/settings")) {
        return jsonResponse({ mailer_autoconfirm: false, external: { google: true } });
      }
      if (url.endsWith("/rest/v1/rpc/get_my_gyms")) {
        return jsonResponse([]);
      }
      if (url.endsWith("/rest/v1/rpc/get_my_access")) {
        return jsonResponse({ gym_id: null, role: null });
      }
      if (url.endsWith("/rest/v1/profiles?select=active_gym_id&limit=0")) {
        return jsonResponse([]);
      }
      if (url.endsWith("/rest/v1/rpc/get_my_membership_verifications")) {
        return jsonResponse({ code: "PGRST202" }, 404);
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    const result = await verifyDeploymentContract({
      supabaseUrl: "https://project.supabase.co",
      anonKey: "public-anon-key",
      secretKey: "server-secret-key",
      fetch,
    });

    expect(result).toEqual({
      ok: false,
      issues: [
        "Membership-verification RPC public.get_my_membership_verifications() is missing.",
      ],
    });
  });

  it("bounds an unresponsive provider request", async () => {
    const fetch = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return jsonResponse({ mailer_autoconfirm: true });
    });

    const result = await verifyDeploymentContract({
      supabaseUrl: "https://project.supabase.co",
      anonKey: "public-anon-key",
      secretKey: "server-secret-key",
      requestTimeoutMs: 5,
      fetch,
    });

    expect(result.ok).toBe(false);
  });
});
