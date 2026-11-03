/**
 * Database tests: run the real migrations in PGlite and verify per-user isolation (RLS),
 * constraints, quote snapshots/freezing, append-only history, rate limiting and auth helpers.
 * @vitest-environment node
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite as PGliteCtor, type PGlite, type Transaction } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { MIGRATIONS_DIR, applyMigrations, asAnon, asUser, createDb, createUser, migrationFiles } from './db';

let db: PGlite;
let userA: string;
let userB: string;

const one = async <T>(tx: Transaction | PGlite, sql: string, params: unknown[] = []) =>
  (await tx.query<T>(sql, params)).rows[0]!;

/** Thrown at the end of a test transaction to undo it (the shared catalogue would keep it). */
const ROLLBACK = 'test rollback';

async function tierId(tx: Transaction, name = 'Standard'): Promise<string> {
  return (await one<{ id: string }>(tx, `select id from public.tiers where name = $1`, [name])).id;
}

async function newElement(tx: Transaction, name: string, rate = 1000): Promise<string> {
  return (
    await one<{ id: string }>(tx, `insert into public.elements (name, default_rate) values ($1, $2) returning id`, [
      name,
      rate,
    ])
  ).id;
}

async function newQuote(tx: Transaction, extra: Record<string, unknown> = {}) {
  const row = { guest_name: 'Rohit Sharma', function_name: 'Sangeet', ...extra };
  const cols = Object.keys(row);
  const vals = Object.values(row);
  return one<{ id: string; quote_no: string; status: string }>(
    tx,
    `insert into public.quotes (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')})
     returning id, quote_no, status`,
    vals,
  );
}

beforeAll(async () => {
  db = await createDb();
  userA = await createUser(db, '9876543210', 'Uday Yadav');
  userB = await createUser(db, '+91 91234 56789', 'David');
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe('migrations', () => {
  it('can be re-run safely (idempotent)', async () => {
    await expect(applyMigrations(db)).resolves.toBeUndefined();
  });

  it('APPLY_ALL.sql is up to date and runs on a fresh database', async () => {
    const bundled = readFileSync(join(MIGRATIONS_DIR, '..', 'APPLY_ALL.sql'), 'utf8');
    for (const f of migrationFiles()) {
      expect(bundled, `${f} missing or stale — run npm run db:bundle`).toContain(
        readFileSync(join(MIGRATIONS_DIR, f), 'utf8').trim(),
      );
    }
    const fresh = new PGliteCtor({ extensions: { pg_trgm, pgcrypto } });
    await fresh.exec(readFileSync(join(MIGRATIONS_DIR, '..', 'tests', 'supabase-shim.sql'), 'utf8'));
    await expect(fresh.exec(bundled)).resolves.toBeTruthy();
    await fresh.close();
  }, 60_000);

  it('packages have no link to functions', async () => {
    const res = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'packages'`,
    );
    const cols = res.rows.map((r) => r.column_name);
    expect(cols).toContain('tier_id');
    expect(cols.some((c) => c.includes('function'))).toBe(false);
  });

  it('has RLS enabled on every public table', async () => {
    const res = await db.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(res.rows).toEqual([]);
  });
});

describe('accounts (phone login)', () => {
  it('normalizes phone numbers', async () => {
    const r = await one<Record<string, string | null>>(
      db,
      `select public.normalize_phone('9876543210') a, public.normalize_phone('+91 98765-43210') b,
              public.normalize_phone('09876543210') c, public.normalize_phone('12345') d,
              public.normalize_phone('5876543210') e`,
    );
    expect(r).toEqual({ a: '9876543210', b: '9876543210', c: '9876543210', d: null, e: null });
  });

  it('creates an auth user with internal email, hashed default password and profile', async () => {
    const u = await one<{ email: string; ok: boolean; token: string }>(
      db,
      `select email, encrypted_password = extensions.crypt('ambria@123', encrypted_password) as ok,
              confirmation_token as token from auth.users where id = $1`,
      [userB],
    );
    expect(u).toEqual({ email: '9123456789@phone.invalid', ok: true, token: '' });

    const p = await one<{ phone: string; full_name: string; must_change_password: boolean }>(
      db,
      `select phone, full_name, must_change_password from public.profiles where id = $1`,
      [userB],
    );
    expect(p).toEqual({ phone: '9123456789', full_name: 'David', must_change_password: true });

    const ident = await one<{ n: number }>(db, `select count(*)::int n from auth.identities where user_id = $1`, [userB]);
    expect(ident.n).toBe(1);
  });

  it('seeds each user their own option lists', async () => {
    const counts = await asUser(db, userA, (tx) =>
      one<Record<string, number>>(
        tx,
        `select (select count(*)::int from public.function_options) f,
                (select count(*)::int from public.function_options where is_active) fa,
                (select count(*)::int from public.venues) v,
                (select count(*)::int from public.sub_venues) sv,
                (select count(*)::int from public.sessions) s,
                (select count(*)::int from public.tiers) t`,
      ),
    );
    expect(counts).toEqual({ f: 35, fa: 33, v: 4, sv: 2, s: 3, t: 2 });
  });

  it('blocks sign-ups that do not come through create_app_user', async () => {
    await expect(
      db.query(`insert into auth.users (id, email) values (gen_random_uuid(), 'someone@example.com')`),
    ).rejects.toThrow(/Sign-ups are disabled/);
    // The lock re-closes after create_app_user's own insert.
    const flag = await one<{ v: string | null }>(db, `select current_setting('app.allow_user_create', true) v`);
    expect(flag.v === null || flag.v === '' || flag.v === 'off').toBe(true);
  });

  it('rejects invalid and duplicate phones', async () => {
    await expect(createUser(db, '12345')).rejects.toThrow(/Invalid phone/);
    await expect(createUser(db, '09876543210')).rejects.toThrow(/already exists/);
  });

  it('app users cannot create or reset accounts', async () => {
    await expect(
      asUser(db, userA, (tx) => tx.query(`select public.create_app_user('9000000001', 'x')`)),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, userA, (tx) => tx.query(`select public.reset_user_password('9123456789')`)),
    ).rejects.toThrow(/permission denied/);
  });

  it('forces a password change after first login and after a reset', async () => {
    await asUser(db, userA, (tx) => tx.query(`select public.mark_password_changed()`));
    const after = await one<{ m: boolean }>(db, `select must_change_password m from public.profiles where id = $1`, [userA]);
    expect(after.m).toBe(false);

    await db.query(`select public.reset_user_password('9876543210')`);
    const reset = await one<{ m: boolean }>(db, `select must_change_password m from public.profiles where id = $1`, [userA]);
    expect(reset.m).toBe(true);
  });
});

describe('profiles', () => {
  it('a user can edit their business details but not the password flag or phone', async () => {
    await asUser(db, userA, (tx) => tx.query(`update public.profiles set business_name = 'Uday Events' where id = $1`, [userA]));
    await expect(
      asUser(db, userA, (tx) => tx.query(`update public.profiles set must_change_password = false`)),
    ).rejects.toThrow(/permission denied/);
    await expect(asUser(db, userA, (tx) => tx.query(`update public.profiles set phone = '9000000000'`))).rejects.toThrow(
      /permission denied/,
    );
  });

  it('a user sees only their own profile', async () => {
    const rows = await asUser(db, userB, (tx) => tx.query(`select id from public.profiles`));
    expect(rows.rows).toEqual([{ id: userB }]);
  });
});

describe('shared catalogue (0030)', () => {
  let elementA: string;

  beforeAll(async () => {
    elementA = await asUser(db, userA, (tx) => newElement(tx, 'Entrance Arch', 25000));
  });

  it('anon cannot read anything', async () => {
    await expect(asAnon(db, (tx) => tx.query(`select * from public.elements`))).rejects.toThrow(/permission denied/);
    await expect(asAnon(db, (tx) => tx.query(`select * from public.quotes`))).rejects.toThrow(/permission denied/);
  });

  it("user B sees user A's element", async () => {
    const res = await asUser(db, userB, (tx) => tx.query(`select id from public.elements where id = $1`, [elementA]));
    expect(res.rows).toEqual([{ id: elementA }]);
  });

  it("user B can edit user A's element (logged with B as the editor)", async () => {
    await expect(
      asUser(db, userB, async (tx) => {
        const res = await tx.query(`update public.elements set default_rate = 26000 where id = $1`, [elementA]);
        expect(res.affectedRows).toBe(1);
        const log = await one<{ changed_by: string }>(
          tx,
          `select changed_by from public.rate_change_logs where element_id = $1 and new_rate = 26000`,
          [elementA],
        );
        expect(log.changed_by).toBe(userB);
        throw new Error(ROLLBACK);
      }),
    ).rejects.toThrow(ROLLBACK);
  });

  it('user B cannot create rows owned by user A', async () => {
    await expect(
      asUser(db, userB, (tx) =>
        tx.query(`insert into public.elements (owner_id, name, default_rate) values ($1, 'X', 1)`, [userA]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("user B can put user A's element in their package", async () => {
    await expect(
      asUser(db, userB, async (tx) => {
        const pkg = await one<{ id: string }>(
          tx,
          `insert into public.packages (name, tier_id) values ('Royal', $1) returning id`,
          [await tierId(tx)],
        );
        await tx.query(`insert into public.package_elements (package_id, element_id) values ($1, $2)`, [pkg.id, elementA]);
        throw new Error(ROLLBACK);
      }),
    ).rejects.toThrow(ROLLBACK);
  });

  it("user B can delete user A's unused element", async () => {
    await expect(
      asUser(db, userB, async (tx) => {
        await tx.query(`select public.delete_element($1)`, [elementA]);
        expect((await tx.query(`select id from public.elements where id = $1`, [elementA])).rows).toEqual([]);
        throw new Error(ROLLBACK);
      }),
    ).rejects.toThrow(ROLLBACK);
  });

  it('merges tiers into one list', async () => {
    const res = await asUser(db, userB, (tx) => tx.query<{ name: string }>(`select name from public.tiers order by sort_order`));
    expect(res.rows.map((r) => r.name)).toEqual(['Standard', 'Premium']);
  });
});

describe('catalogue constraints', () => {
  it('rejects negative rates, zero quantities and bad video links', async () => {
    await expect(asUser(db, userA, (tx) => newElement(tx, 'Bad', -1))).rejects.toThrow(/check constraint/);
    await expect(
      asUser(db, userA, async (tx) => {
        await tx.query(`insert into public.packages (name, tier_id, video_url) values ('P', $1, 'javascript:alert(1)')`, [
          await tierId(tx),
        ]);
      }),
    ).rejects.toThrow(/check constraint/);
  });

  it('active element names are unique across the team', async () => {
    await expect(asUser(db, userA, (tx) => newElement(tx, 'entrance arch'))).rejects.toMatchObject({ code: '23505' });
    await expect(asUser(db, userB, (tx) => newElement(tx, 'Entrance Arch'))).rejects.toThrow(/already exists/);
  });

  it('maps elements to a package with default quantities', async () => {
    const count = await asUser(db, userA, async (tx) => {
      const pkg = await one<{ id: string }>(
        tx,
        `insert into public.packages (name, tier_id) values ('Royal Package', $1) returning id`,
        [await tierId(tx, 'Premium')],
      );
      const e1 = await newElement(tx, 'Stage Backdrop', 40000);
      const e2 = await newElement(tx, 'Sofa Lounge', 15000);
      await tx.query(
        `insert into public.package_elements (package_id, element_id, default_qty) values ($1, $2, 1), ($1, $3, 4)`,
        [pkg.id, e1, e2],
      );
      await expect(
        tx.query(`insert into public.package_elements (package_id, element_id, default_qty) values ($1, $2, 0)`, [
          pkg.id,
          e1,
        ]),
      ).rejects.toThrow();
      return 2;
    });
    expect(count).toBe(2);
  });
});

describe('quotes', () => {
  it('numbers quotes per user, server-side', async () => {
    const q1 = await asUser(db, userA, (tx) => newQuote(tx, { quote_no: 'HACKED' }));
    const q2 = await asUser(db, userA, (tx) => newQuote(tx));
    const qb = await asUser(db, userB, (tx) => newQuote(tx));
    const year = new Date().getFullYear();
    expect(q1.quote_no).toBe(`ENT-${year}-00001`);
    expect(q2.quote_no).toBe(`ENT-${year}-00002`);
    expect(qb.quote_no).toBe(`ENT-${year}-00001`);
  });

  it('always starts as draft', async () => {
    const q = await asUser(db, userA, (tx) => newQuote(tx, { status: 'confirmed' }));
    expect(q.status).toBe('draft');
  });

  it('rejects totals that do not add up and line amounts that do not match qty × rate', async () => {
    await expect(
      asUser(db, userA, (tx) => newQuote(tx, { elements_subtotal: 100, charges_total: 50, final_total: 999 })),
    ).rejects.toThrow(/check constraint/);

    await expect(
      asUser(db, userA, async (tx) => {
        const q = await newQuote(tx);
        await tx.query(
          `insert into public.quote_items (quote_id, element_name, qty, rate, amount) values ($1, 'Arch', 2, 100, 150)`,
          [q.id],
        );
      }),
    ).rejects.toThrow(/check constraint/);
  });

  it('freezes a quote once confirmed, allows only draft → confirmed/cancelled, and logs it', async () => {
    const q = await asUser(db, userA, async (tx) => {
      const q = await newQuote(tx, { elements_subtotal: 200, final_total: 200 });
      await tx.query(
        `insert into public.quote_items (quote_id, element_name, qty, rate, amount) values ($1, 'Arch', 2, 100, 200)`,
        [q.id],
      );
      return q;
    });

    // draft: editable; 'sent' no longer exists
    await asUser(db, userA, (tx) => tx.query(`update public.quotes set guest_name = 'Changed' where id = $1`, [q.id]));
    await expect(
      asUser(db, userA, (tx) => tx.query(`update public.quotes set status = 'sent' where id = $1`, [q.id])),
    ).rejects.toThrow(/Invalid status change|quotes_status_no_sent/);

    await asUser(db, userA, (tx) => tx.query(`update public.quotes set status = 'confirmed' where id = $1`, [q.id]));
    await expect(
      asUser(db, userA, (tx) => tx.query(`update public.quotes set guest_name = 'Again' where id = $1`, [q.id])),
    ).rejects.toThrow(/can no longer be edited/);
    await expect(
      asUser(db, userA, (tx) =>
        tx.query(`insert into public.quote_items (quote_id, element_name, qty, rate, amount) values ($1, 'Extra', 1, 1, 1)`, [q.id]),
      ),
    ).rejects.toThrow(/frozen/);
    await expect(
      asUser(db, userA, (tx) => tx.query(`update public.quotes set status = 'draft' where id = $1`, [q.id])),
    ).rejects.toThrow(/Invalid status change/);

    const audit = await asUser(db, userA, (tx) =>
      tx.query<{ old_data: { status: string }; new_data: { status: string } }>(
        `select old_data, new_data from public.audit_log where row_id = $1 order by at`,
        [q.id],
      ),
    );
    expect(audit.rows.map((r) => `${r.old_data.status}->${r.new_data.status}`)).toEqual(['draft->confirmed']);
  });

  it('0017 turns old Sent quotes into Drafts without writing audit rows', async () => {
    const q = await asUser(db, userA, (tx) => newQuote(tx));
    await db.exec(`alter table public.quotes drop constraint quotes_status_no_sent;
      alter table public.quotes disable trigger quotes_before_update;
      alter table public.quotes disable trigger quotes_audit_status;
      update public.quotes set status = 'sent' where id = '${q.id}';
      alter table public.quotes enable trigger quotes_before_update;
      alter table public.quotes enable trigger quotes_audit_status;`);
    await db.exec(readFileSync(join(MIGRATIONS_DIR, '0017_remove_sent.sql'), 'utf8'));
    const r = await one<{ status: string; n: number }>(
      db,
      `select status, (select count(*)::int from public.audit_log where row_id = $1) n from public.quotes where id = $1`,
      [q.id],
    );
    expect(r).toEqual({ status: 'draft', n: 0 });
    const fn = await one<{ f: string | null }>(db, `select to_regprocedure('public.mark_quote_sent(uuid)')::text f`);
    expect(fn.f).toBeNull();
  });

  it('quotes cannot be deleted and audit rows cannot be written by users', async () => {
    await expect(asUser(db, userA, (tx) => tx.query(`delete from public.quotes`))).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, userA, (tx) =>
        tx.query(`insert into public.audit_log (owner_id, table_name, row_id, action) values ($1, 'x', $1, 'x')`, [userA]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('vendor purchase rates (append-only)', () => {
  it('can be added and voided with a reason, never edited', async () => {
    const entry = await asUser(db, userA, async (tx) => {
      const el = await newElement(tx, 'Floral Centerpiece', 3000);
      const v = await one<{ id: string }>(tx, `insert into public.vendors (name) values ('DIGANI FRUITS & VEGETABLES') returning id`);
      return one<{ id: string }>(
        tx,
        `insert into public.vendor_rate_entries (element_id, vendor_id, purchase_date, qty, unit, rate_per_unit)
         values ($1, $2, current_date - 3, 1, 'Kg', 180) returning id`,
        [el, v.id],
      );
    });

    await expect(
      asUser(db, userA, (tx) => tx.query(`update public.vendor_rate_entries set rate_per_unit = 1 where id = $1`, [entry.id])),
    ).rejects.toThrow(/permission denied/);
    // Shared catalogue: a teammate may void it too.
    await expect(
      asUser(db, userB, async (tx) => {
        await tx.query(`select public.void_vendor_rate_entry($1, 'wrong')`, [entry.id]);
        throw new Error(ROLLBACK);
      }),
    ).rejects.toThrow(ROLLBACK);
    await expect(
      asUser(db, userA, (tx) => tx.query(`select public.void_vendor_rate_entry($1, '  ')`, [entry.id])),
    ).rejects.toThrow(/reason is required/);

    await asUser(db, userA, (tx) => tx.query(`select public.void_vendor_rate_entry($1, 'Typo in rate')`, [entry.id]));
    const row = await one<{ void_reason: string }>(db, `select void_reason from public.vendor_rate_entries where id = $1`, [
      entry.id,
    ]);
    expect(row.void_reason).toBe('Typo in rate');
  });

  it('rejects future purchase dates', async () => {
    await expect(
      asUser(db, userA, async (tx) => {
        const el = await newElement(tx, 'Chair Setup', 100);
        const v = await one<{ id: string }>(tx, `insert into public.vendors (name) values ('Vendor Two') returning id`);
        await tx.query(
          `insert into public.vendor_rate_entries (element_id, vendor_id, purchase_date, qty, rate_per_unit)
           values ($1, $2, current_date + 30, 1, 10)`,
          [el, v.id],
        );
      }),
    ).rejects.toThrow(/check constraint/);
  });
});

describe('elements: rate history, update RPC, rate limit', () => {
  it('logs the initial rate and every change, with the reason', async () => {
    const id = await asUser(db, userA, (tx) => newElement(tx, 'Dhol Players', 8000));
    await asUser(db, userA, (tx) =>
      tx.query(`select public.update_element($1, 'Dhol Players', 'Set', 9500, 1, null, null, 'Vendor price increase')`, [id]),
    );
    // name-only edit: no new rate log
    await asUser(db, userA, (tx) =>
      tx.query(`select public.update_element($1, 'Dhol Players (4)', 'Set', 9500, 1, null, null, null)`, [id]),
    );
    // direct update (no RPC) is still logged, just without a reason
    await asUser(db, userA, (tx) => tx.query(`update public.elements set default_rate = 9000 where id = $1`, [id]));

    const logs = await asUser(db, userA, (tx) =>
      tx.query<{ old_rate: string | null; new_rate: string; reason: string | null; change_type: string }>(
        `select old_rate, new_rate, reason, change_type from public.rate_change_logs where element_id = $1 order by changed_at, new_rate`,
        [id],
      ),
    );
    expect(logs.rows.map((r) => [r.old_rate && Number(r.old_rate), Number(r.new_rate), r.reason])).toEqual([
      [null, 8000, 'Initial rate'],
      [8000, 9500, 'Vendor price increase'],
      [9500, 9000, null],
    ]);
    expect(logs.rows.every((r) => r.change_type === 'master_rate')).toBe(true);
  });

  it("update_element works on a teammate's element", async () => {
    const id = await asUser(db, userA, (tx) => newElement(tx, 'Anchor', 15000));
    await asUser(db, userB, (tx) => tx.query(`select public.update_element($1, 'Anchor', null, 16000, null, null, null)`, [id]));
    const row = await one<{ r: string }>(db, `select default_rate r from public.elements where id = $1`, [id]);
    expect(Number(row.r)).toBe(16000);
  });

  it('users cannot write rate history directly', async () => {
    await expect(
      asUser(db, userA, (tx) =>
        tx.query(
          `insert into public.rate_change_logs (change_type, element_name, new_rate) values ('master_rate', 'Fake', 1)`,
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('archived names can be reused, but restoring a duplicate active name fails', async () => {
    const id = await asUser(db, userA, (tx) => newElement(tx, 'LED Wall', 30000));
    await asUser(db, userA, (tx) => tx.query(`update public.elements set is_active = false where id = $1`, [id]));
    await asUser(db, userA, (tx) => newElement(tx, 'LED Wall', 32000));
    await expect(
      asUser(db, userA, (tx) => tx.query(`update public.elements set is_active = true where id = $1`, [id])),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('limits element writes per user', async () => {
    const fresh = await createDb();
    const u = await createUser(fresh, '9000000009');
    await expect(
      asUser(fresh, u, async (tx) => {
        for (let i = 0; i < 61; i++) {
          await tx.query(`insert into public.elements (name, default_rate) values ($1, 1)`, [`E${i}`]);
        }
      }),
    ).rejects.toMatchObject({ code: 'P0429' });
    await fresh.close();
  }, 60_000);
});

describe('packages: save_package RPC and summaries', () => {
  const save = (tx: Transaction, id: string | null, items: unknown[], extra: Partial<{ name: string; active: boolean; tier: string }> = {}) =>
    one<{ id: string }>(
      tx,
      `select public.save_package($1, $2, $3, $4, $5, null, $6, $7, $8::jsonb) as id`,
      [id, extra.name ?? 'Classic Package', extra.tier, 150000, ' A classic setup ', 'https://youtu.be/abc', extra.active ?? true, JSON.stringify(items)],
    );

  it('creates a package with elements, then edits the mapping in one call', async () => {
    const { pkgId, e1, e2, e3 } = await asUser(db, userA, async (tx) => {
      const tier = await tierId(tx);
      const e1 = await newElement(tx, 'Pkg Arch', 10000);
      const e2 = await newElement(tx, 'Pkg Sofa', 5000);
      const e3 = await newElement(tx, 'Pkg Lights', 2000);
      const { id } = await save(tx, null, [{ element_id: e1, default_qty: 1 }, { element_id: e2, default_qty: 4 }], { tier });
      return { pkgId: id, e1, e2, e3, tier };
    });

    const s1 = await asUser(db, userA, (tx) =>
      one<{ element_count: number; elements_total: string; tier_name: string; description: string }>(
        tx,
        `select element_count, elements_total, tier_name, description from public.package_summaries where id = $1`,
        [pkgId],
      ),
    );
    expect({ ...s1, elements_total: Number(s1.elements_total) }).toEqual({
      element_count: 2,
      elements_total: 30000,
      tier_name: 'Standard',
      description: 'A classic setup',
    });

    // drop e2, change e1 qty, add e3
    await asUser(db, userA, async (tx) => {
      await save(tx, pkgId, [{ element_id: e1, default_qty: 2 }, { element_id: e3, default_qty: 10 }], {
        tier: await tierId(tx, 'Premium'),
      });
    });
    const items = await asUser(db, userA, (tx) =>
      tx.query<{ element_id: string; default_qty: string }>(
        `select element_id, default_qty from public.package_elements where package_id = $1 order by sort_order`,
        [pkgId],
      ),
    );
    expect(items.rows.map((r) => [r.element_id, Number(r.default_qty)])).toEqual([
      [e1, 2],
      [e3, 10],
    ]);
    expect(items.rows.some((r) => r.element_id === e2)).toBe(false);
  });

  it('requires at least one element and no duplicates', async () => {
    await expect(asUser(db, userA, async (tx) => save(tx, null, [], { tier: await tierId(tx) }))).rejects.toThrow(
      /at least one element/,
    );
    await expect(
      asUser(db, userA, async (tx) => {
        const e = await newElement(tx, 'Dup Check', 1);
        return save(tx, null, [{ element_id: e, default_qty: 1 }, { element_id: e, default_qty: 2 }], { tier: await tierId(tx) });
      }),
    ).rejects.toThrow(/only once/);
  });

  it('rolls back the package if an element is invalid (all-or-nothing)', async () => {
    const before = await asUser(db, userA, (tx) => one<{ n: number }>(tx, `select count(*)::int n from public.packages`));
    await expect(
      asUser(db, userA, async (tx) => {
        const e = await newElement(tx, 'Zero Qty', 1);
        return save(tx, null, [{ element_id: e, default_qty: 0 }], { tier: await tierId(tx), name: 'Broken Package' });
      }),
    ).rejects.toThrow(/check constraint/);
    const after = await asUser(db, userA, (tx) => one<{ n: number }>(tx, `select count(*)::int n from public.packages`));
    expect(after.n).toBe(before.n);
  });

  it("can use a teammate's element and edit a teammate's package", async () => {
    const otherElement = await asUser(db, userB, (tx) => newElement(tx, 'B Shared Element', 100));
    const pkgA = await asUser(db, userA, async (tx) =>
      (await save(tx, null, [{ element_id: otherElement, default_qty: 1 }], { tier: await tierId(tx), name: 'A Team Package' })).id,
    );
    await asUser(db, userB, async (tx) =>
      save(tx, pkgA, [{ element_id: otherElement, default_qty: 3 }], { tier: await tierId(tx), name: 'A Team Package' }),
    );
    const seen = await asUser(db, userB, (tx) =>
      one<{ element_count: number; elements_total: string }>(tx, `select element_count, elements_total from public.package_summaries where id = $1`, [pkgA]),
    );
    expect({ ...seen, elements_total: Number(seen.elements_total) }).toEqual({ element_count: 1, elements_total: 300 });
  });

  it('archived elements can stay in a package but cannot be newly added', async () => {
    const { pkg, kept, archived } = await asUser(db, userA, async (tx) => {
      const tier = await tierId(tx);
      const kept = await newElement(tx, 'Keep Me', 100);
      const archived = await newElement(tx, 'Archive Me', 100);
      const pkg = (await save(tx, null, [{ element_id: kept, default_qty: 1 }], { tier, name: 'Archive Test' })).id;
      await tx.query(`update public.elements set is_active = false where id = $1`, [kept]);
      await tx.query(`update public.elements set is_active = false where id = $1`, [archived]);
      return { pkg, kept, archived };
    });
    await expect(
      asUser(db, userA, async (tx) => save(tx, pkg, [{ element_id: kept, default_qty: 2 }], { tier: await tierId(tx), name: 'Archive Test' })),
    ).resolves.toBeTruthy();
    await expect(
      asUser(db, userA, async (tx) =>
        save(tx, pkg, [{ element_id: kept, default_qty: 2 }, { element_id: archived, default_qty: 1 }], {
          tier: await tierId(tx),
          name: 'Archive Test',
        }),
      ),
    ).rejects.toThrow(/Archived elements/);
  });
});

describe('save_quote RPC', () => {
  /** Builds a full payload for user A from their own seeded options and a fresh package. */
  async function setup(tx: Transaction) {
    const opt = await one<{ fn: string; venue: string; sub: string; sess: string; tier: string }>(
      tx,
      `select (select id from public.function_options where name = 'Sangeet') fn,
              (select id from public.venues where name = 'Ambria Exotica') venue,
              (select id from public.sub_venues where name = 'The Aura') sub,
              (select id from public.sessions where name = 'Dinner') sess,
              (select id from public.tiers where name = 'Premium') tier`,
    );
    const e1 = await newElement(tx, `Q Arch ${Math.random()}`, 25000);
    const e2 = await newElement(tx, `Q Sofa ${Math.random()}`, 15000);
    const pkg = await one<{ id: string }>(
      tx,
      `select public.save_package(null, $1, $2, null, null, null, null, true, $3::jsonb) as id`,
      [`Q Royal ${Math.random()}`, opt.tier, JSON.stringify([{ element_id: e1, default_qty: 1 }, { element_id: e2, default_qty: 2 }])],
    );
    const payload = (o: Record<string, unknown> = {}) => ({
      quote_id: null,
      guest: {
        source: 'lms_contract',
        source_ref: 'C-1042',
        source_raw: { demo: true },
        guest_name: ' Mehta Family ',
        guest_phone: '+91 98765 43210',
        function_id: opt.fn,
        venue_id: opt.venue,
        sub_venue_id: opt.sub,
        event_date: '2027-01-10',
        session_id: opt.sess,
      },
      package_id: pkg.id,
      lines: [
        { element_id: e1, qty: 1, rate: 25000, included: true },
        { element_id: e2, qty: 3, rate: 14000, included: true }, // rate override
      ],
      charges: [{ description: 'Transportation', amount: 5000 }],
      notes: null,
      ...o,
    });
    return { e1, e2, pkgId: pkg.id, payload };
  }
  const saveQuote = (tx: Transaction, payload: unknown) =>
    one<{ r: { id: string; quote_no: string } }>(tx, `select public.save_quote($1::jsonb) as r`, [JSON.stringify(payload)]).then((x) => x.r);

  it('saves quote, items and charges with server-side snapshot and totals', async () => {
    const { quote, e2 } = await asUser(db, userA, async (tx) => {
      const s = await setup(tx);
      return { quote: await saveQuote(tx, s.payload()), e2: s.e2 };
    });
    expect(quote.quote_no).toMatch(/^ENT-\d{4}-\d{5}$/);

    const q = await asUser(db, userA, (tx) =>
      one<Record<string, unknown>>(
        tx,
        `select status, source, source_ref, guest_name, guest_phone, function_name, venue_name, sub_venue_name, session_name,
                package_tier, elements_subtotal, charges_total, final_total from public.quotes where id = $1`,
        [quote.id],
      ),
    );
    expect({ ...q, elements_subtotal: Number(q.elements_subtotal), charges_total: Number(q.charges_total), final_total: Number(q.final_total) }).toEqual({
      status: 'draft',
      source: 'lms_contract',
      source_ref: 'C-1042',
      guest_name: 'Mehta Family',
      guest_phone: '9876543210',
      function_name: 'Sangeet',
      venue_name: 'Ambria Exotica',
      sub_venue_name: 'The Aura',
      session_name: 'Dinner',
      package_tier: 'Premium',
      elements_subtotal: 67000,
      charges_total: 5000,
      final_total: 72000,
    });

    const logs = await asUser(db, userA, (tx) =>
      tx.query<{ element_id: string; old_rate: string; new_rate: string }>(
        `select element_id, old_rate, new_rate from public.rate_change_logs where quote_id = $1 and change_type = 'quote_override'`,
        [quote.id],
      ),
    );
    expect(logs.rows.map((r) => [r.element_id, Number(r.old_rate), Number(r.new_rate)])).toEqual([[e2, 15000, 14000]]);
  });

  it('keeps saved quotes unchanged when the master element changes later (snapshot)', async () => {
    const { quote, e1 } = await asUser(db, userA, async (tx) => {
      const s = await setup(tx);
      return { quote: await saveQuote(tx, s.payload()), e1: s.e1 };
    });
    await asUser(db, userA, (tx) => tx.query(`select public.update_element($1, 'Renamed Arch', null, 99999, 1, null, null, 'later change')`, [e1]));
    const item = await asUser(db, userA, (tx) =>
      one<{ element_name: string; rate: string; master_rate_at_quote: string }>(
        tx,
        `select element_name, rate, master_rate_at_quote from public.quote_items where quote_id = $1 and element_id = $2`,
        [quote.id, e1],
      ),
    );
    expect(item.element_name).toMatch(/^Q Arch/);
    expect(Number(item.rate)).toBe(25000);
    expect(Number(item.master_rate_at_quote)).toBe(25000);
  });

  it('re-saves a draft in place and only logs new overrides', async () => {
    await asUser(db, userA, async (tx) => {
      const s = await setup(tx);
      const first = await saveQuote(tx, s.payload());
      const again = await saveQuote(tx, s.payload({ quote_id: first.id, charges: [] }));
      expect(again).toEqual(first);
      const q = await one<{ final_total: string; n: number }>(
        tx,
        `select final_total, (select count(*)::int from public.quote_charges where quote_id = $1) n from public.quotes where id = $1`,
        [first.id],
      );
      expect([Number(q.final_total), q.n]).toEqual([67000, 0]);
      const logs = await one<{ n: number }>(tx, `select count(*)::int n from public.rate_change_logs where quote_id = $1`, [first.id]);
      expect(logs.n).toBe(1); // same override, not logged twice

      const changed = s.payload({ quote_id: first.id });
      (changed.lines as { rate: number }[])[1]!.rate = 13000;
      await saveQuote(tx, changed);
      const logs2 = await one<{ n: number }>(tx, `select count(*)::int n from public.rate_change_logs where quote_id = $1`, [first.id]);
      expect(logs2.n).toBe(2);
    });
  });

  it('re-saves a draft but refuses a confirmed one, and keeps the stored LMS row', async () => {
    await expect(
      asUser(db, userA, async (tx) => {
        const s = await setup(tx);
        const q = await saveQuote(tx, s.payload());
        await tx.query(`update public.quotes set status = 'confirmed' where id = $1`, [q.id]);
        await saveQuote(tx, s.payload({ quote_id: q.id }));
      }),
    ).rejects.toThrow(/can no longer be edited/);

    // re-saving without the LMS row keeps the stored one
    const raw = await asUser(db, userA, async (tx) => {
      const s = await setup(tx);
      const q = await saveQuote(tx, s.payload());
      const p = s.payload({ quote_id: q.id }) as { guest: Record<string, unknown> };
      p.guest.source_raw = null;
      await saveQuote(tx, p);
      return one<{ source_raw: unknown; fn: string | null }>(tx, `select source_raw, function_id fn from public.quotes where id = $1`, [q.id]);
    });
    expect(raw.source_raw).toEqual({ demo: true });
    expect(typeof raw.fn).toBe('string');
  });

  it('validates the payload', async () => {
    const attempt = (mut: (p: Record<string, unknown>) => void) =>
      asUser(db, userA, async (tx) => {
        const s = await setup(tx);
        const p = s.payload();
        mut(p);
        await saveQuote(tx, p);
      });
    await expect(attempt((p) => ((p.guest as Record<string, unknown>).guest_phone = '123'))).rejects.toThrow(/mobile number/);
    await expect(attempt((p) => ((p.lines as { included: boolean }[]).forEach((l) => (l.included = false))))).rejects.toThrow(
      /at least one element/,
    );
    await expect(attempt((p) => ((p.lines as { qty: number }[])[0]!.qty = 0))).rejects.toThrow(/check constraint/);
    await expect(attempt((p) => ((p.charges as { amount: number }[])[0]!.amount = -1))).rejects.toThrow(/check constraint/);
    await expect(attempt((p) => ((p.guest as Record<string, unknown>).sub_venue_id = null))).resolves.toBeUndefined();
  });

  it("can use a teammate's element, but not their options or their quote", async () => {
    const theirs = await asUser(db, userB, async (tx) => {
      const e = await newElement(tx, 'B Quote Element', 100);
      const fn = await one<{ id: string }>(tx, `select id from public.function_options where name = 'Wedding'`);
      return { e, fn: fn.id };
    });
    await expect(
      asUser(db, userA, async (tx) => {
        const s = await setup(tx);
        const p = s.payload();
        (p.lines as { element_id: string }[]).push({ element_id: theirs.e, qty: 1, rate: 100, included: true } as never);
        await saveQuote(tx, p);
        throw new Error(ROLLBACK);
      }),
    ).rejects.toThrow(ROLLBACK);
    await expect(
      asUser(db, userA, async (tx) => {
        const s = await setup(tx);
        const p = s.payload();
        (p.lines as { element_id: string }[]).push({ element_id: crypto.randomUUID(), qty: 1, rate: 1, included: true } as never);
        await saveQuote(tx, p);
      }),
    ).rejects.toThrow(/no longer available/);
    await expect(
      asUser(db, userA, async (tx) => {
        const s = await setup(tx);
        const p = s.payload();
        (p.guest as Record<string, unknown>).function_id = theirs.fn;
        await saveQuote(tx, p);
      }),
    ).rejects.toThrow(/function, venue and session/);

    const aQuote = await asUser(db, userA, async (tx) => saveQuote(tx, (await setup(tx)).payload()));
    await expect(
      asUser(db, userB, (tx) => tx.query(`select public.save_quote($1::jsonb)`, [JSON.stringify({ quote_id: aQuote.id })])),
    ).rejects.toThrow();
    const seen = await asUser(db, userB, (tx) => tx.query(`select id from public.quotes where id = $1`, [aQuote.id]));
    expect(seen.rows).toEqual([]);
  });
});

describe('save_quote with several packages (0013)', () => {
  // Own user, so these writes don't eat into user A's per-minute write limit.
  let userC: string;
  beforeAll(async () => {
    userC = await createUser(db, '9000000077', 'Multi Package');
  });

  async function twoPackages(tx: Transaction) {
    const opt = await one<{ fn: string; venue: string; sess: string; std: string; prem: string }>(
      tx,
      `select (select id from public.function_options where name = 'Wedding') fn,
              (select id from public.venues where name = 'Ambria Pushpanjali') venue,
              (select id from public.sessions where name = 'Lunch') sess,
              (select id from public.tiers where name = 'Standard') std,
              (select id from public.tiers where name = 'Premium') prem`,
    );
    const arch = await newElement(tx, `MP Arch ${Math.random()}`, 25000);
    const sofa = await newElement(tx, `MP Sofa ${Math.random()}`, 15000);
    const dj = await newElement(tx, `MP DJ ${Math.random()}`, 8000);
    const pkg = (name: string, tier: string, items: string[]) =>
      one<{ id: string }>(tx, `select public.save_package(null, $1, $2, null, null, null, null, true, $3::jsonb) as id`, [
        name,
        tier,
        JSON.stringify(items.map((element_id) => ({ element_id, default_qty: 1 }))),
      ]).then((r) => r.id);
    const royal = await pkg(`MP Royal ${Math.random()}`, opt.prem, [arch, sofa]);
    const classic = await pkg(`MP Classic ${Math.random()}`, opt.std, [arch, dj]);
    const guest = {
      source: 'manual',
      guest_name: 'Kapoor Wedding',
      guest_phone: '9123456789',
      function_id: opt.fn,
      venue_id: opt.venue,
      sub_venue_id: null,
      event_date: '2027-02-01',
      session_id: opt.sess,
    };
    return { arch, sofa, dj, royal, classic, guest };
  }
  const save = (tx: Transaction, payload: unknown) =>
    one<{ r: { id: string } }>(tx, `select public.save_quote($1::jsonb) as r`, [JSON.stringify(payload)]).then((x) => x.r.id);

  it('uses the element multiplier: guest rate = rate × multiplier, no override logged for it (0023)', async () => {
    const r = await asUser(db, userC, async (tx) => {
      const s = await twoPackages(tx);
      await tx.query(`select public.update_element($1, 'Arch x2', null, 23, 1, null, null, null, null, 2)`, [s.arch]);
      const el = await one<{ selling_rate: string; multiplier: string }>(tx, `select selling_rate::text, multiplier::text from public.elements where id = $1`, [s.arch]);
      const id = await save(tx, {
        guest: s.guest,
        packages: [{ package_id: s.royal, lines: [{ element_id: s.arch, qty: 3, rate: 46 }] }],
        charges: [],
      });
      const line = await one<{ rate: string; amount: string; master: string }>(
        tx,
        `select rate::text, amount::text, master_rate_at_quote::text master from public.quote_items where quote_id = $1`,
        [id],
      );
      const overrides = await one<{ n: number }>(
        tx,
        `select count(*)::int n from public.rate_change_logs where quote_id = $1 and change_type = 'quote_override'`,
        [id],
      );
      // a later edit without p_multiplier keeps it
      await tx.query(`select public.update_element($1, 'Arch x2', null, 25, 1, null, null, null, null)`, [s.arch]);
      const kept = await one<{ selling_rate: string }>(tx, `select selling_rate::text from public.elements where id = $1`, [s.arch]);
      return { el, line, overrides: overrides.n, kept: kept.selling_rate };
    });
    expect(r.el).toEqual({ selling_rate: '46.00', multiplier: '2.00' });
    expect(r.line).toEqual({ rate: '46.00', amount: '138.00', master: '46.00' });
    expect(r.overrides).toBe(0);
    expect(r.kept).toBe('50.00');
  });

  it('saves package sections with their own subtotals; the same element may be in both', async () => {
    const { quoteId } = await asUser(db, userC, async (tx) => {
      const s = await twoPackages(tx);
      const quoteId = await save(tx, {
        guest: s.guest,
        packages: [
          { package_id: s.royal, lines: [{ element_id: s.arch, qty: 1, rate: 25000 }, { element_id: s.sofa, qty: 2, rate: 15000 }] },
          { package_id: s.classic, lines: [{ element_id: s.arch, qty: 1, rate: 22000 }, { element_id: s.dj, qty: 4, rate: 8000 }] },
        ],
        charges: [],
      });
      return { quoteId };
    });

    const sections = await asUser(db, userC, (tx) =>
      tx.query<{ package_name: string; package_tier: string; subtotal: string; n: number }>(
        `select qp.package_name, qp.package_tier, qp.subtotal,
                (select count(*)::int from public.quote_items qi where qi.quote_package_id = qp.id) n
           from public.quote_packages qp where qp.quote_id = $1 order by qp.sort_order`,
        [quoteId],
      ),
    );
    expect(sections.rows.map((r) => [r.package_tier, Number(r.subtotal), r.n])).toEqual([
      ['Premium', 55000, 2],
      ['Standard', 54000, 2],
    ]);
    const q = await asUser(db, userC, (tx) =>
      one<{ elements_subtotal: string; package_name: string; package_tier: string }>(
        tx,
        `select elements_subtotal, package_name, package_tier from public.quotes where id = $1`,
        [quoteId],
      ),
    );
    expect(Number(q.elements_subtotal)).toBe(109000);
    expect(q.package_name).toMatch(/^MP Royal .* \+ MP Classic /);
    expect(q.package_tier).toBe('Premium + Standard');

    // the arch override at 22,000 is logged once
    const logs = await asUser(db, userC, (tx) =>
      one<{ n: number }>(tx, `select count(*)::int n from public.rate_change_logs where quote_id = $1`, [quoteId]),
    );
    expect(logs.n).toBe(1);
  });

  it('rejects the same element twice in one package, the same package twice, and an empty package', async () => {
    const attempt = (build: (s: Awaited<ReturnType<typeof twoPackages>>) => unknown) =>
      asUser(db, userC, async (tx) => {
        const s = await twoPackages(tx);
        await save(tx, build(s));
      });
    await expect(
      attempt((s) => ({ guest: s.guest, packages: [{ package_id: s.royal, lines: [{ element_id: s.arch, qty: 1, rate: 1 }, { element_id: s.arch, qty: 1, rate: 1 }] }] })),
    ).rejects.toThrow(/only once/);
    await expect(
      attempt((s) => ({
        guest: s.guest,
        packages: [
          { package_id: s.royal, lines: [{ element_id: s.arch, qty: 1, rate: 1 }] },
          { package_id: s.royal, lines: [{ element_id: s.sofa, qty: 1, rate: 1 }] },
        ],
      })),
    ).rejects.toThrow(/package can be added only once/);
    await expect(
      attempt((s) => ({
        guest: s.guest,
        packages: [
          { package_id: s.royal, lines: [{ element_id: s.arch, qty: 1, rate: 1 }] },
          { package_id: s.classic, lines: [{ element_id: s.dj, qty: 1, rate: 1, included: false }] },
        ],
      })),
    ).rejects.toThrow(/at least one element/);
  });

  it("accepts a teammate's package, refuses a missing one", async () => {
    const theirPkg = await asUser(db, userB, async (tx) => {
      const e = await newElement(tx, 'B MP Element', 1);
      const tier = await tierId(tx);
      return (await one<{ id: string }>(tx, `select public.save_package(null, 'B MP', $1, null, null, null, null, true, $2::jsonb) as id`, [
        tier,
        JSON.stringify([{ element_id: e, default_qty: 1 }]),
      ])).id;
    });
    const id = await asUser(db, userC, async (tx) => {
      const s = await twoPackages(tx);
      return save(tx, { guest: s.guest, packages: [{ package_id: theirPkg, lines: [{ element_id: s.arch, qty: 1, rate: 1 }] }] });
    });
    const owner = await one<{ owner_id: string; package_name: string }>(db, `select owner_id, package_name from public.quotes where id = $1`, [id]);
    expect(owner).toEqual({ owner_id: userC, package_name: 'B MP' }); // the quote is still C's own
    await expect(
      asUser(db, userC, async (tx) => {
        const s = await twoPackages(tx);
        await save(tx, { guest: s.guest, packages: [{ package_id: crypto.randomUUID(), lines: [{ element_id: s.arch, qty: 1, rate: 1 }] }] });
      }),
    ).rejects.toThrow(/Choose the package again/);
  });

  it('accepts an extra element that is not part of the package (quote only)', async () => {
    const id = await asUser(db, userC, async (tx) => {
      const s = await twoPackages(tx);
      return save(tx, { guest: s.guest, packages: [{ package_id: s.royal, lines: [{ element_id: s.arch, qty: 1, rate: 25000 }, { element_id: s.dj, qty: 2, rate: 8000 }] }], charges: [] });
    });
    const n = await asUser(db, userC, (tx) => one<{ n: number; total: string }>(tx, `select count(*)::int n, (select final_total from public.quotes where id = $1) total from public.quote_items where quote_id = $1`, [id]));
    expect([n.n, Number(n.total)]).toEqual([2, 41000]);
  });

  it('still accepts the old single-package payload as one section', async () => {
    const id = await asUser(db, userC, async (tx) => {
      const s = await twoPackages(tx);
      return save(tx, { guest: s.guest, package_id: s.royal, lines: [{ element_id: s.arch, qty: 1, rate: 25000 }], charges: [] });
    });
    const n = await asUser(db, userC, (tx) => one<{ n: number }>(tx, `select count(*)::int n from public.quote_packages where quote_id = $1`, [id]));
    expect(n.n).toBe(1);
  });
});

describe('P&L (0014, cost = Default rate since 0026)', () => {
  // Own user so cost/vendor data doesn't mix with other tests or their write limits.
  let userP: string;
  beforeAll(async () => {
    userP = await createUser(db, '9000000088', 'PnL User');
  });

  async function setup(tx: Transaction) {
    const opt = await one<{ fn: string; venue: string; sess: string; tier: string }>(
      tx,
      `select (select id from public.function_options where name = 'Wedding') fn,
              (select id from public.venues where name = 'Ambria Pushpanjali') venue,
              (select id from public.sessions where name = 'Dinner') sess,
              (select id from public.tiers where name = 'Standard') tier`,
    );
    // Default rate = our cost; the old unit cost / vendor rates must be ignored.
    const big = (await one<{ id: string }>(tx, `insert into public.elements (name, default_rate, unit_cost) values ($1, 600, 9) returning id`, [`Big ${Math.random()}`])).id;
    const small = (await one<{ id: string }>(tx, `insert into public.elements (name, default_rate) values ($1, 150) returning id`, [`Small ${Math.random()}`])).id;
    const v = (await one<{ id: string }>(tx, `insert into public.vendors (name) values ($1) returning id`, [`PnL Vendor ${Math.random()}`])).id;
    await tx.query(`insert into public.vendor_rate_entries (element_id, vendor_id, purchase_date, qty, rate_per_unit) values ($1, $2, '2026-10-01', 1, 77)`, [small, v]);
    const pkg = (await one<{ id: string }>(tx, `select public.save_package(null, $1, $2, null, null, null, null, true, $3::jsonb) as id`, [
      `PnL Pkg ${Math.random()}`,
      opt.tier,
      JSON.stringify([big, small].map((element_id) => ({ element_id, default_qty: 1 }))),
    ])).id;
    const quote = (lines: { element_id: string; qty: number; rate: number; included?: boolean }[], eventDate = '2027-03-01') =>
      one<{ r: { id: string } }>(tx, `select public.save_quote($1::jsonb) as r`, [
        JSON.stringify({
          guest: { source: 'manual', guest_name: 'PnL Guest', guest_phone: '9811122233', function_id: opt.fn, venue_id: opt.venue, event_date: eventDate, session_id: opt.sess },
          packages: [{ package_id: pkg, lines }],
          charges: [{ description: 'Transportation', amount: 1000 }],
        }),
      ]).then((x) => x.r.id);
    // A line whose element is gone has no cost.
    const orphanLine = (quoteId: string) =>
      tx.query(
        `insert into public.quote_items (quote_id, element_id, element_name, qty, rate, amount, sort_order) values ($1, null, 'Deleted thing', 1, 500, 500, 99)`,
        [quoteId],
      );
    return { big, small, pkg, v, quote, orphanLine };
  }

  it('cost per unit is the Default rate (unit cost and vendor rates are ignored)', async () => {
    const r = await asUser(db, userP, async (tx) => {
      const s = await setup(tx);
      const c = (id: string) => one<{ unit_cost: string; source: string }>(tx, `select * from public.element_cost($1, '2026-10-26')`, [id]);
      return { big: await c(s.big), small: await c(s.small) };
    });
    expect([Number(r.big.unit_cost), r.big.source]).toEqual([600, 'base_rate']);
    expect([Number(r.small.unit_cost), r.small.source]).toEqual([150, 'base_rate']);
  });

  it('locks cost on save and computes profit/margin; later rate changes do not move it', async () => {
    const { quoteId, small } = await asUser(db, userP, async (tx) => {
      const s = await setup(tx);
      const quoteId = await s.quote([
        { element_id: s.big, qty: 2, rate: 1000 }, // selling 2000, cost 1200
        { element_id: s.small, qty: 3, rate: 200 }, // selling  600, cost  450
      ]);
      return { quoteId, small: s.small };
    });
    const pnl = () =>
      asUser(db, userP, (tx) =>
        one<Record<string, string | number | null>>(
          tx,
          `select elements_selling, elements_cost, profit, margin_pct, missing_cost_lines, charges_total from public.quote_pnl where id = $1`,
          [quoteId],
        ),
      );
    const before = await pnl();
    expect([Number(before.elements_selling), Number(before.elements_cost), Number(before.profit), Number(before.margin_pct), before.missing_cost_lines]).toEqual([
      2600, 1650, 950, 36.54, 0,
    ]);
    expect(Number(before.charges_total)).toBe(1000); // pass-through, not in profit

    await asUser(db, userP, (tx) => tx.query(`update public.elements set default_rate = 999 where id = $1`, [small]));
    expect(Number((await pnl()).elements_cost)).toBe(1650);

    const lines = await asUser(db, userP, (tx) =>
      tx.query<{ cost_source: string; cost: string; margin_pct: string }>(
        `select cost_source, cost, margin_pct from public.quote_item_pnl where quote_id = $1 order by sort_order`,
        [quoteId],
      ),
    );
    expect(lines.rows.map((l) => [l.cost_source, Number(l.cost), Number(l.margin_pct)])).toEqual([
      ['base_rate', 1200, 40],
      ['base_rate', 450, 25],
    ]);
  });

  it('never treats a missing cost as zero (a line whose element was deleted)', async () => {
    const quoteId = await asUser(db, userP, async (tx) => {
      const s = await setup(tx);
      const id = await s.quote([
        { element_id: s.big, qty: 1, rate: 1000 },
        { element_id: s.small, qty: 1, rate: 200, included: false }, // excluded lines don't count
      ]);
      await s.orphanLine(id);
      return id;
    });
    const p = await asUser(db, userP, (tx) =>
      one<Record<string, string | number | null>>(tx, `select known_cost, missing_cost_lines, elements_cost, profit, margin_pct from public.quote_pnl where id = $1`, [quoteId]),
    );
    expect([Number(p.known_cost), p.missing_cost_lines, p.elements_cost, p.profit, p.margin_pct]).toEqual([600, 1, null, null, null]);
  });

  it('handles a zero selling amount safely', async () => {
    const quoteId = await asUser(db, userP, async (tx) => {
      const s = await setup(tx);
      return s.quote([{ element_id: s.big, qty: 1, rate: 0 }]);
    });
    const p = await asUser(db, userP, (tx) => one<{ profit: string; margin_pct: string | null }>(tx, `select profit, margin_pct from public.quote_pnl where id = $1`, [quoteId]));
    expect([Number(p.profit), p.margin_pct]).toEqual([-600, null]);
  });

  it('totals only confirmed quotes by default and excludes incomplete ones from profit', async () => {
    await asUser(db, userP, async (tx) => {
      const s = await setup(tx);
      const a = await s.quote([{ element_id: s.big, qty: 1, rate: 1000 }]); // profit 400
      const b = await s.quote([{ element_id: s.small, qty: 1, rate: 500 }]);
      await s.orphanLine(b); // cost missing
      await s.quote([{ element_id: s.big, qty: 10, rate: 1000 }]); // stays draft
      await tx.query(`update public.quotes set status = 'confirmed' where id = any($1::uuid[])`, [[a, b]]);
    });
    const t = await asUser(db, userP, (tx) => one<{ r: Record<string, number> }>(tx, `select public.pnl_totals() as r`));
    expect(t.r).toMatchObject({ quotes: 2, complete_quotes: 1, incomplete_quotes: 1, elements_selling: 1000, elements_cost: 600, profit: 400, margin_pct: 40 });

    const all = await asUser(db, userP, (tx) =>
      one<{ r: Record<string, number> }>(tx, `select public.pnl_totals(array['draft','confirmed']::public.quote_status[]) as r`),
    );
    expect(all.r.quotes).toBeGreaterThan(2);
  });

  it('0026 re-costs saved lines (confirmed too) from the Default rate', async () => {
    const quoteId = await asUser(db, userP, async (tx) => {
      const s = await setup(tx);
      return s.quote([{ element_id: s.big, qty: 1, rate: 1000 }]);
    });
    await db.query(`update public.quotes set status = 'confirmed' where id = $1`, [quoteId]); // frozen quotes too
    await db.exec(`alter table public.quote_items disable trigger quote_items_guard;
      update public.quote_items set unit_cost_at_quote = 123, cost_source = 'fixed' where quote_id = '${quoteId}';
      alter table public.quote_items enable trigger quote_items_guard;`);
    await db.exec(readFileSync(join(MIGRATIONS_DIR, '0026_cost_is_default_rate.sql'), 'utf8'));
    const item = await one<{ unit_cost_at_quote: string; cost_source: string; rate: string }>(
      db,
      `select unit_cost_at_quote, cost_source, rate::text from public.quote_items where quote_id = $1`,
      [quoteId],
    );
    expect([Number(item.unit_cost_at_quote), item.cost_source, item.rate]).toEqual([600, 'base_rate', '1000.00']);
  });

  it('is private to each user', async () => {
    const seen = await asUser(db, userA, (tx) => tx.query(`select id from public.quote_pnl where guest_name = 'PnL Guest'`));
    expect(seen.rows).toEqual([]);
    await expect(asAnon(db, (tx) => tx.query(`select * from public.quote_pnl`))).rejects.toThrow(/permission denied/);
  });
});

describe('deleting elements and packages (0015)', () => {
  let userD: string;
  beforeAll(async () => {
    userD = await createUser(db, '9000000099', 'Delete User');
  });

  async function quoteWith(tx: Transaction, el: string, pkg: string) {
    const opt = await one<{ fn: string; venue: string; sess: string }>(
      tx,
      `select (select id from public.function_options where name = 'Haldi') fn,
              (select id from public.venues where name = 'Ambria Restro') venue,
              (select id from public.sessions where name = 'Lunch') sess`,
    );
    return one<{ r: { id: string } }>(tx, `select public.save_quote($1::jsonb) as r`, [
      JSON.stringify({
        guest: { source: 'manual', guest_name: 'Delete Guest', guest_phone: '9811100000', function_id: opt.fn, venue_id: opt.venue, event_date: '2027-04-01', session_id: opt.sess },
        packages: [{ package_id: pkg, lines: [{ element_id: el, qty: 2, rate: 900 }] }],
        charges: [],
      }),
    ]).then((x) => x.r.id);
  }

  it('deletes an unused element and returns its image path for clean-up', async () => {
    const r = await asUser(db, userD, async (tx) => {
      const id = (await one<{ id: string }>(tx, `insert into public.elements (name, default_rate, image_path) values ('Spare', 10, 'u/e/1.webp') returning id`)).id;
      const out = await one<{ r: { image_path: string } }>(tx, `select public.delete_element($1) as r`, [id]);
      const left = await one<{ n: number }>(tx, `select count(*)::int n from public.elements where id = $1`, [id]);
      return { out: out.r, left: left.n };
    });
    expect(r).toEqual({ out: { image_path: 'u/e/1.webp' }, left: 0 });
  });

  it('blocks deleting an element that is in a package or has vendor history', async () => {
    await expect(
      asUser(db, userD, async (tx) => {
        const el = await newElement(tx, 'In Package', 100);
        await tx.query(`select public.save_package(null, 'Holder', $1, null, null, null, null, true, $2::jsonb)`, [
          await tierId(tx),
          JSON.stringify([{ element_id: el, default_qty: 1 }]),
        ]);
        await tx.query(`select public.delete_element($1)`, [el]);
      }),
    ).rejects.toThrow(/in 1 package/);
    await expect(
      asUser(db, userD, async (tx) => {
        const el = await newElement(tx, 'Bought Before', 100);
        const v = (await one<{ id: string }>(tx, `insert into public.vendors (name) values ('Del Vendor') returning id`)).id;
        await tx.query(`insert into public.vendor_rate_entries (element_id, vendor_id, purchase_date, qty, rate_per_unit) values ($1, $2, current_date, 1, 50)`, [el, v]);
        await tx.query(`select public.delete_element($1)`, [el]);
      }),
    ).rejects.toThrow(/vendor purchase history/);
  });

  it('deleting a package (then its element) keeps confirmed quotes and history intact', async () => {
    const { quoteId, el, pkg } = await asUser(db, userD, async (tx) => {
      const el = await newElement(tx, 'Snapshot Arch', 1000);
      const pkg = (await one<{ id: string }>(tx, `select public.save_package(null, 'Doomed Package', $1, null, null, null, null, true, $2::jsonb) as id`, [
        await tierId(tx, 'Premium'),
        JSON.stringify([{ element_id: el, default_qty: 1 }]),
      ])).id;
      const quoteId = await quoteWith(tx, el, pkg); // rate 900 vs master 1000 -> override log
      await tx.query(`update public.quotes set status = 'confirmed' where id = $1`, [quoteId]);
      return { quoteId, el, pkg };
    });

    await asUser(db, userD, (tx) => tx.query(`select public.delete_package($1)`, [pkg]));
    await asUser(db, userD, (tx) => tx.query(`select public.delete_element($1)`, [el]));

    const q = await asUser(db, userD, (tx) =>
      one<Record<string, unknown>>(
        tx,
        `select q.status, q.package_id, q.package_name, q.final_total,
                (select package_name from public.quote_packages where quote_id = q.id) section,
                (select package_id from public.quote_packages where quote_id = q.id) section_pkg,
                (select element_name from public.quote_items where quote_id = q.id) item_name,
                (select element_id from public.quote_items where quote_id = q.id) item_el,
                (select count(*)::int from public.rate_change_logs where quote_id = q.id) logs
           from public.quotes q where q.id = $1`,
        [quoteId],
      ),
    );
    expect({ ...q, final_total: Number(q.final_total) }).toEqual({
      status: 'confirmed',
      package_id: null,
      package_name: 'Doomed Package',
      final_total: 1800,
      section: 'Doomed Package',
      section_pkg: null,
      item_name: 'Snapshot Arch',
      item_el: null,
      logs: 1,
    });
  });

  it("user B can delete user D's package", async () => {
    const pkg = await asUser(db, userD, async (tx) => {
      const el = await newElement(tx, 'Team El', 1);
      return (await one<{ id: string }>(tx, `select public.save_package(null, 'Team Pkg', $1, null, null, null, null, true, $2::jsonb) as id`, [
        await tierId(tx),
        JSON.stringify([{ element_id: el, default_qty: 1 }]),
      ])).id;
    });
    await asUser(db, userB, (tx) => tx.query(`select public.delete_package($1)`, [pkg]));
    expect((await db.query(`select id from public.packages where id = $1`, [pkg])).rows).toEqual([]);
  });
});

describe('vendor_rate_history view (trend)', () => {
  it('marks NEW / up / down / same by purchase date and ignores voided entries', async () => {
    const { el, ids } = await asUser(db, userA, async (tx) => {
      const el = await newElement(tx, 'Trend Fruits', 100);
      const v = await one<{ id: string }>(tx, `insert into public.vendors (name) values ('Trend Vendor') returning id`);
      const add = async (date: string, rate: number) =>
        (
          await one<{ id: string }>(
            tx,
            `insert into public.vendor_rate_entries (element_id, vendor_id, purchase_date, qty, unit, rate_per_unit)
             values ($1, $2, $3, 1, 'Kg', $4) returning id`,
            [el, v.id, date, rate],
          )
        ).id;
      // logged out of order on purpose — trend follows purchase_date
      const d15 = await add('2026-10-15', 160);
      const d01 = await add('2026-10-01', 190);
      const s21 = await add('2026-09-21', 150);
      const d18 = await add('2026-10-18', 180);
      const d20 = await add('2026-10-20', 180);
      const bad = await add('2026-10-19', 999);
      await tx.query(`select public.void_vendor_rate_entry($1, 'typo')`, [bad]);
      return { el, ids: { s21, d01, d15, d18, d20, bad } };
    });

    const rows = await asUser(db, userA, (tx) =>
      tx.query<{ id: string; trend: string; prev_rate: string | null; vendor_name: string; element_name: string }>(
        `select id, trend, prev_rate, vendor_name, element_name from public.vendor_rate_history where element_id = $1
         order by purchase_date desc, logged_at desc`,
        [el],
      ),
    );
    const byId = Object.fromEntries(rows.rows.map((r) => [r.id, r.trend]));
    expect(byId).toEqual({
      [ids.s21]: 'new',
      [ids.d01]: 'up',
      [ids.d15]: 'down',
      [ids.d18]: 'up',
      [ids.bad]: 'void',
      [ids.d20]: 'same', // compared with 18 Oct, the voided 19 Oct entry is skipped
    });
    expect(rows.rows[0]).toMatchObject({ vendor_name: 'Trend Vendor', element_name: 'Trend Fruits' });
  });

  it("is shared with the team and closed to anon", async () => {
    const seen = await asUser(db, userB, (tx) => tx.query(`select id from public.vendor_rate_history where element_name = 'Trend Fruits'`));
    expect(seen.rows).toHaveLength(6);
    await expect(asAnon(db, (tx) => tx.query(`select * from public.vendor_rate_history`))).rejects.toThrow(/permission denied/);
  });
});

describe('rate limiting', () => {
  it('allows up to the limit, then blocks with P0429', async () => {
    const results = await asUser(db, userA, async (tx) => {
      const out: boolean[] = [];
      for (let i = 0; i < 3; i++) {
        out.push((await one<{ ok: boolean }>(tx, `select public.check_rate_limit('test', 2, 60) ok`)).ok);
      }
      return out;
    });
    expect(results).toEqual([true, true, false]);

    await expect(
      asUser(db, userA, (tx) => tx.query(`select public.enforce_rate_limit('test', 2, 60)`)),
    ).rejects.toMatchObject({ code: 'P0429' });
  });

  it('counts each user separately', async () => {
    const ok = await asUser(db, userB, (tx) => one<{ ok: boolean }>(tx, `select public.check_rate_limit('test', 2, 60) ok`));
    expect(ok.ok).toBe(true);
  });

  it('users cannot read or reset the counters', async () => {
    await expect(asUser(db, userA, (tx) => tx.query(`delete from public.rate_limits`))).rejects.toThrow(/permission denied/);
  });
});

describe('storage (per-user folders)', () => {
  it('lets a user write only inside their own folder; catalogue photos are readable by the team', async () => {
    await asUser(db, userA, (tx) =>
      tx.query(`insert into storage.objects (bucket_id, name) values ('element-images', $1)`, [`${userA}/elements/arch.webp`]),
    );
    await asUser(db, userA, (tx) =>
      tx.query(`insert into storage.objects (bucket_id, name) values ('brand', $1)`, [`${userA}/logo.webp`]),
    );
    await expect(
      asUser(db, userB, (tx) =>
        tx.query(`insert into storage.objects (bucket_id, name) values ('element-images', $1)`, [`${userA}/hack.webp`]),
      ),
    ).rejects.toThrow(/row-level security/);
    const seen = await asUser(db, userB, (tx) => tx.query(`select name from storage.objects`));
    expect(seen.rows).toEqual([{ name: `${userA}/elements/arch.webp` }]); // brand files stay private
  });
});

describe('charge rates (0018)', () => {
  it('seeds Transportation and Labour for every user, each seeing only their own', async () => {
    const rows = await asUser(db, userB, (tx) =>
      tx.query<{ code: string; mode: string; rate: string; qty_per_package: string; owner_id: string }>(
        `select code, mode, rate::text, qty_per_package::text, owner_id from public.charge_rates order by sort_order`,
      ),
    );
    expect(rows.rows.map((r) => [r.code, r.mode, r.rate, r.qty_per_package])).toEqual([
      ['transportation', 'fixed', '0.00', '1.00'],
      ['labour', 'per_package', '500.00', '2.00'],
    ]);
    expect(new Set(rows.rows.map((r) => r.owner_id))).toEqual(new Set([userB]));
  });

  it('lets a user change rate / labour per package, but not code, mode or other users’ rows', async () => {
    await asUser(db, userA, (tx) => tx.query(`update public.charge_rates set rate = 1500 where code = 'transportation'`));
    const a = await asUser(db, userA, (tx) => one<{ rate: string }>(tx, `select rate::text from public.charge_rates where code = 'transportation'`));
    expect(a.rate).toBe('1500.00');
    const b = await asUser(db, userB, (tx) => one<{ rate: string }>(tx, `select rate::text from public.charge_rates where code = 'transportation'`));
    expect(b.rate).toBe('0.00');

    await expect(asUser(db, userA, (tx) => tx.query(`update public.charge_rates set mode = 'fixed' where code = 'labour'`))).rejects.toThrow(
      /cannot change/,
    );
    await expect(asUser(db, userA, (tx) => tx.query(`update public.charge_rates set rate = -1 where code = 'labour'`))).rejects.toThrow(/check/);
    await expect(asUser(db, userA, (tx) => tx.query(`delete from public.charge_rates`))).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, userA, (tx) => tx.query(`insert into public.charge_rates (code, label, mode) values ('x_y', 'X', 'fixed')`)),
    ).rejects.toThrow(/permission denied/);
  });

  it('re-running 0018 keeps edited rates', async () => {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, '0018_charge_rates.sql'), 'utf8'));
    const a = await asUser(db, userA, (tx) => one<{ rate: string }>(tx, `select rate::text from public.charge_rates where code = 'transportation'`));
    expect(a.rate).toBe('1500.00');
  });
});

describe('charge rates per venue (0019)', () => {
  const venueId = (tx: Transaction, name: string) => one<{ id: string }>(tx, `select id from public.venues where name = $1`, [name]).then((r) => r.id);
  const labourId = (tx: Transaction) => one<{ id: string }>(tx, `select id from public.charge_rates where code = 'labour'`).then((r) => r.id);

  it('saves the default and venue rates in one call; venues left out go back to the default', async () => {
    await asUser(db, userB, async (tx) => {
      const exotica = await venueId(tx, 'Ambria Exotica');
      const push = await venueId(tx, 'Ambria Pushpanjali');
      const id = await labourId(tx);
      await tx.query(`select public.save_charge_rate($1, 600, 3, $2::jsonb)`, [
        id,
        JSON.stringify([
          { venue_id: exotica, rate: 700, qty_per_package: null },
          { venue_id: push, rate: 800, qty_per_package: 4 },
        ]),
      ]);
      const def = await one<{ rate: string; qty: string }>(tx, `select rate::text, qty_per_package::text qty from public.charge_rates where id = $1`, [id]);
      expect(def).toEqual({ rate: '600.00', qty: '3.00' });
      const rows = await tx.query<{ rate: string; qty: string | null }>(
        `select rate::text, qty_per_package::text qty from public.charge_venue_rates where charge_rate_id = $1 order by rate`,
        [id],
      );
      expect(rows.rows).toEqual([{ rate: '700.00', qty: null }, { rate: '800.00', qty: '4.00' }]);

      await tx.query(`select public.save_charge_rate($1, 600, null, $2::jsonb)`, [id, JSON.stringify([{ venue_id: push, rate: 900 }])]);
      const after = await tx.query(`select rate::text from public.charge_venue_rates where charge_rate_id = $1`, [id]);
      expect(after.rows).toEqual([{ rate: '900.00' }]);
    });
  });

  it("can't point at another user's venue or charge, and others can't see the rows", async () => {
    const otherVenue = await asUser(db, userA, (tx) => venueId(tx, 'Ambria Exotica'));
    await expect(
      asUser(db, userB, async (tx) =>
        tx.query(`select public.save_charge_rate($1, 600, null, $2::jsonb)`, [await labourId(tx), JSON.stringify([{ venue_id: otherVenue, rate: 1 }])]),
      ),
    ).rejects.toThrow(/foreign key/);
    const aLabour = await asUser(db, userA, (tx) => labourId(tx));
    await expect(asUser(db, userB, (tx) => tx.query(`select public.save_charge_rate($1, 1, null, '[]')`, [aLabour]))).rejects.toThrow(/not found/);
    const seen = await asUser(db, userA, (tx) => tx.query(`select id from public.charge_venue_rates`));
    expect(seen.rows).toEqual([]);
  });
});

describe('Manaktala venue (0020)', () => {
  it('renames Emerald Green to Manaktala for every user, keeping its LMS id', async () => {
    const rows = await asUser(db, userA, (tx) => tx.query<{ name: string; lms_id: number }>(`select name, lms_id from public.venues order by sort_order`));
    expect(rows.rows.map((r) => r.name)).toEqual(['Ambria Pushpanjali', 'Manaktala', 'Ambria Exotica', 'Ambria Restro']);
    expect(rows.rows[1]!.lms_id).toBe(6);
  });

  it('gives new users Manaktala, and re-running is harmless', async () => {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, '0020_manaktala_venue.sql'), 'utf8'));
    const fresh = await createUser(db, '9000011111', 'New User');
    const rows = await asUser(db, fresh, (tx) => tx.query<{ name: string }>(`select name from public.venues where lms_id = 6`));
    expect(rows.rows).toEqual([{ name: 'Manaktala' }]);
  });
});

describe('element remarks (0021)', () => {
  it('saves trimmed remarks through update_element and limits them to 500 characters', async () => {
    await asUser(db, userA, async (tx) => {
      const id = await newElement(tx, 'Remarks Arch');
      const r = await one<{ remarks: string | null }>(
        tx,
        `select (public.update_element($1, 'Remarks Arch', null, 1000, 1, null, null, null, '  Entrance gate, Exotica  ')).remarks`,
        [id],
      );
      expect(r.remarks).toBe('Entrance gate, Exotica');
      const blank = await one<{ remarks: string | null }>(tx, `select (public.update_element($1, 'Remarks Arch', null, 1000, 1, null, null, null, '  ')).remarks`, [id]);
      expect(blank.remarks).toBeNull();
    });
    await expect(
      asUser(db, userA, (tx) => tx.query(`insert into public.elements (name, default_rate, remarks) values ('Long', 1, $1)`, ['x'.repeat(501)])),
    ).rejects.toThrow(/elements_remarks_len/);
  });
});

describe('quote line remarks (0022)', () => {
  it('snapshots the element remarks when a line is saved; later edits to the element do not change it', async () => {
    await asUser(db, userA, async (tx) => {
      const el = await newElement(tx, `Remark Gate ${Math.random()}`);
      await tx.query(`update public.elements set remarks = 'Entrance gate, Exotica' where id = $1`, [el]);
      const q = await newQuote(tx);
      const line = await one<{ id: string; remarks: string | null }>(
        tx,
        `insert into public.quote_items (quote_id, element_id, element_name, qty, rate, amount, sort_order)
         values ($1, $2, 'Gate', 1, 1000, 1000, 1) returning id, remarks`,
        [q.id, el],
      );
      expect(line.remarks).toBe('Entrance gate, Exotica');
      await tx.query(`update public.elements set remarks = 'Changed later' where id = $1`, [el]);
      const after = await one<{ remarks: string }>(tx, `select remarks from public.quote_items where id = $1`, [line.id]);
      expect(after.remarks).toBe('Entrance gate, Exotica');
    });
  });
});

describe('package functions (0024)', () => {
  it('tags packages with functions and lists the guest function first, never hiding the rest', async () => {
    const res = await asUser(db, userB, async (tx) => {
      const fn = (name: string) => one<{ id: string }>(tx, `select id from public.function_options where name = $1`, [name]).then((r) => r.id);
      const sangeet = await fn('Sangeet');
      const wedding = await fn('Wedding');
      const el = await newElement(tx, `PF El ${Math.random()}`);
      const tier = await tierId(tx);
      const make = async (name: string) =>
        (await one<{ id: string }>(tx, `select public.save_package(null, $1, $2, null, null, null, null, true, $3::jsonb) as id`, [
          name,
          tier,
          JSON.stringify([{ element_id: el, default_qty: 1 }]),
        ])).id;
      const aAll = await make('AA Any function');
      const zSangeet = await make('ZZ Sangeet Special');
      const mBoth = await make('MM Sangeet and Wedding');
      await tx.query(`select public.set_package_functions($1, $2::uuid[])`, [zSangeet, [sangeet]]);
      await tx.query(`select public.set_package_functions($1, $2::uuid[])`, [mBoth, [sangeet, wedding, sangeet]]);
      const forSangeet = await tx.query<{ name: string; for_function: boolean; total: string }>(
        `select name, for_function, total::text from public.studio_packages($1, 0, 50)`,
        [sangeet],
      );
      const noFn = await tx.query<{ for_function: boolean }>(`select for_function from public.studio_packages(null, 0, 50)`);
      const tags = await one<{ n: number }>(tx, `select count(*)::int n from public.package_functions where package_id = $1`, [mBoth]);
      await tx.query(`select public.set_package_functions($1, '{}')`, [mBoth]);
      const cleared = await one<{ n: number }>(tx, `select count(*)::int n from public.package_functions where package_id = $1`, [mBoth]);
      return { forSangeet: forSangeet.rows, noFn: noFn.rows, tags: tags.n, cleared: cleared.n, aAll };
    });
    const names = res.forSangeet.map((r) => r.name);
    expect(names.slice(0, 2)).toEqual(['MM Sangeet and Wedding', 'ZZ Sangeet Special']); // the guest's function first
    expect(names).toContain('AA Any function'); // untagged still listed
    expect(res.forSangeet.filter((r) => r.for_function)).toHaveLength(2);
    expect(Number(res.forSangeet[0]!.total)).toBe(res.forSangeet.length);
    expect(res.noFn.every((r) => !r.for_function)).toBe(true);
    expect(res.tags).toBe(2); // duplicates collapsed
    expect(res.cleared).toBe(0);
  });

  it("matches a teammate's tag by function name, but can't use their function id", async () => {
    const aFn = await asUser(db, userA, (tx) => one<{ id: string }>(tx, `select id from public.function_options where name = 'Sangeet'`).then((r) => r.id));
    const pkg = await asUser(db, userA, async (tx) => {
      const el = await newElement(tx, `Tag El ${Math.random()}`);
      const id = (await one<{ id: string }>(tx, `select public.save_package(null, 'A Sangeet Tagged', $1, null, null, null, null, true, $2::jsonb) as id`, [
        await tierId(tx),
        JSON.stringify([{ element_id: el, default_qty: 1 }]),
      ])).id;
      await tx.query(`select public.set_package_functions($1, $2::uuid[])`, [id, [aFn]]);
      return id;
    });
    // B's own "Sangeet" (a different id) puts A's tagged package first.
    const forB = await asUser(db, userB, async (tx) => {
      const bFn = await one<{ id: string }>(tx, `select id from public.function_options where name = 'Sangeet'`);
      return tx.query<{ id: string; for_function: boolean }>(`select id, for_function from public.studio_packages($1, 0, 50)`, [bFn.id]);
    });
    expect(forB.rows.find((r) => r.id === pkg)?.for_function).toBe(true);
    await expect(
      asUser(db, userB, (tx) => tx.query(`select public.set_package_functions($1, $2::uuid[])`, [pkg, [aFn]])),
    ).rejects.toThrow(/foreign key/);
  });
});

describe('vendor rates: old → new (0027)', () => {
  it('shows one row per element + vendor with the latest and previous rate, ignoring voided entries', async () => {
    const rows = await asUser(db, userB, async (tx) => {
      const el = await newElement(tx, `Old New ${Math.random()}`);
      const a = await one<{ id: string }>(tx, `insert into public.vendors (name) values ($1) returning id`, [`ON A ${Math.random()}`]);
      const b = await one<{ id: string }>(tx, `insert into public.vendors (name) values ($1) returning id`, [`ON B ${Math.random()}`]);
      const log = (v: string, date: string, rate: number) =>
        one<{ id: string }>(
          tx,
          `insert into public.vendor_rate_entries (element_id, vendor_id, purchase_date, qty, rate_per_unit) values ($1, $2, $3, 1, $4) returning id`,
          [el, v, date, rate],
        );
      await log(a.id, '2026-10-01', 2);
      await log(a.id, '2026-10-10', 5);
      const bad = await log(a.id, '2026-10-20', 999);
      await tx.query(`select public.void_vendor_rate_entry($1, 'typo')`, [bad.id]);
      await log(b.id, '2026-10-05', 7);
      return tx.query<{ vendor_id: string; new_rate: string; old_rate: string | null; purchases: number; trend: string }>(
        `select vendor_id, new_rate::text, old_rate::text, purchases, trend from public.vendor_rate_latest where element_id = $1 order by new_rate`,
        [el],
      );
    });
    expect(rows.rows.map((r) => [r.new_rate, r.old_rate, r.purchases, r.trend])).toEqual([
      ['5.00', '2.00', 2, 'up'], // vendor A: voided ₹999 ignored
      ['7.00', null, 1, 'new'], // vendor B
    ]);
  });
});

describe('landing photo (0028)', () => {
  it('lets a user set their own landing photo path, but not anyone else’s', async () => {
    await asUser(db, userB, (tx) => tx.query(`update public.profiles set hero_image_path = $1 where id = $2`, [`${userB}/brand/hero.webp`, userB]));
    const mine = await asUser(db, userB, (tx) => one<{ p: string }>(tx, `select hero_image_path p from public.profiles where id = $1`, [userB]));
    expect(mine.p).toBe(`${userB}/brand/hero.webp`);
    const r = await asUser(db, userB, (tx) => tx.query(`update public.profiles set hero_image_path = 'x' where id = $1`, [userA]));
    expect(r.affectedRows ?? 0).toBe(0);
  });
});

describe('team manual quotes (0031)', () => {
  /** User A's manual quote with one package; returns ids and a payload builder for any user. */
  async function aManualQuote(source = 'manual', guestName = `Kapoor ${Math.random().toString(36).slice(2, 8)}`) {
    return asUser(db, userA, async (tx) => {
      const tier = await tierId(tx, 'Premium');
      const el = await newElement(tx, `T Arch ${Math.random()}`, 20000);
      const pkg = await one<{ id: string }>(
        tx,
        `select public.save_package(null, $1, $2, null, null, null, null, true, $3::jsonb) as id`,
        [`T Royal ${Math.random()}`, tier, JSON.stringify([{ element_id: el, default_qty: 1 }])],
      );
      const payload = await guestPayload(tx, { source, guestName, pkg: pkg.id, el, rate: 20000 });
      const r = await one<{ r: { id: string } }>(tx, `select public.save_quote($1::jsonb) as r`, [JSON.stringify(payload)]);
      return { id: r.r.id, pkg: pkg.id, el, guestName };
    });
  }
  /** A save payload using the CALLER's own option lists. */
  async function guestPayload(
    tx: Transaction,
    o: { source?: string; guestName: string; pkg: string; el: string; rate: number; quoteId?: string },
  ) {
    const opt = await one<{ fn: string; venue: string; sess: string }>(
      tx,
      `select (select id from public.function_options where name = 'Sangeet') fn,
              (select id from public.venues where name = 'Ambria Exotica') venue,
              (select id from public.sessions where name = 'Dinner') sess`,
    );
    return {
      quote_id: o.quoteId ?? null,
      guest: {
        source: o.source ?? 'manual', source_ref: null, guest_name: o.guestName, guest_phone: '9876543210',
        function_id: opt.fn, venue_id: opt.venue, sub_venue_id: null, event_date: '2027-02-01', session_id: opt.sess,
      },
      packages: [{ package_id: o.pkg, lines: [{ element_id: o.el, qty: 1, rate: o.rate, included: true }] }],
      charges: [],
    };
  }

  it('search shows only your own manual quotes unless "all staff" is on', async () => {
    const q = await aManualQuote();
    await aManualQuote('lms_lead', q.guestName); // LMS quotes are never shared
    const search = (all: boolean) =>
      asUser(db, userB, (tx) => tx.query<{ id: string; mine: boolean; owner_name: string }>(
        `select * from public.team_manual_quotes($1, '', $2)`, [q.guestName, all]));
    expect((await search(false)).rows).toEqual([]);
    const all = (await search(true)).rows;
    expect(all.map((r) => [r.id, r.mine, r.owner_name])).toEqual([[q.id, false, 'Uday Yadav']]);
    const own = await asUser(db, userA, (tx) => tx.query<{ mine: boolean }>(`select * from public.team_manual_quotes($1, '', false)`, [q.guestName]));
    expect(own.rows.map((r) => r.mine)).toEqual([true]);
  });

  it('opening a teammate’s quote maps options to your lists and is logged once', async () => {
    const q = await aManualQuote();
    const open = () => asUser(db, userB, (tx) => one<{ r: Record<string, unknown> }>(tx, `select public.team_quote($1) as r`, [q.id]).then((x) => x.r));
    const r = await open();
    await open();
    const bFn = await asUser(db, userB, (tx) => one<{ id: string }>(tx, `select id from public.function_options where name = 'Sangeet'`));
    expect(r).toMatchObject({ mine: false, owner_name: 'Uday Yadav', function_id: bFn.id, status: 'draft' });
    expect((r.quote_items as unknown[]).length).toBe(1);

    const logs = await asUser(db, userA, (tx) =>
      tx.query<{ action: string; actor: string; name: string }>(
        `select action, actor, new_data->>'actor_name' name from public.audit_log where row_id = $1 and action like '%_by_other'`, [q.id]));
    expect(logs.rows).toEqual([{ action: 'viewed_by_other', actor: userB, name: 'David' }]);
    // The audit trail belongs to the owner; the teammate can't read or change it.
    const theirs = await asUser(db, userB, (tx) => tx.query(`select 1 from public.audit_log where row_id = $1`, [q.id]));
    expect(theirs.rows).toEqual([]);
    await expect(asUser(db, userB, (tx) => tx.query(`delete from public.audit_log where row_id = $1`, [q.id]))).rejects.toThrow();
  });

  it('a teammate can update the manual quote in place; owner stays, change is audited', async () => {
    const q = await aManualQuote();
    const saved = await asUser(db, userB, async (tx) => {
      const p = await guestPayload(tx, { guestName: q.guestName, pkg: q.pkg, el: q.el, rate: 25000, quoteId: q.id });
      return one<{ r: { id: string } }>(tx, `select public.save_quote($1::jsonb) as r`, [JSON.stringify(p)]).then((x) => x.r);
    });
    expect(saved.id).toBe(q.id);

    const row = await one<{ owner_id: string; final_total: string; lines: number }>(
      db,
      `select owner_id, final_total, (select count(*)::int from public.quote_items i where i.quote_id = q.id and i.owner_id = q.owner_id) lines
         from public.quotes q where id = $1`, [q.id]);
    expect(row).toEqual({ owner_id: userA, final_total: '25000.00', lines: 1 });

    const log = await one<{ actor: string; before: string; after: string; name: string }>(
      db,
      `select actor, old_data->>'final_total' before, new_data->>'final_total' after, new_data->>'actor_name' name
         from public.audit_log where row_id = $1 and action = 'edited_by_other'`, [q.id]);
    expect({ ...log, before: Number(log.before), after: Number(log.after) }).toEqual({ actor: userB, before: 20000, after: 25000, name: 'David' });
  });

  it('confirmed quotes stay locked, and LMS quotes stay private', async () => {
    const q = await aManualQuote();
    await asUser(db, userA, (tx) => tx.query(`update public.quotes set status = 'confirmed' where id = $1`, [q.id]));
    await expect(
      asUser(db, userB, async (tx) => {
        const p = await guestPayload(tx, { guestName: q.guestName, pkg: q.pkg, el: q.el, rate: 1, quoteId: q.id });
        await tx.query(`select public.save_quote($1::jsonb)`, [JSON.stringify(p)]);
      }),
    ).rejects.toThrow(/can no longer be edited/);

    const lms = await aManualQuote('lms_contract');
    await expect(asUser(db, userB, (tx) => tx.query(`select public.team_quote($1)`, [lms.id]))).rejects.toThrow(/not found/);
  });
});

describe('re-running migrations with shared data (0030)', () => {
  it('still works when quotes and packages point at teammates’ rows', async () => {
    const cross = await one<{ n: number }>(
      db,
      `select count(*)::int n from public.quote_packages qp join public.packages p on p.id = qp.package_id where p.owner_id <> qp.owner_id`,
    );
    expect(cross.n).toBeGreaterThan(0);
    await expect(applyMigrations(db)).resolves.toBeUndefined();
  }, 60_000);
});