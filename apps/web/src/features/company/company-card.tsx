import type { PublicCompany } from '@refund/sources';
import { formatCnpj } from '@refund/sources';
import { Building2 } from 'lucide-react';
import { formatBrtDate } from '@/lib/date';

// Screen 1 card ("É você?"): public company data only (ARCHITECTURE §6.2 whitelist). Never the QSA
// (rule 6.9); an EI/MEI legal name arrives already masked from the whitelist.

const SIZE_LABEL: Record<PublicCompany['size'], string> = {
  MEI: 'MEI',
  ME: 'Microempresa',
  EPP: 'Empresa de pequeno porte',
  OTHER: 'Demais',
  UNKNOWN: 'Não informado',
};

function regimeLabel(c: PublicCompany): string {
  if (c.mei.optedIn) return 'MEI';
  if (c.simples.optedIn) return 'Simples Nacional';
  const last = c.taxRegimeHistory.at(-1);
  return last ? `Fora do Simples (${last.form.toLowerCase()} em ${last.year})` : 'Fora do Simples';
}

function yearOf(date: string | null): string | null {
  return date ? date.slice(0, 4) : null;
}

export function CompanyCard({ company }: { company: PublicCompany }) {
  const synthetic = company.source === 'persona' || company.source === 'replay';
  const since = yearOf(company.simples.optedIn ? company.simples.since : company.activityStartDate);
  const rows: Array<[string, string]> = [
    ['Atividade', `${company.primaryCnae.description} (${company.primaryCnae.code})`],
    ['Regime', regimeLabel(company)],
    [
      'Porte',
      `${SIZE_LABEL[company.size]}${since ? ` · ${company.simples.optedIn ? 'Simples desde' : 'aberta em'} ${since}` : ''}`,
    ],
    ['Situação', company.registrationStatus.trim().toLowerCase()],
    ['UF', company.uf],
  ];
  return (
    <section
      className="rounded-lg border border-border bg-surface shadow-sm"
      data-testid="company-card"
      data-cnpj={company.cnpj}
      aria-label="Dados públicos da empresa"
    >
      <div className="flex items-start gap-3 border-b border-border p-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-surface-2">
          <Building2
            className="size-5 text-muted-foreground"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </span>
        <div className="min-w-0">
          <p className="type-h4 text-balance text-foreground" data-testid="company-name">
            {company.displayLegalName}
          </p>
          <p className="type-mono mt-0.5 text-muted-foreground">
            {formatCnpj(company.cnpj)}
            {synthetic ? ' (sintético)' : ''}
          </p>
        </div>
      </div>
      <dl className="grid gap-3 p-5">
        {rows.map(([k, v], i) => (
          <div
            key={k}
            className="enter grid grid-cols-[96px_minmax(0,1fr)] gap-3"
            style={{ ['--enter-delay' as string]: `${i * 80}ms` }}
          >
            <dt className="type-small text-muted-foreground">{k}</dt>
            <dd className="type-small text-foreground first-letter:uppercase">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="type-caption border-t border-border px-5 py-3 text-muted-foreground">
        {synthetic
          ? 'Empresa fictícia de exemplo. Nenhum dado real.'
          : `Dados públicos da Receita, consultados em ${formatBrtDate(company.fetchedAt)}. Sem dados de sócios.`}
      </p>
    </section>
  );
}
