// create-staff-account
//
// Creates a pre-confirmed staff member account with a secure temporary password.
// Upserts their active public.profiles row immediately so they appear in Team
// Management right away, and returns the credentials to the store owner so they
// can be provided to the new staff member to log in at /login.
//
// Caller must be an authenticated owner (checked against their own profiles row).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.1';

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '*')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

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

    // Client bound to the caller's own JWT — identifies who is calling
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
        console.log(`[create-staff-account] Cleaning up stale auth user ${existingAuthUser.id} without profile`);
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
      console.error('[create-staff-account] User creation error:', createError);
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
      console.error('[create-staff-account] Profile upsert error:', profileUpsertError);
      return json(req, { error: 'Staff account created but profile setup failed. Please retry.' }, 500);
    }

    // 5. Return the temporary credentials securely to the admin
    const loginUrl = `${siteUrl}/login`;
    return json(
      req,
      {
        userId: newUserId,
        email: email,
        role: role,
        tempPassword: tempPassword,
        loginUrl: loginUrl,
      },
      200,
    );
  } catch (err) {
    console.error('[create-staff-account] Unexpected error:', err);
    return json(req, { error: 'Unexpected server error' }, 500);
  }
});
