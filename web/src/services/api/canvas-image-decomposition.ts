"use client";

import type { CanvasImageDecomposition } from "@/lib/canvas-image-decomposition";
import { refreshUserPointsIfSystem } from "@/services/api/points";
import { throwIfClientSessionExpired } from "@/services/api/session-expiration";

export async function requestCanvasImageDecomposition(input: { requestId: string; source: string }) {
    try {
        const response = await fetch("/api/canvas/image-decomposition", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
        });
        throwIfClientSessionExpired(response);
        const payload = (await response.json().catch(() => null)) as { data?: CanvasImageDecomposition; msg?: string } | null;
        if (!response.ok || !payload?.data) throw new Error(payload?.msg || "图片分层识别失败");
        return payload.data;
    } finally {
        void refreshUserPointsIfSystem("system");
    }
}
