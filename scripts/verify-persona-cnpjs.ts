// Confirms that no persona CNPJ exists at the Receita (ARCHITECTURE §7.5): BrasilAPI must answer
// 404 for each one. If BrasilAPI rejects the alphanumeric format (400) or is unreachable, CNPJ.ws is
// asked too; what matters is "does not exist". A positive control (the first alphanumeric CNPJ
// issued, public in the Receita's news of 31/07/2026) must answer 200 on BrasilAPI; otherwise its
// 404s prove nothing and every persona CNPJ is also checked on CNPJ.ws. Writes a Markdown report.
//
// Usage (from the repository root of the main checkout, where docs/ exists; docs/ is outside Git):
//   node scripts/verify-persona-cnpjs.ts [--out docs/conferencias/cnpj-personas.md]
// From a worktree, pass the main checkout's absolute path in --out.
// Run at G2 and again on 29/11. Exit code: 0 = none exists; 1 = some CNPJ exists or is inconclusive.
// Only status codes and the API's short error message go to the report: a 200 body is never
// written (it could carry a real company's QSA).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ALL_PERSONA_CNPJS } from '../packages/personas/src/cnpjs.ts';

const BRASILAPI = 'https://brasilapi.com.br/api/cnpj/v1/';
const CNPJWS = 'https://publica.cnpj.ws/cnpj/';
const CNPJWS_INTERVAL_MS = 21_000; // public CNPJ.ws: 3 requests per minute per IP (research 03 §2.1)
const TIMEOUT_MS = 10_000;
const HEADERS = { accept: 'application/json', 'user-agent': 'refund-persona-check/1.0' };
const CONTROL_CNPJ = '00000000E08G12';

type Verdict = 'not registered' | 'EXISTS' | 'inconclusive';

interface Probe {
  status: number | null;
  message: string;
}

interface Check {
  cnpj: string;
  mask: string;
  role: string;
  brasilApi: Probe;
  cnpjWs: Probe | null;
  verdict: Verdict;
}

function mask(cnpj: string): string {
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}

async function probe(url: string): Promise<Probe> {
  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.ok) return { status: res.status, message: '(body not recorded)' };
    const text = await res.text();
    let message = text.slice(0, 160);
    try {
      const body = JSON.parse(text) as Record<string, unknown>;
      message = String(body.message ?? body.detalhes ?? body.titulo ?? message);
    } catch {
      // not JSON: keep the truncated text
    }
    return { status: res.status, message: message.replace(/\s+/g, ' ').trim() };
  } catch (error) {
    return { status: null, message: error instanceof Error ? error.name : 'network error' };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function verdictOf(a: Probe, b: Probe | null, onlySecond = false): Verdict {
  if (a.status === 200 || b?.status === 200) return 'EXISTS';
  if ((!onlySecond && a.status === 404) || b?.status === 404) return 'not registered';
  return 'inconclusive';
}

function nowBrt(): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date());
}

function cell(p: Probe | null): string {
  return p === null ? '—' : `${p.status ?? 'sem resposta'}: ${p.message}`;
}

function report(checks: Check[], control: Probe, when: string): string {
  const lines = [
    '# CNPJs das personas: não existem na Receita',
    '',
    `- Gerado por: \`node scripts/verify-persona-cnpjs.ts\` em ${when} (horário de Brasília)`,
    `- Fontes: BrasilAPI \`GET ${BRASILAPI}{cnpj}\`; CNPJ.ws \`GET ${CNPJWS}{cnpj}\` só quando a BrasilAPI não responde 404`,
    '- Critério: 404 = não registrado. 200 = existe (falha: trocar a raiz em `packages/personas/src/cnpjs.ts`). O corpo de uma resposta 200 nunca é gravado.',
    `- Controle positivo: \`${mask(CONTROL_CNPJ)}\` (primeiro CNPJ alfanumérico emitido, notícia da Receita de 31/07/2026) respondeu ${cell(control)} na BrasilAPI${control.status === 200 ? ', então a BrasilAPI aceita o formato alfanumérico e o 404 significa "não existe"' : '; sem o controle, cada CNPJ foi conferido também no CNPJ.ws'}.`,
    '- Usado por: ARCHITECTURE §7.5 (rodar no G2 e de novo em 29/11).',
    '',
    '| CNPJ | Papel | BrasilAPI | CNPJ.ws | Resultado |',
    '|---|---|---|---|---|',
    ...checks.map(
      (c) =>
        `| \`${c.mask}\` | ${c.role} | ${cell(c.brasilApi)} | ${cell(c.cnpjWs)} | **${c.verdict}** |`,
    ),
    '',
  ];
  return lines.join('\n');
}

function outPath(argv: string[]): string {
  const i = argv.indexOf('--out');
  const value = i >= 0 ? argv[i + 1] : undefined;
  return resolve(value ?? 'docs/conferencias/cnpj-personas.md');
}

async function main(): Promise<void> {
  const out = outPath(process.argv);
  const checks: Check[] = [];
  let usedCnpjWs = false;
  const control = await probe(`${BRASILAPI}${CONTROL_CNPJ}`);
  const brasilApiTrusted = control.status === 200;
  console.log(`control ${mask(CONTROL_CNPJ)}: BrasilAPI ${control.status ?? '-'}`);
  for (const { cnpj, role } of ALL_PERSONA_CNPJS) {
    const brasilApi = await probe(`${BRASILAPI}${cnpj}`);
    let cnpjWs: Probe | null = null;
    if (!brasilApiTrusted || (brasilApi.status !== 404 && brasilApi.status !== 200)) {
      if (usedCnpjWs) await sleep(CNPJWS_INTERVAL_MS);
      cnpjWs = await probe(`${CNPJWS}${cnpj}`);
      usedCnpjWs = true;
    }
    const check = {
      cnpj,
      mask: mask(cnpj),
      role,
      brasilApi,
      cnpjWs,
      verdict: brasilApiTrusted ? verdictOf(brasilApi, cnpjWs) : verdictOf(brasilApi, cnpjWs, true),
    };
    checks.push(check);
    console.log(
      `${check.mask}  ${check.verdict}  (BrasilAPI ${brasilApi.status ?? '-'}${cnpjWs ? `, CNPJ.ws ${cnpjWs.status ?? '-'}` : ''})`,
    );
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, report(checks, control, nowBrt()));
  console.log(`report: ${out}`);
  if (checks.some((c) => c.verdict !== 'not registered')) process.exit(1);
}

if (import.meta.main) await main();
