import { supabase } from "../lib/supabaseClient";
import { errorReporting } from "./observability";

/**
 * App Version Policy Management Service
 * Provides transactional RPC clients for reading and updating version governance policies.
 */

export const fetchAppVersionPolicy = async (platform) => {
  const { data, error } = await supabase.rpc("get_app_version_policy", {
    p_platform: platform,
  });
  if (error) {
    errorReporting.capture(error, { domain: "version_policy", operation: "fetchAppVersionPolicy" });
    throw error;
  }
  return data;
};

export const fetchAllAppVersionPolicies = async () => {
  const [android, ios] = await Promise.all([
    fetchAppVersionPolicy("android"),
    fetchAppVersionPolicy("ios"),
  ]);
  return { android, ios };
};

export const updateAppVersionPolicy = async (platform, policy, confirmationText) => {
  const { data, error } = await supabase.rpc("update_app_version_policy", {
    p_platform: platform,
    p_policy: policy,
    p_confirmation: confirmationText,
  });
  if (error) {
    errorReporting.capture(error, { domain: "version_policy", operation: "updateAppVersionPolicy" });
    throw error;
  }
  return data;
};

export const setGlobalVersionEnforcementBypass = async (enabled, confirmationText) => {
  const { data, error } = await supabase.rpc("set_global_version_enforcement_bypass", {
    p_enabled: enabled,
    p_confirmation: confirmationText,
  });
  if (error) {
    errorReporting.capture(error, { domain: "version_policy", operation: "setGlobalVersionEnforcementBypass" });
    throw error;
  }
  return data;
};

export const fetchAppVersionAuditLog = async (limit = 20) => {
  const { data, error } = await supabase
    .from("app_version_policy_audit")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    errorReporting.capture(error, { domain: "version_policy", operation: "fetchAppVersionAuditLog" });
    throw error;
  }
  return data;
};
