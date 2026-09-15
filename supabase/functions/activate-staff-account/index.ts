// supabase/functions/activate-staff-account/index.ts
//
// Invoked by an authenticated user during password setup on /set-password.
// Delegates status transition, status history insertion, and audit logging
// directly to the transactional PostgreSQL RPC activate_staff_account().
//
// Performs non-blocking repair if app_metadata.staff_role has drifted from
// the canonical PostgreSQL profile role.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.1';

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '*')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function originMatches(origin: string, pattern: string): boolean {
  if (!pattern.includes('*')) return origin === pattern;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(origin);
}

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allowOrigin = ALLOWED_ORIGINS.includes('*')
    ? '*'
    : (ALLOWED_ORIGINS.find((p) => originMatches(origin, p)) ?? ALLOWED_ORIGINS[0] ?? '');
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

    // Authenticate caller session from their own invite JWT
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await callerClient.auth.getUser();
    if (userError || !user) {
      return json(req, { error: 'Invalid or expired invite session' }, 401);
    }

    // 1. Invoke atomic database RPC under caller's authenticated context
    const { data: rpcResult, error: rpcError } = await callerClient.rpc('activate_staff_account');

    if (rpcError) {
      console.error('[activate-staff-account] RPC activation error:', rpcError.message);
      return json(req, { error: rpcError.message || 'Failed to activate staff account.' }, 400);
    }

    const activatedRole = rpcResult?.role ?? 'staff';

    // 2. Non-authoritative claim projection repair (if app_metadata drifted)
    const projectedRole = user.app_metadata?.staff_role;
    if (projectedRole !== activatedRole) {
      const adminClient = createClient(supabaseUrl, serviceRoleKey);
      try {
        await adminClient.auth.admin.updateUserById(user.id, {
          app_metadata: { staff_role: activatedRole },
        });
        console.log(`[activate-staff-account] Repaired app_metadata for user ${user.id} to ${activatedRole}`);
      } catch (driftErr) {
        console.warn('[activate-staff-account] Non-blocking projection repair error:', driftErr);
      }
    }

    return json(req, { activated: true, role: activatedRole, status: rpcResult?.status }, 200);
  } catch (err) {
    console.error('[activate-staff-account] Unexpected error:', err);
    return json(req, { error: 'Unexpected server error' }, 500);
  }
});
