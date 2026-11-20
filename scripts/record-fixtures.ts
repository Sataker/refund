// Records replay fixtures (ARCHITECTURE §5.1–5.2) from the ALREADY-SANITIZED providers through the
// recorder: the whitelist runs before anything is written, and `detectPii` refuses the recording if
// anything personal is left. Calls the internet: never runs in CI.
//
// A masked (EI/MEI) company is refused by the recorder: its CNPJ identifies a person. Any other
// organization CNPJ recorded under fixtures/cnpj/ must be listed in scripts/pii-exceptions.json with a
// reason, or the PII guard (rule 6) fails.
//
// Usage:
//   node scripts/record-fixtures.ts --source=cnpj --cnpj=<CNPJ> [--provider=brasilapi|cnpjws]
//   node scripts/record-fixtures.ts --source=cnpj-raw --cnpj=<CNPJ> [--provider=<one source>]
//     (E21: the raw answer of each of the six sources, REDUCED to the keys its whitelist reads, for the
//     adapter tests under packages/sources/test/fixtures/cnpj/. Only a large public company's CNPJ.)
//   node scripts/record-fixtures.ts --source=sgs --code=432 --from=YYYY-MM-DD --to=YYYY-MM-DD
//   node scripts/record-fixtures.ts --source=hero-selic      (synthetic, ENGINE-SPEC F.2)
//   node scripts/record-fixtures.ts --source=pluggy --item=<id>   (E11: needs PluggyFinancial)
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getJson } from '../packages/sources/src/http.ts';
import {
  BrasilApiCnpj,
  type CivilDate,
  CNPJ_SOURCES,
  CnpjWsCnpj,
  createEnvelope,
  detectPii,
  type ProviderContext,
  recording,
  SGS_WHITELIST,
  type SgsCode,
  SgsSeries,
  sanitizationOf,
  seriesKey,
  validateCnpj,
} from '../packages/sources/src/index.ts';
import { biomeFormat, FIXTURES_DIR, generateIndex } from './generate-fixtures-index.ts';

const SGS_CODES: readonly SgsCode[] = [432, 11, 433, 4389];

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

function die(message: string): never {
  console.error(`fixtures:record: ${message}`);
  process.exit(1);
}

function recordedBy(): string {
  try {
    const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
    return `scripts/record-fixtures.ts@${sha}`;
  } catch {
    return 'scripts/record-fixtures.ts';
  }
}

const ctx: ProviderContext = { mode: 'live' };
const written: string[] = [];
const onRecorded = (path: string): void => {
  written.push(path);
};

async function recordCnpj(): Promise<void> {
  const input = arg('cnpj') ?? die('missing --cnpj=');
  const cnpj = validateCnpj(input);
  if (!cnpj.ok) die(cnpj.error.message);
  const provider = arg('provider') ?? 'brasilapi';
  const dir = join(FIXTURES_DIR, 'cnpj');
  const live =
    provider === 'cnpjws'
      ? recording(
          new CnpjWsCnpj(),
          { dir, source: 'cnpjws.cnpj' },
          { recordedBy: recordedBy(), onRecorded },
        )
      : recording(
          new BrasilApiCnpj(),
          { dir, source: 'brasilapi.cnpj' },
          { recordedBy: recordedBy(), onRecorded },
        );
  const r = await live.lookup(cnpj.value, ctx);
  if (!r.ok) die(`${r.error.source} ${r.error.code}: ${r.error.message}`);
}

/** Where the reduced raw answers live: test data only, never indexed for replay. */
const RAW_CNPJ_DIR = 'packages/sources/test/fixtures/cnpj';

/**
 * Raw answers for the adapter tests. The whitelist runs FIRST: the answer must sanitize (a masked EI/MEI
 * company is refused, its CNPJ names a person), then only the keys the whitelist reads are kept (the
 * source's raw zod schema strips everything else, QSA included), and `detectPii` must find nothing.
 */
async function recordCnpjRaw(): Promise<void> {
  const input = arg('cnpj') ?? die('missing --cnpj=');
  const cnpj = validateCnpj(input);
  if (!cnpj.ok) die(cnpj.error.message);
  const only = arg('provider');
  mkdirSync(RAW_CNPJ_DIR, { recursive: true });
  for (const spec of CNPJ_SOURCES) {
    if (only && spec.source !== only) continue;
    const raw = await getJson(`${spec.baseUrl}/${cnpj.value}`, ctx, {
      source: spec.source,
      timeoutMs: 10_000,
    });
    if (!raw.ok) die(`${spec.source} ${raw.error.code}: ${raw.error.message}`);
    const recordedAt = new Date().toISOString();
    const company = spec.sanitize(raw.value, cnpj.value, recordedAt);
    if (!company.ok) die(`${spec.source} ${company.error.code}: ${company.error.message}`);
    if (company.value.masked) die(`${spec.source}: masked company (EI/MEI); not recorded`);
    const reduced = spec.rawSchema.parse(raw.value);
    const findings = detectPii(reduced);
    if (findings.length > 0) die(`${spec.source}: personal data left (${findings[0]?.rule})`);
    const path = join(RAW_CNPJ_DIR, `${spec.source}.${cnpj.value}.json`);
    const fixture = {
      source: spec.source,
      cnpj: cnpj.value,
      recordedAt,
      recordedBy: recordedBy(),
      sanitization: sanitizationOf(company.value) ?? {
        whitelist: 'cnpj@1',
        discardedFields: [],
        replacedDocuments: 0,
      },
      raw: reduced,
    };
    writeFileSync(path, `${JSON.stringify(fixture, null, 2)}\n`);
    written.push(path);
  }
}

function civil(name: string): CivilDate {
  const v = arg(name) ?? die(`missing --${name}=`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) die(`--${name} must be YYYY-MM-DD`);
  return v as CivilDate;
}

async function recordSgs(): Promise<void> {
  const code = Number(arg('code')) as SgsCode;
  if (!SGS_CODES.includes(code)) die(`--code must be one of ${SGS_CODES.join(', ')}`);
  const period = { from: civil('from'), to: civil('to') };
  const sgs = recording(
    new SgsSeries(),
    { dir: join(FIXTURES_DIR, 'sgs'), source: 'sgs.series' },
    { recordedBy: recordedBy(), onRecorded },
  );
  const r = await sgs.series(code, period, ctx);
  if (!r.ok) die(`${r.error.source} ${r.error.code}: ${r.error.message}`);
}

/**
 * Hero's Selic (ENGINE-SPEC F.2, "selicAnnual = fixture 15,00%"): series 432 held at 15.00 on every
 * day of the hero window, up to the analysis date. Synthetic by design (`origin: 'synthetic'`); `/app`
 * uses the SGS value of the day.
 */
function recordHeroSelic(): void {
  const period = { from: '2025-11-01' as CivilDate, to: '2026-11-12' as CivilDate };
  const data: { date: CivilDate; value: string }[] = [];
  for (let d = new Date(`${period.from}T00:00:00Z`); d.toISOString().slice(0, 10) <= period.to; ) {
    data.push({ date: d.toISOString().slice(0, 10) as CivilDate, value: '15.00' });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  const key = seriesKey(432, period);
  const envelope = createEnvelope({
    source: 'sgs.series',
    key,
    origin: 'synthetic',
    recordedAt: new Date().toISOString(),
    recordedBy: `${recordedBy()} --source=hero-selic (ENGINE-SPEC F.2)`,
    sanitization: { whitelist: SGS_WHITELIST, discardedFields: [], replacedDocuments: 0 },
    data,
  });
  const dir = join(FIXTURES_DIR, 'sgs');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${key}.json`);
  writeFileSync(path, `${JSON.stringify(envelope, null, 2)}\n`);
  written.push(path);
}

async function main(): Promise<void> {
  const source = arg('source');
  if (source === 'cnpj') await recordCnpj();
  else if (source === 'cnpj-raw') {
    await recordCnpjRaw();
    biomeFormat(written);
    for (const p of written) console.log(`recorded ${p}`);
    return;
  } else if (source === 'sgs') await recordSgs();
  else if (source === 'hero-selic') recordHeroSelic();
  else if (source === 'pluggy') {
    die('the live Pluggy provider (PluggyFinancial) arrives in E11; nothing recorded');
  } else die('use --source=cnpj|cnpj-raw|sgs|hero-selic|pluggy');
  biomeFormat(written);
  generateIndex();
  for (const p of written) console.log(`recorded ${p}`);
}

if (import.meta.main) await main();
