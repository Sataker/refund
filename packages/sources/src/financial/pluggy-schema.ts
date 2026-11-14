import { z } from 'zod';

// Raw Pluggy objects (API v1: items, accounts, transactions, identity), lenient on purpose: only the
// fields the whitelist reads are declared, everything else is ignored by zod and never copied
// (ARCHITECTURE §6.2, whitelist `pluggy@1`). PII fields such as `fullName`, `taxNumber` or
// `descriptionRaw` are deliberately NOT declared, so they cannot be read by mistake.

const text = z.string().nullish();
const amount = z.union([z.number(), z.string()]).nullish();

export const pluggyDocumentSchema = z.object({ type: text, value: text }).nullish();

const pluggyPartySchema = z
  .object({
    // `name` is read only to redact it from the description when the document is a CPF.
    name: text,
    documentNumber: pluggyDocumentSchema,
  })
  .nullish();

export const pluggyItemSchema = z.object({
  id: z.string(),
  status: z.string(),
  executionStatus: text,
  clientUserId: text,
  connector: z.object({
    id: z.number(),
    name: z.string(),
    isSandbox: z.boolean().nullish(),
    type: text,
  }),
});

export const pluggyAccountSchema = z.object({
  id: z.string(),
  type: z.string(),
  subtype: text,
  name: text,
  marketingName: text,
  currencyCode: text,
  balance: amount,
});

export const pluggyTransactionSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  date: z.string(),
  description: text,
  amount: z.union([z.number(), z.string()]),
  type: z.enum(['DEBIT', 'CREDIT']),
  category: text,
  merchant: z.object({ businessName: text, cnpj: text, cnae: text }).nullish(),
  creditCardMetadata: z
    .object({
      installmentNumber: z.number().nullish(),
      totalInstallments: z.number().nullish(),
      payeeMCC: z.union([z.number(), z.string()]).nullish(),
    })
    .nullish(),
  paymentData: z
    .object({
      paymentMethod: text,
      payer: pluggyPartySchema,
      receiver: pluggyPartySchema,
    })
    .nullish(),
});

export const pluggyIdentitySchema = z.object({
  document: text,
  documentType: text,
  economicActivities: z.array(z.object({ code: text })).nullish(),
  parties: z.array(z.object({ document: text, documentType: text })).nullish(),
});

export const pluggyPageSchema = z.object({
  results: z.array(z.unknown()),
  page: z.number().nullish(),
  totalPages: z.number().nullish(),
});

export type PluggyItem = z.infer<typeof pluggyItemSchema>;
export type PluggyAccount = z.infer<typeof pluggyAccountSchema>;
export type PluggyTransaction = z.infer<typeof pluggyTransactionSchema>;
export type PluggyIdentity = z.infer<typeof pluggyIdentitySchema>;
