import { NextResponse } from "next/server";

import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { isAuthInputError } from "@/lib/auth/store";
import { sanitizeAuthBackup } from "@/lib/server/admin-backup-policy";
import { readAdminBackupData } from "@/lib/server/admin-backup-store";
import { verifyAdminSensitiveAction } from "@/lib/server/admin-mfa-service";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (currentUser.role !== "admin") return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });

    try {
        const proof = await readJsonBody<{ currentPassword?: unknown; totpCode?: unknown }>(request);
        await verifyAdminSensitiveAction(currentUser.id, proof);
        const exportedAt = new Date().toISOString();
        const data = await readAdminBackupData();
        const backup = {
            app: "VOZEB PRO",
            version: 1,
            backupType: "account-config",
            exportedAt,
            files: {
                auth: sanitizeAuthBackup(data.auth),
                prompts: data.prompts,
                generationLogs: data.generationLogs,
                accountDeletionRequests: {
                    version: 1,
                    requests: data.accountDeletionRequests.requests.map(({ email: _email, ...item }) => item),
                },
            },
        };
        await safeRecordAuditLog({
            action: "admin.backup.export",
            actor: auditActorFromRequest(request, currentUser),
            target: { type: "backup", id: exportedAt },
        });
        return new NextResponse(JSON.stringify(backup, null, 2), {
            headers: {
                "Content-Type": "application/json; charset=utf-8",
                "Content-Disposition": `attachment; filename="vozeb-pro-data-backup-${exportedAt.slice(0, 10)}.json"`,
                "Cache-Control": "private, no-store, max-age=0",
                Pragma: "no-cache",
            },
        });
    } catch (error) {
        await safeRecordAuditLog({
            action: "admin.backup.export",
            status: "failure",
            actor: auditActorFromRequest(request, currentUser),
            target: { type: "backup" },
            metadata: { error: error instanceof Error ? error.message : "unknown" },
        });
        if (isAuthInputError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error("Admin backup export failed", error);
        return NextResponse.json({ error: "导出备份失败" }, { status: 500 });
    }
}
