import { describe, expect, it } from "vitest";

import { splitImageDataLayers } from "./canvas-image-data";

describe("Canvas 智能分层", () => {
    it("将边缘连通背景与中心主体拆成透明图层", () => {
        const data = new Uint8ClampedArray(3 * 3 * 4);
        for (let index = 0; index < 9; index += 1) data.set(index === 4 ? [0, 0, 0, 255] : [255, 255, 255, 255], index * 4);
        const result = splitImageDataLayers({ data, width: 3, height: 3, colorSpace: "srgb" } as ImageData);

        expect(result.removedPixels).toBe(8);
        expect(result.foreground[3]).toBe(0);
        expect(result.foreground[4 * 4 + 3]).toBe(255);
        expect(result.background[3]).toBe(255);
        expect(result.background[4 * 4 + 3]).toBe(0);
    });
});
