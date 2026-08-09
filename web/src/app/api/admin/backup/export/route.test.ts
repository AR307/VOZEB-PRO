import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    readAdminBackupData: vi.fn(),
    sanitizeAuthBackup: vi.fn(),
    verifyAdminSensitiveAction: vi.fn(),
    safeRecordAuditLog: vi.fn(async () => undefined),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/store", () => ({ isAuthInputError: vi.fn(() => false) }));
vi.mock("@/lib/server/admin-backup-policy", () => ({ sanitizeAuthBackup: mocks.sanitizeAuthBackup }));
vi.mock("@/lib/server/admin-backup-store", () => ({ readAdminBackupData: mocks.readAdminBackupData }));
vi.mock("@/lib/server/admin-mfa-service", () => ({ verifyAdminSensitiveAction: mocks.verifyAdminSensitiveAction }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({ id: "admin" })), safeRecordAuditLog: mocks.safeRecordAuditLog }));

import { POST } from "./route";

describe("POST /api/admin/backup/export", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin", role: "admin" });
        mocks.verifyAdminSensitiveAction.mockResolvedValue(undefined);
        mocks.sanitizeAuthBackup.mockReturnValue({ users: [{ id: "user-one" }] });
        mocks.readAdminBackupData.mockResolvedValue({
            auth: { users: [{ id: "user-one", passwordHash: "secret" }] },
            prompts: { version: 1, prompts: [] },
            generationLogs: { version: 1, logs: [] },
            accountDeletionRequests: { version: 1, requests: [{ id: "request-one", email: "private@example.com" }] },
        });
    });

    it("verifies the administrator and returns a non-cacheable sanitized backup", async () => {
        const response = await POST(request());
        const backup = await response.json();

        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toContain("no-store");
        expect(response.headers.get("content-disposition")).toContain("vozeb-pro-data-backup-");
        expect(mocks.verifyAdminSensitiveAction).toHaveBeenCalledWith("admin", { currentPassword: "admin-password", totpCode: "123456" });
        expect(JSON.stringify(backup)).not.toContain("passwordHash");
        expect(JSON.stringify(backup)).not.toContain("private@example.com");
        expect(mocks.safeRecordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.backup.export", target: expect.objectContaining({ type: "backup" }) }));
    });

    it("rejects unauthenticated and non-admin users before reading backup data", async () => {
        mocks.getCurrentUser.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "user", role: "user" });

        expect((await POST(request())).status).toBe(401);
        expect((await POST(request())).status).toBe(403);
        expect(mocks.readAdminBackupData).not.toHaveBeenCalled();
    });
});

function request() {
    return new Request("http://localhost/api/admin/backup/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: "admin-password", totpCode: "123456" }),
    });
}
