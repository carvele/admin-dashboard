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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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
      callerProfile.role !== 'owner' ||
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

    // 2. Fail-closed invitation link regeneration
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'invite',
      email: targetProfile.email,
      options: { redirectTo: redirectUrl },
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error('[resend-staff-invite] Invite generation failed:', linkError?.message);
      await adminClient.from('logs').insert({
        user_id: caller.id,
        user_name: caller.email,
        action: 'staff_invite_resend_failed',
        target_type: 'staff',
        target_id: staffUserId,
        details: { error: linkError?.message || 'Link generation failed' },
      });
      return json(req, { error: 'Failed to generate fresh invitation link. Please try again.' }, 500);
    }

    const actionLink = linkData.properties.action_link;

    // 3. Send fresh invitation email via Resend
    let emailSent = false;
    let emailError: string | null = null;

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const resendFromEmail = Deno.env.get('RESEND_FROM_EMAIL') ?? 'JezSy Collection <onboarding@resend.dev>';

    if (!resendApiKey) {
      emailError = 'RESEND_API_KEY is not configured in Supabase secrets.';
      console.warn('[resend-staff-invite]', emailError);
    } else {
      try {
        const safeEmail = escapeHtml(targetProfile.email);
        const safeActionLink = escapeHtml(actionLink);

        const emailHtml = '<!DOCTYPE html>' +
'<html>' +
'<head>' +
'  <meta charset="utf-8">' +
'  <meta name="viewport" content="width=device-width, initial-scale=1.0">' +
'  <title>Your New Staff Account Invitation - JezSy Collection</title>' +
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
'              <h2 style="color: #1f1c18; font-size: 18px; margin: 0 0 12px 0; font-weight: 600;">New Invitation Link</h2>' +
'              <p style="color: #544b45; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">' +
'                Your administrator has generated a fresh invitation link for your account. Any previously issued invitation links are no longer valid. Click below to set up your password and access the management portal:' +
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
'                      Set Up Password & Activate Account &rarr;' +
'                    </a>' +
'                  </td>' +
'                </tr>' +
'              </table>' +
'              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border: 1px solid #efe9db; border-radius: 6px; margin: 0 0 16px 0;">' +
'                <tr>' +
'                  <td style="padding: 14px 16px;">' +
'                    <p style="margin: 0 0 8px 0; font-size: 12px; font-weight: 600; color: #1f1c18; text-transform: uppercase; letter-spacing: 0.04em;">Security Instructions</p>' +
'                    <ul style="margin: 0; padding-left: 18px; font-size: 12px; color: #544b45; line-height: 1.5;">' +
'                      <li>This invitation link expires automatically.</li>' +
'                      <li>Do not forward or share this email with anyone.</li>' +
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
            to: [targetProfile.email],
            subject: 'New Staff Account Invitation Link - JezSy Collection',
            html: emailHtml,
          }),
        });

        if (resendResponse.ok) {
          emailSent = true;
          console.log('[resend-staff-invite] Fresh invitation link sent to ' + targetProfile.email);
        } else {
          const errBody = await resendResponse.json().catch(() => ({}));
          emailError = errBody?.message || ('Resend delivery failed with status ' + resendResponse.status);
          console.warn('[resend-staff-invite] Resend error:', emailError);
        }
      } catch (err: unknown) {
        emailError = err instanceof Error ? err.message : 'Network error communicating with Resend';
        console.warn('[resend-staff-invite] Resend exception:', emailError);
      }
    }

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
