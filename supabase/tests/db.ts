/**
 * Test helpers: boots PGlite (real Postgres in-process), loads the Supabase shim
 * and every migration in order, and runs queries as a given user / anon.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite, type Transaction } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const ROOT = join(import.meta.dirname, '..');
export const MIGRATIONS_DIR = join(ROOT, 'migrations');

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort();
}

export async function applyMigrations(db: PGlite): Promise<void> {
  for (const file of migrationFiles()) {
    try {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
    } catch (err) {
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`, { cause: err });
    }
  }
}

export async function createDb(): Promise<PGlite> {
  const db = new PGlite({ extensions: { pg_trgm, pgcrypto } });
  await db.exec(readFileSync(join(ROOT, 'tests', 'supabase-shim.sql'), 'utf8'));
  await applyMigrations(db);
  return db;
}

/** Runs `fn` as the `authenticated` role with auth.uid() = uid. Commits on success. */
export async function asUser<T>(db: PGlite, uid: string, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
    await tx.exec('set local role authenticated');
    return fn(tx);
  });
}

/** Runs `fn` as the `anon` role (not logged in). */
export async function asAnon<T>(db: PGlite, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec('set local role anon');
    return fn(tx);
  });
}

/** Creates a login the same way the owner will in the SQL Editor. Returns the user id. */
export async function createUser(db: PGlite, phone: string, name = 'Test User'): Promise<string> {
  const res = await db.query<{ id: string }>(`select public.create_app_user($1, $2) as id`, [phone, name]);
  return res.rows[0]!.id;
}
