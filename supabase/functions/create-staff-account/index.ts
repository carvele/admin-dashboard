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

// Supports a leading wildcard segment, e.g. "https://*.admin-dashboard-byq.pages.dev"
// to match Cloudflare Pages preview-deployment subdomains.
function originMatches(origin: string, pattern: string): boolean {
  if (!pattern.includes('*')) return origin === pattern;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*');
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

    let inviteResult = await adminClient.auth.admin.inviteUserByEmail(
      email,
      {
        // user_metadata (spoofable by the user) — kept only for display/redirect.
        // The authoritative role lives in app_metadata, set below.
        data: { role, staff_role: role },
        redirectTo: `${siteUrl}/set-password`,
      },
    );

    let wasResent = false;

    if (inviteResult.error) {
      const inviteError = inviteResult.error;
      if (inviteError.status === 422 || /already registered/i.test(inviteError.message)) {
        // Check if there is an existing profile row in public.profiles
        const { data: existingProfile } = await adminClient
          .from('profiles')
          .select('id, role')
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
                'This email is already registered as an active staff member in Team Management.',
            },
            409,
          );
        }

        // The user is registered in auth.users, but has NO profiles row.
        // This is a stale or interrupted pending invitation (e.g. from an expired link
        // or a previous signup attempt before password completion).
        // Find their auth.users entry, remove the stale unactivated auth record, and reissue a fresh invite.
        const { data: listData, error: listError } = await adminClient.auth.admin.listUsers({
          perPage: 1000,
        });

        const pendingAuthUser = (!listError && listData?.users)
          ? listData.users.find((u: { email?: string }) => u.email?.toLowerCase() === email)
          : null;

        if (pendingAuthUser) {
          // Double check they definitely have no profile by user ID
          const { data: idProfile } = await adminClient
            .from('profiles')
            .select('id')
            .eq('id', pendingAuthUser.id)
            .maybeSingle();

          if (!idProfile) {
            console.log(
              `[create-staff-account] Stale unactivated auth user found (${pendingAuthUser.id}). Deleting to reissue fresh invite for ${email}`,
            );
            const { error: delError } = await adminClient.auth.admin.deleteUser(pendingAuthUser.id);
            if (!delError) {
              const { data: retryData, error: retryError } = await adminClient.auth.admin.inviteUserByEmail(
                email,
                {
                  data: { role, staff_role: role },
                  redirectTo: `${siteUrl}/set-password`,
                },
              );

              if (!retryError && retryData?.user) {
                inviteResult = { data: retryData, error: null };
                wasResent = true;
              } else if (retryError) {
                console.error('[create-staff-account] Retry invite failed:', retryError);
                return json(req, { error: `Failed to reissue invite: ${retryError.message}` }, 500);
              }
            } else {
              console.error('[create-staff-account] Failed to delete stale user:', delError);
            }
          }
        }

        if (!inviteResult.data?.user) {
          return json(
            req,
            {
              error:
                'This email is already registered. If a previous invite was pending, please retry in a moment.',
            },
            409,
          );
        }
      } else {
        return json(req, { error: inviteError.message }, 500);
      }
    }

    if (!inviteResult.data?.user) {
      return json(req, { error: 'Failed to issue invite.' }, 500);
    }

    // Authoritative role assignment. app_metadata is writable ONLY by the service
    // role — a user cannot change it via auth.updateUser (unlike user_metadata) —
    // so activate-staff-account can trust staff_role when it creates the profile.
    const { error: metaError } = await adminClient.auth.admin.updateUserById(
      inviteResult.data.user.id,
      { app_metadata: { staff_role: role } },
    );
    if (metaError) {
      console.error('[create-staff-account] Failed to set app_metadata:', metaError);
      return json(req, { error: 'Invite sent but role assignment failed. Please retry.' }, 500);
    }

    return json(req, { userId: inviteResult.data.user.id, resent: wasResent }, 200);
  } catch (err) {
    console.error('[create-staff-account] Unexpected error:', err);
    return json(req, { error: 'Unexpected server error' }, 500);
  }
});
