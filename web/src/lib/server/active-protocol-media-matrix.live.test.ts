import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runCustomImageTask, pollCustomImageTask } from "@/app/api/image-tasks/image-task-custom";
import { runOpenAiImageTask } from "@/app/api/image-tasks/image-task-openai";
import { createUpstream } from "@/app/api/video-generation-tasks/route";
import type { SystemChannelProtocol } from "@/lib/auth/store-types";
import { emptyAdvancedConfig, protocolModelConfig } from "@/lib/channel-protocol-registry";
import type { SystemGenerationChannelConfig } from "@/lib/server/generation-channel";
import type { ImageTask } from "@/lib/server/image-task-store";
import type { VideoTask } from "@/lib/server/video-task-store";
import { queryVideoTaskUpstream } from "@/lib/server/video-task-runtime";
import { createProtocolFixtureServer } from "../../../scripts/protocol-fixture-server.mjs";

const MULTIPLIERS = { imageQuality: { auto: 1, high: 1 }, videoQuality: { "720": 1, "1080": 1 }, videoSeconds: { "5": 1, "8": 1 } };

describe("active media protocols over TCP fixtures", () => {
    let fixture: ReturnType<typeof createProtocolFixtureServer>;
    let origin = "";

    beforeEach(async () => {
        vi.stubEnv("VOZEB_PRO_ALLOW_PRIVATE_UPSTREAMS", "1");
        vi.stubEnv("VOZEB_PRO_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1");
        fixture = createProtocolFixtureServer();
        await new Promise<void>((resolve) => fixture.server.listen(0, "127.0.0.1", resolve));
        const address = fixture.server.address();
        if (!address || typeof address === "string") throw new Error("Protocol fixture did not bind a TCP port");
        origin = `http://127.0.0.1:${address.port}`;
    });

    afterEach(async () => {
        vi.unstubAllEnvs();
        await new Promise<void>((resolve, reject) => fixture.server.close((error?: Error) => (error ? reject(error) : resolve())));
    });

    it.each([
        ["openai", "/v1", "mock-image", "openai", "/v1/images/generations"],
        ["sub2api", "/v1", "mock-image", "openai", "/v1/images/generations"],
        ["newapi", "/v1", "mock-image", "openai", "/v1/images/generations"],
        ["stable-diffusion", "", "mock-image", "declarative", "/sdapi/v1/txt2img"],
        ["yumeng", "", "seedream_5.0Pro", "declarative", "/v2/model-center/tasks"],
        ["custom", "", "custom-image-model", "declarative", "/custom/images"],
    ] as const)("completes %s image creation with its declared request shape", async (protocol, basePath, model, kind, expectedCreatePath) => {
        const baseUrl = `${origin}${basePath}`;
        const task = imageTask(baseUrl, model, protocol, kind === "declarative" ? imageConfig(protocol) : undefined);
        const result = kind === "declarative" ? await runCustomImageTask(task, origin, origin, "", protocol === "yumeng") : await runOpenAiImageTask(task, origin, origin, "", true);
        const resolved = result.pending ? await pollCustomImageTask(task, result.pending.id, result.pending.pollBaseUrl, "") : result;
        expect(resolved.dataUrl || resolved.remoteUrl).toBeTruthy();
        expect(fixture.requests[0]?.method).toBe("POST");
        expect(fixture.requests[0]?.path).toBe(expectedCreatePath);
    });

    it.each([
        ["openai", "/v1", "mock-video", "/v1/videos"],
        ["sub2api", "/v1", "mock-video", "/v1/videos"],
        ["newapi", "/v1", "mock-video", "/v1/videos"],
        ["seedance", "", "seedance-video", "/contents/generations/tasks"],
        ["volcengine-video", "/api/v3", "seedance-video", "/api/v3/contents/generations/tasks"],
        ["yumeng", "", "seedance-2.5", "/v2/model-center/tasks"],
        ["custom", "", "custom-video-model", "/custom/videos"],
    ] as const)("completes %s video creation and polling without path fallback", async (protocol, basePath, model, expectedCreatePath) => {
        const baseUrl = `${origin}${basePath}`;
        const config = videoConfig(protocol, baseUrl, model);
        const upstream = await createUpstream("user-live", "", "", config, "animate a blue logo", { videoSeconds: 5, size: "16:9", vquality: "720", videoGenerateAudio: false }, [], MULTIPLIERS, `video-${protocol}`);
        expect(fixture.requests[0]?.path).toBe(expectedCreatePath);
        expect(upstream.id).toBeTruthy();
        const result = await queryVideoTaskUpstream({ config, upstream, userId: "user-live" } as unknown as VideoTask, "", "");
        expect(result).toMatchObject({ state: "result_ready", resultUrl: expect.stringContaining("/media/fixture.mp4") });
        expect(fixture.requests).toHaveLength(2);
    });

    it("completes the Gemini Veo operation protocol", async () => {
        const config = videoConfig("gemini", `${origin}/v1beta`, "veo-3.1-generate-preview");
        const upstream = await createUpstream("user-live", "", "", config, "animate a blue logo", { videoSeconds: 5, size: "16:9", vquality: "720", videoGenerateAudio: false }, [], MULTIPLIERS, "video-gemini");
        expect(fixture.requests[0]?.path).toBe("/v1beta/models/veo-3.1-generate-preview:predictLongRunning");
        const result = await queryVideoTaskUpstream({ config, upstream, userId: "user-live" } as unknown as VideoTask, "", "");
        expect(result).toMatchObject({ state: "result_ready", resultUrl: expect.stringContaining("/media/fixture.mp4") });
    });
});

function imageTask(baseUrl: string, model: string, protocol: string, advancedConfig?: ImageTask["config"]["advancedConfig"]): ImageTask {
    return {
        id: `image-${protocol}`,
        userId: "user-live",
        username: "user",
        displayName: "User",
        kind: "generation",
        source: "image-workbench",
        status: "running",
        createdAt: 1,
        updatedAt: 1,
        config: { baseUrl, apiKey: "fixture-key", apiFormat: "openai", model, channelId: `fixture-${protocol}`, ...(advancedConfig ? { advancedConfig } : {}) },
        candidateConfigs: [],
        prompt: "create a blue protocol test image",
        references: [],
    };
}

function imageConfig(protocol: string) {
    if (protocol === "stable-diffusion") {
        return {
            ...emptyAdvancedConfig(),
            protocol: "stable-diffusion" as const,
            createPath: "/sdapi/v1/txt2img",
            editPath: "/sdapi/v1/img2img",
            requestTemplate: '{"prompt":"{{prompt}}","width":"{{width}}","height":"{{height}}","override_settings":{"sd_model_checkpoint":"{{model}}"}}',
            resultField: "images[0]",
        };
    }
    if (protocol === "yumeng") return { ...emptyAdvancedConfig(), ...protocolModelConfig("yumeng", "image") };
    return protocol === "custom" ? { ...emptyAdvancedConfig(), protocol: "custom" as const, createPath: "/custom/images", requestTemplate: '{"model":"{{model}}","prompt":"{{prompt}}"}', resultField: "data.image_url" } : undefined;
}

function videoConfig(protocol: SystemChannelProtocol, baseUrl: string, model: string): SystemGenerationChannelConfig {
    const strict = protocolModelConfig(protocol, "video");
    const advancedConfig =
        (strict ? { ...emptyAdvancedConfig(), ...strict } : undefined) ||
        (protocol === "custom"
            ? {
                  ...emptyAdvancedConfig(),
                  protocol: "custom" as const,
                  createPath: "/custom/videos",
                  queryPath: "/custom/results/:task_id",
                  requestTemplate: '{"deployment":"{{model}}","input":"{{prompt}}","seconds":"{{duration}}","aspect":"{{ratio}}"}',
                  resultField: "data.video_url",
                  statusField: "data.status",
              }
            : undefined);
    return { apiSource: "system", baseUrl, apiKey: "system", apiFormat: protocol === "gemini" ? "gemini" : "openai", model, logicalModel: model, channelId: `fixture-${protocol}`, advancedConfig };
}
