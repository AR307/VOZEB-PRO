import type { AdminSensitiveActionProof } from "@/lib/admin-sensitive-action";

export async function revealAdminChannelApiKey(channelId: string, proof: AdminSensitiveActionProof) {
    const response = await fetch(`/api/admin/settings/channels/${encodeURIComponent(channelId)}/api-key`, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(proof),
    });
    const payload = (await response.json().catch(() => null)) as { apiKey?: string; error?: string } | null;
    if (!response.ok || !payload?.apiKey) throw new Error(payload?.error || "读取 API Key 失败");
    return payload.apiKey;
}
