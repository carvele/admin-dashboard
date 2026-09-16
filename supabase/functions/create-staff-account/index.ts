// supabase/functions/create-staff-account/index.ts
//
// Provisions a new workforce identity with tokenized invitation links.
// Zero cleartext passwords. Enforces a coordinated compensating saga,
// mandatory server audit logging, and strict Staff-only onboarding for Phase 1.
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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const ALLOWED_INVITE_ROLES = ['staff'];

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

    // Verify caller session
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !caller) {
      return json(req, { error: 'Invalid or expired session' }, 401);
    }

    // Admin client bound to service role
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
      callerProfile.role !== 'owner' ||
      callerProfile.employment_status !== 'active'
    ) {
      return json(req, { error: 'You do not have permission to invite staff.' }, 403);
    }

    const body = await req.json();
    const email = (body?.email ?? '').toLowerCase().trim();
    const role = body?.role ?? 'staff';

    if (!email || !email.includes('@')) {
      return json(req, { error: 'A valid email address is required.' }, 400);
    }

    // Strict Phase 1 policy: staff only
    if (!ALLOWED_INVITE_ROLES.includes(role)) {
      return json(
        req,
        {
          error:
            'Phase 1 onboarding only supports staff invitations. Owner provisioning is restricted until Phase 2 MFA and step-up authentication are deployed.',
        },
        400,
      );
    }

    // Server-controlled redirect URL — never trust client-supplied siteUrl
    const configuredSiteUrl = Deno.env.get('ADMIN_DASHBOARD_URL') ?? Deno.env.get('SITE_URL');
    const requestOrigin = req.headers.get('Origin');
    const isOriginAllowed = requestOrigin && ALLOWED_ORIGINS.some((p) => originMatches(requestOrigin, p));
    const baseSiteUrl = configuredSiteUrl ?? (isOriginAllowed ? requestOrigin : 'https://admin.jezsy.com');
    const redirectUrl = `${baseSiteUrl.replace(/\/$/, '')}/set-password`;

    // 1. Pre-flight integrity checks
    const { data: existingProfile } = await adminClient
      .from('profiles')
      .select('id, role, employment_status, deleted')
      .eq('email', email)
      .maybeSingle();

    if (existingProfile) {
      if (existingProfile.role === 'customer') {
        return json(
          req,
          {
            error:
              'This email address belongs to an existing customer account. Please use a distinct work email address for staff access.',
          },
          409,
        );
      }
      if (existingProfile.employment_status === 'active' && !existingProfile.deleted) {
        return json(
          req,
          {
            error:
              'A staff member with this email address has already registered and is active in Team Management.',
          },
          409,
        );
      }
      if (existingProfile.employment_status === 'invited') {
        return json(
          req,
          {
            error:
              'An invitation is already pending for this email address. Use Resend Invite from the team table to generate a fresh link.',
            alreadyInvited: true,
            staffUserId: existingProfile.id,
          },
          409,
        );
      }
    }

    // 2. Auth identity creation + email dispatch via inviteUserByEmail.
    // Creates the auth user, issues an invite token, and sends the email
    // through Supabase's configured mail delivery (Auth > Email settings) --
    // not through Resend, so it is not sandbox-restricted to a single address.
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      {
        data: { staff_role: 'staff', role: 'staff' },
        redirectTo: redirectUrl,
      },
    );

    if (inviteError || !inviteData?.user) {
      console.error('[create-staff-account] inviteUserByEmail failed:', inviteError?.message);
      return json(req, { error: inviteError?.message || 'Failed to create staff invitation identity.' }, 500);
    }

    const createdUserId = inviteData.user.id;

    // 3. Operational projection sync (app_metadata)
    let metaSynced = false;
    try {
      const { error: metaError } = await adminClient.auth.admin.updateUserById(createdUserId, {
        app_metadata: { staff_role: 'staff' },
      });
      metaSynced = !metaError;
      if (metaError) {
        console.warn('[create-staff-account] app_metadata projection sync error:', metaError.message);
      }
    } catch (e) {
      console.warn('[create-staff-account] app_metadata projection sync exception:', e);
      metaSynced = false;
    }

    // 4. Strict profile initialization & staff_memberships authority write
    const nowIso = new Date().toISOString();
    
    // 4a. Base profile identity (account_kind = 'workforce', no direct role/status write)
    const { error: profileInsertError } = await adminClient.from('profiles').upsert({
      id: createdUserId,
      email: email,
      account_kind: 'workforce',
      invite_delivery_status: 'pending',
      invited_at: nowIso,
      last_invited_at: nowIso,
      deleted: false,
      is_blocked: false,
      created_at: nowIso,
      updated_at: nowIso,
    }, { onConflict: 'id' });

    if (profileInsertError) {
      console.error('[create-staff-account] Profile insert failed, compensating auth identity:', profileInsertError.message);
      await adminClient.auth.admin.deleteUser(createdUserId);
      return json(req, { error: 'Failed to create staff profile. Provisioning rolled back.' }, 500);
    }

    // 4b. Canonical workforce authority: staff_memberships write
    // Trigger trg_sync_membership_to_profile automatically projects role and employment_status to profiles
    const { error: membershipInsertError } = await adminClient.from('staff_memberships').insert({
      user_id: createdUserId,
      role: 'staff',
      employment_status: 'invited',
      device_approval_state: 'not_required',
      created_at: nowIso,
      updated_at: nowIso,
    });

    if (membershipInsertError) {
      console.error('[create-staff-account] Staff membership insert failed, compensating profile and auth user:', membershipInsertError.message);
      await adminClient.from('profiles').delete().eq('id', createdUserId);
      await adminClient.auth.admin.deleteUser(createdUserId);
      return json(req, { error: 'Failed to establish staff membership authority. Provisioning rolled back.' }, 500);
    }

    // 5. Mandatory server audit logging & compensation on failure
    const { error: auditError } = await adminClient.from('logs').insert({
      user_id: caller.id,
      user_name: caller.email,
      action: 'staff_account_invited',
      target_type: 'staff',
      target_id: createdUserId,
      details: {
        role: 'staff',
        email,
        app_metadata_synced: metaSynced,
        ...(!metaSynced ? { claim_sync_pending: true } : {}),
      },
    });

    if (auditError) {
      console.error('[create-staff-account] Mandatory audit failed, compensating profile and auth user:', auditError.message);
      let profileCleanup = 'not_attempted';
      let authCleanup = 'not_attempted';
      try {
        await adminClient.from('staff_status_history').delete().eq('staff_id', createdUserId);
        const { error: pErr } = await adminClient.from('profiles').delete().eq('id', createdUserId);
        profileCleanup = pErr ? `failed: ${pErr.message}` : 'success';
      } catch (e: unknown) {
        profileCleanup = `exception: ${e instanceof Error ? e.message : String(e)}`;
      }
      try {
        const { error: aErr } = await adminClient.auth.admin.deleteUser(createdUserId);
        authCleanup = aErr ? `failed: ${aErr.message}` : 'success';
      } catch (e: unknown) {
        authCleanup = `exception: ${e instanceof Error ? e.message : String(e)}`;
      }

      if (profileCleanup !== 'success' || authCleanup !== 'success') {
        console.error('[CRITICAL] staff_provisioning_compensation_failed', {
          target_user_id: createdUserId,
          email,
          original_error: auditError.message,
          profile_cleanup: profileCleanup,
          auth_cleanup: authCleanup,
        });
      }

      return json(req, { error: 'Mandatory security audit logging failed. Provisioning transaction rolled back.' }, 500);
    }

    return json(
      req,
      {
        userId: createdUserId,
        email: email,
        role: 'staff',
        emailSent: true,
      },
      200,
    );
  } catch (err: unknown) {
    console.error('[create-staff-account] Unexpected error:', err);
    return json(req, { error: 'Unexpected server error' }, 500);
  }
});
