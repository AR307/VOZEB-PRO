"use client";

import type { Psd } from "ag-psd";

export type CanvasPsdLayer = {
    name: string;
    dataUrl: string;
    x: number;
    y: number;
    width: number;
    height: number;
    visible?: boolean;
};

export type CanvasPsdPixelLayer = Omit<CanvasPsdLayer, "dataUrl"> & {
    pixels: Uint8ClampedArray;
};

export async function encodeCanvasPsd(layers: CanvasPsdLayer[], width: number, height: number) {
    validateDocument(layers, width, height);
    const pixelLayers = await Promise.all(layers.map(renderLayer));
    const bytes = await encodePsdPixelLayers(pixelLayers, width, height);
    return new Blob([bytes], { type: "image/vnd.adobe.photoshop" });
}

export async function encodePsdPixelLayers(layers: CanvasPsdPixelLayer[], width: number, height: number) {
    validateDocument(layers, width, height);
    layers.forEach((layer) => {
        if (layer.pixels.length !== layer.width * layer.height * 4) throw new Error(`图层“${layer.name}”像素数据不完整`);
    });

    const { writePsd } = await import("ag-psd");
    const psd: Psd = {
        width,
        height,
        imageData: { data: compositePixelLayers(layers, width, height), width, height },
        children: layers.map((layer) => ({
            name: layer.name,
            top: Math.round(layer.y),
            left: Math.round(layer.x),
            hidden: layer.visible === false,
            imageData: { data: layer.pixels, width: layer.width, height: layer.height },
        })),
    };
    return new Uint8Array(writePsd(psd, { noBackground: true }));
}

async function renderLayer(layer: CanvasPsdLayer): Promise<CanvasPsdPixelLayer> {
    const image = await loadImage(layer.dataUrl);
    const width = Math.max(1, Math.round(layer.width));
    const height = Math.max(1, Math.round(layer.height));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器不支持 PSD 导出");
    context.drawImage(image, 0, 0, width, height);
    return { ...layer, x: Math.round(layer.x), y: Math.round(layer.y), width, height, pixels: context.getImageData(0, 0, width, height).data };
}

function compositePixelLayers(layers: CanvasPsdPixelLayer[], width: number, height: number) {
    const target = new Uint8ClampedArray(width * height * 4);
    for (const layer of [...layers].reverse()) {
        if (layer.visible === false) continue;
        const left = Math.round(layer.x);
        const top = Math.round(layer.y);
        for (let sourceY = 0; sourceY < layer.height; sourceY += 1) {
            const targetY = top + sourceY;
            if (targetY < 0 || targetY >= height) continue;
            for (let sourceX = 0; sourceX < layer.width; sourceX += 1) {
                const targetX = left + sourceX;
                if (targetX < 0 || targetX >= width) continue;
                blendPixel(target, (targetY * width + targetX) * 4, layer.pixels, (sourceY * layer.width + sourceX) * 4);
            }
        }
    }
    return target;
}

function blendPixel(target: Uint8ClampedArray, targetOffset: number, source: Uint8ClampedArray, sourceOffset: number) {
    const sourceAlpha = source[sourceOffset + 3] / 255;
    if (sourceAlpha <= 0) return;
    const targetAlpha = target[targetOffset + 3] / 255;
    const outputAlpha = sourceAlpha + targetAlpha * (1 - sourceAlpha);
    for (let channel = 0; channel < 3; channel += 1) {
        target[targetOffset + channel] = Math.round((source[sourceOffset + channel] * sourceAlpha + target[targetOffset + channel] * targetAlpha * (1 - sourceAlpha)) / outputAlpha);
    }
    target[targetOffset + 3] = Math.round(outputAlpha * 255);
}

function validateDocument(layers: Array<Pick<CanvasPsdLayer, "name">>, width: number, height: number) {
    if (!layers.length || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error("没有可导出的图片图层");
}

function loadImage(dataUrl: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("图片读取失败，无法导出 PSD"));
        image.src = dataUrl;
    });
}
