"use client";

type ImageCropRect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export type CanvasImageLayerData = {
    foregroundDataUrl: string;
    backgroundDataUrl: string;
    width: number;
    height: number;
    removedPixels: number;
};

export type ImageUpscaleAlgorithm = "nearest" | "bilinear" | "high";

export const MAX_UPSCALE_LONG_EDGE = 4096;

export type ImageUpscaleParams = {
    targetLongEdge: number;
    algorithm: ImageUpscaleAlgorithm;
};

export type ImageSplitParams = {
    rows: number;
    columns: number;
};

type ImageSplitPiece = {
    row: number;
    column: number;
    dataUrl: string;
};

export async function cropDataUrl(dataUrl: string, crop?: ImageCropRect) {
    const image = await loadImage(dataUrl);
    if (crop) {
        return drawCrop(image, Math.floor(crop.x * image.width), Math.floor(crop.y * image.height), Math.ceil(crop.width * image.width), Math.ceil(crop.height * image.height));
    }
    const size = Math.min(image.width, image.height);
    const sx = Math.max(0, Math.floor((image.width - size) / 2));
    const sy = Math.max(0, Math.floor((image.height - size) / 2));
    return drawCrop(image, sx, sy, size, size);
}

export async function splitDataUrl(dataUrl: string, params: ImageSplitParams): Promise<ImageSplitPiece[]> {
    const image = await loadImage(dataUrl);
    const rows = Math.max(1, Math.floor(params.rows));
    const columns = Math.max(1, Math.floor(params.columns));
    const pieces: ImageSplitPiece[] = [];

    for (let row = 0; row < rows; row += 1) {
        const sy = Math.floor((row * image.height) / rows);
        const sh = Math.floor(((row + 1) * image.height) / rows) - sy;
        for (let column = 0; column < columns; column += 1) {
            const sx = Math.floor((column * image.width) / columns);
            const sw = Math.floor(((column + 1) * image.width) / columns) - sx;
            pieces.push({ row, column, dataUrl: drawCrop(image, sx, sy, sw, sh) });
        }
    }

    return pieces;
}

/**
 * Estimates the subject from the border colour and returns two transparent
 * layers. It is deliberately local: the source image never leaves the
 * browser and users can still refine the result with the existing mask tool.
 */
export async function splitSubjectAndBackgroundDataUrl(dataUrl: string): Promise<CanvasImageLayerData> {
    const image = await loadImage(dataUrl);
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("浏览器不支持图片处理");
    context.drawImage(image, 0, 0);
    const source = context.getImageData(0, 0, canvas.width, canvas.height);
    const { foreground, background: backgroundLayer, removedPixels } = splitImageDataLayers(source);
    return {
        foregroundDataUrl: imageDataUrl(foreground, canvas.width, canvas.height),
        backgroundDataUrl: imageDataUrl(backgroundLayer, canvas.width, canvas.height),
        width: canvas.width,
        height: canvas.height,
        removedPixels,
    };
}

export function splitImageDataLayers(source: ImageData) {
    const backgroundColour = sampleBorderColour(source);
    const removed = floodBorderBackground(source, backgroundColour);
    const foreground = new Uint8ClampedArray(source.data);
    const background = new Uint8ClampedArray(source.data);
    for (let index = 0; index < removed.length; index += 1) {
        const offset = index * 4 + 3;
        if (removed[index]) foreground[offset] = 0;
        else background[offset] = 0;
    }
    return { foreground, background, removedPixels: removed.reduce((count, value) => count + (value ? 1 : 0), 0) };
}

export async function upscaleDataUrl(dataUrl: string, params: ImageUpscaleParams) {
    const image = await loadImage(dataUrl);
    const { width, height } = resolveUpscaleSize(image.width, image.height, params.targetLongEdge);
    return params.algorithm === "high" ? drawStepUpscale(image, width, height) : drawResize(image, image.width, image.height, width, height, params.algorithm);
}

export function resolveUpscaleSize(width: number, height: number, targetLongEdge: number) {
    const longEdge = Math.max(1, width, height);
    const target = Math.min(MAX_UPSCALE_LONG_EDGE, Math.max(1, Math.round(targetLongEdge)));
    const scale = target / longEdge;
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function drawCrop(image: HTMLImageElement, sx: number, sy: number, sw: number, sh: number) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, sw);
    canvas.height = Math.max(1, sh);
    const context = canvas.getContext("2d");
    if (!context) return image.src;
    context.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
}

function drawStepUpscale(image: HTMLImageElement, width: number, height: number) {
    let source: CanvasImageSource = image;
    let sourceWidth = image.width;
    let sourceHeight = image.height;

    while (sourceWidth * 2 < width && sourceHeight * 2 < height) {
        const nextWidth = sourceWidth * 2;
        const nextHeight = sourceHeight * 2;
        const next = drawResizeCanvas(source, sourceWidth, sourceHeight, nextWidth, nextHeight, "high");
        source = next;
        sourceWidth = nextWidth;
        sourceHeight = nextHeight;
    }

    return drawResize(source, sourceWidth, sourceHeight, width, height, "high");
}

function drawResize(source: CanvasImageSource, sourceWidth: number, sourceHeight: number, width: number, height: number, algorithm: ImageUpscaleAlgorithm) {
    return drawResizeCanvas(source, sourceWidth, sourceHeight, width, height, algorithm).toDataURL("image/png");
}

function drawResizeCanvas(source: CanvasImageSource, sourceWidth: number, sourceHeight: number, width: number, height: number, algorithm: ImageUpscaleAlgorithm) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return canvas;
    context.imageSmoothingEnabled = algorithm !== "nearest";
    context.imageSmoothingQuality = algorithm === "bilinear" ? "medium" : "high";
    context.drawImage(source, 0, 0, sourceWidth, sourceHeight, 0, 0, width, height);
    return canvas;
}

function loadImage(dataUrl: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("图片读取失败，无法处理图像"));
        image.src = dataUrl;
    });
}

function sampleBorderColour(image: ImageData) {
    const points = [
        [0, 0],
        [image.width - 1, 0],
        [0, image.height - 1],
        [image.width - 1, image.height - 1],
    ];
    const values = points.map(([x, y]) => {
        const offset = (y * image.width + x) * 4;
        return [image.data[offset], image.data[offset + 1], image.data[offset + 2]];
    });
    return values[0].map((_, channel) => Math.round(values.reduce((sum, value) => sum + value[channel], 0) / values.length));
}

function floodBorderBackground(image: ImageData, background: number[]) {
    const total = image.width * image.height;
    const removed = new Uint8Array(total);
    const queued = new Uint8Array(total);
    const queue: number[] = [];
    for (let x = 0; x < image.width; x += 1) {
        queue.push(x, (image.height - 1) * image.width + x);
    }
    for (let y = 1; y < image.height - 1; y += 1) {
        queue.push(y * image.width, y * image.width + image.width - 1);
    }
    const tolerance = 58;
    for (const index of queue) queued[index] = 1;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const index = queue[cursor];
        const offset = index * 4;
        if (!isBackgroundPixel(image.data, offset, background, tolerance)) continue;
        removed[index] = 1;
        const x = index % image.width;
        const y = Math.floor(index / image.width);
        for (const next of [index - 1, index + 1, index - image.width, index + image.width]) {
            if (next < 0 || next >= total || queued[next]) continue;
            const nextX = next % image.width;
            if (Math.abs(nextX - x) > 1) continue;
            queued[next] = 1;
            queue.push(next);
        }
    }
    return removed;
}

function isBackgroundPixel(data: Uint8ClampedArray, offset: number, background: number[], tolerance: number) {
    if (data[offset + 3] === 0) return true;
    const distance = Math.hypot(data[offset] - background[0], data[offset + 1] - background[1], data[offset + 2] - background[2]);
    return distance <= tolerance;
}

function imageDataUrl(data: Uint8ClampedArray, width: number, height: number) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器不支持图片处理");
    const pixels = new Uint8ClampedArray(data.length);
    pixels.set(data);
    context.putImageData(new ImageData(pixels, width, height), 0, 0);
    return canvas.toDataURL("image/png");
}
