"use client";

import type { CanvasImageDecomposition, CanvasImageLayerBox, CanvasImageLayerCandidate } from "@/lib/canvas-image-decomposition";
import { renderCanvasSubjectLayers, type CanvasSubjectMask } from "./canvas-subject-segmentation";

type ImageCropRect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export type CanvasImageLayerData = {
    foregroundBlob: Blob;
    editMaskBlob: Blob;
    width: number;
    height: number;
    foregroundPixels: number;
    backgroundPixels: number;
};

export type CanvasImageDecompositionData = {
    width: number;
    height: number;
    editMaskBlob: Blob;
    layers: Array<{ candidate: CanvasImageLayerCandidate; blob: Blob; width: number; height: number }>;
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

/** Uses the local semantic mask to create a transparent subject and an edit mask. */
export async function splitSubjectAndBackgroundDataUrl(dataUrl: string, signal?: AbortSignal): Promise<CanvasImageLayerData> {
    const result = await renderCanvasSubjectLayers(dataUrl, signal);
    if (result.kind === "blobs") return result;
    const image = await loadImage(dataUrl);
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("浏览器不支持图片处理");
    context.drawImage(image, 0, 0);
    const source = context.getImageData(0, 0, canvas.width, canvas.height);
    const { foreground, editMask, foregroundPixels, backgroundPixels } = applySubjectMaskToImageData(source, result.mask);
    const [foregroundBlob, editMaskBlob] = await Promise.all([imageDataBlob(foreground, canvas.width, canvas.height), imageDataBlob(editMask, canvas.width, canvas.height)]);
    return {
        foregroundBlob,
        editMaskBlob,
        width: canvas.width,
        height: canvas.height,
        foregroundPixels,
        backgroundPixels,
    };
}

export async function buildCanvasImageDecompositionData(dataUrl: string, decomposition: CanvasImageDecomposition): Promise<CanvasImageDecompositionData> {
    const image = await loadImage(dataUrl);
    const boxes = decomposition.layers.map((candidate) => ({ candidate, box: scaleLayerBox(candidate.bbox, decomposition.width, decomposition.height, image.width, image.height) }));
    const layers: CanvasImageDecompositionData["layers"] = [];
    for (const { candidate, box } of boxes) {
        await yieldToBrowser();
        layers.push({
            candidate,
            blob: await drawCropBlob(image, box),
            width: box.width,
            height: box.height,
        });
    }
    const mask = document.createElement("canvas");
    mask.width = image.width;
    mask.height = image.height;
    const context = mask.getContext("2d");
    if (!context) throw new Error("浏览器不支持图片处理");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, mask.width, mask.height);
    boxes.forEach(({ box }) => context.clearRect(box.x, box.y, box.width, box.height));
    return { width: image.width, height: image.height, editMaskBlob: await canvasBlob(mask), layers };
}

export async function compositeCanvasImageEditResult(sourceUrl: string, generatedUrl: string, editMaskUrl: string) {
    const [sourceImage, generatedImage, maskImage] = await Promise.all([loadImage(sourceUrl), loadImage(generatedUrl), loadImage(editMaskUrl)]);
    const width = sourceImage.width;
    const height = sourceImage.height;
    const source = drawImageData(sourceImage, width, height);
    const generated = drawImageData(generatedImage, width, height);
    const mask = drawImageData(maskImage, width, height);
    const composite = compositeImageDataWithinMask(source, generated, mask);
    return imageDataBlob(composite.data, width, height);
}

export function compositeImageDataWithinMask(source: Pick<ImageData, "data" | "width" | "height">, generated: Pick<ImageData, "data" | "width" | "height">, editMask: Pick<ImageData, "data" | "width" | "height">) {
    const expectedLength = source.width * source.height * 4;
    if (source.width < 1 || source.height < 1 || source.data.length !== expectedLength) throw new Error("源图片像素数据无效");
    if (generated.width !== source.width || generated.height !== source.height || generated.data.length !== expectedLength) throw new Error("背景补全结果尺寸无效");
    if (editMask.width !== source.width || editMask.height !== source.height || editMask.data.length !== expectedLength) throw new Error("背景补全蒙版尺寸无效");
    const data = new Uint8ClampedArray(expectedLength);
    for (let offset = 0; offset < expectedLength; offset += 4) {
        const preserveWeight = editMask.data[offset + 3] / 255;
        const editWeight = 1 - preserveWeight;
        for (let channel = 0; channel < 4; channel += 1) data[offset + channel] = Math.round(source.data[offset + channel] * preserveWeight + generated.data[offset + channel] * editWeight);
    }
    return { data, width: source.width, height: source.height };
}

export function scaleLayerBox(box: CanvasImageLayerBox, sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number): CanvasImageLayerBox {
    const left = Math.max(0, Math.floor((box.x / sourceWidth) * targetWidth));
    const top = Math.max(0, Math.floor((box.y / sourceHeight) * targetHeight));
    const right = Math.min(targetWidth, Math.ceil(((box.x + box.width) / sourceWidth) * targetWidth));
    const bottom = Math.min(targetHeight, Math.ceil(((box.y + box.height) / sourceHeight) * targetHeight));
    return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

export function applySubjectMaskToImageData(source: Pick<ImageData, "data" | "width" | "height">, subjectMask: CanvasSubjectMask) {
    if (source.width < 1 || source.height < 1 || source.data.length !== source.width * source.height * 4) throw new Error("源图片像素数据无效");
    if (subjectMask.width < 1 || subjectMask.height < 1 || subjectMask.data.length !== subjectMask.width * subjectMask.height) throw new Error("主体蒙版尺寸无效");
    const foreground = new Uint8ClampedArray(source.data);
    const editMask = new Uint8ClampedArray(source.data.length);
    let foregroundPixels = 0;
    let backgroundPixels = 0;
    for (let y = 0; y < source.height; y += 1) {
        for (let x = 0; x < source.width; x += 1) {
            const confidence = sampleSubjectConfidence(subjectMask, x, y, source.width, source.height);
            const offset = (y * source.width + x) * 4;
            foreground[offset + 3] = Math.round(source.data[offset + 3] * confidence);
            editMask[offset] = 255;
            editMask[offset + 1] = 255;
            editMask[offset + 2] = 255;
            editMask[offset + 3] = Math.round(255 * (1 - confidence));
            if (confidence >= 0.5) foregroundPixels += 1;
            else backgroundPixels += 1;
        }
    }
    return { foreground, editMask, foregroundPixels, backgroundPixels };
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

function drawCropBlob(image: HTMLImageElement, box: CanvasImageLayerBox) {
    const canvas = document.createElement("canvas");
    canvas.width = box.width;
    canvas.height = box.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器不支持图片处理");
    context.drawImage(image, box.x, box.y, box.width, box.height, 0, 0, canvas.width, canvas.height);
    return canvasBlob(canvas);
}

function drawImageData(image: CanvasImageSource, width: number, height: number) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("浏览器不支持图片处理");
    context.drawImage(image, 0, 0, width, height);
    return context.getImageData(0, 0, width, height);
}

async function yieldToBrowser() {
    const scheduler = (globalThis as typeof globalThis & { scheduler?: { yield?: () => Promise<void> } }).scheduler;
    if (scheduler?.yield) return scheduler.yield();
    if (typeof requestAnimationFrame === "function") await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
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

function sampleSubjectConfidence(mask: CanvasSubjectMask, x: number, y: number, width: number, height: number) {
    const sourceX = width === 1 ? 0 : (x / (width - 1)) * (mask.width - 1);
    const sourceY = height === 1 ? 0 : (y / (height - 1)) * (mask.height - 1);
    const left = Math.floor(sourceX);
    const top = Math.floor(sourceY);
    const right = Math.min(mask.width - 1, left + 1);
    const bottom = Math.min(mask.height - 1, top + 1);
    const horizontal = sourceX - left;
    const vertical = sourceY - top;
    const topValue = mask.data[top * mask.width + left] * (1 - horizontal) + mask.data[top * mask.width + right] * horizontal;
    const bottomValue = mask.data[bottom * mask.width + left] * (1 - horizontal) + mask.data[bottom * mask.width + right] * horizontal;
    return Math.max(0, Math.min(1, topValue * (1 - vertical) + bottomValue * vertical));
}

function imageDataBlob(data: Uint8ClampedArray, width: number, height: number) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器不支持图片处理");
    const pixels = new Uint8ClampedArray(data.length);
    pixels.set(data);
    context.putImageData(new ImageData(pixels, width, height), 0, 0);
    return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("图片编码失败，无法生成图层"))), "image/png"));
}

function canvasBlob(canvas: HTMLCanvasElement) {
    return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("图片编码失败，无法生成图层"))), "image/png"));
}
