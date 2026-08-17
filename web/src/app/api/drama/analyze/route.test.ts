import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    getAuthSettings: vi.fn(),
    refundUserPoints: vi.fn(),
    resolveLogicalModelCandidates: vi.fn(),
    checkRateLimit: vi.fn(),
    requestStructuredText: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/store", () => ({ getAuthSettings: mocks.getAuthSettings, isAuthInputError: vi.fn(() => false), refundUserPoints: mocks.refundUserPoints }));
vi.mock("@/lib/server/internal-origin", () => ({ resolveInternalOrigin: vi.fn((origin: string) => origin) }));
vi.mock("@/lib/server/logical-model-router", () => ({ resolveLogicalModelCandidates: mocks.resolveLogicalModelCandidates }));
vi.mock("@/lib/server/security", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/lib/server/text-planning-runtime", () => ({ rankTextPlanningCandidates: vi.fn((items: unknown[]) => items), requestStructuredText: mocks.requestStructuredText }));

import { POST } from "./route";

describe("POST /api/drama/analyze", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.checkRateLimit.mockResolvedValue({ allowed: true });
        mocks.getAuthSettings.mockResolvedValue({ defaultModels: { textModel: "planner" }, generationDefaults: { videoSeconds: 5 } });
        mocks.resolveLogicalModelCandidates.mockReturnValue([
            {
                channel: { id: "text-channel", name: "文本渠道", baseUrl: "https://example.com/v1", apiKey: "secret", apiFormat: "openai", models: ["vendor-planner"], enabled: true },
                upstreamModel: "vendor-planner",
            },
        ]);
        mocks.requestStructuredText.mockResolvedValue({
            arguments: JSON.stringify({
                episode: { outline: "大纲", hook: "", nextPreview: "", sourceRange: "第一场" },
                characters: [],
                scenes: [],
                props: [],
                clues: [],
                shots: [
                    {
                        title: "荒原",
                        description: "灰黑色风暴扫过废墟",
                        sourceText: "灰黑色风暴扫过废墟。",
                        shotBoundary: "环境建立",
                        dialogue: "",
                        narration: "",
                        utterances: [],
                        duration: 5,
                        characterNames: [],
                        sceneName: "废墟",
                        propNames: [],
                        clueNames: [],
                    },
                ],
            }),
            headers: new Headers(),
            protocol: "chat",
            elapsedMs: 10,
        });
    });

    it("uses native structured output first with an independently billed JSON fallback", async () => {
        const response = await POST(
            new Request("http://localhost/api/drama/analyze", {
                method: "POST",
                headers: { "content-type": "application/json", cookie: "session=test" },
                body: JSON.stringify({ phase: "content", script: "灰黑色风暴扫过废墟。" }),
            }),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({ code: 0, data: { shots: [expect.objectContaining({ title: "荒原" })] } });
        expect(mocks.requestStructuredText).toHaveBeenCalledOnce();
        const input = mocks.requestStructuredText.mock.calls[0]?.[0] as {
            preferNativeTools?: boolean;
            headers?: HeadersInit;
            fallbackHeaders?: HeadersInit;
            tool?: { name?: string };
            validateArguments?: (argumentsText: string) => boolean;
        };
        const toolBillingKey = new Headers(input.headers).get("x-vozeb-pro-points-idempotency-key");
        const fallbackBillingKey = new Headers(input.fallbackHeaders).get("x-vozeb-pro-points-idempotency-key");
        expect(input).toMatchObject({ preferNativeTools: true, tool: { name: "analyze_drama_content" } });
        expect(input.validateArguments?.('{"script":"输入回显"}')).toBe(false);
        expect(input.validateArguments?.('{"episode":{"outline":"大纲"},"shots":[{"title":"镜头"}]}')).toBe(true);
        expect(toolBillingKey).toMatch(/:tool$/);
        expect(fallbackBillingKey).toMatch(/:json$/);
        expect(fallbackBillingKey).not.toBe(toolBillingKey);
    });
});
