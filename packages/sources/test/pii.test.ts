import { describe, expect, it } from 'vitest';
import {
  detectPii,
  findForbiddenKeys,
  hmacDocument,
  isAllowedEmailDomain,
  isValidCpf,
  mask,
  maskCpf,
  protectDocument,
  redactDescription,
  scanText,
  stripDocuments,
  syntheticDocument,
  validateCnpj,
} from '../src/index.ts';
import { cpfCheckDigits } from '../src/pii/cpf.ts';
import {
  ALNUM_CNPJ,
  CPF,
  CPF_2,
  formatCpf,
  NUMERIC_CNPJ,
  PERSONAL_EMAIL,
  PHONE,
} from './helpers.ts';

const pepper = new TextEncoder().encode('test-pepper-not-a-secret');

describe('CPF helpers', () => {
  it('validates check digits and rejects all-equal sequences', () => {
    expect(isValidCpf(CPF)).toBe(true);
    expect(isValidCpf(`${CPF.slice(0, 10)}${(Number(CPF[10]) + 1) % 10}`)).toBe(false);
    expect(isValidCpf('11111111111')).toBe(false);
    expect(isValidCpf('123')).toBe(false);
  });

  it('rejects a malformed base', () => {
    expect(() => cpfCheckDigits('12345678')).toThrow(RangeError);
  });

  it('masks a CPF as ***.456.789-** and never shows the first or last digits', () => {
    expect(maskCpf(CPF)).toBe(`***.${CPF.slice(3, 6)}.${CPF.slice(6, 9)}-**`);
    expect(maskCpf(formatCpf(CPF))).toBe(maskCpf(CPF));
    expect(maskCpf('12')).toBe('***.***.***-**');
  });

  it('generic mask keeps at most 2 characters on each side', () => {
    expect(mask('abcdef')).toBe('******');
    expect(mask('abcdefghij')).toBe('ab******ij');
  });
});

describe('hmacDocument', () => {
  it('is HMAC-SHA256 in base64url (43 chars) and ignores the mask', () => {
    const h = hmacDocument(CPF, pepper);
    expect(h).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hmacDocument(formatCpf(CPF), pepper)).toBe(h);
    expect(hmacDocument(CPF_2, pepper)).not.toBe(h);
    expect(hmacDocument(CPF, new TextEncoder().encode('other'))).not.toBe(h);
  });
});

describe('protectDocument', () => {
  it('a CPF keeps only HMAC and mask, never the number', () => {
    const d = protectDocument(formatCpf(CPF), pepper);
    expect(d).toEqual({
      type: 'CPF',
      hmac: hmacDocument(CPF, pepper),
      publicValue: null,
      mask: maskCpf(CPF),
    });
    expect(JSON.stringify(d)).not.toContain(CPF);
  });

  it('without a pepper the CPF HMAC is null (fixtures and personas)', () => {
    expect(protectDocument(CPF, null)?.hmac).toBeNull();
  });

  it('a CNPJ stays in clear (alphanumeric included)', () => {
    expect(protectDocument('12.abc.345/01de-35', pepper)).toEqual({
      type: 'CNPJ',
      hmac: null,
      publicValue: ALNUM_CNPJ,
      mask: '12.ABC.345/01DE-35',
    });
  });

  it('a partner CNPJ can be hidden (HMAC + partial mask only)', () => {
    const d = protectDocument(NUMERIC_CNPJ, pepper, { hidePublicValue: true });
    expect(d?.publicValue).toBeNull();
    expect(d?.hmac).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(d?.mask).toMatch(/^\d{2}\.\d{3}\.\d{3}\/\*{4}-\*\*$/);
    expect(protectDocument(NUMERIC_CNPJ, null, { hidePublicValue: true })?.hmac).toBeNull();
  });

  it('returns null for something that is not a document', () => {
    expect(protectDocument('12345', pepper)).toBeNull();
  });
});

describe('syntheticDocument', () => {
  it('is deterministic, valid and different from the original', () => {
    const cpf = syntheticDocument(CPF, 'CPF');
    expect(isValidCpf(cpf)).toBe(true);
    expect(cpf).not.toBe(CPF);
    expect(syntheticDocument(formatCpf(CPF), 'CPF')).toBe(cpf);
    const cnpj = syntheticDocument(NUMERIC_CNPJ, 'CNPJ');
    expect(validateCnpj(cnpj).ok).toBe(true);
    expect(cnpj.startsWith('RFSB')).toBe(true);
    expect(syntheticDocument(NUMERIC_CNPJ, 'CNPJ')).toBe(cnpj);
  });
});

describe('stripDocuments', () => {
  it('removes formatted CPF and CNPJ (alphanumeric included) and valid 11/14-digit runs', () => {
    expect(stripDocuments(`PIX ${formatCpf(CPF)} OK`)).toBe('PIX [doc] OK');
    expect(stripDocuments('PAGTO 12.ABC.345/01DE-35')).toBe('PAGTO [doc]');
    expect(stripDocuments(`TED ${CPF} X`)).toBe('TED [doc] X');
    expect(stripDocuments(`BOLETO ${NUMERIC_CNPJ}`)).toBe('BOLETO [doc]');
  });

  // Code review 14/11 (HIGH): CPFs glued to letters or in partial/spaced forms survived.
  it.each([
    ['glued to a letter', (c: string) => `PIX REF${formatCpf(c)}`, 'PIX REF[doc]'],
    ['glued on both sides', (c: string) => `X${formatCpf(c)}Y`, 'X[doc]Y'],
    ['dash only', (c: string) => `TED ${c.slice(0, 9)}-${c.slice(9)}`, 'TED [doc]'],
    [
      'spaces',
      (c: string) => `TED ${c.slice(0, 3)} ${c.slice(3, 6)} ${c.slice(6, 9)} ${c.slice(9)}`,
      'TED [doc]',
    ],
    [
      'dots without dash',
      (c: string) => `TED ${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}${c.slice(9)}`,
      'TED [doc]',
    ],
    ['CNPJ glued to a letter', () => 'REF12.ABC.345/01DE-35', 'REF[doc]'],
  ])('removes a CPF %s', (_label, build, expected) => {
    expect(stripDocuments(build(CPF))).toBe(expected);
  });

  it('keeps a spaced or partial sequence whose check digits are not a CPF', () => {
    expect(stripDocuments('TEL 123 456 789 00')).toBe('TEL 123 456 789 00');
    expect(stripDocuments('NF 123456789-01')).toBe('NF 123456789-01');
  });

  it('keeps runs with an invalid check digit and ordinary text', () => {
    expect(stripDocuments('PEDIDO 12345678901')).toBe('PEDIDO 12345678901');
    expect(stripDocuments('00000000000000')).toBe('00000000000000');
    expect(stripDocuments('DAS SIMPLES NACIONAL')).toBe('DAS SIMPLES NACIONAL');
  });
});

describe('redactDescription', () => {
  const cpfParty = { document: protectDocument(CPF, null), name: 'José Antônio Souza' };

  it('removes formatted and unformatted CPF and keeps useful text', () => {
    expect(redactDescription(`PIX RECEBIDO ${formatCpf(CPF)}`)).toBe('PIX RECEBIDO [doc]');
    expect(redactDescription(`PIX RECEBIDO ${CPF}`)).toBe('PIX RECEBIDO [doc]');
    expect(redactDescription('DAS SIMPLES NACIONAL')).toBe('DAS SIMPLES NACIONAL');
  });

  it("replaces a PF counterparty's name with [pessoa], ignoring case, accents and spacing", () => {
    expect(redactDescription('PIX ENVIADO JOSE ANTONIO  SOUZA', cpfParty)).toBe(
      'PIX ENVIADO [pessoa]',
    );
    expect(redactDescription('pix para josé antônio souza e José Antônio Souza', cpfParty)).toBe(
      'pix para [pessoa] e [pessoa]',
    );
  });

  it('handles decomposed accents, stray marks and characters outside the BMP', () => {
    expect(redactDescription('PIX JOSÉ ANTÔNIO SOUZA', cpfParty)).toBe('PIX [pessoa]');
    expect(redactDescription('\u{1F4B8} PIX josé antônio souza ́ ok', cpfParty)).toBe(
      '\u{1F4B8} PIX [pessoa] ́ ok',
    );
  });

  it('replaces whole words only', () => {
    const ana = { document: protectDocument(CPF, null), name: 'Ana' };
    expect(redactDescription('PIX ANA BANANA', ana)).toBe('PIX [pessoa] BANANA');
  });

  it('keeps a company name (CNPJ counterparty) and ignores a blank name', () => {
    const company = { document: protectDocument(NUMERIC_CNPJ, null), name: 'ACME LTDA' };
    expect(redactDescription('BOLETO ACME LTDA', company)).toBe('BOLETO ACME LTDA');
    expect(redactDescription('PIX X', { document: cpfParty.document, name: '   ' })).toBe('PIX X');
  });

  it('turns runs of 6 or more digits into #', () => {
    expect(redactDescription('TED AG 1234 CC 1234567')).toBe('TED AG 1234 CC #');
  });
});

describe('detectPii and scanText', () => {
  it('finds forbidden keys at any depth, except email inside sanitization', () => {
    const findings = detectPii({
      a: [{ qsa: [] }],
      b: { fullName: 'x', Email: 'x' },
      sanitization: { email: 'discarded' },
    });
    expect(findings.map((f) => f.path).sort()).toEqual(['$.a[0].qsa', '$.b.Email', '$.b.fullName']);
    expect(findings.every((f) => f.rule === 'forbidden-key')).toBe(true);
  });

  it('finds CPFs, e-mails and phones with their key as context, and masks them', () => {
    const findings = detectPii({
      note: `cliente ${formatCpf(CPF)}`,
      documentNumber: CPF,
      cpf: Number(CPF),
      contact: PERSONAL_EMAIL,
      telefone: PHONE,
    });
    expect(findings.map((f) => f.rule).sort()).toEqual([
      'email',
      'formatted-cpf',
      'phone',
      'unformatted-cpf',
      'unformatted-cpf',
    ]);
    for (const f of findings) {
      expect(f.excerpt).not.toContain(CPF.slice(2, 9));
      expect(f.excerpt).not.toContain('silva');
    }
  });

  it('finds a formatted CPF glued to letters and partial forms with valid check digits', () => {
    const spaced = `${CPF.slice(0, 3)} ${CPF.slice(3, 6)} ${CPF.slice(6, 9)} ${CPF.slice(9)}`;
    for (const text of [
      `PIX REF${formatCpf(CPF)}`,
      `REF${formatCpf(CPF)}X`,
      `TED ${CPF.slice(0, 9)}-${CPF.slice(9)}`,
      `TED ${spaced}`,
    ]) {
      expect(scanText(text).map((f) => f.rule)).toEqual(['formatted-cpf']);
    }
    expect(redactDescription(`PIX ${spaced} OK`)).toBe('PIX [doc] OK');
    expect(scanText('NF 123456789-01')).toEqual([]);
  });

  it('passes clean data, allowed e-mail domains and numbers without context', () => {
    expect(
      detectPii({
        amountCents: Number(CPF),
        support: ['ana', 'example.com'].join('@'),
        reference: PHONE,
        mask: maskCpf(CPF),
      }),
    ).toEqual([]);
  });

  it('allowed domains include subdomains', () => {
    expect(isAllowedEmailDomain('mail.userefund.com.br')).toBe(true);
    expect(isAllowedEmailDomain('gmail.com')).toBe(false);
  });

  it('scanText reports offsets and honours the allow hook (never for CPFs)', () => {
    const text = `a ${PERSONAL_EMAIL} b ${formatCpf(CPF)}`;
    const allowAll = () => true;
    expect(scanText(text, { allow: allowAll }).map((f) => f.rule)).toEqual(['formatted-cpf']);
    const [email] = scanText(text).filter((f) => f.rule === 'email');
    expect(email?.index).toBe(2);
  });

  it('findForbiddenKeys works on JSON text with offsets', () => {
    const [f] = findForbiddenKeys('{"x":1,\n"cnpj_cpf_do_socio":"a"}');
    expect(f).toMatchObject({ rule: 'forbidden-key', index: 8 });
  });
});
