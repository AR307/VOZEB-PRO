import { describe, expect, it } from "vitest";

import type { CreativeAgentRun } from "@/services/api/creative";

import { creativeRunReplayPreferences } from "./creative-run-replay";

describe("creativeRunReplayPreferences", () => {
    it("preserves the actual image task count for edit and regenerate", () => {
        expect(creativeRunReplayPreferences(run({ generationPreferences: { image: { size: "1:1", quality: "high" } }, tasks: [task("image", 4)] }))).toEqual({ image: { size: "1:1", quality: "high", count: 4 } });
    });

    it("does not invent video batch support", () => {
        const preferences = { mode: "video" as const, video: { size: "16:9", seconds: 5 } };
        expect(creativeRunReplayPreferences(run({ generationPreferences: preferences, tasks: [task("video", 1)] }))).toEqual(preferences);
    });
});

function run(patch: Partial<CreativeAgentRun>): CreativeAgentRun {
    return { id: "run-one", conversationId: "conversation-one", inputMessageId: "user-one", assistantMessageId: "assistant-one", status: "completed", assetIds: [], tasks: [], ...patch };
}

function task(type: "image" | "video", count: number): CreativeAgentRun["tasks"][number] {
    return { id: `${type}-one`, title: type, type, count, status: "completed" };
}
