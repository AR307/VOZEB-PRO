import { randomUUID } from "node:crypto";

import { expect, test, type Page, type TestInfo } from "@playwright/test";

type MediaType = "image" | "video";
type MediaSize = { width: number; height: number; label: string };

const IMAGE_SIZES: MediaSize[] = [
    { label: "1:1", width: 1024, height: 1024 },
    { label: "9:16", width: 720, height: 1280 },
    { label: "16:9", width: 1920, height: 1080 },
    { label: "超长图", width: 1000, height: 4000 },
];
const VIDEO_SIZES: MediaSize[] = [
    { label: "16:9", width: 1920, height: 1080 },
    { label: "9:16", width: 720, height: 1280 },
    { label: "1:1", width: 1024, height: 1024 },
];
const browserErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    browserErrors.set(page, errors);
    page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
        if (response.status() >= 400) errors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    });
});

test.afterEach(async ({ page }) => {
    expect(browserErrors.get(page) || []).toEqual([]);
});

test("image results shrink to their real 1:1, 9:16, 16:9 and long-image sizes", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "桌面尺寸矩阵由 1672×941 基准项目验证");
    await preparePage(page, testInfo);
    const expected = [
        { width: 420, height: 420 },
        { width: 300, height: 533 },
        { width: 560, height: 315 },
        { width: 320, height: 1280 },
    ];

    for (let index = 0; index < IMAGE_SIZES.length; index += 1) {
        const fixture = await mockCreativeRound(page, { type: "image", sizes: [IMAGE_SIZES[index]] });
        await page.goto(`/create?conversationId=${fixture.id}`, { waitUntil: "domcontentloaded" });
        const result = page.getByTestId("creative-media-result");
        const primary = result.getByTestId("creative-primary-result");
        await expect(primary).toBeVisible({ timeout: 45_000 });
        await expect(result.getByText("更多生成结果", { exact: true })).toHaveCount(0);
        await expect(result.getByTestId("creative-result-switcher")).toHaveCount(0);
        await expect(primary).toHaveAttribute("data-rendered-width", String(expected[index].width));
        await expect(primary).toHaveAttribute("data-rendered-height", String(expected[index].height));
        await expectTightMediaBounds(primary, expected[index]);
        await expectShrinkToFitShell(result, expected[index].width);
        await expectNoHorizontalOverflow(page);
        if (IMAGE_SIZES[index].label === "超长图") await captureVisibleResultSegments(page, primary, testInfo, "image-single-long");
        else await captureResult(result, testInfo, `image-single-${IMAGE_SIZES[index].label.replace(":", "-")}`);
    }
});

test("multiple image results share one switcher and actions follow the selected result", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "完整多结果交互在桌面基准项目验证");
    await preparePage(page, testInfo);
    const fixture = await mockCreativeRound(page, { type: "image", sizes: IMAGE_SIZES });
    await page.goto(`/create?conversationId=${fixture.id}`, { waitUntil: "domcontentloaded" });

    const round = page.getByTestId("creative-media-round");
    const result = round.getByTestId("creative-media-result");
    const primary = result.getByTestId("creative-primary-result");
    await expect(result).toBeVisible({ timeout: 45_000 });
    await expect(result.getByTestId("creative-result-switcher")).toHaveAttribute("data-results-count", "4");
    await expect(result.getByText("更多生成结果", { exact: true })).toBeVisible();
    await expect(primary).toHaveAttribute("data-rendered-width", "420");
    expect(fixture.repeatedRequests()).toHaveLength(0);

    await result.getByRole("button", { name: "查看生成结果 3" }).click();
    await expect(primary).toHaveAttribute("data-rendered-width", "560");
    await expect(primary).toHaveAttribute("data-rendered-height", "315");
    await expect(round.getByLabel("本轮创作操作", { exact: true })).toHaveAttribute("data-active-asset-id", fixture.assets[2].id);
    await captureResult(result, testInfo, "image-multiple-results");

    await result.getByRole("button", { name: "查看生成结果 4" }).click();
    await expect(primary).toHaveAttribute("data-rendered-width", "320");
    await expect(primary).toHaveAttribute("data-rendered-height", "1280");
    await expect(round.getByLabel("本轮创作操作", { exact: true })).toHaveAttribute("data-active-asset-id", fixture.assets[3].id);

    await round.getByRole("button", { name: "更多本轮创作操作" }).click();
    await page.getByText("在新窗口打开", { exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __lastOpenedUrl?: string }).__lastOpenedUrl)).toBe(fixture.assets[3].serverUrl);
    await expectNoHorizontalOverflow(page);

    await round.getByRole("button", { name: "再次生成" }).evaluate((button) => {
        (button as HTMLButtonElement).click();
        (button as HTMLButtonElement).click();
    });
    await expect.poll(() => fixture.repeatedRequests().length).toBe(1);
    expect(fixture.repeatedRequests()[0]).toMatchObject({
        prompt: fixture.prompt,
        modelIds: ["image-gen"],
        preferences: { mode: "image", image: { size: "1:1", quality: "high", count: 4 } },
    });
});

test("single video results keep real ratios and retain complete player controls", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "桌面视频尺寸矩阵由 1672×941 基准项目验证");
    await preparePage(page, testInfo);
    const expected = [
        { width: 520, height: 293 },
        { width: 300, height: 533 },
        { width: 420, height: 420 },
    ];

    for (let index = 0; index < VIDEO_SIZES.length; index += 1) {
        const fixture = await mockCreativeRound(page, { type: "video", sizes: [VIDEO_SIZES[index]] });
        await page.goto(`/create?conversationId=${fixture.id}`, { waitUntil: "domcontentloaded" });
        const result = page.getByTestId("creative-video-result");
        const primary = result.getByTestId("creative-primary-result");
        const player = result.getByTestId("creative-video-player");
        const video = player.locator("video").first();
        await expect(result).toBeVisible({ timeout: 45_000 });
        await video.evaluate((element) => element.dispatchEvent(new Event("loadedmetadata")));
        await expect(result.getByText("更多生成结果", { exact: true })).toHaveCount(0);
        await expect(result.getByTestId("creative-result-switcher")).toHaveCount(0);
        await expect(result.getByText(/视频亮点|镜头分镜|配乐氛围|文案摘要/)).toHaveCount(0);
        await expect(primary).toHaveAttribute("data-rendered-width", String(expected[index].width));
        await expect(primary).toHaveAttribute("data-rendered-height", String(expected[index].height));
        await expectTightMediaBounds(primary, expected[index]);
        await expectShrinkToFitShell(result, expected[index].width);
        await expect(video).toHaveAttribute("preload", "metadata");
        await expect(player.getByLabel("视频播放进度")).toBeVisible();
        await expect(player.getByLabel("静音")).toBeVisible();
        await expect(player.getByLabel("全屏播放")).toBeVisible();

        if (index === 0) {
            await player.getByRole("button", { name: "开始播放视频" }).click();
            await expect(player.getByRole("button", { name: "暂停视频" })).toBeVisible();
            await player.getByRole("button", { name: "暂停视频" }).click();
            await player.getByLabel("视频播放进度").fill("6");
            await expect(player.getByText("00:06 / 00:15", { exact: true })).toBeVisible();
            await player.getByLabel("静音").click();
            await expect(player.getByLabel("打开声音")).toBeVisible();
            await player.getByLabel("全屏播放").click();
            await expect.poll(() => page.evaluate(() => Number((window as unknown as { __fullscreenRequests?: number }).__fullscreenRequests || 0))).toBe(1);
        }
        await expectNoHorizontalOverflow(page);
        await captureResult(result, testInfo, `video-single-${VIDEO_SIZES[index].label.replace(":", "-")}`);
    }
});

test("natural media dimensions replace stale ratio metadata when persisted dimensions are missing", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "自然尺寸回退在桌面基准项目验证");
    await preparePage(page, testInfo);

    const imageFixture = await mockCreativeRound(page, { type: "image", sizes: [IMAGE_SIZES[1]], omitDimensions: true, reportedRatio: "1:1" });
    await page.goto(`/create?conversationId=${imageFixture.id}`, { waitUntil: "domcontentloaded" });
    const imageResult = page.getByTestId("creative-media-result");
    const imagePrimary = imageResult.getByTestId("creative-primary-result");
    await expect(imagePrimary).toHaveAttribute("data-rendered-width", "300", { timeout: 45_000 });
    await expect(imagePrimary).toHaveAttribute("data-rendered-height", "533");
    await expectTightMediaBounds(imagePrimary, { width: 300, height: 533 });
    await expectShrinkToFitShell(imageResult, 300);

    const videoFixture = await mockCreativeRound(page, { type: "video", sizes: [VIDEO_SIZES[0]], omitDimensions: true, reportedRatio: "1:1" });
    await page.goto(`/create?conversationId=${videoFixture.id}`, { waitUntil: "domcontentloaded" });
    const videoResult = page.getByTestId("creative-video-result");
    const videoPrimary = videoResult.getByTestId("creative-primary-result");
    const video = videoResult.getByTestId("creative-video-player").locator("video").first();
    await expect.poll(() => video.evaluate((element) => element.videoWidth / element.videoHeight), { timeout: 45_000 }).toBeCloseTo(16 / 9, 2);
    await expect(videoPrimary).toHaveAttribute("data-rendered-width", "520");
    await expect(videoPrimary).toHaveAttribute("data-rendered-height", "293");
    await expectTightMediaBounds(videoPrimary, { width: 520, height: 293 });
    await expectShrinkToFitShell(videoResult, 520);
    await expectNoHorizontalOverflow(page);
});

test("multiple videos switch src, poster and size while releasing the previous player", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "完整视频切换在桌面基准项目验证");
    await preparePage(page, testInfo);
    const fixture = await mockCreativeRound(page, { type: "video", sizes: [VIDEO_SIZES[0], VIDEO_SIZES[1]] });
    await page.goto(`/create?conversationId=${fixture.id}`, { waitUntil: "domcontentloaded" });

    const round = page.getByTestId("creative-media-round");
    const result = round.getByTestId("creative-video-result");
    const primary = result.getByTestId("creative-primary-result");
    const firstPlayer = result.getByTestId("creative-video-player");
    await expect(result).toBeVisible({ timeout: 45_000 });
    await firstPlayer.locator("video").evaluate((element) => element.dispatchEvent(new Event("loadedmetadata")));
    await firstPlayer.getByRole("button", { name: "开始播放视频" }).click();
    const pausesBeforeSwitch = await page.evaluate(() => Number((window as unknown as { __mediaPauseCalls?: number }).__mediaPauseCalls || 0));

    await result.getByRole("button", { name: "查看生成结果 2" }).click();
    const secondPlayer = result.getByTestId("creative-video-player");
    const secondVideo = secondPlayer.locator("video").first();
    await expect(secondVideo).toHaveAttribute("aria-label", fixture.assets[1].title);
    await expect(secondVideo).toHaveAttribute("src", fixture.assets[1].serverUrl!);
    await expect(secondVideo).toHaveAttribute("poster", fixture.assets[1].metadata.coverUrl as string);
    await expect(primary).toHaveAttribute("data-rendered-width", "300");
    await expect(primary).toHaveAttribute("data-rendered-height", "533");
    await expect(secondPlayer.getByText("00:00 / 00:15", { exact: true })).toBeVisible();
    await expect(round.getByLabel("本轮创作操作", { exact: true })).toHaveAttribute("data-active-asset-id", fixture.assets[1].id);
    await expect.poll(() => page.evaluate(() => Number((window as unknown as { __mediaPauseCalls?: number }).__mediaPauseCalls || 0))).toBeGreaterThan(pausesBeforeSwitch);
    await expect.poll(() => page.evaluate(() => Number((window as unknown as { __mediaLoadCalls?: number }).__mediaLoadCalls || 0))).toBeGreaterThan(0);
    await expect(result.getByText("更多生成结果", { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await captureResult(result, testInfo, "video-multiple-results");
});

test("failed media generation shows the real failure path without an empty result card", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "失败状态在桌面基准项目验证");
    await preparePage(page, testInfo);
    const fixture = await mockCreativeRound(page, { type: "image", sizes: [], failed: true });
    await page.goto(`/create?conversationId=${fixture.id}`, { waitUntil: "domcontentloaded" });

    const round = page.getByTestId("creative-media-round");
    await expect(round).toBeVisible({ timeout: 45_000 });
    await expect(round.getByTestId("creative-generation-failure")).toBeVisible();
    await expect(round.getByText("当前模型暂不可用，请切换模型或稍后重试。", { exact: true })).toBeVisible();
    await expect(round.getByText("仅在你确认后重新请求", { exact: true })).toBeVisible();
    await expect(round.getByRole("button", { name: "重新分析 图片生成" })).toHaveText("重新分析");
    await expect(round.getByText("已为你生成图片", { exact: true })).toHaveCount(0);
    await expect(round.getByTestId("creative-primary-result")).toHaveCount(0);
    await expect(round.getByText("更多生成结果", { exact: true })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await captureResult(round, testInfo, "generation-failed");
});

test("partial image and video runs keep every successful result visible with a failed-task retry", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "部分成功结果由桌面基准项目验证");
    await preparePage(page, testInfo);

    for (const type of ["image", "video"] as const) {
        const fixture = await mockCreativeRound(page, { type, sizes: type === "image" ? IMAGE_SIZES.slice(0, 2) : VIDEO_SIZES.slice(0, 2), partialFailure: true });
        await page.goto(`/create?conversationId=${fixture.id}`, { waitUntil: "domcontentloaded" });
        const round = page.getByTestId("creative-media-round");
        const result = round.getByTestId(type === "image" ? "creative-media-result" : "creative-video-result");

        await expect(result).toBeVisible({ timeout: 45_000 });
        await expect(result).toHaveAttribute("data-results-count", "2");
        await expect(result.getByTestId("creative-result-switcher")).toHaveAttribute("data-results-count", "2");
        await expect(round.getByRole("button", { name: `重试 ${type === "image" ? "图片" : "视频"}生成` })).toBeVisible();
        await expectNoHorizontalOverflow(page);
        await captureResult(round, testInfo, `${type}-partial-results`);
    }
});

test("result layouts remain contained at 390px and 430px", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "chromium", "移动端项目覆盖窄屏回归");
    await preparePage(page, testInfo);

    for (const type of ["image", "video"] as const) {
        const fixture = await mockCreativeRound(page, { type, sizes: type === "image" ? IMAGE_SIZES : [VIDEO_SIZES[1], VIDEO_SIZES[0]] });
        await page.goto(`/create?conversationId=${fixture.id}`, { waitUntil: "domcontentloaded" });
        const result = page.getByTestId(type === "image" ? "creative-media-result" : "creative-video-result");
        const primary = result.getByTestId("creative-primary-result");
        await expect(primary).toBeVisible({ timeout: 45_000 });
        const bounds = await primary.evaluate((element) => element.getBoundingClientRect().toJSON());
        expect(bounds.width).toBeLessThanOrEqual(page.viewportSize()!.width);
        expect(bounds.width / bounds.height).toBeCloseTo(type === "image" ? 1 : 9 / 16, 1);
        await expectNoHorizontalOverflow(page);
    }
});

async function preparePage(page: Page, testInfo: TestInfo) {
    if (testInfo.project.name === "chromium") await page.setViewportSize({ width: 1672, height: 941 });
    await page.route(/\/api\/public\/gallery(?:\?.*)?$/, (route) => route.fulfill({ json: { code: 0, data: { items: [] }, msg: "OK" } }));
    await page.route(/\/api\/notifications\/interactions(?:\?.*)?$/, (route) => route.fulfill({ json: { code: 0, data: { items: [], unreadCount: 0 }, msg: "OK" } }));
    await installBrowserSpies(page);
}

async function mockCreativeRound(page: Page, options: { type: MediaType; sizes: MediaSize[]; failed?: boolean; partialFailure?: boolean; omitDimensions?: boolean; reportedRatio?: string }) {
    const id = `e2e-result-${randomUUID()}`;
    const runId = `e2e-run-${randomUUID()}`;
    const timestamp = Date.now();
    const prompt = options.type === "image" ? `生成 ${Math.max(1, options.sizes.length)} 张商业主视觉` : `生成 ${Math.max(1, options.sizes.length)} 条产品短视频`;
    const assets = [] as Array<Record<string, unknown>>;

    for (let index = 0; index < options.sizes.length; index += 1) {
        const size = options.sizes[index];
        const serverUrl = options.type === "image" ? imageDataUrl(size, index) : await createVideoDataUrl(page, size, index);
        const coverUrl = imageDataUrl(size, index + 10);
        assets.push({
            id: `${options.type}-asset-${randomUUID()}`,
            userId: "e2e-user",
            conversationId: id,
            messageId: `assistant-${runId}`,
            sourceRunId: runId,
            sourceTaskId: `${options.type}-task-${index + 1}`,
            ordinal: index,
            type: options.type,
            status: "ready",
            title: `${options.type === "image" ? "图片" : "视频"}结果 ${index + 1}`,
            serverUrl,
            remoteUrl: serverUrl,
            mimeType: options.type === "image" ? "image/svg+xml" : "video/webm",
            ...(options.omitDimensions ? {} : { width: size.width, height: size.height }),
            durationMs: options.type === "video" ? 15_000 : undefined,
            metadata: { coverUrl, ratio: options.reportedRatio || `${size.width}:${size.height}` },
            createdAt: timestamp + index + 1,
            updatedAt: timestamp + index + 1,
        });
    }

    const userMessage = { id: `user-${runId}`, conversationId: id, runId, sequence: 1, role: "user", status: "completed", content: prompt, metadata: {}, createdAt: timestamp, updatedAt: timestamp };
    const assistantMessage = {
        id: `assistant-${runId}`,
        conversationId: id,
        runId,
        sequence: 2,
        role: "assistant",
        status: options.failed ? "failed" : "completed",
        content: options.failed ? "当前模型暂不可用，请切换模型或稍后重试。" : `${options.type === "image" ? "图片" : "视频"}已生成。`,
        metadata: {},
        createdAt: timestamp + 1,
        updatedAt: timestamp + 1,
    };
    const conversation = { id, userId: "e2e-user", surface: "chat", source: "agent", title: prompt, status: "active", contextSummary: "", contextSummaryThroughSequence: 0, createdAt: timestamp, updatedAt: timestamp, lastMessageAt: timestamp };
    const primarySize = options.sizes[0] || (options.type === "image" ? IMAGE_SIZES[0] : VIDEO_SIZES[0]);
    const tasks = options.failed
        ? [{ id: `${options.type}-task`, title: options.type === "image" ? "图片生成" : "视频生成", type: options.type, model: `${options.type}-gen`, count: 1, status: "failed", error: "当前模型暂不可用，请切换模型或稍后重试。" }]
        : options.partialFailure
          ? [
                {
                    id: `${options.type}-task`,
                    title: options.type === "image" ? "图片生成" : "视频生成",
                    type: options.type,
                    model: `${options.type}-gen`,
                    count: options.sizes.length + 1,
                    status: "failed",
                    error: "部分结果生成失败",
                    childTasks: [
                        ...assets.map((asset, index) => ({ id: `${options.type}-child-${index + 1}`, status: "completed", attempt: 1, result: { serverUrl: asset.serverUrl } })),
                        { id: `${options.type}-child-failed`, status: "failed", attempt: 1, error: "上游拒绝了一个结果" },
                    ],
                },
            ]
          : options.type === "image"
            ? [{ id: "image-task", title: "生成图片", type: "image", model: "image-gen", ratio: options.reportedRatio || primarySize.label, quality: "high", count: Math.max(1, options.sizes.length), status: "completed" }]
            : options.sizes.map((size, index) => ({ id: `video-task-${index + 1}`, title: "生成视频", type: "video", model: "video-gen", ratio: options.reportedRatio || size.label, quality: "high", seconds: 15, count: 1, status: "completed" }));
    const run = {
        id: runId,
        conversationId: id,
        inputMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        status: options.failed ? "failed" : "completed",
        prompt,
        referencedAssetIds: [],
        requestedModelIds: [`${options.type}-gen`],
        generationPreferences:
            options.type === "image" ? { mode: "image", image: { size: options.reportedRatio || primarySize.label, quality: "high" } } : { mode: "video", video: { size: options.reportedRatio || primarySize.label, quality: "high", seconds: 15 } },
        assetIds: assets.map((asset) => asset.id),
        tasks,
        createdAt: timestamp,
        updatedAt: timestamp,
    };
    const repeatedRun = {
        ...run,
        id: `repeat-${runId}`,
        inputMessageId: `repeat-user-${runId}`,
        assistantMessageId: `repeat-assistant-${runId}`,
        status: "running",
        assetIds: [],
        tasks: [],
    };
    const repeatedRequests: Array<Record<string, unknown>> = [];

    await page.route(new RegExp(`/api/creative/conversations/${id}$`), (route) => route.fulfill({ json: { code: 0, data: { conversation }, msg: "OK" } }));
    await page.route(new RegExp(`/api/creative/conversations/${id}/messages(?:\\?.*)?$`), (route) => route.fulfill({ json: { code: 0, data: { messages: [userMessage, assistantMessage] }, msg: "OK" } }));
    await page.route(new RegExp(`/api/creative/conversations/${id}/assets$`), (route) => route.fulfill({ json: { code: 0, data: { assets }, msg: "OK" } }));
    await page.route(new RegExp(`/api/agent/runs/${runId}$`), (route) => route.fulfill({ json: { code: 0, data: { run }, msg: "OK" } }));
    await page.route(new RegExp(`/api/agent/runs/${repeatedRun.id}/events(?:\\?.*)?$`), (route) =>
        route.fulfill({
            status: 200,
            contentType: "text/event-stream",
            body: `event: run.completed\ndata: ${JSON.stringify({ data: { reply: "再次生成已完成" } })}\n\n`,
        }),
    );
    await page.route(/\/api\/agent\/runs$/, async (route) => {
        if (route.request().method() !== "POST") return route.fallback();
        repeatedRequests.push((await route.request().postDataJSON()) as Record<string, unknown>);
        return route.fulfill({ json: { code: 0, data: { run: repeatedRun, created: true }, msg: "OK" } });
    });
    return { id, prompt, assets, repeatedRequests: () => repeatedRequests };
}

function imageDataUrl(size: MediaSize, index: number) {
    const hue = (210 + index * 37) % 360;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="hsl(${hue} 55% 40%)"/><stop offset="1" stop-color="hsl(${(hue + 55) % 360} 70% 78%)"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${size.width * 0.5}" cy="${Math.min(size.height * 0.35, size.width)}" r="${Math.max(32, size.width * 0.18)}" fill="rgba(255,255,255,.72)"/><text x="50%" y="${Math.min(size.height * 0.72, size.height - 40)}" text-anchor="middle" fill="white" font-family="sans-serif" font-size="${Math.max(24, size.width * 0.07)}">VOZEB ${size.label}</text></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

async function createVideoDataUrl(page: Page, size: MediaSize, index: number) {
    await page.goto("about:blank");
    return page.evaluate(
        async ({ width, height, index: frameIndex }) => {
            const scale = Math.min(1, 640 / Math.max(width, height));
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(180, Math.round(width * scale));
            canvas.height = Math.max(180, Math.round(height * scale));
            const context = canvas.getContext("2d")!;
            const stream = canvas.captureStream(12);
            const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8" });
            const chunks: Blob[] = [];
            recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
            const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
            recorder.start();
            for (let frame = 0; frame < 6; frame += 1) {
                const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
                gradient.addColorStop(0, `hsl(${215 + frameIndex * 30 + frame * 2} 42% 32%)`);
                gradient.addColorStop(1, `hsl(${38 + frameIndex * 25 + frame * 2} 58% 70%)`);
                context.fillStyle = gradient;
                context.fillRect(0, 0, canvas.width, canvas.height);
                context.fillStyle = "rgba(255,255,255,.82)";
                context.beginPath();
                context.arc(canvas.width * (0.28 + frame * 0.08), canvas.height * 0.45, Math.max(24, Math.min(canvas.width, canvas.height) * 0.16), 0, Math.PI * 2);
                context.fill();
                await new Promise((resolve) => setTimeout(resolve, 45));
            }
            recorder.stop();
            await stopped;
            stream.getTracks().forEach((track) => track.stop());
            const bytes = new Uint8Array(await new Blob(chunks, { type: "video/webm" }).arrayBuffer());
            let binary = "";
            bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
            return `data:video/webm;base64,${btoa(binary)}`;
        },
        { width: size.width, height: size.height, index },
    );
}

async function installBrowserSpies(page: Page) {
    await page.addInitScript(() => {
        const states = new WeakMap<HTMLMediaElement, { paused: boolean; currentTime: number }>();
        const state = (media: HTMLMediaElement) => {
            const current = states.get(media) || { paused: true, currentTime: 0 };
            states.set(media, current);
            return current;
        };
        Object.defineProperty(HTMLMediaElement.prototype, "paused", {
            configurable: true,
            get() {
                return state(this).paused;
            },
        });
        Object.defineProperty(HTMLMediaElement.prototype, "currentTime", {
            configurable: true,
            get() {
                return state(this).currentTime;
            },
            set(value: number) {
                state(this).currentTime = Number(value) || 0;
            },
        });
        Object.defineProperty(HTMLMediaElement.prototype, "duration", {
            configurable: true,
            get() {
                return 15;
            },
        });
        HTMLMediaElement.prototype.play = function () {
            state(this).paused = false;
            this.dispatchEvent(new Event("play"));
            return Promise.resolve();
        };
        HTMLMediaElement.prototype.pause = function () {
            (window as unknown as { __mediaPauseCalls?: number }).__mediaPauseCalls = Number((window as unknown as { __mediaPauseCalls?: number }).__mediaPauseCalls || 0) + 1;
            state(this).paused = true;
            this.dispatchEvent(new Event("pause"));
        };
        HTMLMediaElement.prototype.load = function () {
            (window as unknown as { __mediaLoadCalls?: number }).__mediaLoadCalls = Number((window as unknown as { __mediaLoadCalls?: number }).__mediaLoadCalls || 0) + 1;
        };
        Element.prototype.requestFullscreen = async function () {
            (window as unknown as { __fullscreenRequests?: number }).__fullscreenRequests = Number((window as unknown as { __fullscreenRequests?: number }).__fullscreenRequests || 0) + 1;
        };
        document.exitFullscreen = async () => undefined;
        window.open = ((url?: string | URL) => {
            (window as unknown as { __lastOpenedUrl?: string }).__lastOpenedUrl = String(url || "");
            return null;
        }) as typeof window.open;
    });
}

async function expectTightMediaBounds(primary: ReturnType<Page["getByTestId"]>, expected: { width: number; height: number }) {
    const [card, media] = await Promise.all([
        primary.evaluate((element) => element.getBoundingClientRect().toJSON()),
        primary
            .locator("img, video")
            .first()
            .evaluate((element) => element.getBoundingClientRect().toJSON()),
    ]);
    expect(Math.abs(card.width - expected.width)).toBeLessThanOrEqual(2);
    expect(Math.abs(card.height - expected.height)).toBeLessThanOrEqual(2);
    expect(card.width - media.width).toBeLessThanOrEqual(3);
    expect(card.height - media.height).toBeLessThanOrEqual(3);
}

async function expectShrinkToFitShell(result: ReturnType<Page["getByTestId"]>, mediaWidth: number) {
    const [shell, primary, actions] = await Promise.all([
        result.evaluate((element) => element.getBoundingClientRect().toJSON()),
        result.getByTestId("creative-primary-result").evaluate((element) => element.getBoundingClientRect().toJSON()),
        result.getByLabel("本轮创作操作", { exact: true }).evaluate((element) => element.getBoundingClientRect().toJSON()),
    ]);
    const expectedShellWidth = Math.max(mediaWidth, 352);
    expect(Math.abs(shell.width - expectedShellWidth)).toBeLessThanOrEqual(2);
    expect(Math.abs(actions.width - expectedShellWidth)).toBeLessThanOrEqual(2);
    expect(Math.abs(primary.width - mediaWidth)).toBeLessThanOrEqual(2);
}

async function captureResult(locator: ReturnType<Page["getByTestId"]>, testInfo: TestInfo, name: string) {
    if (process.env.VOZEB_PRO_VISUAL_CAPTURE !== "1") return;
    const path = testInfo.outputPath(`${name}-${testInfo.project.name}.png`);
    await locator.screenshot({ path });
    await testInfo.attach(name, { path, contentType: "image/png" });
}

async function captureVisibleResultSegments(page: Page, locator: ReturnType<Page["getByTestId"]>, testInfo: TestInfo, name: string) {
    if (process.env.VOZEB_PRO_VISUAL_CAPTURE !== "1") return;
    for (const block of ["start", "end"] as const) {
        await locator.evaluate((element, position) => element.scrollIntoView({ block: position, inline: "nearest" }), block);
        await page.waitForTimeout(120);
        const [bounds, composerBounds] = await Promise.all([locator.boundingBox(), page.locator(".creative-composer").first().boundingBox()]);
        const viewport = page.viewportSize();
        if (!bounds || !viewport) continue;
        const x = Math.max(0, bounds.x);
        const y = Math.max(0, bounds.y);
        const right = Math.min(viewport.width, bounds.x + bounds.width);
        const bottom = Math.min(viewport.height, bounds.y + bounds.height, composerBounds?.y ? composerBounds.y - 8 : viewport.height);
        if (right <= x || bottom <= y) continue;
        const path = testInfo.outputPath(`${name}-${block}-${testInfo.project.name}.png`);
        await page.screenshot({ path, clip: { x, y, width: right - x, height: bottom - y } });
        await testInfo.attach(`${name}-${block}`, { path, contentType: "image/png" });
    }
}

async function expectNoHorizontalOverflow(page: Page) {
    const widths = await page.evaluate(() => ({ document: [document.documentElement.clientWidth, document.documentElement.scrollWidth], body: [document.body.clientWidth, document.body.scrollWidth] }));
    expect(widths.document[1], JSON.stringify(widths)).toBeLessThanOrEqual(widths.document[0] + 1);
    expect(widths.body[1], JSON.stringify(widths)).toBeLessThanOrEqual(widths.body[0] + 1);
}
