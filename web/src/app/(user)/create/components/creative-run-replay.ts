import type { CreativeGenerationPreferences } from "@/lib/creative-runtime-contract";
import type { CreativeAgentRun } from "@/services/api/creative";

export function creativeRunReplayPreferences(run?: CreativeAgentRun): CreativeGenerationPreferences | undefined {
    if (!run) return undefined;
    const preferences = run.generationPreferences;
    const imageCounts = run.tasks
        .filter((task) => task.type === "image")
        .map((task) => Number(task.count))
        .filter((count) => Number.isInteger(count) && count > 0);
    if (!imageCounts.length) return preferences;
    return {
        ...preferences,
        image: {
            ...preferences?.image,
            count: Math.min(10, Math.max(...imageCounts)),
        },
    };
}
