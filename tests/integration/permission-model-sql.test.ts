import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import defaults from '../fixtures/role-permission-defaults.json';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(process.cwd(), 'supabase/migrations/015_permission_model.sql');
const financialMigrationPath = resolve(process.cwd(), 'supabase/migrations/025_financial_integrity_and_reporting.sql');

describe('SQL permission model', () => {
  it('seeds the frozen role matrix and resolves owner, unknown, override, and edit/view rules', () => {
    const sql = [migrationPath, financialMigrationPath]
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');

    for (const [role, permissions] of Object.entries(defaults)) {
      for (const permission of permissions) {
        expect(sql).toContain(`('${role}', '${permission}')`);
      }
    }

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.has_gym_permission');
    expect(sql).toMatch(/IF v_role = 'owner' THEN\s+RETURN true;/i);
    expect(sql).toMatch(/RAISE EXCEPTION 'unknown permission: %', p_permission/i);
    expect(sql).toMatch(/FROM public\.gym_user_permission_overrides/i);
    expect(sql).toMatch(/p_permission = 'gym_page:view'[\s\S]*?'gym_page:edit'/i);
  });

  it('moves protected writes from broad manager roles to effective permissions', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(/CREATE POLICY gyms_update[\s\S]*?has_gym_permission\('gym_page:edit'/i);
    expect(sql).toContain('CREATE TRIGGER protect_gym_publish');
    expect(sql).toMatch(/has_gym_permission\('gym_page:publish', NEW\.id\)/i);
    expect(sql).toMatch(/CREATE POLICY payments_select[\s\S]*?'payments:view'[\s\S]*?'members:payment_history:view'/i);
    expect(sql).toMatch(/CREATE POLICY payments_insert[\s\S]*?'payments:create'/i);
    expect(sql).toMatch(/CREATE POLICY plans_manage[\s\S]*?'plans:manage'/i);
    expect(sql).toMatch(/CREATE POLICY promos_manage[\s\S]*?'promos:manage'/i);
    expect(sql).toMatch(/CREATE POLICY announcements_manage[\s\S]*?'announcements:manage'/i);
  });

  it('guards admin RPCs and conditionally appends only the specified finance fields', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(/admin_dashboard_stats\(\)[\s\S]*?has_gym_permission\('dashboard:view'/i);
    expect(sql).toMatch(/has_gym_permission\('dashboard:finance:view'[\s\S]*?'today_revenue'[\s\S]*?'month_revenue'[\s\S]*?'revenue_7d'/i);
    expect(sql).toMatch(/admin_reports_data\(p_days INTEGER DEFAULT 14\)[\s\S]*?has_gym_permission\('reports:attendance:view'/i);
    expect(sql).toMatch(/has_gym_permission\('reports:finance:view'[\s\S]*?'month_revenue'[\s\S]*?'revenue_by_day'[\s\S]*?'revenue_by_dom'[\s\S]*?'method_breakdown'/i);
  });

  it('keeps get_my_access aligned with middleware profile-status handling', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    const getMyAccess = sql.slice(sql.indexOf('FUNCTION public.get_my_access'), sql.indexOf('ALTER TABLE public.gym_role_permission_defaults'));

    expect(getMyAccess).toMatch(/WHERE id = auth\.uid\(\) AND status <> 'rejected'/i);
    expect(getMyAccess).toMatch(/IF NOT FOUND THEN\s+RAISE EXCEPTION 'permission denied'/i);
  });
});
