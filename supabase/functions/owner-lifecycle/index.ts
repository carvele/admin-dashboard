// supabase/functions/owner-lifecycle/index.ts
//
// Governs Owner lifecycle mutations, workforce MFA resets, and step-up authentication.
// Supports mutually exclusive STEP_UP_MODE: 'native_amr' | 'receipt'.
// Enforces quorum guards, persistent MFA recovery states, and server-defined routing.

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

function parseJwt(token: string): any {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (_e) {
    return {};
  }
}

// Server-defined constant routing
const MUTATION_ROUTES: Record<string, { action_class: string; rpc: string }> = {
  'promote': { action_class: 'owner_promotion', rpc: 'promote_workforce_to_owner' },
  'demote': { action_class: 'owner_demotion', rpc: 'demote_owner' },
  'block': { action_class: 'owner_block', rpc: 'block_owner' },
  'archive': { action_class: 'owner_archive', rpc: 'archive_owner' },
  'terminate': { action_class: 'owner_terminate', rpc: 'terminate_owner' },
  'reset-mfa': { action_class: 'mfa_reset', rpc: 'begin_workforce_mfa_reset' },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeadersFor(req) });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // 1. Fail-closed check on STEP_UP_MODE
    const STEP_UP_MODE = Deno.env.get('STEP_UP_MODE') ?? 'native_amr';
    if (STEP_UP_MODE !== 'native_amr' && STEP_UP_MODE !== 'receipt') {
      return json(req, { error: 'Invalid or unconfigured STEP_UP_MODE. Must be "native_amr" or "receipt".' }, 500);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json(req, { error: 'Missing authorization header' }, 401);
    }
    const token = authHeader.replace(/^Bearer\s+/i, '');

    // 2. Authenticate caller session with user-scoped client
    const callerClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !caller) {
      return json(req, { error: 'Invalid or expired caller session' }, 401);
    }

    const decodedJwt = parseJwt(token);
    let sessionId = decodedJwt.session_id;

    // 3. Service-role admin client
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is active Owner
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
      return json(req, { error: 'Caller must be an active, unblocked Owner.' }, 403);
    }

    // 4. Determine operation from URL pathname or JSON body
    const url = new URL(req.url);
    const pathSegments = url.pathname.split('/').filter(Boolean);
    const lastSegment = pathSegments[pathSegments.length - 1];

    const body = req.method !== 'GET' ? await req.json().catch(() => ({})) : {};
    const actionKey = (MUTATION_ROUTES[lastSegment] || lastSegment === 'complete-mfa-reset')
      ? lastSegment
      : (body.action as string);

    if (!actionKey) {
      return json(req, { error: 'Action not specified' }, 400);
    }

    // Handle complete-mfa-reset separately
    if (actionKey === 'complete-mfa-reset') {
      const targetId = body.targetId;
      const operationId = body.operationId;
      if (!targetId || !operationId) {
        return json(req, { error: 'targetId and operationId are required to complete MFA reset' }, 400);
      }

      // Check target has newly enrolled and verified TOTP factor
      const { data: targetFactors, error: tfErr } = await adminClient.auth.admin.mfa.listFactors({ userId: targetId });
      if (tfErr) {
        return json(req, { error: 'Failed to inspect target MFA factors: ' + tfErr.message }, 500);
      }

      const hasVerifiedTotp = (targetFactors?.factors ?? []).some(
        (f: any) => f.factor_type === 'totp' && f.status === 'verified'
      );
      if (!hasVerifiedTotp) {
        return json(req, { error: 'Target user does not have a verified TOTP factor enrolled yet.' }, 400);
      }

      // Call service-role complete_mfa_reset
      const { error: completeErr } = await adminClient.rpc('complete_mfa_reset', {
        p_operation_id: operationId,
        p_target_id: targetId,
      });

      if (completeErr) {
        return json(req, { error: completeErr.message }, 400);
      }

      return json(req, {
        ok: true,
        status: 'completed',
        target_id: targetId,
        operation_id: operationId,
        message: 'MFA re-enrollment verified and recovery reservation cleared.',
      }, 200);
    }

    const route = MUTATION_ROUTES[actionKey];
    if (!route) {
      return json(req, { error: `Unsupported action: ${actionKey}` }, 400);
    }
    const { action_class, rpc } = route;

    const targetId = body.targetId;
    if (!targetId) {
      return json(req, { error: 'targetId is required' }, 400);
    }

    // 5. Step-up enforcement
    let verifiedAt: string;

    if (STEP_UP_MODE === 'native_amr') {
      // Validate fresh MFA via user-scoped RPC
      const { error: amrErr } = await callerClient.rpc('require_recent_mfa');
      if (amrErr) {
        return json(req, {
          error: 'STEP_UP_REQUIRED',
          message: 'Fresh TOTP verification required within 5 minutes.',
        }, 428);
      }

      const totpEntry = (decodedJwt.amr ?? []).find((e: any) => e.method === 'totp');
      if (!totpEntry || !totpEntry.timestamp) {
        return json(req, { error: 'STEP_UP_REQUIRED', message: 'Missing TOTP timestamp claim in token' }, 428);
      }
      verifiedAt = new Date(totpEntry.timestamp * 1000).toISOString();
    } else {
      // RECEIPT mode: server-witnessed challenge and verify
      const code = body.code;
      const factorId = body.factorId;
      if (!code || !factorId) {
        return json(req, { error: 'code and factorId are required for step-up verification in receipt mode.' }, 400);
      }

      // Server-witnessed verification with user-scoped client
      const { error: cvErr } = await callerClient.auth.mfa.challengeAndVerify({
        factorId,
        code,
      });
      if (cvErr) {
        return json(req, { error: 'Invalid or expired TOTP verification code: ' + cvErr.message }, 403);
      }

      // Retrieve refreshed session to update session_id
      const { data: sessionData } = await callerClient.auth.getSession();
      if (sessionData?.session?.access_token) {
        const refreshedJwt = parseJwt(sessionData.session.access_token);
        if (refreshedJwt.session_id) {
          sessionId = refreshedJwt.session_id;
        }
      }

      // Server time becomes authoritative verified_at
      verifiedAt = new Date().toISOString();

      // Mint service-role receipt
      const { error: receiptErr } = await adminClient.rpc('create_step_up_receipt', {
        p_actor_id: caller.id,
        p_session_id: sessionId,
        p_action_class: action_class,
        p_target_id: targetId,
        p_verified_at: verifiedAt,
      });

      if (receiptErr) {
        return json(req, { error: 'Failed to mint step-up receipt: ' + receiptErr.message }, 500);
      }
    }

    // 6. Live actor factor check (both modes)
    const { data: actorFactors, error: actorFactorErr } = await adminClient.auth.admin.mfa.listFactors({
      userId: caller.id,
    });
    if (
      actorFactorErr ||
      !actorFactors?.factors?.some((f: any) => f.factor_type === 'totp' && f.status === 'verified')
    ) {
      return json(req, { error: 'STEP_UP_REQUIRED', message: 'Actor must maintain a verified TOTP factor.' }, 403);
    }

    // 7. For promotion, ensure target also has verified TOTP factor
    if (actionKey === 'promote') {
      const { data: targetFactors, error: tfErr } = await adminClient.auth.admin.mfa.listFactors({
        userId: targetId,
      });
      if (
        tfErr ||
        !targetFactors?.factors?.some((f: any) => f.factor_type === 'totp' && f.status === 'verified')
      ) {
        return json(req, {
          error: 'Target user must enroll and verify TOTP MFA before being promoted to Owner.',
        }, 400);
      }
    }

    // 8. Execute mutation
    if (actionKey === 'reset-mfa') {
      const reason = (body.reason ?? '').trim();
      if (!reason) {
        return json(req, { error: 'Reason is required for MFA reset.' }, 400);
      }

      const operationId = crypto.randomUUID();
      const { data: resetInit, error: resetErr } = await adminClient.rpc('begin_workforce_mfa_reset', {
        p_actor_id: caller.id,
        p_target_id: targetId,
        p_reason: reason,
        p_operation_id: operationId,
        p_session_id: sessionId,
        p_step_up_verified_at: verifiedAt,
      });

      if (resetErr) {
        return json(req, { error: resetErr.message }, 400);
      }

      // Delete target's TOTP factors
      const { data: tFactors, error: fetchErr } = await adminClient.auth.admin.mfa.listFactors({
        userId: targetId,
      });
      if (fetchErr) {
        await adminClient.rpc('clear_mfa_reset_reservation', {
          p_operation_id: operationId,
          p_target_id: targetId,
          p_action: 'mfa_reset_failed',
          p_error: fetchErr.message,
        });
        return json(req, { error: 'Failed to inspect target factors: ' + fetchErr.message }, 500);
      }

      const totpFactors = (tFactors?.factors ?? []).filter((f: any) => f.factor_type === 'totp');
      let deletionFailed = false;
      let deletionErrorMessage: string | null = null;

      for (const factor of totpFactors) {
        const { error: delErr } = await adminClient.auth.admin.mfa.deleteFactor({
          id: factor.id,
          userId: targetId,
        });
        if (delErr) {
          deletionFailed = true;
          deletionErrorMessage = delErr.message;
          break;
        }
      }

      if (deletionFailed) {
        await adminClient.rpc('clear_mfa_reset_reservation', {
          p_operation_id: operationId,
          p_target_id: targetId,
          p_action: 'mfa_reset_failed',
          p_error: deletionErrorMessage,
        });
        return json(req, { error: 'Factor deletion failed: ' + deletionErrorMessage }, 500);
      }

      // Check if target was an Owner
      const isTargetOwner = resetInit?.target_role === 'owner';
      if (isTargetOwner) {
        await adminClient.rpc('transition_mfa_reset_to_awaiting', {
          p_operation_id: operationId,
          p_target_id: targetId,
        });
        return json(req, {
          ok: true,
          status: 'awaiting_reenrollment',
          operation_id: operationId,
          target_id: targetId,
          message: 'Owner MFA reset initiated; account held in awaiting_reenrollment recovery state.',
        }, 200);
      } else {
        await adminClient.rpc('clear_mfa_reset_reservation', {
          p_operation_id: operationId,
          p_target_id: targetId,
          p_action: 'mfa_reset_completed',
        });
        return json(req, {
          ok: true,
          status: 'completed',
          operation_id: operationId,
          target_id: targetId,
          message: 'Workforce MFA reset completed successfully.',
        }, 200);
      }
    }

    // Direct mutation RPC for promote, demote, block, archive, terminate
    const { data: mutationData, error: mutationErr } = await adminClient.rpc(rpc, {
      p_actor_id: caller.id,
      p_target_id: targetId,
      p_session_id: sessionId,
      p_step_up_verified_at: verifiedAt,
    });

    if (mutationErr) {
      return json(req, { error: mutationErr.message }, 400);
    }

    return json(req, { ok: true, data: mutationData }, 200);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return json(req, { error: 'Unexpected error: ' + message }, 500);
  }
});
