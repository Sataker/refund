import { expect, test } from '../fixtures.ts';

// ARCHITECTURE §7.4 and §10.2: without any variable (the backup deployment), /api/health answers 200, the demo
// assembles with every AI call recorded and every video number in place, and the database is simply absent.

test.describe('health without env @demo', () => {
  test('/api/health is ok with the demo field and no database', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    expect(res.headers()['cache-control']).toContain('no-store');
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.demo).toEqual({ personas: 1, recordingsComplete: true, videoNumbers: 'ok' });
    expect(body.capabilities.database).toBe(false);
    expect(body.checks).toBeUndefined();
  });
});
