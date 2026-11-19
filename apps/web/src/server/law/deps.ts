import 'server-only';
import { templateDiffSummary } from '@refund/ai';
import type { Db } from '@refund/db';
import type { Capabilities } from '../capabilities.ts';
import { decrypt, type Secrets } from '../crypto.ts';
import { readEnv } from '../env.ts';
import { logger } from '../log.ts';
import { sendEmail } from '../report/email.ts';
import { lawAlertEmailBody } from './alert-email.ts';
import type { LawProcessDeps } from './process.ts';

// Production wiring of the "law changed" flow. The summary is the template, which names provisions only from the
// @refund/law labels: no scraped diff goes to the model until a slotted summarizeDiff exists (code review E16, M2;
// EXECUTION §9). The e-mail only with the e-mail capability (INFRA-CI §1.1). Without it, the change still lands in
// law_changes and on the outdated findings.

export function lawProcessDeps(db: Db, secrets: Secrets, caps: Capabilities): LawProcessDeps {
  const site = readEnv().values.NEXT_PUBLIC_SITE_URL;
  return {
    db,
    summarize: async (input) => ({ summary: templateDiffSummary(input), origin: 'template' }),
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
