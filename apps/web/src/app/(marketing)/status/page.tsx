import type { Metadata } from 'next';
import { Section, SupportPage, TextLink } from '@/features/support/page-shell';
import type { HealthStatus } from '@/lib/health';
import { statusPageUrl } from '@/lib/status';
import type { Capabilities } from '@/server/capabilities';
import { healthReport } from '@/server/health';

// /status (ARCHITECTURE §10.2, §10.3 and §13; IDENTITY-AND-UI §5.14; EXECUTION E20, task 4). The history lives on the
// UptimeRobot status page (we do not build our own, §10.3); this page links it and shows the same basic report as
// GET /api/health, computed on each request (never the deep check: that one touches the database and is rate-limited).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Status · Refund',
  description: 'Se o Refund está no ar agora e onde ver o histórico de disponibilidade.',
};

const STATUS_TEXT: Record<HealthStatus, string> = {
  ok: 'Tudo funcionando.',
  degraded: 'No ar, com algum serviço opcional fora. A demonstração continua funcionando.',
  failed: 'Com falha agora.',
};

/** VERCEL_ENV in Portuguese; anything else (no Vercel) is a local run. */
const ENVIRONMENT_LABELS: Readonly<Record<string, string>> = {
  production: 'produção',
  preview: 'prévia',
  development: 'desenvolvimento',
};

const CAPABILITY_LABELS: [keyof Capabilities, string][] = [
  ['database', 'Banco de dados'],
  ['pluggy', 'Conexão de contas (Pluggy, sandbox)'],
  ['ai', 'IA para classificar e explicar'],
  ['email', 'Envio do relatório por e-mail'],
  ['payments', 'Pagamento por Pix'],
  ['lawMonitor', 'Monitor de mudanças na lei'],
  ['cron', 'Limpeza diária de dados'],
];

function Row({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-2">
      <dt>{label}</dt>
      <dd className="text-right text-muted-foreground" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}

export default async function StatusPage() {
  const { body } = await healthReport({ deep: false });
  const uptime = statusPageUrl();
  const checkedAt = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  return (
    <SupportPage
      title="Status"
      lead="Se o Refund está no ar agora e onde ver o histórico."
      testId="status-page"
      disclaimer={false}
    >
      <Section title="Agora">
        <p className="type-h3" data-testid="status/overall" data-status={body.status}>
          {STATUS_TEXT[body.status]}
        </p>
        <p className="type-small text-muted-foreground">
          Verificado em {checkedAt} (horário de Brasília). Os mesmos dados, em JSON, estão em{' '}
          <a href="/api/health" className="text-cobalt underline underline-offset-4">
            /api/health
          </a>
          .
        </p>
      </Section>

      <Section title="Demonstração">
        <dl>
          <Row
            label="Personas prontas"
            value={String(body.demo.personas)}
            testId="status/demo-personas"
          />
          <Row
            label="Números da tela conferidos com o gabarito"
            value={body.demo.videoNumbers === 'ok' ? 'Sim' : 'Não'}
            testId="status/demo-numbers"
          />
          <Row
            label="Explicações da demonstração prontas"
            value={body.demo.recordingsComplete ? 'Sim' : 'Não'}
          />
        </dl>
      </Section>

      <Section title="Serviços ligados neste servidor">
        <dl>
          {CAPABILITY_LABELS.map(([key, label]) => (
            <Row key={key} label={label} value={body.capabilities[key] ? 'Ligado' : 'Desligado'} />
          ))}
        </dl>
        <p className="type-small text-muted-foreground">
          Um serviço desligado não derruba a demonstração, que funciona sem nenhum deles.
        </p>
      </Section>

      <Section title="Histórico">
        {uptime ? (
          <p>
            O histórico de disponibilidade fica numa página pública do UptimeRobot:{' '}
            <a
              href={uptime}
              className="text-cobalt underline underline-offset-4"
              rel="noopener noreferrer"
              data-testid="status/uptime-link"
            >
              ver o histórico
            </a>
            .
          </p>
        ) : (
          <p data-testid="status/uptime-pending">
            A página pública de disponibilidade (UptimeRobot) ainda não foi publicada.
          </p>
        )}
        <p className="type-small text-muted-foreground">
          Versão {body.version}, ambiente {ENVIRONMENT_LABELS[body.environment] ?? 'local'}. Como o
          motor é testado está em <TextLink href="/motor">Motor e testes</TextLink>.
        </p>
      </Section>
    </SupportPage>
  );
}
