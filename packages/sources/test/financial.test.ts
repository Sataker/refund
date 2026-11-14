import { describe, expect, it } from 'vitest';
import {
  type CivilDate,
  createEnvelope,
  detectPii,
  hmacDocument,
  type PersonaDataset,
  PersonaFinancial,
  protectedDocumentSchema,
  ReplayFinancial,
  reaisToCents,
  type SourceTransaction,
  sanitizationOf,
  sanitizePluggyAccount,
  sanitizePluggyIdentity,
  sanitizePluggyItem,
  sanitizePluggyTransaction,
  validateCnpj,
} from '../src/index.ts';
import { CPF, CPF_2, formatCpf, NUMERIC_CNPJ, PERSONAL_EMAIL, PHONE } from './helpers.ts';

const pepper = new TextEncoder().encode('test-pepper-not-a-secret');
const ctx = { mode: 'replay' as const };
const period = { from: '2026-01-01' as CivilDate, to: '2026-12-31' as CivilDate };

function pixOut(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'tx-1',
    accountId: 'acc-1',
    date: '2026-10-05T03:00:00.000Z',
    description: `PIX ENVIADO JOSE SOUZA ${formatCpf(CPF)}`,
    descriptionRaw: `PIX ENVIADO JOSE SOUZA ${CPF} AG 1234 CC 98765-4`,
    currencyCode: 'BRL',
    amount: -1500.5,
    balance: 1000,
    providerCode: '123',
    category: 'Transfers',
    type: 'DEBIT',
    paymentData: {
      paymentMethod: 'PIX',
      payer: {
        name: 'ACME LTDA',
        accountNumber: '12345',
        branchNumber: '0001',
        documentNumber: { type: 'CNPJ', value: NUMERIC_CNPJ },
      },
      receiver: {
        name: 'José Souza',
        accountNumber: '98765',
        branchNumber: '1234',
        routingNumber: '341',
        documentNumber: { type: 'CPF', value: CPF },
      },
    },
    ...overrides,
  };
}

describe('Pluggy transaction whitelist (pluggy@1)', () => {
  it('a CPF counterparty becomes HMAC + mask; its number and name never leave', () => {
    const r = sanitizePluggyTransaction(pixOut(), { pepper });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const t = r.value;
    expect(t).toEqual({
      sourceId: 'tx-1',
      accountSourceId: 'acc-1',
      date: '2026-10-05',
      amountCents: -150050,
      description: 'PIX ENVIADO [pessoa] [doc]',
      pluggyType: 'DEBIT',
      method: 'PIX',
      sourceCategory: 'Transfers',
      counterparty: {
        document: {
          type: 'CPF',
          hmac: hmacDocument(CPF, pepper),
          publicValue: null,
          mask: `***.${CPF.slice(3, 6)}.${CPF.slice(6, 9)}-**`,
        },
        name: null,
        cnae: null,
      },
      mcc: null,
      installment: null,
    } satisfies SourceTransaction);
    const json = JSON.stringify(t);
    for (const leak of [CPF, 'José', 'JOSE', '98765', 'descriptionRaw', 'accountNumber']) {
      expect(json).not.toContain(leak);
    }
    expect(detectPii(t)).toEqual([]);
    expect(sanitizationOf(t)?.discardedFields).toEqual(
      expect.arrayContaining(['descriptionRaw', 'providerCode', 'balance', 'currencyCode']),
    );
  });

  it('a CNPJ counterparty stays in clear with its name (credit: the payer)', () => {
    const r = sanitizePluggyTransaction(
      pixOut({ type: 'CREDIT', amount: 2000, description: 'PIX RECEBIDO ACME LTDA' }),
      { pepper },
    );
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.amountCents).toBe(200000);
    expect(r.value.counterparty).toEqual({
      document: { type: 'CNPJ', hmac: null, publicValue: NUMERIC_CNPJ, mask: expect.any(String) },
      name: 'ACME LTDA',
      cnae: null,
    });
    expect(r.value.description).toBe('PIX RECEBIDO ACME LTDA');
  });

  it('a card purchase keeps merchant CNPJ, CNAE, MCC and installments', () => {
    const r = sanitizePluggyTransaction(
      {
        id: 'tx-2',
        accountId: 'card-1',
        date: '2026-10-06T00:00:00.000Z',
        description: 'ACADEMIA FIT 2/10',
        amount: 199.9,
        type: 'DEBIT',
        merchant: {
          name: 'ACADEMIA',
          businessName: 'ACADEMIA FIT LTDA',
          cnpj: NUMERIC_CNPJ,
          cnae: '9313100',
        },
        creditCardMetadata: {
          installmentNumber: 2,
          totalInstallments: 10,
          payeeMCC: 7997,
          cardNumber: '1234',
        },
      },
      { pepper: null },
    );
    if (!r.ok) throw new Error('expected ok');
    expect(r.value).toMatchObject({
      amountCents: -19990,
      method: 'CARD',
      mcc: '7997',
      installment: { number: 2, total: 10 },
      counterparty: { name: 'ACADEMIA FIT LTDA', cnae: '9313-1/00' },
    });
    expect(JSON.stringify(r.value)).not.toContain('cardNumber');
  });

  it('without any document the name is dropped and the counterparty may be null', () => {
    const withName = sanitizePluggyTransaction(
      pixOut({ paymentData: { paymentMethod: 'TED', receiver: { name: 'Fulano de Tal' } } }),
      { pepper },
    );
    expect(withName.ok && withName.value.counterparty).toBeNull();
    const truncated = sanitizePluggyTransaction(
      pixOut({
        description: 'TED ENVIADA FULANO T',
        paymentData: { paymentMethod: 'TED', receiver: { name: 'Fulano de Tal' } },
      }),
      { pepper },
    );
    expect(truncated.ok && truncated.value.description).toBe('TED ENVIADA [pessoa] T');
    const merchantNoCnpj = sanitizePluggyTransaction(
      pixOut({ paymentData: null, merchant: { businessName: 'X', cnpj: null, cnae: null } }),
      { pepper },
    );
    expect(merchantNoCnpj.ok && merchantNoCnpj.value.counterparty).toBeNull();
    expect(merchantNoCnpj.ok && merchantNoCnpj.value.method).toBe('OTHER');
  });

  it('fixture recording replaces documents with synthetic ones and counts them', () => {
    const r = sanitizePluggyTransaction(pixOut(), { pepper: null, syntheticDocuments: true });
    if (!r.ok) throw new Error('expected ok');
    const doc = r.value.counterparty?.document;
    expect(doc?.type).toBe('CPF');
    expect(doc?.hmac).toBeNull();
    expect(doc?.mask).not.toBe(`***.${CPF.slice(3, 6)}.${CPF.slice(6, 9)}-**`);
    expect(sanitizationOf(r.value)?.replacedDocuments).toBe(1);
    const merchant = sanitizePluggyTransaction(
      pixOut({
        paymentData: null,
        merchant: { businessName: 'ACME', cnpj: NUMERIC_CNPJ, cnae: null },
      }),
      { pepper: null, syntheticDocuments: true },
    );
    expect(
      merchant.ok && merchant.value.counterparty?.document?.publicValue?.startsWith('RFSB'),
    ).toBe(true);
    const junk = sanitizePluggyTransaction(
      pixOut({ paymentData: { receiver: { documentNumber: { value: '123' } } } }),
      { pepper: null, syntheticDocuments: true },
    );
    expect(junk.ok && junk.value.counterparty).toBeNull();
  });

  it.each([
    ['no id', { id: undefined }],
    ['bad date', { date: 'yesterday' }],
    ['bad amount', { amount: 'abc' }],
    ['bad type', { type: 'TRANSFER' }],
  ])('%s → UNEXPECTED_RESPONSE', (_label, overrides) => {
    const r = sanitizePluggyTransaction(pixOut(overrides), { pepper });
    expect(r).toMatchObject({
      ok: false,
      error: { code: 'UNEXPECTED_RESPONSE', source: 'pluggy' },
    });
  });
});

describe('reaisToCents', () => {
  it.each([
    [1500.5, 150050],
    [-0.01, -1],
    [1.005, 101],
    ['12.345', 1235],
    ['7', 700],
    [1e-7, 0],
    [0, 0],
    [null, null],
    ['1,50', null],
    [Number.MAX_SAFE_INTEGER, null],
  ])('%s → %s', (input, expected) => {
    expect(reaisToCents(input)).toBe(expected);
  });
});

describe('protectedDocumentSchema (fixtures read back)', () => {
  const masked = `***.${CPF.slice(3, 6)}.${CPF.slice(6, 9)}-**`;
  it('a CPF must have no public value and a ***.NNN.NNN-** (or fully hidden) mask', () => {
    expect(
      protectedDocumentSchema.safeParse({
        type: 'CPF',
        hmac: null,
        publicValue: null,
        mask: masked,
      }).success,
    ).toBe(true);
    expect(
      protectedDocumentSchema.safeParse({
        type: 'CPF',
        hmac: null,
        publicValue: null,
        mask: '***.***.***-**',
      }).success,
    ).toBe(true);
    expect(
      protectedDocumentSchema.safeParse({ type: 'CPF', hmac: null, publicValue: CPF, mask: masked })
        .success,
    ).toBe(false);
    expect(
      protectedDocumentSchema.safeParse({
        type: 'CPF',
        hmac: null,
        publicValue: null,
        mask: formatCpf(CPF),
      }).success,
    ).toBe(false);
    expect(
      protectedDocumentSchema.safeParse({
        type: 'CNPJ',
        hmac: null,
        publicValue: NUMERIC_CNPJ,
        mask: 'x',
      }).success,
    ).toBe(true);
  });
});

describe('Pluggy account, item and identity whitelists', () => {
  it('account: no number, owner or tax number; product name without digits; balance in cents', () => {
    const r = sanitizePluggyAccount(
      {
        id: 'acc-1',
        type: 'BANK',
        subtype: 'CHECKING_ACCOUNT',
        number: '0001/12345-0',
        name: 'Conta Corrente 1234567',
        marketingName: null,
        owner: 'José Souza',
        taxNumber: CPF,
        balance: 1013.66,
        currencyCode: 'BRL',
        bankData: { transferNumber: '0001/12345-0' },
        creditData: { availableCreditLimit: 1000 },
      },
      { holder: 'PF', institution: 'Banco Exemplo' },
    );
    if (!r.ok) throw new Error('expected ok');
    expect(r.value).toEqual({
      sourceId: 'acc-1',
      holder: 'PF',
      type: 'BANK',
      subtype: 'CHECKING_ACCOUNT',
      productName: 'Conta Corrente #',
      institution: 'Banco Exemplo',
      currency: 'BRL',
      balanceCents: 101366,
    });
    expect(sanitizationOf(r.value)?.discardedFields).toEqual([
      'bankData',
      'creditData',
      'number',
      'owner',
      'taxNumber',
    ]);
    expect(
      sanitizePluggyAccount({ id: 'x', type: 'INVESTMENT' }, { holder: 'PF', institution: 'X' }).ok,
    ).toBe(false);
    expect(sanitizePluggyAccount(null, { holder: 'PF', institution: 'X' }).ok).toBe(false);
  });

  it('item: keeps status and connector, drops parameters, credentials and provider messages', () => {
    const r = sanitizePluggyItem({
      id: 'item-1',
      status: 'UPDATED',
      executionStatus: 'SUCCESS',
      clientUserId: 'user-1',
      parameter: { cpf: CPF },
      error: { providerMessage: `CPF ${CPF} bloqueado` },
      userAction: null,
      connector: {
        id: 2,
        name: 'Pluggy Bank',
        isSandbox: true,
        type: 'PERSONAL_BANK',
        credentials: [],
      },
    });
    if (!r.ok) throw new Error('expected ok');
    expect(r.value).toEqual({
      sourceId: 'item-1',
      clientUserId: 'user-1',
      status: 'UPDATED',
      executionStatus: 'SUCCESS',
      connector: { id: 2, name: 'Pluggy Bank', sandbox: true, type: 'PERSONAL_BANK' },
    });
    expect(JSON.stringify(r.value)).not.toContain(CPF);
    expect(sanitizePluggyItem({ id: 'x' }).ok).toBe(false);
    const minimal = sanitizePluggyItem({
      id: 'x',
      status: 'UPDATING',
      connector: { id: 1, name: 'B' },
    });
    expect(minimal.ok && minimal.value).toMatchObject({
      clientUserId: null,
      executionStatus: '',
      connector: { sandbox: false, type: '' },
    });
  });

  it('identity: no fullName, birthDate, addresses, phones or e-mails; partners only as HMAC', () => {
    const raw = {
      id: 'id-1',
      fullName: 'José Souza',
      birthDate: '1990-01-01',
      document: formatCpf(CPF),
      documentType: 'CPF',
      taxNumber: CPF,
      emails: [{ value: PERSONAL_EMAIL }],
      phoneNumbers: [{ value: PHONE }],
      addresses: [{ fullAddress: 'Rua X, 1' }],
      relations: [{ name: 'Mãe' }],
      economicActivities: [{ code: '6201501' }, { code: null }],
      parties: [
        { document: CPF_2, documentType: 'CPF', name: 'Sócia Fictícia' },
        { document: NUMERIC_CNPJ, documentType: 'CNPJ', name: 'Holding' },
        { document: null, name: 'Sem documento' },
      ],
    };
    const r = sanitizePluggyIdentity(raw, { pepper });
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.holder).toBe('PF');
    expect(r.value.document).toMatchObject({
      type: 'CPF',
      publicValue: null,
      hmac: hmacDocument(CPF, pepper),
    });
    expect(r.value.economicActivities).toEqual(['6201-5/01']);
    expect(r.value.partnerDocuments).toHaveLength(2);
    for (const p of r.value.partnerDocuments) {
      expect(p.publicValue).toBeNull();
      expect(p.hmac).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }
    const json = JSON.stringify(r.value);
    for (const leak of [
      CPF,
      CPF_2,
      NUMERIC_CNPJ,
      'José',
      'Sócia',
      PERSONAL_EMAIL,
      PHONE,
      '1990',
      'Rua',
    ]) {
      expect(json).not.toContain(leak);
    }
    expect(detectPii(r.value)).toEqual([]);
    expect(sanitizationOf(r.value)?.discardedFields).toEqual(
      expect.arrayContaining(['fullName', 'birthDate', 'taxNumber', 'emails', 'addresses']),
    );
  });

  it('identity of a company is PJ; an invalid holder document is refused', () => {
    const pj = sanitizePluggyIdentity(
      { document: NUMERIC_CNPJ, documentType: 'CNPJ' },
      { pepper: null },
    );
    expect(pj.ok && pj.value).toMatchObject({
      holder: 'PJ',
      document: { publicValue: NUMERIC_CNPJ },
    });
    expect(sanitizePluggyIdentity({ document: '123' }, { pepper: null }).ok).toBe(false);
    expect(sanitizePluggyIdentity('x', { pepper: null }).ok).toBe(false);
    const synthetic = sanitizePluggyIdentity(
      { document: CPF, parties: [{ document: NUMERIC_CNPJ }] },
      { pepper: null, syntheticDocuments: true },
    );
    expect(synthetic.ok && sanitizationOf(synthetic.value)?.replacedDocuments).toBe(2);
  });
});

// ---------- persona and replay providers ----------

const cnpj = validateCnpj('RFDEV001000158');
if (!cnpj.ok) throw new Error('fixture CNPJ');

function tx(id: string, date: string): SourceTransaction {
  return {
    sourceId: id,
    accountSourceId: 'acc-pj',
    date: date as CivilDate,
    amountCents: -100,
    description: 'TARIFA',
    pluggyType: 'DEBIT',
    method: 'FEE',
    sourceCategory: null,
    counterparty: null,
    mcc: null,
    installment: null,
  };
}

const dataset: PersonaDataset = {
  items: [
    {
      holder: 'PJ',
      item: {
        sourceId: 'item-pj',
        clientUserId: null,
        status: 'UPDATED',
        executionStatus: 'SUCCESS',
        connector: { id: 0, name: 'Banco Sintético', sandbox: true, type: 'BUSINESS_BANK' },
      },
      identity: {
        holder: 'PJ',
        document: { type: 'CNPJ', hmac: null, publicValue: cnpj.value, mask: 'RF.DEV.001/0001-58' },
        economicActivities: ['6201-5/01'],
        partnerDocuments: [],
      },
      accounts: [
        {
          account: {
            sourceId: 'acc-pj',
            holder: 'PJ',
            type: 'BANK',
            subtype: 'CHECKING_ACCOUNT',
            productName: 'Conta Corrente PJ',
            institution: 'Banco Sintético',
            currency: 'BRL',
            balanceCents: 100,
          },
          transactions: [
            tx('t1', '2025-12-31'),
            tx('t2', '2026-01-10'),
            tx('t3', '2026-02-10'),
            tx('t4', '2026-03-10'),
          ],
        },
      ],
    },
  ],
};

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

describe('PersonaFinancial', () => {
  const persona = new PersonaFinancial(dataset, { pageSize: 2 });

  it('serves item, accounts and identity', async () => {
    expect(persona.name).toBe('persona');
    expect(await persona.getItem('item-pj', ctx)).toMatchObject({
      ok: true,
      value: { sourceId: 'item-pj' },
    });
    expect(await persona.listAccounts('item-pj', ctx)).toMatchObject({
      ok: true,
      value: [{ sourceId: 'acc-pj' }],
    });
    expect(await persona.getIdentity('item-pj', ctx)).toMatchObject({
      ok: true,
      value: { holder: 'PJ' },
    });
  });

  it('pages the transactions of the period', async () => {
    const pages = await collect(persona.listTransactions('acc-pj', period, ctx));
    expect(pages.map((p) => (p.ok ? p.value.map((t) => t.sourceId) : []))).toEqual([
      ['t2', 't3'],
      ['t4'],
    ]);
  });

  it('unknown ids → NOT_FOUND', async () => {
    expect(await persona.getItem('x', ctx)).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND', source: 'persona' },
    });
    expect(await persona.listAccounts('x', ctx)).toMatchObject({ ok: false });
    expect(await persona.getIdentity('x', ctx)).toMatchObject({ ok: false });
    expect(await collect(persona.listTransactions('x', period, ctx))).toMatchObject([
      { ok: false },
    ]);
  });
});

describe('ReplayFinancial', () => {
  const pj = dataset.items[0];
  if (!pj) throw new Error('dataset');
  const envelope = (
    source: 'pluggy.item' | 'pluggy.accounts' | 'pluggy.transactions' | 'pluggy.identity',
    key: string,
    data: unknown,
  ) =>
    createEnvelope({
      source,
      key,
      origin: 'live',
      recordedAt: '2026-11-20T12:00:00.000Z',
      recordedBy: 'test',
      sanitization: { whitelist: 'pluggy@1', discardedFields: [], replacedDocuments: 0 },
      data,
    });
  const fixtures = [
    envelope('pluggy.item', 'item-pj', pj.item),
    envelope(
      'pluggy.accounts',
      'item-pj',
      pj.accounts.map((a) => a.account),
    ),
    envelope('pluggy.transactions', 'acc-pj', pj.accounts[0]?.transactions),
  ];
  const replay = new ReplayFinancial({ fixtures, pageSize: 10 });

  it('reads item, accounts and transactions from verified envelopes', async () => {
    expect(replay.name).toBe('replay');
    expect(await replay.getItem('item-pj', ctx)).toEqual({ ok: true, value: pj.item });
    expect(await replay.listAccounts('item-pj', ctx)).toMatchObject({
      ok: true,
      value: [{ sourceId: 'acc-pj' }],
    });
    const pages = await collect(replay.listTransactions('acc-pj', period, ctx));
    expect(pages).toHaveLength(1);
    expect(pages[0]?.ok && pages[0].value.map((t) => t.sourceId)).toEqual(['t2', 't3', 't4']);
  });

  it('identity: null when the item was recorded without it; FIXTURE_MISSING for an unknown item', async () => {
    expect(await replay.getIdentity('item-pj', ctx)).toEqual({ ok: true, value: null });
    expect(await replay.getIdentity('nope', ctx)).toMatchObject({
      ok: false,
      error: { code: 'FIXTURE_MISSING' },
    });
    const withIdentity = new ReplayFinancial({
      fixtures: [...fixtures, envelope('pluggy.identity', 'item-pj', pj.identity)],
    });
    expect(await withIdentity.getIdentity('item-pj', ctx)).toEqual({
      ok: true,
      value: pj.identity,
    });
  });

  it('missing or malformed fixtures are typed errors', async () => {
    expect(await replay.getItem('nope', ctx)).toMatchObject({
      ok: false,
      error: { code: 'FIXTURE_MISSING' },
    });
    expect(await collect(replay.listTransactions('nope', period, ctx))).toMatchObject([
      { ok: false, error: { code: 'FIXTURE_MISSING' } },
    ]);
    const bad = new ReplayFinancial({
      fixtures: [envelope('pluggy.item', 'item-pj', { ...pj.item, fullName: 'x' })],
    });
    expect(await bad.getItem('item-pj', ctx)).toMatchObject({
      ok: false,
      error: { code: 'UNEXPECTED_RESPONSE' },
    });
    expect(await new ReplayFinancial().getItem('nope', ctx)).toMatchObject({ ok: false });
  });
});
