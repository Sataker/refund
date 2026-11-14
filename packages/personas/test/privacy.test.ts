import { validateCnpj } from '@refund/sources';
import { describe, expect, it } from 'vitest';
import { ALL_PERSONA_CNPJS, ALLOWED_NAMES } from '../src/index.ts';
import { committedData, readCommitted } from './helpers.ts';

const files = ['dev-exportador.json', 'dev-exportador.answer-key.json'] as const;
const data = committedData();

function isValidCpf(digits: string): boolean {
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  const dv = (len: number): number => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(digits[i]) * (len + 1 - i);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(9) === Number(digits[9]) && dv(10) === Number(digits[10]);
}

describe('hero persona: no real personal data (ARCHITECTURE §6.4, TESTS §3.3)', () => {
  it.each(files)(
    '%s has no CPF in clear text (formatted or 11 digits with a valid check digit)',
    (f) => {
      const text = readCommitted(f);
      expect(text).not.toMatch(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/);
      for (const m of text.matchAll(/(?<!\d)\d{11}(?!\d)/g)) expect(isValidCpf(m[0])).toBe(false);
    },
  );

  it.each(files)('%s has no forbidden key', (f) => {
    const text = readCommitted(f);
    for (const k of [
      'qsa',
      'cnpj_cpf_do_socio',
      'nome_socio',
      'representante_legal',
      'logradouro',
      'cep',
      'email',
      'fullName',
      'birthDate',
      'taxNumber',
      'descriptionRaw',
      'accountNumber',
      'branchNumber',
    ]) {
      expect(text).not.toContain(`"${k}":`);
    }
  });

  it('every CPF is a ProtectedDocument with no clear value and no HMAC (no pepper in personas)', () => {
    const docs = data.items.flatMap((i) => [
      i.identity.document,
      ...i.identity.partnerDocuments,
      ...i.accounts.flatMap((a) => a.transactions.flatMap((t) => t.counterparty?.document ?? [])),
    ]);
    const cpfs = docs.filter((d) => d.type === 'CPF');
    expect(cpfs.length).toBeGreaterThan(0);
    for (const d of cpfs) {
      expect(d.publicValue).toBeNull();
      expect(d.hmac).toBeNull();
      expect(d.mask).toMatch(/^\*\*\*\.(\d{3}|\*{3})\.(\d{3}|\*{3})-\*\*$/);
    }
    // Identity parties[] keep only the HMAC: fully hidden mask (ARCHITECTURE §6.2)
    for (const i of data.items) {
      for (const p of i.identity.partnerDocuments) expect(p.mask).toBe('***.***.***-**');
    }
    // holder, 2 employees and the psychologist (+ the fully hidden partner mask)
    const partial = cpfs.filter((d) => d.mask !== '***.***.***-**');
    expect(new Set(partial.map((d) => d.mask)).size).toBe(4);
  });

  it.each(files)('%s only contains CNPJs listed in cnpjs.ts, all valid', (f) => {
    const listed = new Set<string>(ALL_PERSONA_CNPJS.map((c) => c.cnpj));
    const text = readCommitted(f);
    const bare = [...text.matchAll(/(?<![0-9A-Z])[0-9A-Z]{12}\d{2}(?![0-9A-Z])/g)].map((m) => m[0]);
    const masked = [
      ...text.matchAll(/[0-9A-Z]{2}\.[0-9A-Z]{3}\.[0-9A-Z]{3}\/[0-9A-Z]{4}-\d{2}/g),
    ].map((m) => m[0].replace(/[./-]/g, ''));
    expect(bare.length + masked.length).toBeGreaterThan(0);
    for (const c of [...bare, ...masked]) {
      if (!validateCnpj(c).ok) continue; // ids and other 14-char tokens that are not CNPJs
      expect(listed.has(c), c).toBe(true);
    }
  });

  it('every name in the data comes from names.ts', () => {
    const names = [
      data.holderDisplayName,
      data.company.displayLegalName,
      data.company.displayTradeName,
      ...data.items.flatMap((i) => [
        i.item.connector.name,
        ...i.accounts.flatMap((a) => [
          a.account.institution,
          ...a.transactions.flatMap((t) => t.counterparty?.name ?? []),
        ]),
      ]),
    ];
    for (const n of names) expect(ALLOWED_NAMES.has(n ?? ''), String(n)).toBe(true);
  });

  it('descriptions name no person: CPF counterparties appear as [pessoa]', () => {
    for (const t of data.items.flatMap((i) => i.accounts.flatMap((a) => a.transactions))) {
      if (t.counterparty?.document?.type === 'CPF') expect(t.description).toContain('[pessoa]');
      expect(t.description).not.toMatch(/\d{6,}/);
    }
  });
});
