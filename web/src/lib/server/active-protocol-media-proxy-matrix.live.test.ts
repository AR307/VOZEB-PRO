import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    consumeUserPoints: vi.fn(),
    fetchInternalApi: vi.fn(),
    getAuthSettings: vi.fn(),
    mediaAccess: vi.fn(),
    refundUserPoints: vi.fn(),
    taskAccess: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn(async () => ({ id: "proxy-user", role: "user", pointsBalance: 100 })) }));
vi.mock("@/lib/auth/store", () => ({
    consumeUserPoints: mocks.consumeUserPoints,
    getAuthSettings: mocks.getAuthSettings,
    isAuthInputError: (error: unknown) => Boolean(error && typeof error === "object" && "status" in error),
    isQuotaExceededError: vi.fn(() => false),
    refundUserPoints: mocks.refundUserPoints,
}));
vi.mock("@/lib/server/generation-media-access", () => ({ authorizeGenerationMediaProxyRequest: mocks.mediaAccess }));
vi.mock("@/lib/server/generation-task-authorization", () => ({ userOwnsGenerationUpstreamTask: mocks.taskAccess }));
vi.mock("@/lib/server/internal-origin", () => ({
    fetchInternalApi: mocks.fetchInternalApi,
    isInternalApiBaseUrl: (value: string) => value.trim().startsWith("/"),
    resolveInternalOrigin: () => INTERNAL_ORIGIN,
}));
vi.mock("@/lib/server/media-concurrency", () => ({ acquireMediaConcurrency: () => ({ release: vi.fn() }), withMediaConcurrency: (response: Response) => response }));
vi.mock("@/lib/server/proxy-dispatcher", () => ({ configureServerProxyDispatcher: vi.fn() }));

import { runCustomImageTask, pollCustomImageTask } from "@/app/api/image-tasks/image-task-custom";
import { runOpenAiImageTask } from "@/app/api/image-tasks/image-task-openai";
import { GET as proxyGet, HEAD as proxyHead, POST as proxyPost } from "@/app/api/ai/system/[channelId]/[...path]/route";
import { createUpstream } from "@/app/api/video-generation-tasks/video-generation-route";
import type { LogicalModelCapability, SystemChannelAdvancedConfig, SystemChannelModelConfig, SystemChannelProtocol } from "@/lib/auth/store-types";
import { channelProtocolDefinitions, emptyAdvancedConfig, protocolAuthHeaders, protocolModelConfig, registeredChannelProtocolDefinitions, type ChannelProtocolDefinition } from "@/lib/channel-protocol-registry";
import type { SystemGenerationChannelConfig } from "@/lib/server/generation-channel";
import type { ImageTask } from "@/lib/server/image-task-store";
import type { VideoTask } from "@/lib/server/video-task-store";
import { queryVideoTaskUpstream } from "@/lib/server/video-task-runtime";
import { createProtocolFixtureServer } from "../../../scripts/protocol-fixture-server.mjs";

const INTERNAL_ORIGIN = "http://internal.vozeb.test";
const MULTIPLIERS = { imageQuality: { auto: 1, high: 1 }, videoQuality: { "720": 1, "1080": 1 }, videoSeconds: { "5": 1, "8": 1 } };
const IMAGE_PROTOCOLS = protocolCases("image");
const VIDEO_PROTOCOLS = protocolCases("video");
const PNG_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGPQq/3/H4QZYAwAWewKpRUlAtEAAAAASUVORK5CYII=";
let fixture: ReturnType<typeof createProtocolFixtureServer>;
let fixtureOrigin = "";

describe("active media protocols through the system proxy", () => {
    beforeEach(async () => {
        vi.stubEnv("VOZEB_PRO_ALLOW_PRIVATE_UPSTREAMS", "1");
        vi.stubEnv("VOZEB_PRO_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1");
        fixture = createProtocolFixtureServer();
        await new Promise<void>((resolve) => fixture.server.listen(0, "127.0.0.1", resolve));
        const address = fixture.server.address();
        if (!address || typeof address === "string") throw new Error("Protocol fixture did not bind a TCP port");
        fixtureOrigin = `http://127.0.0.1:${address.port}`;
        mocks.consumeUserPoints.mockReset().mockResolvedValue({ cost: 1, remaining: 99, permanentRemaining: 99, dailyRemaining: 0, dailyExpiresAt: "", recordId: "points-record" });
        mocks.refundUserPoints.mockReset();
        mocks.mediaAccess.mockReset().mockResolvedValue(true);
        mocks.taskAccess.mockReset().mockResolvedValue(true);
        mocks.fetchInternalApi.mockReset().mockImplementation(dispatchInternalRequest);
    });

    afterEach(async () => {
        vi.unstubAllEnvs();
        await new Promise<void>((resolve, reject) => fixture.server.close((error?: Error) => (error ? reject(error) : resolve())));
    });

    it.each(IMAGE_PROTOCOLS)("routes $id text-to-image and image-to-image through its configured upstream contract", async (definition) => {
        const model = protocolModel(definition, "image");
        const operation = protocolOperation(definition, "image", model);
        const advancedConfig = protocolAdvancedConfig(definition.id, operation, model);
        const channel = configureProxyChannel(definition, "image", model, advancedConfig);

        const generated = await runImage(imageTask(channel, false), definition.id);
        await expectImageResult(generated);
        expectProxyRequests(channel, operation.createPath, model, false);

        fixture.requests.splice(0);
        const edited = await runImage(imageTask(channel, true), definition.id);
        await expectImageResult(edited);
        expectProxyRequests(channel, operation.editPath || operation.createPath, model, true);
    });

    it.each(VIDEO_PROTOCOLS)("routes $id text-to-video and image-to-video creation, polling, and media", async (definition) => {
        const model = protocolModel(definition, "video");
        const operation = protocolOperation(definition, "video", model);
        if (!operation.queryPath) throw new Error(`${definition.id} video operation is missing queryPath`);
        const advancedConfig = protocolAdvancedConfig(definition.id, operation, model);
        const channel = configureProxyChannel(definition, "video", model, advancedConfig);

        const created = await createUpstream("proxy-user", INTERNAL_ORIGIN, "", channel.config, "animate a blue logo", videoParameters(), [], MULTIPLIERS, `text-video-${definition.id}`);
        await expectVideoResult(channel, created);
        expectProxyRequests(channel, operation.createPath, model, false, operation.queryPath, created.id);

        fixture.requests.splice(0);
        const createPath = operation.imageToVideoPath || operation.createPath;
        const referenced = await createUpstream(
            "proxy-user",
            INTERNAL_ORIGIN,
            "",
            channel.config,
            "animate the reference image",
            videoParameters(),
            [{ type: "image", url: `${fixtureOrigin}/media/fixture.png` }],
            MULTIPLIERS,
            `image-video-${definition.id}`,
        );
        await expectVideoResult(channel, referenced);
        expectProxyRequests(channel, createPath, model, true, operation.queryPath, referenced.id);
    });
});

function protocolCases(capability: "image" | "video") {
    const strict = registeredChannelProtocolDefinitions.filter((definition) => definition.strict && definition.operations[capability]);
    const advanced = channelProtocolDefinitions.filter((definition) => !definition.strict && definition.capabilities.includes(capability));
    return [...strict, ...advanced];
}

function protocolModel(definition: ChannelProtocolDefinition, capability: "image" | "video") {
    return definition.builtInModels?.find((item) => item.capability === capability)?.id || `mock-${capability}`;
}

function protocolOperation(definition: ChannelProtocolDefinition, capability: "image" | "video", model: string) {
    const registered = protocolModelConfig(definition.id, capability, model);
    if (registered) return registered;
    if (definition.id === "custom") {
        return {
            capability,
            protocol: "custom" as const,
            createPath: `/custom/${capability === "image" ? "images" : "videos"}`,
            ...(capability === "image" ? { editPath: "/custom/images" } : { imageToVideoPath: "/custom/videos", queryPath: "/custom/results/:task_id" }),
            requestTemplate: capability === "image" ? '{"model":"{{model}}","prompt":"{{prompt}}","images":"{{images}}"}' : '{"model":"{{model}}","prompt":"{{prompt}}","images":"{{images}}"}',
            resultField: capability === "image" ? "data.image_url" : "data.video_url",
            statusField: capability === "video" ? "data.status" : "",
            supportsReferenceImage: true,
        } satisfies SystemChannelModelConfig;
    }
    return {
        capability,
        protocol: definition.id,
        createPath: capability === "image" ? "/images/generations" : "/videos",
        ...(capability === "image" ? { editPath: "/images/edits" } : { imageToVideoPath: "/videos", queryPath: "/videos/:task_id" }),
        requestTemplate: capability === "video" ? '{"model":"{{model}}","prompt":"{{prompt}}","images":"{{images}}"}' : "",
        resultField: capability === "video" ? "video_url" : "",
        statusField: capability === "video" ? "status" : "",
        supportsReferenceImage: true,
    } satisfies SystemChannelModelConfig;
}

function protocolAdvancedConfig(protocol: SystemChannelProtocol, operation: SystemChannelModelConfig, model: string): SystemChannelAdvancedConfig {
    const base = emptyAdvancedConfig();
    return {
        ...base,
        ...operation,
        protocol,
        modelConfigs: { [normalizeModel(model)]: operation },
    };
}

function configureProxyChannel(definition: ChannelProtocolDefinition, capability: LogicalModelCapability, model: string, advancedConfig: SystemChannelAdvancedConfig) {
    const channelId = `proxy-${definition.id}-${capability}`;
    const logicalModelId = `${definition.id}-${capability}`;
    const upstreamBaseUrl = fixtureBaseUrl(definition.id, advancedConfig.protocol === "gemini" ? "gemini" : definition.apiFormat);
    mocks.getAuthSettings.mockResolvedValue({
        generationPointMultipliers: MULTIPLIERS,
        logicalModels: [{ id: logicalModelId, name: logicalModelId, capability, enabled: true, bindings: [{ id: `${logicalModelId}-binding`, channelId, upstreamModel: model, enabled: true, priority: 1 }] }],
        systemChannels: [{ id: channelId, name: channelId, enabled: true, baseUrl: upstreamBaseUrl, apiKey: "fixture-key", apiFormat: definition.apiFormat, models: [model], advancedConfig }],
    });
    return {
        channelId,
        logicalModelId,
        upstreamBaseUrl,
        expectedAuthHeaders: protocolAuthHeaders("fixture-key", advancedConfig, definition.apiFormat),
        config: {
            apiSource: "system" as const,
            baseUrl: `/api/ai/system/${encodeURIComponent(channelId)}`,
            apiKey: "system" as const,
            apiFormat: definition.apiFormat,
            model,
            logicalModel: logicalModelId,
            channelId,
            advancedConfig,
        } satisfies SystemGenerationChannelConfig,
    };
}

function fixtureBaseUrl(protocol: SystemChannelProtocol, apiFormat: "openai" | "gemini") {
    if (["custom", "stable-diffusion", "yumeng", "seedance-special"].includes(protocol)) return fixtureOrigin;
    return `${fixtureOrigin}/${apiFormat === "gemini" ? "v1beta" : "v1"}`;
}

function imageTask(channel: ReturnType<typeof configureProxyChannel>, edit: boolean): ImageTask {
    const protocol = channel.config.advancedConfig?.protocol || "auto";
    return {
        id: `${edit ? "edit" : "image"}-${protocol}`,
        userId: "proxy-user",
        username: "proxy-user",
        displayName: "Proxy User",
        kind: edit ? "edit" : "generation",
        source: "image-workbench",
        status: "running",
        createdAt: 1,
        updatedAt: 1,
        config: { ...channel.config, quality: "high" },
        candidateConfigs: [],
        prompt: "create a blue protocol test image",
        references: edit ? [{ id: "reference", name: "reference.png", type: "image/png", dataUrl: ["yumeng", "sub2api", "custom"].includes(protocol) ? "https://cdn.example.com/reference.png" : PNG_DATA_URL }] : [],
    };
}

async function runImage(task: ImageTask, protocol: SystemChannelProtocol) {
    const declarative = protocol === "custom" || protocol === "stable-diffusion" || protocol === "yumeng";
    const submitted = declarative ? await runCustomImageTask(task, INTERNAL_ORIGIN, fixtureOrigin, "", true) : await runOpenAiImageTask(task, INTERNAL_ORIGIN, fixtureOrigin, "", true);
    return submitted.pending ? pollCustomImageTask(task, submitted.pending.id, submitted.pending.pollBaseUrl, "", true) : submitted;
}

function videoParameters() {
    return { videoSeconds: 5, size: "16:9", vquality: "720", videoGenerateAudio: false };
}

async function expectImageResult(result: { dataUrl?: string; remoteUrl?: string }) {
    const source = result.dataUrl || result.remoteUrl || "";
    expect(source).toBeTruthy();
    if (source.startsWith("data:")) {
        expect(Buffer.from(source.slice(source.indexOf(",") + 1), "base64").byteLength).toBeGreaterThan(0);
        return;
    }
    const response = await dispatchInternalRequest(source.startsWith("/") ? `${INTERNAL_ORIGIN}${source}` : source, {});
    expect(response.ok).toBe(true);
    expect(response.headers.get("content-type")).toContain("image/");
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
}

async function expectVideoResult(channel: ReturnType<typeof configureProxyChannel>, upstream: VideoTask["upstream"]) {
    expect(upstream?.id).toBeTruthy();
    const result = await queryVideoTaskUpstream({ config: channel.config, upstream, userId: "proxy-user" } as unknown as VideoTask, INTERNAL_ORIGIN, "");
    expect(result).toMatchObject({ state: "result_ready" });
    if (result.state !== "result_ready") throw new Error(`video fixture did not return a result: ${result.state}`);
    const proxyUrl = `${INTERNAL_ORIGIN}${channel.config.baseUrl}/_media?url=${encodeURIComponent(result.resultUrl)}`;
    const response = await dispatchInternalRequest(proxyUrl, {});
    expect(response.ok).toBe(true);
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
}

function expectProxyRequests(channel: ReturnType<typeof configureProxyChannel>, createPath: string | undefined, model: string, referenceRequired: boolean, queryPath?: string, taskId?: string) {
    if (!createPath) throw new Error("Protocol operation is missing createPath");
    const createRequests = fixture.requests.filter((request) => request.method === "POST");
    expect(createRequests).toHaveLength(1);
    expect(createRequests[0]?.path).toBe(upstreamPath(channel.upstreamBaseUrl, createPath.replace(":model", model)));
    Object.entries(channel.expectedAuthHeaders).forEach(([key, value]) => expect(createRequests[0]?.headers[key.toLowerCase()]).toBe(value));
    expect(requestContainsReference(createRequests[0])).toBe(referenceRequired);
    if (queryPath && taskId) expect(fixture.requests.some((request) => request.method === "GET" && request.path === upstreamPath(channel.upstreamBaseUrl, queryPath.replace(":model", model).replace(":task_id", taskId)))).toBe(true);
    expect(mocks.consumeUserPoints).toHaveBeenCalled();
}

function upstreamPath(baseUrl: string, path: string) {
    const base = new URL(baseUrl).pathname.replace(/\/+$/, "");
    const suffix = path.startsWith("/") ? path : `/${path}`;
    const baseVersion = base.match(/\/(v1|v1beta)$/i)?.[1];
    const normalizedSuffix = baseVersion ? suffix.replace(new RegExp(`^/${baseVersion}(?=/)`, "i"), "") : suffix;
    return `${base}${normalizedSuffix}` || "/";
}

function requestContainsReference(request: (typeof fixture.requests)[number] | undefined) {
    const body = request?.body.toString(request.contentType.includes("multipart/form-data") ? "latin1" : "utf8") || "";
    return /reference\.png|fixture\.png|iVBOR|input_reference|reference_images|image_urls|inlineData|image_url|"images"\s*:\s*\[\s*"http|"image"\s*:\s*\{/.test(body);
}

async function dispatchInternalRequest(input: string | URL | Request, init?: RequestInit) {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.slice(0, 3).join("/") !== "api/ai/system") return fetch(request);
    const channelId = decodeURIComponent(segments[3] || "");
    const path = segments.slice(4).map(decodeURIComponent);
    const context = { params: Promise.resolve({ channelId, path }) };
    if (request.method === "GET") return proxyGet(request, context);
    if (request.method === "HEAD") return proxyHead(request, context);
    if (request.method === "POST") return proxyPost(request, context);
    throw new Error(`Unsupported internal fixture method: ${request.method}`);
}

function normalizeModel(model: string) {
    return model
        .trim()
        .replace(/^models\//i, "")
        .toLowerCase();
}
