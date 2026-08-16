import { initializeCanvas, readPsd } from "ag-psd";
import { beforeAll, describe, expect, it } from "vitest";

import { encodePsdPixelLayers } from "./canvas-psd";

describe("Canvas PSD 导出", () => {
    beforeAll(() => {
        initializeCanvas(
            (width, height) =>
                ({
                    width,
                    height,
                    getContext: () => ({ createImageData: (nextWidth: number, nextHeight: number) => ({ width: nextWidth, height: nextHeight, data: new Uint8ClampedArray(nextWidth * nextHeight * 4) }) }),
                }) as unknown as HTMLCanvasElement,
        );
    });

    it("写入标准 PSD、中文图层名、位置和透明通道", async () => {
        const subject = new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 128]);
        const background = new Uint8ClampedArray([0, 255, 0, 255, 0, 255, 0, 0, 0, 255, 0, 255, 0, 255, 0, 255]);
        const file = await encodePsdPixelLayers(
            [
                { name: "主体", x: 1, y: 0, width: 2, height: 1, pixels: subject },
                { name: "背景", x: 0, y: 0, width: 2, height: 2, pixels: background },
            ],
            3,
            2,
        );
        const psd = readPsd(file, { useImageData: true, skipThumbnail: true });

        expect(new TextDecoder().decode(file.slice(0, 4))).toBe("8BPS");
        expect(psd).toMatchObject({ width: 3, height: 2 });
        expect(psd.children?.map((layer) => layer.name)).toEqual(["主体", "背景"]);
        expect(psd.children?.[0]).toMatchObject({ left: 1, top: 0, right: 3, bottom: 1, hidden: false });
        expect(Array.from(psd.children?.[0]?.imageData?.data || [])).toEqual(Array.from(subject));
        expect(psd.children?.[1]?.imageData?.data[7]).toBe(0);
    });
});
