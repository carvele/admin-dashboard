import {
  fetchAppVersionPolicy,
  updateAppVersionPolicy,
  setGlobalVersionEnforcementBypass,
} from "./appVersionService";
import { supabase } from "../lib/supabaseClient";

jest.mock("../lib/supabaseClient", () => ({
  supabase: {
    rpc: jest.fn(),
    from: jest.fn(),
  },
}));

describe("appVersionService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("fetchAppVersionPolicy", () => {
    it("calls get_app_version_policy rpc with platform", async () => {
      supabase.rpc.mockResolvedValueOnce({
        data: { platform: "android", min_version: "1.0.0", success: true },
        error: null,
      });

      const res = await fetchAppVersionPolicy("android");
      expect(supabase.rpc).toHaveBeenCalledWith("get_app_version_policy", {
        p_platform: "android",
      });
      expect(res.platform).toBe("android");
    });
  });

  describe("updateAppVersionPolicy", () => {
    it("calls update_app_version_policy rpc with payload and confirmation", async () => {
      supabase.rpc.mockResolvedValueOnce({
        data: { success: true, platform: "android", min_version: "1.1.0" },
        error: null,
      });

      const policy = {
        min_version: "1.1.0",
        min_build_number: 2,
        latest_version: "1.1.0",
        latest_build_number: 2,
        store_url: "market://details?id=com.jezsy.mobileapp",
        store_fallback_url: "https://play.google.com",
      };

      const res = await updateAppVersionPolicy("android", policy, "Confirmed 1.1.0 on Play Store");
      expect(supabase.rpc).toHaveBeenCalledWith("update_app_version_policy", {
        p_platform: "android",
        p_policy: policy,
        p_confirmation: "Confirmed 1.1.0 on Play Store",
      });
      expect(res.success).toBe(true);
    });
  });

  describe("setGlobalVersionEnforcementBypass", () => {
    it("calls set_global_version_enforcement_bypass rpc", async () => {
      supabase.rpc.mockResolvedValueOnce({
        data: { success: true, emergency_bypass_enabled: true, affected_platforms: 2 },
        error: null,
      });

      const res = await setGlobalVersionEnforcementBypass(true, "Testing emergency bypass");
      expect(supabase.rpc).toHaveBeenCalledWith("set_global_version_enforcement_bypass", {
        p_enabled: true,
        p_confirmation: "Testing emergency bypass",
      });
      expect(res.emergency_bypass_enabled).toBe(true);
    });
  });
});
