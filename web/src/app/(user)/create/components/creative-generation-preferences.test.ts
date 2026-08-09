import { describe, expect, it } from "vitest";

import { generationPreferenceSummary, normalizeGenerationCount } from "./creative-generation-preferences";

describe("generationPreferenceSummary", () => {
    it("keeps image, video and audio settings readable in one compact label", () => {
        expect(generationPreferenceSummary("image", {})).toBe("智能参数");
        expect(generationPreferenceSummary("video", { video: { size: "16:9", quality: "720", seconds: 10, count: 3 } })).toBe("16:9 · 720P · 10秒 · 3条");
        expect(generationPreferenceSummary("image", { image: { size: "1024x1536", quality: "high", count: 2 } })).toBe("1024×1536 · 高画质 · 2张");
        expect(generationPreferenceSummary("audio", { audio: { voice: "nova", format: "wav" } })).toBe("Nova · WAV");
    });

    it("accepts custom generation counts within the server contract", () => {
        expect(normalizeGenerationCount("6")).toBe(6);
        expect(normalizeGenerationCount(10)).toBe(10);
        expect(normalizeGenerationCount("0")).toBe(0);
        expect(normalizeGenerationCount("11")).toBe(0);
        expect(normalizeGenerationCount("6份")).toBe(0);
    });
});
