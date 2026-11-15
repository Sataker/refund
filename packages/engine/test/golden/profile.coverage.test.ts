// ENGINE-SPEC C.11.10, T11-19 (margin coverage), brackets up to 60 mil per month. The sweep lives in
// fixtures/coverage.ts; the larger brackets run in profile.coverage-*.test.ts, in parallel.
import { coverageSuite } from './fixtures/coverage.ts';

coverageSuite(['up_to_15k', 'from_15k_to_30k', 'from_30k_to_60k']);
