import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Drama project Agent references", () => {
    it("renders uploaded references above the user message text", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/drama/[id]/drama-agent-panel.tsx"), "utf8");
        const messageSource = source.slice(source.indexOf("messages.map((message)"), source.indexOf("<div ref={endRef}"));

        expect(messageSource).toContain("messageAssetIds(message)");
        expect(messageSource.indexOf("<DramaMessageReferences")).toBeLessThan(messageSource.indexOf("{displayContent}"));
    });

    it("reuses the original request snapshot when an initial submission is retried", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/drama/[id]/drama-agent-panel.tsx"), "utf8");

        expect(source).toContain("clientRequestId: submission.clientRequestId");
        expect(source).toContain("failedSubmissionsRef.current.get(assistantMessageId)");
        expect(source).toContain('aria-label="重试本次项目 Agent 请求"');
        expect(source).toContain("metadata: { assetIds }");
        expect(source).toMatch(/messageAssetIds\(message\)\s*\.filter/);
    });

    it("offers stage-aware actions and keeps the project snapshot semantic without arbitrary array slicing", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/drama/[id]/drama-agent-panel.tsx"), "utf8");
        const snapshotSource = source.slice(source.indexOf("function dramaSnapshot"), source.indexOf("function agentAssetDownloads"));

        expect(source).toContain("DRAMA_AGENT_STAGE_GUIDES");
        expect(source).toContain("检查阶段完成度");
        expect(source).toContain("检查缺失资产");
        expect(source).toContain("检查一致性");
        expect(source).toContain("建议下一步");
        expect(source).toContain("currentStage: stage");
        expect(source).toContain("agentAssetSnapshot");
        expect(source).toContain('styles={{ wrapper: { maxWidth: "100vw" }, body: { padding: 0 } }}');
        expect(source).toContain("建议不会自动修改项目");
        expect(source).toContain("data-drama-agent-quick-actions");
        expect(source).toContain("grid-cols-2");
        expect(source).toContain("data-drama-agent-loading");
        expect(source).toContain("data-drama-agent-empty");
        const quickActions = source.slice(source.indexOf("data-drama-agent-quick-actions"), source.indexOf("data-drama-agent-loading"));
        expect(quickActions).not.toContain("overflow-x-auto");
        expect(snapshotSource).not.toContain(".slice(");
    });
});
