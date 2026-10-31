/**
 * lms-proxy — Supabase Edge Function (Deno).
 * The only way the app talks to LMS: keeps the LMS URL server-side, allows only the two
 * entertainment list endpoints, requires a signed-in user, rate limits per user, drops
 * cancelled rows and returns at most 5 normalised matches.
 *
 * Request:  POST { "source": "lead" | "contract", "query": "mehta" | "98765" }
 * Response: 200 { results: GuestLookupResult[] }
 *           400 bad_request · 401 unauthorized · 429 rate_limited
 *           501 lms_mapping_pending (FIELD_MAP not filled yet) · 502 lms_unavailable
 *
 * Secrets: LMS_BASE_URL, LMS_LOGGED_USER_ID (fallback when the user's profile has none),
 *          ALLOWED_ORIGINS (comma-separated app origins). SUPABASE_URL / SUPABASE_ANON_KEY are built in.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { FIELD_MAP, LMS_ENDPOINTS, isMappingReady, lookup, type LmsSource } from '../_shared/lms.ts';

const LMS_TIMEOUT_MS = 10_000;

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const allow = origin && allowed.includes(origin) ? origin : allowed[0] ?? '';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function json(status: number, body: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('Origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { code: 'method_not_allowed' }, cors);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json(401, { code: 'unauthorized' }, cors);

  // Client acting as the caller: RLS and auth.uid() apply.
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await sb.auth.getUser();
  if (userError || !userData.user) return json(401, { code: 'unauthorized' }, cors);

  const { error: limitError } = await sb.rpc('enforce_rate_limit', {
    p_action: 'lms_lookup',
    p_limit: 30,
    p_window_seconds: 60,
  });
  if (limitError) {
    return limitError.code === 'P0429'
      ? json(429, { code: 'rate_limited' }, { ...cors, 'Retry-After': '60' })
      : json(500, { code: 'server_error' }, cors);
  }

  let body: { source?: unknown; query?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { code: 'bad_request' }, cors);
  }
  const source = body.source as LmsSource;
  const query = typeof body.query === 'string' ? body.query.trim().slice(0, 60) : '';
  if (!(source in LMS_ENDPOINTS) || query.length < 3) return json(400, { code: 'bad_request' }, cors);

  const map = FIELD_MAP[source];
  if (!isMappingReady(map)) return json(501, { code: 'lms_mapping_pending' }, cors);

  const { data: profile } = await sb.from('profiles').select('lms_logged_user_id').eq('id', userData.user.id).single();
  const loggedUserId = profile?.lms_logged_user_id ?? Deno.env.get('LMS_LOGGED_USER_ID');
  const baseUrl = Deno.env.get('LMS_BASE_URL');
  if (!loggedUserId || !baseUrl) return json(501, { code: 'lms_not_configured' }, cors);

  try {
    const res = await fetch(baseUrl.replace(/\/$/, '') + LMS_ENDPOINTS[source], {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loggeduserid: String(loggedUserId) }),
      signal: AbortSignal.timeout(LMS_TIMEOUT_MS),
    });
    if (!res.ok) return json(502, { code: 'lms_unavailable' }, cors);
    const results = lookup(await res.json(), map, source, query);
    return json(200, { results }, cors);
  } catch {
    return json(502, { code: 'lms_unavailable' }, cors);
  }
});
