/**
 * Builders for PostgREST `.or()` filter strings — values are always double-quoted so
 * user text and timestamps (which contain reserved , . : ( ) characters) can't break or
 * inject into the filter.
 */
import { escapeLike } from './dbErrors';

export function quoteValue(v: string): string {
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** `a.ilike."%term%",b.ilike."%term%"` — match the term in any of the columns. */
export function ilikeAny(columns: string[], term: string): string {
  const pattern = quoteValue(`%${escapeLike(term)}%`);
  return columns.map((c) => `${c}.ilike.${pattern}`).join(',');
}

/**
 * Keyset cursor for `order by col desc, id desc`: rows strictly after (value, id).
 * `col.lt."v",and(col.eq."v",id.lt."id")`
 */
export function keysetAfterDesc(col: string, value: string, id: string, idCol = 'id'): string {
  const v = quoteValue(value);
  return `${col}.lt.${v},and(${col}.eq.${v},${idCol}.lt.${quoteValue(id)})`;
}
