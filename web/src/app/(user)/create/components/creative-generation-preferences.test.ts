import { describe, expect, it } from "vitest";

import { normalizePositiveInteger, normalizePositiveNumber, normalizeVideoQuality } from "./creative-generation-preference-fields";
import { generationPreferenceSummary, normalizeGenerationCount } from "./creative-generation-preferences";

describe("generationPreferenceSummary", () => {
    it("keeps image, video and audio settings readable in one compact label", () => {
        expect(generationPreferenceSummary("image", {})).toBe("智能参数");
        expect(generationPreferenceSummary("video", { video: { size: "16:9", quality: "2160", seconds: 60, count: 3, generateAudio: false, watermark: true } })).toBe("16:9 · 2160P · 60秒 · 无声 · 带水印 · 3条");
        expect(generationPreferenceSummary("image", { image: { size: "1024x1536", quality: "high", count: 2 } })).toBe("1024×1536 · 高画质 · 2张");
        expect(generationPreferenceSummary("audio", { audio: { voice: "nova", format: "wav", speed: 1.25 } })).toBe("Nova · WAV · 1.25x");
        expect(generationPreferenceSummary("video", {})).toBe("智能参数 · 5秒 · 有声 · 无水印");
    });

    it("accepts custom generation counts within the server contract", () => {
        expect(normalizeGenerationCount("6")).toBe(6);
        expect(normalizeGenerationCount(10)).toBe(10);
        expect(normalizeGenerationCount("0")).toBe(0);
        expect(normalizeGenerationCount("11")).toBe(0);
        expect(normalizeGenerationCount("6份")).toBe(0);
    });

    it("accepts open-ended video and audio values without inventing capability ceilings", () => {
        expect(normalizeVideoQuality(" 8K ")).toBe("8K");
        expect(normalizePositiveInteger(60)).toBe(60);
        expect(normalizePositiveInteger(1.5)).toBe(0);
        expect(normalizePositiveNumber(8)).toBe(8);
        expect(normalizePositiveNumber(0)).toBe(0);
    });
});
