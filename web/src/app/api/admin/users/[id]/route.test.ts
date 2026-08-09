import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    verifyAdminSensitiveAction: vi.fn(),
    updateUserByAdmin: vi.fn(),
    deleteUserByAdmin: vi.fn(),
    deleteGenerationLogsByUserId: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/store", () => ({
    updateUserByAdmin: mocks.updateUserByAdmin,
    deleteUserByAdmin: mocks.deleteUserByAdmin,
    isAuthInputError: vi.fn(() => false),
}));
vi.mock("@/lib/server/admin-mfa-service", () => ({ verifyAdminSensitiveAction: mocks.verifyAdminSensitiveAction }));
vi.mock("@/lib/server/generation-log-store", () => ({ deleteGenerationLogsByUserId: mocks.deleteGenerationLogsByUserId }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({})), safeRecordAuditLog: vi.fn() }));

import { DELETE, PATCH } from "./route";

describe("admin user detail route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-one", role: "admin" });
        mocks.verifyAdminSensitiveAction.mockResolvedValue(undefined);
        mocks.updateUserByAdmin.mockResolvedValue({ id: "user-one", username: "creator", role: "user", status: "active" });
        mocks.deleteUserByAdmin.mockResolvedValue({ ok: true });
    });

    it("verifies identity before updating user fields", async () => {
        const response = await PATCH(request("PATCH", { role: "admin", currentPassword: "admin-password", totpCode: "123456" }), context());

        expect(response.status).toBe(200);
        expect(mocks.verifyAdminSensitiveAction).toHaveBeenCalledWith("admin-one", expect.objectContaining({ currentPassword: "admin-password", totpCode: "123456" }));
        expect(mocks.updateUserByAdmin).toHaveBeenCalledWith("admin-one", "user-one", { role: "admin" });
    });

    it("verifies identity before deleting the user aggregate", async () => {
        const response = await DELETE(request("DELETE", { currentPassword: "admin-password" }), context());

        expect(response.status).toBe(200);
        expect(mocks.verifyAdminSensitiveAction).toHaveBeenCalledBefore(mocks.deleteUserByAdmin);
        expect(mocks.deleteGenerationLogsByUserId).toHaveBeenCalledWith("user-one");
    });
});

function request(method: string, body: unknown) {
    return new Request("http://localhost/api/admin/users/user-one", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

function context() {
    return { params: Promise.resolve({ id: "user-one" }) };
}
