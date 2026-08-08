import { describe, expect, it } from "vitest";

import { generationPreferenceSummary } from "./creative-generation-preferences";

describe("generationPreferenceSummary", () => {
    it("keeps image, video and audio settings readable in one compact label", () => {
        expect(generationPreferenceSummary("image", {})).toBe("智能参数");
        expect(generationPreferenceSummary("video", { video: { size: "16:9", quality: "720", seconds: 10 } })).toBe("16:9 · 720P · 10秒");
        expect(generationPreferenceSummary("audio", { audio: { voice: "nova", format: "wav" } })).toBe("Nova · WAV");
    });
});
