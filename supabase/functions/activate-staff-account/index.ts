// activate-staff-account
//
// Called once, from the SetPassword page, by a freshly-invited user who has
// just set their password. Creates their public.profiles row using the role
// stored in app_metadata.staff_role (set server-side at invite time and NOT
// modifiable by the user), then the account is active and appears in Team
// Management.
//
// Why this runs server-side instead of a client insert: the role must come
// from a source the user cannot tamper with. user_metadata IS user-writable
// (auth.updateUser({ data })), so trusting it would let anyone self-promote to
// admin. app_metadata is service-role-only, so we read it here under the
// service role and the client never gets to choose its own role.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.1';

// CORS origin allow-list. Set ALLOWED_ORIGINS in the function's env (comma-
// separated, e.g. "https://admin.jezsy.com,https://staging.jezsy.com") to lock
// this down. Defaults to '*' so behaviour is unchanged until configured.
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '*')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allowOrigin = ALLOWED_ORIGINS.includes('*')
    ? '*'
    : (ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] ?? ''));
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };
}

function json(req: Request, body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(req), 'Content-Type': 'application/json' },
  });
}

const ALLOWED_ROLES = ['staff', 'admin'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeadersFor(req) });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json(req, { error: 'Missing authorization header' }, 401);
    }

    // Identify the caller from their own invite session.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await callerClient.auth.getUser();
    if (userError || !user) {
      return json(req, { error: 'Invalid or expired invite session' }, 401);
    }

    // Trusted role — service-role-only claim, cannot be forged by the client.
    const staffRole = user.app_metadata?.staff_role;
    if (!ALLOWED_ROLES.includes(staffRole)) {
      return json(req, { error: 'This account is not a pending staff invite.' }, 403);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Guard against double-activation (e.g. the page submitted twice).
    const { data: existing } = await adminClient
      .from('profiles')
      .select('id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (existing && ALLOWED_ROLES.concat('owner').includes(existing.role)) {
      return json(req, { alreadyActive: true }, 200);
    }

    const profileRow = {
      id: user.id,
      email: user.email,
      role: staffRole,
      deleted: false,
      is_blocked: false,
      employment_status: 'active',
      updated_at: new Date().toISOString(),
    };

    // upsert covers both a brand-new row and the (blocked-at-invite-time)
    // edge case of an email that somehow already had a non-staff row.
    const { error: upsertError } = await adminClient
      .from('profiles')
      .upsert(profileRow, { onConflict: 'id' });

    if (upsertError) {
      console.error('[activate-staff-account] Profile upsert failed:', upsertError);
      return json(req, { error: 'Failed to activate account.' }, 500);
    }

    return json(req, { activated: true, role: staffRole }, 200);
  } catch (err) {
    console.error('[activate-staff-account] Unexpected error:', err);
    return json(req, { error: 'Unexpected server error' }, 500);
  }
});

