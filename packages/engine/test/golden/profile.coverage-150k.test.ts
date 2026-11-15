// ENGINE-SPEC C.11.10, T11-19 (margin coverage), 150 to 300 mil per month (sweep in fixtures/coverage.ts). The
// brackets above 300 mil and "não sei" never yield a range (C.11.5, items 5–7).
import { coverageSuite } from './fixtures/coverage.ts';

coverageSuite(['from_150k_to_300k', 'from_300k_to_400k', 'above_400k', 'dont_know']);
