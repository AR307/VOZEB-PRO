import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    verifyAdminSensitiveAction: vi.fn(),
    completeBillingOrderPayment: vi.fn(),
    audit: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/store", () => ({ isAuthInputError: vi.fn((error) => Boolean(error && typeof error === "object" && "authStatus" in error)) }));
vi.mock("@/lib/server/admin-mfa-service", () => ({ verifyAdminSensitiveAction: mocks.verifyAdminSensitiveAction }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({ id: "admin-one" })), safeRecordAuditLog: mocks.audit }));
vi.mock("@/lib/server/billing-service", () => ({ completeBillingOrderPayment: mocks.completeBillingOrderPayment, isBillingInputError: vi.fn(() => false) }));

import { POST } from "./route";

describe("POST /api/admin/billing/orders/:id/complete", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-one", role: "admin" });
        mocks.verifyAdminSensitiveAction.mockResolvedValue(undefined);
        mocks.completeBillingOrderPayment.mockResolvedValue({
            order: { id: "order-one", orderNo: "VP-1", userId: "user-one", planId: "creator", amountCents: 1000, currency: "CNY" },
            pointsGranted: 20,
        });
    });

    it("verifies identity before payment completion and excludes proof from the payment payload", async () => {
        const response = await POST(
            request({
                provider: "manual",
                channel: "admin-manual",
                currentPassword: "admin-password",
                totpCode: "123456",
                rawPayload: { currentPassword: "nested-password", totpCode: "nested-code" },
            }),
            context(),
        );

        expect(response.status).toBe(200);
        expect(mocks.verifyAdminSensitiveAction).toHaveBeenCalledWith("admin-one", expect.objectContaining({ currentPassword: "admin-password", totpCode: "123456" }));
        expect(mocks.completeBillingOrderPayment).toHaveBeenCalledWith(
            expect.objectContaining({
                orderId: "order-one",
                rawPayload: expect.not.objectContaining({ currentPassword: expect.anything(), totpCode: expect.anything() }),
            }),
        );
        expect(JSON.stringify(mocks.completeBillingOrderPayment.mock.calls)).not.toContain("admin-password");
        expect(JSON.stringify(mocks.completeBillingOrderPayment.mock.calls)).not.toContain("nested-password");
    });

    it("does not complete payment when identity verification fails", async () => {
        mocks.verifyAdminSensitiveAction.mockRejectedValue(Object.assign(new Error("当前密码不正确"), { authStatus: true, status: 400 }));

        const response = await POST(request({ currentPassword: "wrong" }), context());

        expect(response.status).toBe(400);
        expect(mocks.completeBillingOrderPayment).not.toHaveBeenCalled();
    });
});

function request(body: unknown) {
    return new Request("http://localhost/api/admin/billing/orders/order-one/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

function context() {
    return { params: Promise.resolve({ id: "order-one" }) };
}
