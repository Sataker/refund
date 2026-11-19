import 'server-only';
import { DEFAULT_BUDGET, summarizeLawChange } from '@refund/ai';
import type { Db } from '@refund/db';
import type { Capabilities } from '../capabilities.ts';
import { decrypt, type Secrets } from '../crypto.ts';
import { readEnv } from '../env.ts';
import { logger } from '../log.ts';
import { sendEmail } from '../report/email.ts';
import { lawAlertEmailBody } from './alert-email.ts';
import type { LawProcessDeps } from './process.ts';

// Production wiring of the "law changed" flow: the model only with the AI capability (template otherwise), the
// e-mail only with the e-mail capability (INFRA-CI §1.1). Without either, the change still lands in law_changes and
// on the outdated findings.

export function lawProcessDeps(db: Db, secrets: Secrets, caps: Capabilities): LawProcessDeps {
  const site = readEnv().values.NEXT_PUBLIC_SITE_URL;
  return {
    db,
    summarize: (input) =>
      summarizeLawChange(
        input,
        caps.ai
          ? {
              budget: DEFAULT_BUDGET,
              log: (e) => logger.info(e.event, { ...e }),
            }
          : null,
      ),
    notify: async (recipients, regulationLabel) => {
      if (!caps.email || !site) return;
      const body = lawAlertEmailBody({ regulationLabel, link: new URL('/app', site).toString() });
      let sent = 0;
      for (const r of recipients) {
        const to = decrypt(r.emailEncrypted, secrets.encryption);
        if (to === null) continue;
        if ((await sendEmail(to, body, 'law_alert')).ok) sent++;
      }
      logger.info('law.alert_sent', { recipients: recipients.length, sent });
    },
  };
}
