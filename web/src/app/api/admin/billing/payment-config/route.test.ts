import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    getPaymentConfigSummary: vi.fn(),
    savePaymentProviderConfig: vi.fn(),
    verifyAdminSensitiveAction: vi.fn(),
    audit: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({ id: "admin-one" })), safeRecordAuditLog: mocks.audit }));
vi.mock("@/lib/server/payment-config-store", () => ({ savePaymentProviderConfig: mocks.savePaymentProviderConfig }));
vi.mock("@/lib/server/payment-config-status", () => ({ getPaymentConfigSummary: mocks.getPaymentConfigSummary }));
vi.mock("@/lib/server/admin-mfa-service", () => ({ verifyAdminSensitiveAction: mocks.verifyAdminSensitiveAction }));

import { BillingInputError } from "@/lib/server/billing-errors";
import { PATCH } from "./route";

describe("PATCH /api/admin/billing/payment-config", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-one", role: "admin" });
        mocks.getPaymentConfigSummary.mockResolvedValue({ providers: [] });
        mocks.savePaymentProviderConfig.mockResolvedValue(undefined);
        mocks.verifyAdminSensitiveAction.mockResolvedValue(undefined);
    });

    it("passes the selected Alipay mode to the payment config service", async () => {
        const response = await PATCH(
            new Request("http://localhost/api/admin/billing/payment-config", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ providerId: "alipay", enabled: true, values: { mode: "face_to_face" }, currentPassword: "admin-password", totpCode: "123456" }),
            }),
        );

        expect(response.status).toBe(200);
        expect(mocks.verifyAdminSensitiveAction).toHaveBeenCalledWith("admin-one", expect.objectContaining({ currentPassword: "admin-password", totpCode: "123456" }));
        expect(mocks.savePaymentProviderConfig).toHaveBeenCalledWith({ providerId: "alipay", enabled: true, values: { mode: "face_to_face" } });
        expect(mocks.audit).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "admin.billing.payment-config.update",
                target: { type: "payment_provider", id: "alipay" },
                metadata: { enabled: true },
            }),
        );
    });

    it("maps invalid selector values to a client error", async () => {
        mocks.savePaymentProviderConfig.mockRejectedValue(new BillingInputError("接入方式配置无效", 400));

        const response = await PATCH(
            new Request("http://localhost/api/admin/billing/payment-config", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ providerId: "alipay", enabled: true, values: { mode: "both" }, currentPassword: "admin-password" }),
            }),
        );

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "接入方式配置无效" });
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.billing.payment-config.update", status: "failure" }));
    });

    it("does not save payment secrets when identity verification fails", async () => {
        mocks.verifyAdminSensitiveAction.mockRejectedValue(new BillingInputError("当前密码不正确", 400));

        const response = await PATCH(
            new Request("http://localhost/api/admin/billing/payment-config", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ providerId: "stripe", enabled: true, values: { secretKey: "payment-secret" }, currentPassword: "wrong" }),
            }),
        );

        expect(response.status).toBe(400);
        expect(mocks.savePaymentProviderConfig).not.toHaveBeenCalled();
        expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("payment-secret");
        expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("wrong");
    });
});
