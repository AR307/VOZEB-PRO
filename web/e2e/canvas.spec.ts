import { randomUUID } from "node:crypto";

import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("canvas keeps editing, selection, linking and persistence fluid", async ({ page, request }) => {
    const project = await createCanvasProject(request, {
        title: `Canvas 交互回归 ${randomUUID().slice(0, 8)}`,
        viewport: { x: 100, y: 110, k: 1 },
        nodes: [node("text-source", "text", 60, 100, 240, 170, { content: "创作方向" }), node("config-target", "config", 380, 100, 280, 210, { size: "1280x720", composerContent: "" }), node("image-target", "image", 200, 360, 260, 200, {})],
        connections: [],
    });

    try {
        const projectPath = `/api/canvas/projects/${project.id}`;
        const patchRequests: number[] = [];
        page.on("request", (request) => {
            if (request.method() === "PATCH" && new URL(request.url()).pathname === projectPath) patchRequests.push(Date.now());
        });

        await page.goto(`/canvas/${project.id}`, { waitUntil: "domcontentloaded" });
        const surface = page.locator("[data-canvas-surface]");
        await expect(surface).toBeVisible({ timeout: 20_000 });
        await expect(surface).toHaveCSS("background-color", "rgb(255, 255, 255)");

        const configNode = page.locator('[data-node-id="config-target"]');
        await expect.poll(async () => (await configNode.boundingBox())!.height).toBeLessThanOrEqual(182);
        const initialConfigBox = await configNode.boundingBox();
        expect(initialConfigBox).not.toBeNull();
        const generationModeButton = configNode.getByRole("button", { name: "切换生成类型，当前生图" });
        await expect(generationModeButton).toBeVisible();
        await generationModeButton.click();
        await expect(page.getByRole("menuitem", { name: "视频" })).toBeVisible();
        await page.getByRole("menuitem", { name: "视频" }).click();
        await expect(configNode.getByRole("button", { name: "切换生成类型，当前视频" })).toBeVisible();
        await expect(configNode.locator(".canvas-composer-model-picker")).not.toHaveAttribute("title", "gpt-image-2");
        const configDetailsToggle = configNode.getByRole("button", { name: "展开输入与镜头" });
        await expect(configDetailsToggle).toBeVisible();
        await expect(configNode.locator("[data-canvas-config-details]")).toHaveCount(0);
        await configDetailsToggle.click();
        await expect(configNode.getByRole("button", { name: "收起输入与镜头" })).toBeVisible();
        await expect(configNode.locator("[data-canvas-config-details]")).toBeVisible();
        await expect.poll(async () => (await configNode.boundingBox())!.height).toBeGreaterThan(initialConfigBox!.height + 40);
        await configNode.getByRole("button", { name: "收起输入与镜头" }).click();
        await expect(configNode.locator("[data-canvas-config-details]")).toHaveCount(0);
        await expect.poll(async () => (await configNode.boundingBox())!.height).toBeLessThanOrEqual(182);
        await configNode.click({ position: { x: 36, y: 36 } });
        const composer = page.locator('[contenteditable="true"]');
        await expect(composer).toBeVisible();
        await expect.poll(() => composer.evaluate((element) => document.activeElement === element)).toBe(true);
        const composerPatchCount = patchRequests.length;
        await composer.fill("单击即可输入并保存");
        await expect.poll(() => patchRequests.length).toBeGreaterThan(composerPatchCount);
        await expect(page.getByLabel("画布已保存")).toBeVisible();

        await page.reload({ waitUntil: "domcontentloaded" });
        const restoredConfigNode = page.locator('[data-node-id="config-target"]');
        await expect.poll(async () => (await restoredConfigNode.boundingBox())!.height).toBeLessThanOrEqual(182);
        await restoredConfigNode.click({ position: { x: 36, y: 36 } });
        await expect(composer).toHaveText("单击即可输入并保存");
        await expect.poll(() => composer.evaluate((element) => document.activeElement === element)).toBe(true);
        await page.getByRole("button", { name: "关闭提示词组装" }).click();

        const imageNode = page.locator('[data-node-id="image-target"]');
        await imageNode.click({ position: { x: 36, y: 36 } });
        const nodePrompt = page.getByRole("textbox", { name: "节点提示词" });
        await expect(nodePrompt).toBeVisible();
        await expect.poll(() => nodePrompt.evaluate((element) => document.activeElement === element)).toBe(true);
        await nodePrompt.fill("放大编辑后仍然同步");
        await page.getByRole("button", { name: "放大提示词输入" }).click();
        const promptDialog = page.getByRole("dialog", { name: "编辑提示词" });
        const expandedPrompt = promptDialog.getByRole("textbox", { name: "提示词编辑器" });
        await expect(promptDialog).toBeVisible();
        await expect(promptDialog.locator(".ant-modal-body")).toHaveCSS("background-color", "rgb(255, 255, 255)");
        await expect(promptDialog.locator('[data-canvas-prompt-editor="expanded"]')).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
        await expect(expandedPrompt).toHaveCSS("background-color", "rgb(238, 246, 251)");
        await expect(promptDialog.locator(".ant-modal-footer")).toHaveCount(0);
        await expect(expandedPrompt).toHaveValue("放大编辑后仍然同步");
        await expect.poll(() => expandedPrompt.evaluate((element) => document.activeElement === element)).toBe(true);
        await expandedPrompt.fill("弹窗中的长提示词会实时回写原输入框");
        await promptDialog.getByRole("button", { name: "收起提示词输入" }).click();
        await expect(promptDialog).toBeHidden();
        await expect(nodePrompt).toHaveValue("弹窗中的长提示词会实时回写原输入框");

        await page.getByRole("button", { name: "切换到框选模式" }).click();
        await expect(surface).toHaveAttribute("data-canvas-interaction-mode", "select");
        await dragSelectionBox(page, page.locator("[data-node-id]"));
        await expectSelectedNodeCount(page, 3);

        const temporaryPanNodeBox = await configNode.boundingBox();
        const temporaryPanViewport = await readCanvasViewport(request, projectPath);
        expect(temporaryPanNodeBox).not.toBeNull();
        await surface.focus();
        await page.keyboard.down("Space");
        await expect(surface).toHaveAttribute("data-canvas-temporary-pan", "true");
        await page.mouse.move(temporaryPanNodeBox!.x + 80, temporaryPanNodeBox!.y + 60);
        await page.mouse.down();
        await page.mouse.move(temporaryPanNodeBox!.x + 140, temporaryPanNodeBox!.y + 95, { steps: 6 });
        await page.mouse.up();
        await page.keyboard.up("Space");
        await expect(surface).toHaveAttribute("data-canvas-temporary-pan", "false");
        await expect(surface).toHaveAttribute("data-canvas-interaction-mode", "select");
        await expect.poll(async () => (await readCanvasViewport(request, projectPath)).x).toBeGreaterThan(temporaryPanViewport.x + 40);
        const temporaryPanNodeAfter = await configNode.boundingBox();
        expect(temporaryPanNodeAfter!.x - temporaryPanNodeBox!.x).toBeGreaterThan(40);
        expect(temporaryPanNodeAfter!.x - temporaryPanNodeBox!.x).toBeLessThan(80);

        const sourceNode = page.locator('[data-node-id="text-source"]');
        await sourceNode.click();
        await page.keyboard.down("Control");
        await page.locator('[data-node-id="config-target"]').click({ position: { x: 36, y: 36 } });
        await page.keyboard.up("Control");
        await expectSelectedNodeCount(page, 2);

        await dragConnection(page, sourceNode, sourceNode);
        await expect(page.locator("[data-connection-create-menu]")).toHaveCount(0);

        await dragConnection(page, sourceNode, page.locator('[data-node-id="config-target"]'));
        await expect(page.locator("[data-connection-id]")).toHaveCount(1);

        const surfaceBounds = await surface.boundingBox();
        expect(surfaceBounds).not.toBeNull();
        await dragConnectionToPoint(page, sourceNode, surfaceBounds!.x + surfaceBounds!.width - 70, surfaceBounds!.y + surfaceBounds!.height - 70);
        const createMenu = page.locator("[data-connection-create-menu]");
        await expect(createMenu).toBeVisible();
        await createMenu.getByRole("button", { name: /图片生成/ }).click();
        await expect(page.locator("[data-connection-id]")).toHaveCount(2);
        await expect(page.locator("[data-node-id]")).toHaveCount(4);
        await page.waitForTimeout(500);
        await expect(page.getByLabel("画布已保存")).toBeVisible();

        patchRequests.length = 0;
        const beforeDrag = await sourceNode.boundingBox();
        expect(beforeDrag).not.toBeNull();
        const dragStart = { x: beforeDrag!.x + beforeDrag!.width / 2, y: beforeDrag!.y + beforeDrag!.height - 28 };
        await page.mouse.move(dragStart.x, dragStart.y);
        await page.mouse.down();
        await page.mouse.move(dragStart.x + 90, dragStart.y + 45, { steps: 8 });
        await page.waitForTimeout(400);
        expect(patchRequests).toHaveLength(0);
        await page.mouse.up();
        await expect.poll(() => patchRequests.length).toBe(1);
        await expect(page.getByLabel("画布已保存")).toBeVisible();
        const afterDrag = await sourceNode.boundingBox();
        expect(afterDrag!.x).toBeGreaterThan(beforeDrag!.x + 70);

        const resizeHandle = sourceNode.locator('[data-canvas-resize-corner="bottom-right"]');
        const handleBounds = await resizeHandle.boundingBox();
        const beforeResize = await sourceNode.boundingBox();
        expect(handleBounds).not.toBeNull();
        await page.mouse.move(handleBounds!.x + handleBounds!.width / 2, handleBounds!.y + handleBounds!.height / 2);
        await page.mouse.down();
        await page.mouse.move(handleBounds!.x + 75, handleBounds!.y + 45, { steps: 6 });
        await page.mouse.up();
        await expect.poll(async () => (await sourceNode.boundingBox())!.width).toBeGreaterThan(beforeResize!.width + 40);
        await expect.poll(() => patchRequests.length).toBeGreaterThan(1);
        await expect(page.getByLabel("画布已保存")).toBeVisible();

        await page.keyboard.down("Control");
        await imageNode.click({ position: { x: 36, y: 36 } });
        await page.keyboard.up("Control");
        await expectSelectedNodeCount(page, 2);
        await page.getByRole("button", { name: "切换到小手模式" }).click();
        await expect(surface).toHaveAttribute("data-canvas-interaction-mode", "pan");
        await expectSelectedNodeCount(page, 2);
        const copyPatchCount = patchRequests.length;
        await page.keyboard.press("Control+c");
        await page.keyboard.press("Control+v");
        await expect.poll(() => patchRequests.length).toBeGreaterThan(copyPatchCount);
        await expect(page.getByLabel("画布已保存")).toBeVisible();
        await expect.poll(() => readCanvasNodeCount(request, projectPath)).toBe(6);
    } finally {
        await deleteCanvasProject(request, project.id);
    }
});

test("canvas video first and last frame roles persist and retry from the output snapshot", async ({ page, request }) => {
    test.setTimeout(120_000);
    const project = await createCanvasProject(request, {
        title: `Canvas 首尾帧 ${randomUUID().slice(0, 8)}`,
        viewport: { x: 36, y: 110, k: 1 },
        nodes: [
            { ...node("first-frame", "image", 430, 60, 220, 150, { content: "https://cdn.example.com/canvas-first.webp", remoteUrl: "https://cdn.example.com/canvas-first.webp", naturalWidth: 1280, naturalHeight: 720 }), title: "首帧图片" },
            { ...node("last-frame", "image", 430, 260, 220, 150, { content: "https://cdn.example.com/canvas-last.webp", remoteUrl: "https://cdn.example.com/canvas-last.webp", naturalWidth: 1280, naturalHeight: 720 }), title: "尾帧图片" },
            node("video-config", "config", 20, 90, 300, 180, { generationMode: "video", composerContent: "让画面从清晨平滑过渡到黄昏", size: "1280x720", seconds: "5", vquality: "720" }),
        ],
        connections: [
            { id: "first-frame-edge", fromNodeId: "first-frame", toNodeId: "video-config" },
            { id: "last-frame-edge", fromNodeId: "last-frame", toNodeId: "video-config" },
        ],
    });
    const submitted: Array<{ prompt: string; references: Array<{ type: string; role: string; url: string }>; clientRequestId: string }> = [];

    await page.addInitScript(() => {
        if (!localStorage.getItem("vozeb-pro:theme_store")) localStorage.setItem("vozeb-pro:theme_store", JSON.stringify({ state: { theme: "light" }, version: 0 }));
    });
    await page.route("**/api/video-generation-tasks", async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        const body = route.request().postDataJSON() as { prompt: string; references: Array<{ type: string; role: string; url: string }>; config?: { model?: string } };
        submitted.push({ prompt: body.prompt, references: body.references, clientRequestId: route.request().headers()["x-vozeb-pro-client-request-id"] || "" });
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ task: { id: `canvas-video-task-${submitted.length}`, model: body.config?.model || "video-v1", durationSeconds: 5 } }) });
    });
    await page.route("**/api/video-tasks/**", async (route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ task: { status: "error", error: "E2E 视频上游失败", canRetry: true } }) });
    });

    try {
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.goto(`/canvas/${project.id}`, { waitUntil: "domcontentloaded" });
        await expect(page.locator("[data-canvas-surface]")).toBeVisible({ timeout: 20_000 });
        const configNode = page.locator('[data-node-id="video-config"]');
        await expect(configNode).toBeVisible();

        let settingsTrigger = configNode.getByRole("button", { name: /^视频设置：/ });
        await settingsTrigger.click();
        let settings = page.locator("[data-canvas-video-reference-settings]");
        await expect(settings).toBeVisible();
        await settings.getByRole("button", { name: "视频参考模式：首尾帧" }).click();
        await settings.getByRole("button", { name: "设为视频首帧：首帧图片" }).click();
        await settings.getByRole("button", { name: "选择视频尾帧" }).click();
        await settings.getByRole("button", { name: "设为视频尾帧：尾帧图片" }).click();
        await expect(settings.getByText("首帧图片", { exact: true })).toBeVisible();
        await expect(settings.getByText("尾帧图片", { exact: true })).toBeVisible();
        settingsTrigger = configNode.getByRole("button", { name: /^视频设置：首尾帧/ });
        await settingsTrigger.click();
        await expect(settings).toBeHidden();

        await expect
            .poll(async () => {
                const stored = await readCanvasProject(request, `/api/canvas/projects/${project.id}`);
                return stored.nodes.find((item) => item.id === "video-config")?.metadata;
            })
            .toMatchObject({ videoReferenceMode: "first_last", videoFirstFrame: { nodeId: "first-frame" }, videoLastFrame: { nodeId: "last-frame" } });

        const collapseAgentPanel = page.getByRole("button", { name: "收起 Agent 面板" });
        if (await collapseAgentPanel.isVisible().catch(() => false)) {
            await collapseAgentPanel.click();
            await expect(collapseAgentPanel).toBeHidden();
        }

        for (const width of [390, 430]) {
            await page.setViewportSize({ width, height: width === 390 ? 844 : 932 });
            await settingsTrigger.click();
            await expect(settings).toBeVisible();
            const bounds = await settings.boundingBox();
            expect(bounds).not.toBeNull();
            expect(bounds!.x).toBeGreaterThanOrEqual(0);
            expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
            await expectNoHorizontalOverflow(page, `Canvas 首尾帧 ${width}px`);
            await settingsTrigger.click();
            await expect(settings).toBeHidden();
        }

        await page.setViewportSize({ width: 1280, height: 900 });
        await page.evaluate(() => localStorage.setItem("vozeb-pro:theme_store", JSON.stringify({ state: { theme: "dark" }, version: 0 })));
        await page.reload({ waitUntil: "domcontentloaded" });
        await expect(page.locator("html")).toHaveClass(/dark/);
        settingsTrigger = page.locator('[data-node-id="video-config"]').getByRole("button", { name: /^视频设置：首尾帧/ });
        await settingsTrigger.click();
        settings = page.locator("[data-canvas-video-reference-settings]");
        await expect(settings).toBeVisible();
        await expectNoHorizontalOverflow(page, "Canvas 首尾帧深色主题");
        await settingsTrigger.click();

        await page.locator('[data-node-id="video-config"]').getByRole("button", { name: "开始生成" }).click();
        await expect.poll(() => submitted.length).toBe(1);
        expect(submitted[0].references).toEqual([
            { type: "image", role: "first_frame", url: "https://cdn.example.com/canvas-first.webp" },
            { type: "image", role: "last_frame", url: "https://cdn.example.com/canvas-last.webp" },
        ]);
        const retryButton = page.getByRole("button", { name: "重试" });
        await expect(retryButton).toBeVisible({ timeout: 20_000 });

        settingsTrigger = page.locator('[data-node-id="video-config"]').getByRole("button", { name: /^视频设置：首尾帧/ });
        await settingsTrigger.click();
        settings = page.locator("[data-canvas-video-reference-settings]");
        await settings.getByRole("button", { name: "视频参考模式：普通参考" }).click();
        settingsTrigger = page.locator('[data-node-id="video-config"]').getByRole("button", { name: /^视频设置：普通参考/ });
        await settingsTrigger.click();
        await expect(settings).toBeHidden();

        await retryButton.click();
        await expect.poll(() => submitted.length).toBe(2);
        expect(submitted[1].prompt).toBe(submitted[0].prompt);
        expect(submitted[1].references).toEqual(submitted[0].references);
        expect(submitted[1].clientRequestId).not.toBe(submitted[0].clientRequestId);
        await expect
            .poll(async () => {
                const stored = await readCanvasProject(request, `/api/canvas/projects/${project.id}`);
                return stored.nodes.find((item) => item.type === "video")?.metadata?.videoReferences?.map((reference) => reference.role);
            })
            .toEqual(["first_frame", "last_frame"]);
    } finally {
        await deleteCanvasProject(request, project.id);
    }
});

test("canvas opens the Agent rail at the intended width and keeps a fresh chat after deletion", async ({ page, request }) => {
    const project = await createCanvasProject(request, {
        title: `Canvas Agent 面板 ${randomUUID().slice(0, 8)}`,
        nodes: [],
        connections: [],
        chatSessions: [
            {
                id: "agent-session",
                title: "待删除对话",
                messages: [{ id: "agent-message", role: "user", text: "删除后继续输入" }],
                createdAt: "2026-08-06T00:00:00.000Z",
                updatedAt: "2026-08-06T00:00:00.000Z",
            },
        ],
        activeChatId: "agent-session",
    });

    try {
        const projectPath = `/api/canvas/projects/${project.id}`;
        await page.setViewportSize({ width: 1474, height: 900 });
        await page.goto(`/canvas/${project.id}`, { waitUntil: "domcontentloaded" });

        const panel = page.getByLabel("Canvas Agent 对话面板");
        await expect(panel).toBeVisible({ timeout: 20_000 });
        await expect.poll(async () => Math.round((await panel.boundingBox())?.width || 0)).toBe(470);
        await expect(page.getByRole("button", { name: "Agent 对话", exact: true })).toHaveCount(0);

        await page.getByRole("tab", { name: /历史/ }).click();
        await page.getByRole("button", { name: "删除对话：待删除对话" }).click();
        const deleteDialog = page.getByRole("dialog", { name: "删除对话记录？" });
        await deleteDialog.getByRole("button", { name: /删\s*除/ }).click();

        await expect(page.getByRole("tab", { name: "对话", exact: true })).toHaveAttribute("aria-selected", "true");
        await expect(page.getByPlaceholder("描述你想让 Agent 如何操作画布")).toBeVisible();
        await expect(page.getByText("VOZEB PRO Canvas", { exact: true }).first()).toBeVisible();
        await expect.poll(() => readCanvasChatState(request, projectPath)).toEqual({ sessions: 1, messages: 0 });

        await page.getByRole("button", { name: "收起 Agent 面板" }).click();
        await expect(page.getByRole("button", { name: "Agent 对话", exact: true })).toBeVisible();
    } finally {
        await deleteCanvasProject(request, project.id);
    }
});

test("canvas remains operable with 2000 nodes and 5000 connections", async ({ page, request }, testInfo) => {
    test.setTimeout(120_000);
    const nodes = Array.from({ length: 2_000 }, (_, index) => node(`perf-node-${index}`, index % 9 === 0 ? "config" : "text", (index % 50) * 320, Math.floor(index / 50) * 240, 240, 160, { content: `节点 ${index}` }));
    const connections = Array.from({ length: 5_000 }, (_, index) => {
        const sourceIndex = (index * 17) % 2_000;
        let targetIndex = (index * 37 + 1) % 2_000;
        if (targetIndex === sourceIndex) targetIndex = (targetIndex + 1) % 2_000;
        return { id: `perf-edge-${index}`, fromNodeId: `perf-node-${sourceIndex}`, toNodeId: `perf-node-${targetIndex}` };
    });
    const project = await createCanvasProject(request, { title: `Canvas 性能回归 ${randomUUID().slice(0, 8)}`, viewport: { x: 80, y: 100, k: 1 }, nodes, connections });

    try {
        const startedAt = Date.now();
        await page.goto(`/canvas/${project.id}`, { waitUntil: "domcontentloaded" });
        await expect(page.locator("[data-canvas-surface]")).toBeVisible({ timeout: 20_000 });
        await expect(page.locator('[data-node-id="perf-node-0"]')).toBeVisible();
        const interactiveMs = Date.now() - startedAt;
        const renderedNodeCount = await page.locator("[data-node-id]").count();
        expect(renderedNodeCount).toBeGreaterThan(0);
        expect(renderedNodeCount).toBeLessThan(2_000);

        const surface = page.locator("[data-canvas-surface]");
        const bounds = await surface.boundingBox();
        expect(bounds).not.toBeNull();
        const navigationStartedAt = Date.now();
        await page.mouse.move(bounds!.x + bounds!.width - 35, bounds!.y + bounds!.height - 35);
        await page.mouse.down();
        await page.mouse.move(bounds!.x + bounds!.width - 155, bounds!.y + bounds!.height - 95, { steps: 8 });
        await page.mouse.up();
        await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        const navigationMs = Date.now() - navigationStartedAt;
        await page.waitForTimeout(500);
        await expect(page.getByLabel("画布已保存")).toBeVisible();

        const saveStartedAt = Date.now();
        const firstNode = page.locator('[data-node-id="perf-node-0"]');
        const firstBounds = await firstNode.boundingBox();
        expect(firstBounds).not.toBeNull();
        const patchRequest = page.waitForRequest((request) => request.method() === "PATCH" && new URL(request.url()).pathname === `/api/canvas/projects/${project.id}`);
        await page.mouse.move(firstBounds!.x + 80, firstBounds!.y + 16);
        await page.mouse.down();
        await page.mouse.move(firstBounds!.x + 125, firstBounds!.y + 41, { steps: 6 });
        await page.mouse.up();
        await patchRequest;
        await expect(page.getByLabel("画布已保存")).toBeVisible({ timeout: 10_000 });
        const saveMs = Date.now() - saveStartedAt;

        const metrics = { nodes: nodes.length, connections: connections.length, interactiveMs, navigationMs, saveMs, renderedNodeCount };
        await testInfo.attach("canvas-performance.json", { body: JSON.stringify(metrics, null, 2), contentType: "application/json" });
        expect(interactiveMs).toBeLessThan(20_000);
        expect(navigationMs).toBeLessThan(1_500);
        expect(saveMs).toBeLessThan(10_000);
    } finally {
        await deleteCanvasProject(request, project.id);
    }
});

test("canvas restores all nine node types and opens text editing on a single click", async ({ page, request }) => {
    const project = await createCanvasProject(request, {
        title: `Canvas 节点矩阵 ${randomUUID().slice(0, 8)}`,
        viewport: { x: 90, y: 80, k: 0.75 },
        nodes: [
            node("matrix-image", "image", 40, 80, 240, 180, { content: "/logo.svg", naturalWidth: 240, naturalHeight: 180 }),
            node("matrix-panorama", "panorama", 340, 80, 300, 150, { content: "/logo.svg", naturalWidth: 300, naturalHeight: 150 }),
            node("matrix-text", "text", 700, 80, 260, 180, { content: "单击编辑文本" }),
            node("matrix-config", "config", 1020, 80, 300, 180, { generationMode: "image", model: "" }),
            node("matrix-video", "video", 40, 360, 260, 170, { content: "/logo.svg", mimeType: "video/mp4" }),
            node("matrix-audio", "audio", 340, 360, 260, 150, { content: "/logo.svg", mimeType: "audio/mpeg" }),
            node("matrix-brief", "brief", 700, 340, 320, 210, { agentBrief: { objective: "节点矩阵目标" } }),
            node("matrix-task", "task", 40, 640, 300, 180, { prompt: "任务恢复内容", agentTaskStatus: "completed", agentTaskAttempts: 1 }),
            node("matrix-brand", "brand-kit", 420, 620, 320, 200, { brandKit: { summary: "品牌方向恢复" } }),
        ],
        connections: [],
    });

    try {
        await page.goto(`/canvas/${project.id}`, { waitUntil: "domcontentloaded" });
        await expect(page.locator("[data-canvas-surface]")).toBeVisible({ timeout: 20_000 });
        await expect.poll(async () => readCanvasViewport(request, `/api/canvas/projects/${project.id}`)).toEqual({ x: 90, y: 80, k: 0.75 });
        await expect(page.locator("[data-node-id]")).toHaveCount(9);
        await expect(page.locator('[data-node-id="matrix-brief"]').getByText("创作目标")).toBeVisible();
        await expect(page.locator('[data-node-id="matrix-brief"]').getByText("节点矩阵目标")).toBeVisible();
        await expect(page.locator('[data-node-id="matrix-task"]').getByText("任务恢复内容")).toBeVisible();
        await expect(page.locator('[data-node-id="matrix-brand"]').getByText("灵感与视觉方向")).toBeVisible();
        await expect(page.locator('[data-node-id="matrix-video"] video')).toBeVisible();
        await expect(page.locator('[data-node-id="matrix-audio"] audio')).toBeVisible();

        const textNode = page.locator('[data-node-id="matrix-text"]');
        await textNode.click({ position: { x: 50, y: 80 } });
        const textEditor = textNode.locator("textarea");
        await expect(textEditor).toBeVisible();
        await expect.poll(() => textEditor.evaluate((element) => document.activeElement === element)).toBe(true);
        await textEditor.fill("单击后立即可编辑");

        await page.reload({ waitUntil: "domcontentloaded" });
        await expect(page.locator('[data-node-id="matrix-text"]').getByText("单击后立即可编辑")).toBeVisible();
    } finally {
        await deleteCanvasProject(request, project.id);
    }
});

function node(id: string, type: string, x: number, y: number, width: number, height: number, metadata: Record<string, unknown>) {
    return { id, type, title: id, position: { x, y }, width, height, metadata };
}

async function createCanvasProject(request: APIRequestContext, project: Record<string, unknown>) {
    const response = await request.post("/api/canvas/projects", { data: { title: project.title, project } });
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { data: { project: { id: string } } }).data.project;
}

async function deleteCanvasProject(request: APIRequestContext, id: string) {
    const response = await request.delete("/api/canvas/projects", { data: { ids: [id] } });
    expect(response.ok(), await response.text()).toBe(true);
}

async function readCanvasNodeCount(request: APIRequestContext, path: string) {
    const response = await request.get(path);
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { data: { project: { nodes: unknown[] } } }).data.project.nodes.length;
}

async function readCanvasViewport(request: APIRequestContext, path: string) {
    const response = await request.get(path);
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { data: { project: { viewport: { x: number; y: number; k: number } } } }).data.project.viewport;
}

async function readCanvasProject(request: APIRequestContext, path: string) {
    const response = await request.get(path);
    expect(response.ok(), await response.text()).toBe(true);
    return (
        (await response.json()) as {
            data: {
                project: {
                    nodes: Array<{
                        id: string;
                        type: string;
                        metadata?: {
                            videoReferenceMode?: string;
                            videoFirstFrame?: { nodeId?: string };
                            videoLastFrame?: { nodeId?: string };
                            videoReferences?: Array<{ role: string }>;
                        };
                    }>;
                };
            };
        }
    ).data.project;
}

async function readCanvasChatState(request: APIRequestContext, path: string) {
    const response = await request.get(path);
    expect(response.ok(), await response.text()).toBe(true);
    const sessions = ((await response.json()) as { data: { project: { chatSessions: { messages: unknown[] }[] } } }).data.project.chatSessions;
    return { sessions: sessions.length, messages: sessions.reduce((count, session) => count + session.messages.length, 0) };
}

async function dragConnection(page: Page, sourceNode: Locator, targetNode: Locator) {
    const targetBounds = await targetNode.boundingBox();
    expect(targetBounds).not.toBeNull();
    await dragConnectionToPoint(page, sourceNode, targetBounds!.x + targetBounds!.width / 2, targetBounds!.y + targetBounds!.height / 2);
}

async function dragConnectionToPoint(page: Page, sourceNode: Locator, targetX: number, targetY: number) {
    await sourceNode.hover();
    const handle = sourceNode.locator('[data-canvas-handle="source"]');
    const bounds = await handle.boundingBox();
    expect(bounds).not.toBeNull();
    await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetX, targetY, { steps: 8 });
    await page.mouse.up();
}

async function dragSelectionBox(page: Page, nodes: Locator) {
    const boxes = await nodes.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect()).map(({ left, top, right, bottom }) => ({ left, top, right, bottom })));
    expect(boxes.length).toBeGreaterThan(0);
    const bounds = boxes.reduce((current, box) => ({ left: Math.min(current.left, box.left), top: Math.min(current.top, box.top), right: Math.max(current.right, box.right), bottom: Math.max(current.bottom, box.bottom) }), {
        left: Infinity,
        top: Infinity,
        right: -Infinity,
        bottom: -Infinity,
    });
    await page.mouse.move(bounds.left - 16, bounds.top - 16);
    await page.mouse.down();
    await page.mouse.move(bounds.right + 16, bounds.bottom + 16, { steps: 10 });
    await page.mouse.up();
}

async function expectSelectedNodeCount(page: Page, count: number) {
    await expect.poll(() => page.locator("[data-node-id] > div").evaluateAll((elements) => elements.filter((element) => getComputedStyle(element).borderColor === "rgb(47, 128, 255)").length)).toBe(count);
}

async function expectNoHorizontalOverflow(page: Page, label: string) {
    const widths = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(widths.scrollWidth, `${label} document overflow`).toBeLessThanOrEqual(widths.clientWidth + 1);
}
