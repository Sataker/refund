import { describe, expect, it } from 'vitest';
import { localDevPlan } from './entitlements.ts';

describe('localDevPlan (local testing only)', () => {
  it('unlocks the plan only under next dev and off Vercel', () => {
    expect(localDevPlan({ NODE_ENV: 'development', LOCAL_DEV_PLAN: 'business' })).toBe('business');
  });
  it('is ignored in production builds, on Vercel and for unknown plans', () => {
    expect(localDevPlan({ NODE_ENV: 'production', LOCAL_DEV_PLAN: 'business' })).toBeNull();
    expect(
      localDevPlan({ NODE_ENV: 'development', VERCEL: '1', LOCAL_DEV_PLAN: 'business' }),
    ).toBeNull();
    expect(localDevPlan({ NODE_ENV: 'development', LOCAL_DEV_PLAN: 'nope' })).toBeNull();
    expect(localDevPlan({ NODE_ENV: 'development' })).toBeNull();
  });
});
