import type { VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  framework: 'nextjs',
  installCommand: 'pnpm install --frozen-lockfile',
  // São Paulo, close to Supabase sa-east-1 (Hobby: 1 region).
  regions: ['gru1'],
  crons: [
    // 06h00 BRT; Hobby = 1×/day, ±59 min. Without CRON_SECRET the handler answers 401.
    { path: '/api/cron/diario', schedule: '0 9 * * *' },
  ],
};
