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

    // 2. Auth identity creation via tokenized action link
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'invite',
      email,
      options: { redirectTo: redirectUrl },
    });

    if (linkError || !linkData?.user) {
      console.error('[create-staff-account] Link generation failed:', linkError?.message);
      return json(req, { error: linkError?.message || 'Failed to create staff invitation identity.' }, 500);
    }

    const createdUserId = linkData.user.id;
    const actionLink = linkData.properties?.action_link;

    if (!actionLink) {
      await adminClient.auth.admin.deleteUser(createdUserId);
      return json(req, { error: 'Failed to generate invitation action link.' }, 500);
    }

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

    // 4. Strict profile INSERT & saga compensation
    const nowIso = new Date().toISOString();
    const { error: profileInsertError } = await adminClient.from('profiles').insert({
      id: createdUserId,
      email: email,
      role: 'staff',
      employment_status: 'invited',
      invite_delivery_status: 'pending',
      invited_at: nowIso,
      last_invited_at: nowIso,
      deleted: false,
      is_blocked: false,
      created_at: nowIso,
      updated_at: nowIso,
    });

    if (profileInsertError) {
      console.error('[create-staff-account] Profile insert failed, compensating auth identity:', profileInsertError.message);
      await adminClient.auth.admin.deleteUser(createdUserId);
      return json(req, { error: 'Failed to create staff profile. Provisioning rolled back.' }, 500);
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

    // 6. Branded Email Dispatch via Resend
    let emailSent = false;
    let emailError: string | null = null;

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const resendFromEmail = Deno.env.get('RESEND_FROM_EMAIL') ?? 'JezSy Collection <onboarding@resend.dev>';

    if (!resendApiKey) {
      emailError = 'RESEND_API_KEY is not configured in Supabase secrets.';
      console.warn('[create-staff-account]', emailError);
      await adminClient.from('profiles').update({ invite_delivery_status: 'failed' }).eq('id', createdUserId);
    } else {
      try {
        const safeEmail = escapeHtml(email);
        const safeActionLink = escapeHtml(actionLink);

        const emailHtml = '<!DOCTYPE html>' +
'<html>' +
'<head>' +
'  <meta charset="utf-8">' +
'  <meta name="viewport" content="width=device-width, initial-scale=1.0">' +
'  <title>Your Staff Account Invitation - JezSy Collection</title>' +
'</head>' +
'<body style="margin: 0; padding: 0; background-color: #f7f4ed; font-family: sans-serif;">' +
'  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f7f4ed; padding: 32px 16px;">' +
'    <tr>' +
'      <td align="center">' +
'        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 580px; background-color: #ffffff; border: 1px solid #efe9db; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);">' +
'          <tr>' +
'            <td style="background: #1f1c18; padding: 28px 32px; text-align: center; border-bottom: 3px solid #d4af37;">' +
'              <h1 style="color: #ffffff; margin: 0; font-size: 22px; letter-spacing: 0.12em; font-weight: 700; text-transform: uppercase;">JEZSY COLLECTION</h1>' +
'              <p style="color: #d4af37; margin: 6px 0 0 0; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 600;">Staff Management Portal</p>' +
'            </td>' +
'          </tr>' +
'          <tr>' +
'            <td style="padding: 32px 32px 24px 32px;">' +
'              <h2 style="color: #1f1c18; font-size: 18px; margin: 0 0 12px 0; font-weight: 600;">Welcome to the Team</h2>' +
'              <p style="color: #544b45; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">' +
'                You have been invited by an administrator to join the JezSy management portal with <strong>Sales Staff</strong> access. To complete your setup, please click the secure button below to choose your password and activate your account:' +
'              </p>' +
'              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #fdfbf7; border: 1px solid #efe9db; border-left: 4px solid #d4af37; border-radius: 8px; margin: 0 0 24px 0;">' +
'                <tr>' +
'                  <td style="padding: 16px 20px;">' +
'                    <table width="100%" cellpadding="0" cellspacing="0" border="0">' +
'                      <tr>' +
'                        <td style="padding: 6px 0; font-size: 13px; color: #544b45; width: 120px; font-weight: 600;">Staff Email:</td>' +
'                        <td style="padding: 6px 0; font-size: 13px; color: #1f1c18; font-family: monospace; font-weight: 600;">' + safeEmail + '</td>' +
'                      </tr>' +
'                      <tr>' +
'                        <td style="padding: 6px 0; font-size: 13px; color: #544b45; font-weight: 600;">Assigned Role:</td>' +
'                        <td style="padding: 6px 0; font-size: 13px; color: #926f1a; font-weight: 600;">Sales Staff</td>' +
'                      </tr>' +
'                    </table>' +
'                  </td>' +
'                </tr>' +
'              </table>' +
'              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 24px 0;">' +
'                <tr>' +
'                  <td align="center">' +
'                    <a href="' + safeActionLink + '" target="_blank" style="background-color: #1f1c18; color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600; display: inline-block; letter-spacing: 0.02em;">' +
'                      Activate Staff Account & Set Password &rarr;' +
'                    </a>' +
'                  </td>' +
'                </tr>' +
'              </table>' +
'              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border: 1px solid #efe9db; border-radius: 6px; margin: 0 0 16px 0;">' +
'                <tr>' +
'                  <td style="padding: 14px 16px;">' +
'                    <p style="margin: 0 0 8px 0; font-size: 12px; font-weight: 600; color: #1f1c18; text-transform: uppercase; letter-spacing: 0.04em;">Security Instructions</p>' +
'                    <ul style="margin: 0; padding-left: 18px; font-size: 12px; color: #544b45; line-height: 1.5;">' +
'                      <li>This invitation link expires automatically. Please activate your account promptly.</li>' +
'                      <li>Do not forward or share this email with anyone.</li>' +
'                      <li>If you did not expect this invitation, please notify your store administrator immediately.</li>' +
'                    </ul>' +
'                  </td>' +
'                </tr>' +
'              </table>' +
'            </td>' +
'          </tr>' +
'          <tr>' +
'            <td style="background-color: #fdfbf7; padding: 20px 32px; text-align: center; border-top: 1px solid #efe9db;">' +
'              <p style="margin: 0; font-size: 11px; color: #888888; line-height: 1.4;">' +
'                This is an automated administrative notification from JezSy Collection.<br>' +
'                Please do not reply directly to this email.' +
'              </p>' +
'            </td>' +
'          </tr>' +
'        </table>' +
'      </td>' +
'    </tr>' +
'  </table>' +
'</body>' +
'</html>';

        const resendResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + resendApiKey,
          },
          body: JSON.stringify({
            from: resendFromEmail,
            to: [email],
            subject: 'Your Staff Account Invitation - JezSy Collection',
            html: emailHtml,
          }),
        });

        if (resendResponse.ok) {
          emailSent = true;
          await adminClient.from('profiles').update({ invite_delivery_status: 'sent' }).eq('id', createdUserId);
          console.log('[create-staff-account] Invitation email sent to ' + email + ' via Resend');
        } else {
          const errBody = await resendResponse.json().catch(() => ({}));
          emailError = errBody?.message || ('Resend delivery failed with status ' + resendResponse.status);
          await adminClient.from('profiles').update({ invite_delivery_status: 'failed' }).eq('id', createdUserId);
          console.warn('[create-staff-account] Resend error:', emailError);
        }
      } catch (err: unknown) {
        emailError = err instanceof Error ? err.message : 'Network error communicating with Resend';
        await adminClient.from('profiles').update({ invite_delivery_status: 'failed' }).eq('id', createdUserId);
        console.warn('[create-staff-account] Resend exception:', emailError);
      }
    }

    return json(
      req,
      {
        userId: createdUserId,
        email: email,
        role: 'staff',
        emailSent: emailSent,
        emailError: emailError,
      },
      200,
    );
  } catch (err: unknown) {
    console.error('[create-staff-account] Unexpected error:', err);
    return json(req, { error: 'Unexpected server error' }, 500);
  }
});
