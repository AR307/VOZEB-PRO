import { describe, expect, it } from "vitest";

import { normalizeCanvasImageDecomposition } from "./canvas-image-decomposition";

describe("canvas image decomposition", () => {
    it("keeps ecommerce products, copy, logos, badges and decorations as separate layers", () => {
        const result = normalizeCanvasImageDecomposition(
            {
                backgroundDescription: "蓝色渐变背景",
                backgroundPreservedVisuals: ["柔和渐变", "环境光影"],
                layers: [
                    layer("product", "商品组合", 220, 180, 480, 600, 3),
                    layer("headline", "主标题", 40, 40, 500, 100, 5),
                    layer("logo", "品牌 Logo", 820, 40, 120, 80, 7),
                    layer("badge", "促销角标", 760, 240, 180, 160, 6),
                    layer("decoration", "棉花装饰", 20, 540, 200, 300, 1),
                ],
            },
            1000,
            1000,
        );

        expect(result?.layers.map((item) => item.kind)).toEqual(["decoration", "product", "headline", "badge", "logo"]);
        expect(result?.backgroundDescription).toBe("蓝色渐变背景");
        expect(result?.backgroundPreservedVisuals).toEqual(["柔和渐变", "环境光影"]);
    });

    it("clamps model boxes to source pixels and removes exact duplicates across categories", () => {
        const result = normalizeCanvasImageDecomposition(
            {
                layers: [layer("product", "商品", -10, 20, 80, 120, 1), layer("foreground", "重复商品", 0, 20, 70, 120, 2)],
            },
            100,
            100,
        );

        expect(result?.layers).toHaveLength(1);
        expect(result?.layers[0].bbox).toEqual({ x: 0, y: 20, width: 70, height: 80 });
    });

    it("rejects a whole-poster box masquerading as one foreground layer", () => {
        expect(normalizeCanvasImageDecomposition({ layers: [layer("product", "整张海报", 0, 0, 1000, 1000, 1)] }, 1000, 1000)).toBeNull();
    });

    it("treats a missing preserved-visual list as empty at the untrusted model boundary", () => {
        expect(normalizeCanvasImageDecomposition({ layers: [layer("product", "商品", 20, 20, 60, 60, 1)] }, 100, 100)?.backgroundPreservedVisuals).toEqual([]);
    });

    it("drops a whole-poster box without hiding the valid independent layers", () => {
        const result = normalizeCanvasImageDecomposition(
            {
                layers: [layer("foreground", "整张海报", 0, 0, 1000, 1000, 0), layer("logo", "品牌 Logo", 800, 40, 120, 80, 1)],
            },
            1000,
            1000,
        );

        expect(result?.layers).toEqual([expect.objectContaining({ kind: "logo", bbox: { x: 800, y: 40, width: 120, height: 80 } })]);
    });
});

function layer(kind: string, name: string, x: number, y: number, width: number, height: number, zIndex: number) {
    return { id: `${kind}-${zIndex}`, kind, name, bbox: { x, y, width, height }, zIndex, confidence: 0.9 };
}
