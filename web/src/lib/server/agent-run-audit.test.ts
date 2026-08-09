import { describe, expect, it } from "vitest";

import { AGENT_PLAN_SCHEMA_VERSION, buildAgentRunPlannerAudit } from "./agent-run-audit";

describe("Agent Run audit snapshot", () => {
    it("keeps the actual planner route, billing and immutable Skill metadata", () => {
        expect(
            buildAgentRunPlannerAudit({
                mode: "model",
                logicalModelId: "planner",
                channelId: "planner-backup",
                upstreamModel: "vendor/planner-v2",
                protocol: "chat",
                elapsedMs: 1234,
                pointsCost: 1.25,
                pointsRecordId: "points-plan",
                skills: [
                    {
                        id: "skill-one",
                        name: "商品视觉",
                        description: "测试",
                        instructions: "测试",
                        enabled: true,
                        keywords: [],
                        sourceVersion: "1.2.0",
                        sourceCommit: "abcdef",
                        sourceContentHash: "hash",
                    },
                ],
            }),
        ).toEqual({
            schemaVersion: AGENT_PLAN_SCHEMA_VERSION,
            mode: "model",
            logicalModelId: "planner",
            channelId: "planner-backup",
            upstreamModel: "vendor/planner-v2",
            protocol: "chat",
            elapsedMs: 1234,
            pointsCost: 1.25,
            pointsRecordId: "points-plan",
            skills: [{ id: "skill-one", name: "商品视觉", sourceVersion: "1.2.0", sourceCommit: "abcdef", sourceContentHash: "hash" }],
        });
    });
});
