import { expect, test } from '@playwright/test';

test('legacy auth URLs permanently redirect to unified routes', async ({ request }) => {
  const cases = [
    ['/gym/IRON/login', '/login?gym=IRON'],
    ['/gym/IRON/signup', '/signup?gym=IRON'],
    ['/signup/admin', '/gyms/new'],
    ['/signup/member', '/signup'],
    ['/gym-select', '/gyms'],
    ['/kiosk/signup', '/kiosk'],
  ] as const;

  for (const [source, target] of cases) {
    const response = await request.get(source, { maxRedirects: 0 });
    expect(response.status(), source).toBe(308);
    expect(new URL(response.headers().location!, 'http://127.0.0.1:3000').pathname + new URL(response.headers().location!, 'http://127.0.0.1:3000').search).toBe(target);
  }
});
