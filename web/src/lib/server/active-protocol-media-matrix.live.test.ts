import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runCustomImageTask, pollCustomImageTask } from "@/app/api/image-tasks/image-task-custom";
import { runOpenAiImageTask } from "@/app/api/image-tasks/image-task-openai";
import { createUpstream } from "@/app/api/video-generation-tasks/video-generation-route";
import type { SystemChannelProtocol } from "@/lib/auth/store-types";
import { channelProtocolDefinitions, emptyAdvancedConfig, protocolModelConfig, registeredChannelProtocolDefinitions } from "@/lib/channel-protocol-registry";
import type { SystemGenerationChannelConfig } from "@/lib/server/generation-channel";
import type { ImageTask } from "@/lib/server/image-task-store";
import type { VideoTask } from "@/lib/server/video-task-store";
import { queryVideoTaskUpstream } from "@/lib/server/video-task-runtime";
import { createProtocolFixtureServer } from "../../../scripts/protocol-fixture-server.mjs";

const MULTIPLIERS = { imageQuality: { auto: 1, high: 1 }, videoQuality: { "720": 1, "1080": 1 }, videoSeconds: { "5": 1, "8": 1 } };
const STRICT_IMAGE_PROTOCOLS = registeredChannelProtocolDefinitions.filter((definition) => definition.strict && definition.operations.image);
const STRICT_VIDEO_PROTOCOLS = registeredChannelProtocolDefinitions.filter((definition) => definition.strict && definition.operations.video);
const ADVANCED_IMAGE_PROTOCOLS = channelProtocolDefinitions.filter((definition) => !definition.strict && definition.capabilities.includes("image"));
const ADVANCED_VIDEO_PROTOCOLS = channelProtocolDefinitions.filter((definition) => !definition.strict && definition.capabilities.includes("video"));

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

    it.each(STRICT_IMAGE_PROTOCOLS)("completes $id image creation with its registered request shape", async (definition) => {
        const model = definition.builtInModels?.find((item) => item.capability === "image")?.id || "mock-image";
        const operation = definition.operations.image!;
        const baseUrl = operation.createPath === "/images/generations" ? `${origin}/v1` : origin;
        const task = imageTask(baseUrl, model, definition.id, imageConfig(definition.id));
        const declarative = definition.id === "stable-diffusion" || definition.id === "yumeng";
        const result = declarative ? await runCustomImageTask(task, origin, origin, "", definition.id === "yumeng") : await runOpenAiImageTask(task, origin, origin, "", true);
        const resolved = result.pending ? await pollCustomImageTask(task, result.pending.id, result.pending.pollBaseUrl, "") : result;
        expect(resolved.dataUrl || resolved.remoteUrl).toBeTruthy();
        expect(fixture.requests[0]?.method).toBe("POST");
        expect(fixture.requests[0]?.path).toBe(new URL(`${baseUrl}${operation.createPath}`).pathname);
    });

    it.each(STRICT_VIDEO_PROTOCOLS)("completes $id video creation and polling without path fallback", async (definition) => {
        const model = definition.builtInModels?.find((item) => item.capability === "video")?.id || "mock-video";
        const createPath = definition.operations.video!.createPath!;
        const config = videoConfig(definition.id, origin, model);
        const upstream = await createUpstream("user-live", "", "", config, "animate a blue logo", { videoSeconds: 5, size: "16:9", vquality: "720", videoGenerateAudio: false }, [], MULTIPLIERS, `video-${definition.id}`);
        expect(fixture.requests[0]?.path).toBe(createPath.replace(":model", model));
        expect(upstream.id).toBeTruthy();
        const result = await queryVideoTaskUpstream({ config, upstream, userId: "user-live" } as unknown as VideoTask, "", "");
        expect(result).toMatchObject({ state: "result_ready", resultUrl: expect.stringContaining("/media/fixture.mp4") });
        expect(fixture.requests).toHaveLength(2);
    });

    it.each(ADVANCED_IMAGE_PROTOCOLS)("completes configured $id image creation", async (definition) => {
        const baseUrl = definition.id === "custom" ? origin : `${origin}/v1`;
        const task = imageTask(baseUrl, "mock-image", definition.id, imageConfig(definition.id));
        const image = definition.id === "custom" ? await runCustomImageTask(task, origin, origin, "", true) : await runOpenAiImageTask(task, origin, origin, "", true);
        expect(image.dataUrl || image.remoteUrl).toBeTruthy();
        expect(fixture.requests[0]?.path).toBe(definition.id === "custom" ? "/custom/images" : "/v1/images/generations");
    });

    it.each(ADVANCED_VIDEO_PROTOCOLS)("completes configured $id video creation and polling", async (definition) => {
        const config = videoConfig(definition.id, origin, "mock-video");
        const upstream = await createUpstream("user-live", "", "", config, "animate a blue logo", { videoSeconds: 5, size: "16:9", vquality: "720", videoGenerateAudio: false }, [], MULTIPLIERS, `video-${definition.id}`);
        const result = await queryVideoTaskUpstream({ config, upstream, userId: "user-live" } as unknown as VideoTask, "", "");
        expect(result).toMatchObject({ state: "result_ready", resultUrl: expect.stringContaining("/media/fixture.mp4") });
        expect(fixture.requests.map((request) => request.path)).toEqual([definition.id === "custom" ? "/custom/videos" : "/videos", expect.stringMatching(definition.id === "custom" ? /^\/custom\/results\// : /^\/videos\//)]);
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
    if (protocol === "custom") return { ...emptyAdvancedConfig(), protocol: "custom" as const, createPath: "/custom/images", requestTemplate: '{"model":"{{model}}","prompt":"{{prompt}}"}', resultField: "data.image_url" };
    const strict = protocolModelConfig(protocol as SystemChannelProtocol, "image");
    return strict ? { ...emptyAdvancedConfig(), ...strict } : { ...emptyAdvancedConfig(), protocol: protocol as SystemChannelProtocol };
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
            : {
                  ...emptyAdvancedConfig(),
                  protocol,
                  createPath: "/videos",
                  queryPath: "/videos/:task_id",
                  resultField: "video_url",
                  statusField: "status",
              });
    return { apiSource: "system", baseUrl, apiKey: "system", apiFormat: protocol === "gemini" ? "gemini" : "openai", model, logicalModel: model, channelId: `fixture-${protocol}`, advancedConfig };
}
