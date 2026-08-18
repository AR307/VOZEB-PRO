import { describe, expect, it } from "vitest";

import { applySubjectMaskToImageData, scaleLayerBox } from "./canvas-image-data";

describe("Canvas 智能分层", () => {
    it("按语义蒙版保留浅色主体，不再根据主体与背景色差判断", () => {
        const data = new Uint8ClampedArray(3 * 3 * 4);
        for (let index = 0; index < 9; index += 1) data.set(index === 4 ? [242, 230, 222, 255] : [248, 239, 231, 255], index * 4);
        const result = applySubjectMaskToImageData({ data, width: 3, height: 3 }, { width: 3, height: 3, data: new Float32Array([0, 0, 0, 0.85, 1, 0.85, 0, 0.8, 0]) });

        expect(result.foregroundPixels).toBe(4);
        expect(result.backgroundPixels).toBe(5);
        expect(result.foreground[3]).toBe(0);
        expect(result.foreground[4 * 4 + 3]).toBe(255);
        expect(result.foreground[3 * 4 + 3]).toBeGreaterThan(200);
        expect(result.editMask[3]).toBe(255);
        expect(result.editMask[4 * 4 + 3]).toBe(0);
        expect(result.editMask[3 * 4 + 3]).toBeLessThan(50);
    });

    it("将低分辨率语义蒙版平滑重采样到原图尺寸", () => {
        const data = new Uint8ClampedArray(4 * 4 * 4).fill(255);
        const result = applySubjectMaskToImageData({ data, width: 4, height: 4 }, { width: 2, height: 2, data: new Float32Array([0, 1, 0, 1]) });

        expect(result.foreground[3]).toBe(0);
        expect(result.foreground[(4 - 1) * 4 + 3]).toBe(255);
        expect(result.foreground[1 * 4 + 3]).toBeGreaterThan(0);
        expect(result.foreground[1 * 4 + 3]).toBeLessThan(255);
    });

    it("按服务端原图坐标缩放电商元素边界且不裁掉边缘", () => {
        expect(scaleLayerBox({ x: 101, y: 51, width: 199, height: 99 }, 1000, 500, 500, 250)).toEqual({ x: 50, y: 25, width: 100, height: 50 });
        expect(scaleLayerBox({ x: 900, y: 450, width: 100, height: 50 }, 1000, 500, 333, 167)).toEqual({ x: 299, y: 150, width: 34, height: 17 });
    });
});
