// AI Gateway model slugs (ARCHITECTURE §4.5), constants in code: changing them is a commit.
// Checked on 15/11/2026 against https://ai-gateway.vercel.sh/v1/models: anthropic/claude-haiku-5.5,
// claude-haiku-4.5, claude-sonnet-5.5 and claude-sonnet-5 are all listed. Classification is short and high volume
// (Haiku); the explanation is the user-facing text, so it gets Sonnet.
export const MODELS = {
  classify: { primary: 'anthropic/claude-haiku-5.5', fallbacks: ['anthropic/claude-haiku-4.5'] },
  explain: { primary: 'anthropic/claude-sonnet-5.5', fallbacks: ['anthropic/claude-sonnet-5'] },
  summarizeDiff: {
    primary: 'anthropic/claude-sonnet-5.5',
    fallbacks: ['anthropic/claude-sonnet-5'],
  },
} as const;

export type AiTask = keyof typeof MODELS;

/** Per-analysis limits of the live port (ARCHITECTURE §4.5). */
export interface AiBudget {
  /** Transactions one port instance sends to the model; the rest stay for the rules and the cards. */
  maxTransactionsPerAnalysis: number;
  /** Bound of one model call, fallbacks included. */
  timeoutMs: number;
}

export const DEFAULT_BUDGET: AiBudget = { maxTransactionsPerAnalysis: 300, timeoutMs: 20_000 };
