// Basic health payload (ARCHITECTURE §10.2). Capabilities, demo and deep checks arrive with E4.

export type HealthStatus = 'ok' | 'degraded' | 'failed';

export interface BasicHealth {
  status: HealthStatus;
  version: string;
  environment: string;
  builtAt: string | null;
}

export interface HealthEnv {
  VERCEL_GIT_COMMIT_SHA?: string | undefined;
  VERCEL_ENV?: string | undefined;
  REFUND_BUILT_AT?: string | undefined;
}

export function basicHealth(env: HealthEnv): BasicHealth {
  return {
    status: 'ok',
    version: env.VERCEL_GIT_COMMIT_SHA ? env.VERCEL_GIT_COMMIT_SHA.slice(0, 7) : 'local',
    environment: env.VERCEL_ENV ?? 'local',
    builtAt: env.REFUND_BUILT_AT ?? null,
  };
}
