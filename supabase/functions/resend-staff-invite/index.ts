// supabase/functions/resend-staff-invite/index.ts
//
// Regenerates and dispatches a tokenized invitation action link for a pending
// staff member account. Re-derives identity directly from PostgreSQL profiles.
// Fails closed without falling back to passwordless authentication.
//
// Caller must be an authenticated owner.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.1';

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '*')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function originMatches(origin: string, pattern: string): boolean {
  if (!pattern.includes('*')) return origin === pattern;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp('^' + escaped + '$').test(origin);
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

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !caller) {
      return json(req, { error: 'Invalid or expired session' }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerProfile, error: profileError } = await adminClient
      .from('profiles')
      .select('role, deleted, is_blocked, employment_status')
      .eq('id', caller.id)
      .maybeSingle();

    if (
      profileError ||
      !callerProfile ||
      callerProfile.deleted ||
      callerProfile.is_blocked ||
      !['owner', 'admin'].includes(callerProfile.role) ||
      callerProfile.employment_status !== 'active'
    ) {
      return json(req, { error: 'You do not have permission to manage staff invitations.' }, 403);
    }

    const body = await req.json();
    const staffUserId = body?.staffUserId;

    if (!staffUserId) {
      return json(req, { error: 'staffUserId is required.' }, 400);
    }

    // Server-controlled redirect URL
    const configuredSiteUrl = Deno.env.get('ADMIN_DASHBOARD_URL') ?? Deno.env.get('SITE_URL');
    const requestOrigin = req.headers.get('Origin');
    const isOriginAllowed = requestOrigin && ALLOWED_ORIGINS.some((p) => originMatches(requestOrigin, p));
    const baseSiteUrl = configuredSiteUrl ?? (isOriginAllowed ? requestOrigin : 'https://admin.jezsy.com');
    const redirectUrl = `${baseSiteUrl.replace(/\/$/, '')}/set-password`;

    // 1. Look up target profile directly from canonical PostgreSQL record
    const { data: targetProfile, error: targetError } = await adminClient
      .from('profiles')
      .select('id, email, role, employment_status, is_blocked, deleted')
      .eq('id', staffUserId)
      .maybeSingle();

    if (targetError || !targetProfile) {
      return json(req, { error: 'Staff account not found.' }, 404);
    }

    if (targetProfile.deleted || targetProfile.is_blocked) {
      return json(req, { error: 'Cannot resend invitation for a blocked or archived account.' }, 400);
    }

    if (targetProfile.employment_status !== 'invited') {
      return json(
        req,
        {
          error:
            targetProfile.employment_status === 'active'
              ? 'This staff member is already active. Use password reset if they need to recover credentials.'
              : `Cannot resend invitation for staff in status: ${targetProfile.employment_status}`,
        },
        400,
      );
    }

    // 2. Regenerate and dispatch the invite in one call via Supabase Auth's
    // own admin API, instead of a separate generateLink + hand-rolled Resend
    // HTTP send. inviteUserByEmail both issues a fresh token for an existing,
    // still-unconfirmed user and emails it through whatever mail delivery is
    // configured on this Supabase project (Auth > Email settings) -- so it
    // is not limited to a single verified test recipient the way the
    // project's standalone Resend account was.
    let emailSent = false;
    let emailError: string | null = null;

    const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      targetProfile.email,
      { redirectTo: redirectUrl },
    );

    if (inviteError) {
      emailError = inviteError.message || 'Failed to send invitation email.';
      console.error('[resend-staff-invite] inviteUserByEmail failed:', emailError);
      await adminClient.from('logs').insert({
        user_id: caller.id,
        user_name: caller.email,
        action: 'staff_invite_resend_failed',
        target_type: 'staff',
        target_id: staffUserId,
        details: { error: emailError },
      });
      return json(req, { error: 'Failed to generate and send a fresh invitation. Please try again.' }, 500);
    }

    emailSent = true;
    console.log('[resend-staff-invite] Fresh invitation sent to ' + targetProfile.email + ' via Supabase Auth');

    // 4. Update delivery status, timestamp, and audit log
    await adminClient
      .from('profiles')
      .update({
        invite_delivery_status: emailSent ? 'sent' : 'failed',
        last_invited_at: new Date().toISOString(),
      })
      .eq('id', staffUserId);

    await adminClient.from('logs').insert({
      user_id: caller.id,
      user_name: caller.email,
      action: 'staff_invite_resent',
      target_type: 'staff',
      target_id: staffUserId,
      details: { email: targetProfile.email, role: targetProfile.role, emailSent, emailError },
    });

    return json(req, { success: true, emailSent, emailError }, 200);
  } catch (err: unknown) {
    console.error('[resend-staff-invite] Unexpected error:', err);
    return json(req, { error: 'Unexpected server error' }, 500);
  }
});
