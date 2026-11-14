import { z } from 'zod';
import type { SourceAccount, SourceIdentity, SourceItem, SourceTransaction } from '../types.ts';

// Shape check of already-sanitized financial objects read back from fixtures (`strict`: no extra key).

const civilDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const cents = z.number().int().refine(Number.isSafeInteger);

/** `***.456.789-**`, or fully hidden `***.***.***-**` (partners, §6.2). */
const CPF_MASK = /^\*{3}\.(\d{3}|\*{3})\.(\d{3}|\*{3})-\*{2}$/;

export const protectedDocumentSchema = z
  .strictObject({
    type: z.enum(['CPF', 'CNPJ']),
    hmac: z.string().nullable(),
    publicValue: z.string().nullable(),
    mask: z.string(),
  })
  // A CPF never travels in clear (ARCHITECTURE §4.3): no public value, and a mask that hides it.
  .refine((d) => d.type !== 'CPF' || (d.publicValue === null && CPF_MASK.test(d.mask)), {
    message: 'CPF em claro',
  });

export const sourceItemSchema = z.strictObject({
  sourceId: z.string(),
  clientUserId: z.string().nullable(),
  status: z.string(),
  executionStatus: z.string(),
  connector: z.strictObject({
    id: z.number(),
    name: z.string(),
    sandbox: z.boolean(),
    type: z.string(),
  }),
});

export const sourceAccountSchema = z.strictObject({
  sourceId: z.string(),
  holder: z.enum(['PF', 'PJ']),
  type: z.enum(['BANK', 'CREDIT']),
  subtype: z.string(),
  productName: z.string(),
  institution: z.string(),
  currency: z.string(),
  balanceCents: cents.nullable(),
});

export const sourceTransactionSchema = z.strictObject({
  sourceId: z.string(),
  accountSourceId: z.string(),
  date: civilDate,
  amountCents: cents,
  description: z.string(),
  pluggyType: z.enum(['DEBIT', 'CREDIT']),
  method: z.enum(['PIX', 'TED', 'DOC', 'BOLETO', 'CARD', 'FEE', 'FX', 'OTHER']),
  sourceCategory: z.string().nullable(),
  counterparty: z
    .strictObject({
      document: protectedDocumentSchema.nullable(),
      name: z.string().nullable(),
      cnae: z.string().nullable(),
    })
    .nullable(),
  mcc: z.string().nullable(),
  installment: z.strictObject({ number: z.number().int(), total: z.number().int() }).nullable(),
});

export const sourceIdentitySchema = z.strictObject({
  holder: z.enum(['PF', 'PJ']),
  document: protectedDocumentSchema,
  economicActivities: z.array(z.string()),
  partnerDocuments: z.array(protectedDocumentSchema),
});

export function parseWith<T>(schema: z.ZodType, value: unknown): T | null {
  const r = schema.safeParse(value);
  return r.success ? (r.data as T) : null;
}

export type { SourceAccount, SourceIdentity, SourceItem, SourceTransaction };
