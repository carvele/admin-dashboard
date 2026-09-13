// supabase/functions/create-staff-account/index.ts
//
// Creates a new staff member account with a cryptographically secure 10-character
// temporary password, marks the account as pre-confirmed, assigns staff role
// metadata, creates/upserts the public.profiles row, dispatches a professional
// branded invitation email via Resend directly to the invited email, and returns
// the credentials and delivery status securely to the authorized administrator.
//
// Caller must be an authenticated owner (checked against their own profiles row).

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

function generateTemporaryPassword(): string {
  const uppercaseChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowercaseChars = 'abcdefghijkmnopqrstuvwxyz';
  const numberChars = '23456789';
  const specialChars = '!@#$%&*+=-';
  const allChars = uppercaseChars + lowercaseChars + numberChars + specialChars;

  // Guarantee at least 1 uppercase, 1 lowercase, 1 number, and 1 special char
  const getRandomChar = (chars: string): string => {
    const randomByte = new Uint8Array(1);
    crypto.getRandomValues(randomByte);
    return chars[randomByte[0] % chars.length];
  };

  const passwordChars = [
    getRandomChar(uppercaseChars),
    getRandomChar(lowercaseChars),
    getRandomChar(numberChars),
    getRandomChar(specialChars),
  ];

  // Fill up to 10 characters from the full pool
  const remainingCount = 10 - passwordChars.length;
  const randomBytes = new Uint8Array(remainingCount);
  crypto.getRandomValues(randomBytes);
  for (let i = 0; i < remainingCount; i++) {
    passwordChars.push(allChars[randomBytes[i] % allChars.length]);
  }

  // Fisher-Yates shuffle using cryptographically secure random values
  const shuffleBytes = new Uint8Array(passwordChars.length);
  crypto.getRandomValues(shuffleBytes);
  for (let i = passwordChars.length - 1; i > 0; i--) {
    const j = shuffleBytes[i] % (i + 1);
    const temp = passwordChars[i];
    passwordChars[i] = passwordChars[j];
    passwordChars[j] = temp;
  }

  return passwordChars.join('');
}

const ALLOWED_INVITE_ROLES = ['staff', 'owner'];

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

    // Client bound to caller's own JWT — verifies identity and permissions
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !caller) {
      return json(req, { error: 'Invalid or expired session' }, 401);
    }

    // Admin client bound to service role — strictly scoped inside Edge Function
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
      callerProfile.role !== 'owner'
    ) {
      return json(req, { error: 'You do not have permission to invite staff.' }, 403);
    }

    const body = await req.json();
    const email = (body?.email ?? '').toLowerCase().trim();
    const role = body?.role;
    const clientSiteUrl = body?.siteUrl;

    if (!email || !email.includes('@')) {
      return json(req, { error: 'A valid email address is required.' }, 400);
    }
    if (!ALLOWED_INVITE_ROLES.includes(role)) {
      return json(req, { error: 'Role must be "staff" or "owner".' }, 400);
    }

    const siteUrl = clientSiteUrl ?? Deno.env.get('SITE_URL') ?? new URL(req.url).origin;
    const loginUrl = siteUrl + '/login';
    const tempPassword = generateTemporaryPassword();

    // 1. Check if user already exists in public.profiles
    const { data: existingProfile } = await adminClient
      .from('profiles')
      .select('id, role, deleted')
      .eq('email', email)
      .maybeSingle();

    if (existingProfile) {
      if (existingProfile.role === 'customer') {
        return json(
          req,
          {
            error:
              'This email address belongs to an existing customer account. Please use a distinct email address for staff access.',
          },
          409,
        );
      }
      return json(
        req,
        {
          error:
            'A staff member with this email address already exists in Team Management.',
        },
        409,
      );
    }

    // 2. Check if there is a stale orphan auth record without a profile
    const { data: listData } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
    const existingAuthUser = listData?.users?.find(
      (u: { email?: string }) => u.email?.toLowerCase() === email,
    );

    if (existingAuthUser) {
      const { data: idProfile } = await adminClient
        .from('profiles')
        .select('id')
        .eq('id', existingAuthUser.id)
        .maybeSingle();

      if (!idProfile) {
        console.log('[create-staff-account] Cleaning up stale auth user ' + existingAuthUser.id + ' without profile');
        await adminClient.auth.admin.deleteUser(existingAuthUser.id);
      }
    }

    // 3. Create the staff user with the temporary password and pre-confirmed email
    const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      app_metadata: { staff_role: role },
      user_metadata: {
        role,
        staff_role: role,
        must_change_password: true,
      },
    });

    if (createError || !createData?.user) {
      console.error('[create-staff-account] User creation error:', createError?.message);
      return json(req, { error: createError?.message || 'Failed to create staff user account.' }, 500);
    }

    const newUserId = createData.user.id;

    // 4. Create/upsert the active profile row in public.profiles
    const nowIso = new Date().toISOString();
    const { error: profileUpsertError } = await adminClient.from('profiles').upsert(
      {
        id: newUserId,
        email: email,
        role: role,
        deleted: false,
        is_blocked: false,
        employment_status: 'active',
        created_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: 'id' },
    );

    if (profileUpsertError) {
      console.error('[create-staff-account] Profile upsert error:', profileUpsertError.message);
      return json(req, { error: 'Staff account created but profile setup failed. Please retry.' }, 500);
    }

    // 5. Send professional invitation email via Resend API directly to the invited email
    let emailSent = false;
    let emailError: string | null = null;

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const resendFromEmail = Deno.env.get('RESEND_FROM_EMAIL') ?? 'JezSy Collection <onboarding@resend.dev>';

    if (!resendApiKey) {
      emailError = 'RESEND_API_KEY is not configured in Supabase secrets.';
      console.warn('[create-staff-account]', emailError);
    } else {
      try {
        const safeEmail = escapeHtml(email);
        const safeRole = role === 'owner' ? 'Owner' : 'Sales Staff';
        const safeTempPassword = escapeHtml(tempPassword);
        const safeLoginUrl = escapeHtml(loginUrl);

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
'          <!-- Header -->' +
'          <tr>' +
'            <td style="background: #1f1c18; padding: 28px 32px; text-align: center; border-bottom: 3px solid #d4af37;">' +
'              <h1 style="color: #ffffff; margin: 0; font-size: 22px; letter-spacing: 0.12em; font-weight: 700; text-transform: uppercase;">JEZSY COLLECTION</h1>' +
'              <p style="color: #d4af37; margin: 6px 0 0 0; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 600;">Staff Management Portal</p>' +
'            </td>' +
'          </tr>' +
'          <!-- Body -->' +
'          <tr>' +
'            <td style="padding: 32px 32px 24px 32px;">' +
'              <h2 style="color: #1f1c18; font-size: 18px; margin: 0 0 12px 0; font-weight: 600;">Welcome to the Team</h2>' +
'              <p style="color: #544b45; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">' +
'                Your staff account has been created by an administrator with <strong>' + safeRole + '</strong> access. You can now access the admin dashboard using the login credentials below:' +
'              </p>' +
'              <!-- Credentials Card -->' +
'              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #fdfbf7; border: 1px solid #efe9db; border-left: 4px solid #d4af37; border-radius: 8px; margin: 0 0 24px 0;">' +
'                <tr>' +
'                  <td style="padding: 16px 20px;">' +
'                    <table width="100%" cellpadding="0" cellspacing="0" border="0">' +
'                      <tr>' +
'                        <td style="padding: 6px 0; font-size: 13px; color: #544b45; width: 140px; font-weight: 600;">Portal URL:</td>' +
'                        <td style="padding: 6px 0; font-size: 13px; color: #1f1c18; font-family: monospace; font-weight: 600;"><a href="' + safeLoginUrl + '" style="color: #926f1a; text-decoration: underline;">' + safeLoginUrl + '</a></td>' +
'                      </tr>' +
'                      <tr>' +
'                        <td style="padding: 6px 0; font-size: 13px; color: #544b45; width: 140px; font-weight: 600;">Staff Email:</td>' +
'                        <td style="padding: 6px 0; font-size: 13px; color: #1f1c18; font-family: monospace; font-weight: 600;">' + safeEmail + '</td>' +
'                      </tr>' +
'                      <tr>' +
'                        <td style="padding: 6px 0; font-size: 13px; color: #544b45; font-weight: 600;">Temporary Password:</td>' +
'                        <td style="padding: 6px 0;">' +
'                          <span style="background-color: #f5eedc; border: 1px solid #efe9db; color: #1f1c18; font-family: monospace; font-size: 15px; font-weight: 700; padding: 3px 10px; border-radius: 4px; letter-spacing: 0.05em; display: inline-block;">' + safeTempPassword + '</span>' +
'                        </td>' +
'                      </tr>' +
'                      <tr>' +
'                        <td style="padding: 6px 0; font-size: 13px; color: #544b45; font-weight: 600;">Access Role:</td>' +
'                        <td style="padding: 6px 0; font-size: 13px; color: #926f1a; font-weight: 600;">' + safeRole + '</td>' +
'                      </tr>' +
'                    </table>' +
'                  </td>' +
'                </tr>' +
'              </table>' +
'              <!-- Action Button -->' +
'              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 24px 0;">' +
'                <tr>' +
'                  <td align="center">' +
'                    <a href="' + safeLoginUrl + '" target="_blank" style="background-color: #1f1c18; color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600; display: inline-block; letter-spacing: 0.02em;">' +
'                      Log In to Admin Portal &rarr;' +
'                    </a>' +
'                  </td>' +
'                </tr>' +
'              </table>' +
'              <!-- Security Notice -->' +
'              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border: 1px solid #efe9db; border-radius: 6px; margin: 0 0 16px 0;">' +
'                <tr>' +
'                  <td style="padding: 14px 16px;">' +
'                    <p style="margin: 0 0 8px 0; font-size: 12px; font-weight: 600; color: #1f1c18; text-transform: uppercase; letter-spacing: 0.04em;">Important Security Instructions</p>' +
'                    <ul style="margin: 0; padding-left: 18px; font-size: 12px; color: #544b45; line-height: 1.5;">' +
'                      <li>You <strong>must change this temporary password</strong> immediately after your first login under <strong>Settings &gt; Security</strong>.</li>' +
'                      <li>Do not share, forward, or disclose your login credentials to anyone.</li>' +
'                      <li>If you did not expect this invitation, please notify the store administrator immediately.</li>' +
'                    </ul>' +
'                  </td>' +
'                </tr>' +
'              </table>' +
'            </td>' +
'          </tr>' +
'          <!-- Footer -->' +
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
            subject: 'Your Staff Account Invitation & Login Credentials - JezSy Collection',
            html: emailHtml,
          }),
        });

        if (resendResponse.ok) {
          emailSent = true;
          console.log('[create-staff-account] Invitation email sent to ' + email + ' via Resend');
        } else {
          const errBody = await resendResponse.json().catch(() => ({}));
          emailError = errBody?.message || ('Resend delivery failed with status ' + resendResponse.status);
          console.warn('[create-staff-account] Resend error:', emailError);
        }
      } catch (err: unknown) {
        emailError = err instanceof Error ? err.message : 'Network error communicating with Resend';
        console.warn('[create-staff-account] Resend exception:', emailError);
      }
    }

    // 6. Return response to authorized administrator
    return json(
      req,
      {
        userId: newUserId,
        email: email,
        role: role,
        tempPassword: tempPassword,
        loginUrl: loginUrl,
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
