/**
 * Guard: the Guest Studio is client-facing, so the data modules it reads through must never
 * select internal cost / vendor / margin columns. Fails if someone adds one by mistake.
 * @vitest-environment node
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');
const GUEST_FACING = ['src/data/studioCatalog.ts', 'src/data/quotes.ts', 'src/data/eventOptions.ts', 'src/data/quoteEdit.ts'];
const INTERNAL = /unit_cost|cost_source|vendor|master_rate_at_quote|margin|source_raw|notes|multiplier/;

describe('guest-facing data never selects internal columns', () => {
  for (const file of GUEST_FACING) {
    it(file, () => {
      const code = readFileSync(join(ROOT, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '') // comments explain the rule and name the columns
        .replace(/\/\/.*$/gm, '');
      expect(code).not.toMatch(INTERNAL);
    });
  }
});
