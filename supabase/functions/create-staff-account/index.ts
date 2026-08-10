// create-staff-account
//
// Invites a new staff member by email only. Does NOT create a `profiles` row —
// that happens client-side on the SetPassword page once the invitee verifies
// their email (by clicking the invite link) and chooses a password. This is
// what keeps unverified invites out of Team Management and unable to log in.
//
// Caller must be an authenticated admin or owner (checked against their own
// `profiles` row, not the client-supplied body).

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

const ALLOWED_INVITE_ROLES = ['staff', 'admin'];

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

    // Client bound to the caller's own JWT — used only to identify who is calling.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !caller) {
      return json(req, { error: 'Invalid or expired session' }, 401);
    }

    // Admin client — only ever used after the caller's own role is confirmed below.
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerProfile, error: profileError } = await adminClient
      .from('profiles')
      .select('role, deleted, is_blocked')
      .eq('id', caller.id)
      .maybeSingle();

    if (
      profileError ||
      !callerProfile ||
      callerProfile.deleted ||
      callerProfile.is_blocked ||
      !['admin', 'owner'].includes(callerProfile.role)
    ) {
      return json(req, { error: 'You do not have permission to invite staff.' }, 403);
    }

    const body = await req.json();
    const email = (body?.email ?? '').toLowerCase().trim();
    const role = body?.role;

    if (!email || !email.includes('@')) {
      return json(req, { error: 'A valid email address is required.' }, 400);
    }
    if (!ALLOWED_INVITE_ROLES.includes(role)) {
      return json(req, { error: 'Role must be "staff" or "admin".' }, 400);
    }

    const siteUrl = Deno.env.get('SITE_URL') ?? new URL(req.url).origin;

    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      {
        // user_metadata (spoofable by the user) — kept only for display/redirect.
        // The authoritative role lives in app_metadata, set below.
        data: { role },
        redirectTo: `${siteUrl}/set-password`,
      },
    );

    if (inviteError) {
      if (inviteError.status === 422 || /already registered/i.test(inviteError.message)) {
        return json(
          req,
          {
            error:
              'This email already has an account (e.g. a customer sign-up). Invite a fresh address, ' +
              'or use a + alias like name+staff@gmail.com for testing.',
          },
          409,
        );
      }
      return json(req, { error: inviteError.message }, 500);
    }

    // Authoritative role assignment. app_metadata is writable ONLY by the service
    // role — a user cannot change it via auth.updateUser (unlike user_metadata) —
    // so activate-staff-account can trust staff_role when it creates the profile.
    const { error: metaError } = await adminClient.auth.admin.updateUserById(
      inviteData.user.id,
      { app_metadata: { staff_role: role } },
    );
    if (metaError) {
      console.error('[create-staff-account] Failed to set app_metadata:', metaError);
      return json(req, { error: 'Invite sent but role assignment failed. Please retry.' }, 500);
    }

    return json(req, { userId: inviteData.user.id }, 200);
  } catch (err) {
    console.error('[create-staff-account] Unexpected error:', err);
    return json(req, { error: 'Unexpected server error' }, 500);
  }
});

function json(req: Request, body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(req), 'Content-Type': 'application/json' },
  });
}
