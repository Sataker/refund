// Versioned prompts (ARCHITECTURE §4.5). Changing a prompt's text means a new version: the recording key includes
// it, so every recording made with the old text misses and `recordings-complete` asks for a re-record.
export {
  CLASSIFY_INSTRUCTIONS,
  CLASSIFY_PROMPT_VERSION,
  classifyPrompt,
} from './classify.ts';
export {
  EXPLAIN_INSTRUCTIONS,
  EXPLAIN_PROMPT_VERSION,
  explainData,
  explainPrompt,
} from './explain.ts';
export {
  SUMMARIZE_DIFF_INSTRUCTIONS,
  SUMMARIZE_DIFF_PROMPT_VERSION,
  summarizeDiffPrompt,
} from './summarize-diff.ts';
