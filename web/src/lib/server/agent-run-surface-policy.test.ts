import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS } from "@/lib/auth/store-foundation";

import { agentPlannerInput, buildAgentPlannerInput, compactCanvasSnapshot, plannerAgentSkills, selectAgentSkills } from "./agent-run-surface-policy";
import { filterAgentPlannerModels, resolveAgentPlanningProfile } from "./agent-run-planning-profile";

describe("selectAgentSkills", () => {
    it("honors an explicitly selected compatible skill without keyword text", () => {
        const skills = selectAgentSkills(DEFAULT_SETTINGS, "chat", ["character-design"]);
        expect(skills.map((skill) => skill.id)).toContain("character-design");
    });

    it("does not allow a planner response to enable an unselected Skill", () => {
        expect(selectAgentSkills(DEFAULT_SETTINGS, "chat", [])).toEqual([]);
    });

    it("does not allow disabled or incompatible skills to be forced", () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            agentSkills: DEFAULT_SETTINGS.agentSkills.map((skill) => (skill.id === "character-design" ? { ...skill, enabled: false } : skill)),
        };
        expect(selectAgentSkills(settings, "chat", ["character-design"])).toEqual([]);
        expect(selectAgentSkills(DEFAULT_SETTINGS, "canvas", ["image-motion"])).toEqual([]);
    });

    it("keeps drama skills inside drama projects", () => {
        expect(selectAgentSkills(DEFAULT_SETTINGS, "drama", ["drama-planning"]).map((skill) => skill.id)).toEqual(["drama-planning"]);
        expect(selectAgentSkills(DEFAULT_SETTINGS, "drama", ["image-motion"])).toEqual([]);
    });
});

describe("agentPlannerInput", () => {
    it("keeps selected Canvas nodes, one-hop relations and exact size while dropping unrelated nodes", () => {
        const snapshot = {
            projectId: "canvas-one",
            title: "商品画布",
            imageSize: "1:1",
            selectedNodeIds: ["selected"],
            nodes: [
                { id: "config", type: "config", title: "配置", metadata: { size: "400x600" } },
                { id: "selected", type: "image", title: "当前商品", metadata: { url: "/api/reference-assets/current", naturalWidth: 400, naturalHeight: 600 } },
                { id: "related", type: "text", title: "关联文案", metadata: { content: "红色包装" } },
                { id: "unrelated", type: "image", title: "旧图片", metadata: { url: "/api/reference-assets/old" } },
            ],
            connections: [{ id: "edge", fromNodeId: "related", toNodeId: "selected" }],
            viewport: { x: 100, y: 200, k: 0.5 },
        };

        const compact = compactCanvasSnapshot(snapshot);

        expect(compact).toMatchObject({ projectId: "canvas-one", imageSize: "1:1", selectedNodeIds: ["selected"] });
        expect(compact.nodes.map((node) => node.id)).toEqual(["config", "selected", "related"]);
        expect(compact.nodes[0]).toMatchObject({ metadata: { size: "400x600" } });
        expect(compact).not.toHaveProperty("viewport");
    });

    it("enforces message, asset and Skill planner budgets without sending full instructions", () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            agentSkills: [
                {
                    id: "skill-one",
                    name: "商品技能",
                    description: "商品规划摘要",
                    plannerSummary: "精简规划说明".repeat(40),
                    instructions: "完整执行说明".repeat(1000),
                    enabled: true,
                    keywords: [],
                    workspaces: ["canvas" as const],
                },
            ],
        };
        const recentMessages = Array.from({ length: 10 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", content: String(index).repeat(1200), sequence: index + 1 }));
        const assets = Array.from({ length: 9 }, (_, index) => ({ id: `asset-${index}`, type: "text", title: `素材 ${index}`, textContent: "素材正文".repeat(500), metadata: {} }));
        const input = agentPlannerInput(
            { surface: "canvas", prompt: "生成商品图", snapshot: { selectedNodeIds: [], nodes: [], connections: [] }, selectedSkillIds: ["skill-one"] } as never,
            { summary: "长期摘要".repeat(2000), summaryThroughSequence: 0, recentMessages } as never,
            assets as never,
            "conversation-memory-candidates",
            settings.agentSkills,
            [{ id: "image", name: "图片", capability: "image" }],
            settings,
        ) as Record<string, unknown>;
        const context = input.conversationContext as { summary: string; recentMessages: Array<{ content: string; sequence: number }> };
        const skill = (input.availableSkills as Array<Record<string, unknown>>)[0];

        expect(context.summary.length).toBeLessThanOrEqual("长期摘要".repeat(2000).length);
        expect(context.recentMessages.length).toBeGreaterThan(0);
        expect(context.recentMessages.at(-1)?.sequence).toBe(10);
        expect((input.referencedAssets as unknown[]).length).toBeGreaterThan(0);
        expect(String(skill.plannerSummary)).toBe("精简规划说明".repeat(40).slice(0, String(skill.plannerSummary).length));
        expect(String(skill.plannerSummary).length).toBeLessThanOrEqual(240);
        expect(skill).not.toHaveProperty("instructions");
        expect(JSON.stringify(input).length).toBeLessThanOrEqual(12_000);
        expect(input.planningBudget).toEqual({ complexity: "ordinary", maxOutputTokens: 1200 });
    });

    it("keeps a required model at the end of configuration and records actual omissions", () => {
        const tailModelId = `tail-${"x".repeat(60)}`;
        const models = Array.from({ length: 300 }, (_, index) => ({ id: index === 299 ? tailModelId : `model-${index}-${"x".repeat(60)}`, name: `模型 ${index} ${"名称".repeat(120)}`, capability: "image" }));
        const settings = { ...DEFAULT_SETTINGS, defaultModels: { ...DEFAULT_SETTINGS.defaultModels, imageModel: tailModelId } };

        const { input, summary } = buildAgentPlannerInput(
            { surface: "chat", prompt: "生成一张商品图", referencedAssetIds: [], selectedSkillIds: [], requestedModelIds: [], assetIds: [], status: "planning", tasks: [] } as never,
            { summary: "", summaryThroughSequence: 0, recentMessages: [] } as never,
            [],
            "none",
            [],
            models,
            settings,
        );
        const keptIds = (input.availableModels as Array<{ id: string }>).map((model) => model.id);

        expect(keptIds[0]).toBe(tailModelId);
        expect(keptIds).toContain(tailModelId);
        expect(summary.kept.modelIds).toContain(tailModelId);
        expect(summary.omitted.modelIds.length).toBeGreaterThan(0);
        expect(summary.serializedChars).toBeLessThanOrEqual(summary.maxInputChars);
    });

    it("keeps current-turn asset identities ahead of memory candidates under the same character budget", () => {
        const assets = Array.from({ length: 40 }, (_, index) => ({
            id: `asset-${index}`,
            type: "image",
            title: `素材 ${index} ${"标题".repeat(80)}`,
            textContent: "素材正文".repeat(200),
            remoteUrl: `https://cdn.example.com/${index}/${"path".repeat(40)}.png`,
            metadata: {},
        }));
        const run = { surface: "chat", prompt: "根据参考图生成商品海报", referencedAssetIds: assets.map((asset) => asset.id), selectedSkillIds: [], assetIds: [], status: "planning", tasks: [] } as never;
        const common = [{ id: "image", name: "图片", capability: "image" }];
        const explicit = buildAgentPlannerInput(run, { summary: "", summaryThroughSequence: 0, recentMessages: [] } as never, assets as never, "current-turn-explicit", [], common, DEFAULT_SETTINGS);
        const memory = buildAgentPlannerInput(run, { summary: "", summaryThroughSequence: 0, recentMessages: [] } as never, assets as never, "conversation-memory-candidates", [], common, DEFAULT_SETTINGS);

        expect(explicit.summary.kept.assetIds).toEqual(assets.map((asset) => asset.id));
        expect(explicit.summary.kept.assetIds.length).toBeGreaterThan(memory.summary.kept.assetIds.length);
        expect(explicit.summary.serializedChars).toBeLessThanOrEqual(explicit.summary.maxInputChars);
    });

    it("uses larger bounded budgets only for multi-output and complex project planning", () => {
        expect(resolveAgentPlanningProfile({ surface: "chat", prompt: "生成四张角色图" })).toMatchObject({ complexity: "multi", maxInputChars: 22_000, maxOutputTokens: 1600 });
        expect(resolveAgentPlanningProfile({ surface: "drama", prompt: "继续当前项目" })).toMatchObject({ complexity: "complex", maxInputChars: 32_000, maxOutputTokens: 2400 });
    });

    it("prefilters models by request capability while preserving real text planning", () => {
        const models = ["text", "image", "video", "audio"].map((capability) => ({ id: capability, capability }));
        expect(filterAgentPlannerModels(models, { surface: "chat", prompt: "你好，你能做什么" }).map((item) => item.capability)).toEqual(["text"]);
        expect(filterAgentPlannerModels(models, { surface: "chat", prompt: "生成一张商品海报" }).map((item) => item.capability)).toEqual(["text", "image"]);
        expect(filterAgentPlannerModels(models, { surface: "chat", prompt: "让这张图动起来，生成视频" }).map((item) => item.capability)).toEqual(["text", "image", "video"]);
        expect(filterAgentPlannerModels(models, { surface: "chat", prompt: "做一个作品", generationPreferences: { mode: "audio" } }).map((item) => item.capability)).toEqual(["text", "audio"]);
    });

    it("only exposes explicitly selected Skills to the planner", () => {
        expect(plannerAgentSkills(DEFAULT_SETTINGS, { surface: "chat", selectedSkillIds: [] })).toEqual([]);
        expect(plannerAgentSkills(DEFAULT_SETTINGS, { surface: "chat", selectedSkillIds: ["image-motion"] }).map((skill) => skill.id)).toEqual(["image-motion"]);
        expect(plannerAgentSkills(DEFAULT_SETTINGS, { surface: "chat", selectedSkillIds: ["image-motion", "character-design"] }).map((skill) => skill.id)).toEqual(["image-motion", "character-design"]);
    });
});
