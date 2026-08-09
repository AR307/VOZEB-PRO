import { expect, type Locator, type Page } from "@playwright/test";

export function masonryGalleryFixture() {
    const sizes = [
        [400, 800],
        [400, 300],
        [400, 600],
        [400, 240],
        [400, 500],
        [400, 700],
        [400, 360],
        [400, 560],
    ];
    return sizes.map(([width, height], index) => ({
        slug: `e2e-masonry-${index + 1}`,
        sourceType: "media",
        viewCount: index + 1,
        likeCount: 0,
        isFeatured: false,
        publishedAt: "2026-08-04T00:00:00.000Z",
        title: `瀑布流测试作品 ${index + 1}`,
        description: "",
        publicPrompt: `masonry fixture ${index + 1}`,
        category: "视觉设计",
        tags: [],
        authorName: "E2E",
        preview: {
            id: `e2e-preview-${index + 1}`,
            mediaType: "image",
            mimeType: "image/svg+xml",
            url: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="hsl(${index * 42} 55% 58%)"/></svg>`)}`,
        },
    }));
}

export async function readMasonryLayout(page: Page) {
    return page.evaluate(() => {
        const grid = document.querySelector<HTMLElement>('[aria-label="灵感作品列表"]')!;
        const gridBounds = grid.getBoundingClientRect();
        const items = [...grid.children].map((item) => (item.firstElementChild as HTMLElement).getBoundingClientRect());
        const columnCount = getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length;
        const firstRow = items.slice(0, columnCount);
        const shortestColumn = firstRow.reduce((shortest, item) => (item.bottom < shortest.bottom ? item : shortest));
        const nextItem = items[columnCount];
        return {
            columnCount,
            firstRowLefts: firstRow.map((item) => Math.round(item.left)),
            firstRowTopRange: Math.max(...firstRow.map((item) => item.top)) - Math.min(...firstRow.map((item) => item.top)),
            shortestColumnLeft: Math.round(shortestColumn.left),
            shortestColumnBottom: shortestColumn.bottom,
            nextItemLeft: Math.round(nextItem.left),
            nextItemTop: nextItem.top,
            rowGap: Number.parseFloat(getComputedStyle(grid).rowGap) || 0,
            documentClientWidth: document.documentElement.clientWidth,
            documentScrollWidth: document.documentElement.scrollWidth,
            gridClientWidth: grid.clientWidth,
            gridScrollWidth: grid.scrollWidth,
            itemsInsideGrid: items.every((item) => item.left >= gridBounds.left - 1 && item.right <= gridBounds.right + 1),
        };
    });
}

export function masonryLayoutIsReady(layout: Awaited<ReturnType<typeof readMasonryLayout>>, expectedColumns: number) {
    return layout.columnCount === expectedColumns && layout.firstRowLefts.length === expectedColumns && new Set(layout.firstRowLefts).size === expectedColumns && layout.firstRowTopRange <= 1 && layout.nextItemLeft === layout.shortestColumnLeft;
}

export function billingProductsFixture() {
    const timestamp = "2026-08-02T00:00:00.000Z";
    return Array.from({ length: 8 }, (_, index) => ({
        id: `e2e-plan-${index + 1}`,
        productKind: "points",
        name: `E2E 创作积分包 ${index + 1}`,
        description: `用于验证多套餐响应式布局 ${index + 1}`,
        amountCents: (index + 1) * 900,
        currency: "CNY",
        pointsAmount: (index + 1) * 100,
        dailyPoints: 0,
        periodDays: 0,
        enabled: true,
        sortOrder: index,
        metadata: { recommended: index === 2, features: ["图片与视频创作", "订单和积分流水可查", "支付成功自动到账"] },
        pricing: {
            listUnitAmountCents: (index + 1) * 1_000,
            saleUnitAmountCents: (index + 1) * 900,
            discountCents: (index + 1) * 100,
            promotion: { id: `promo-${index + 1}`, label: "限时优惠", unitAmountCents: (index + 1) * 900, startsAt: timestamp, endsAt: timestamp },
        },
        createdAt: timestamp,
        updatedAt: timestamp,
    }));
}

export async function expectNoHorizontalOverflow(page: Page, label: string) {
    await expect
        .poll(async () =>
            page.evaluate(() => ({
                viewport: window.innerWidth,
                documentClientWidth: document.documentElement.clientWidth,
                documentScrollWidth: document.documentElement.scrollWidth,
                bodyClientWidth: document.body.clientWidth,
                bodyScrollWidth: document.body.scrollWidth,
            })),
        )
        .toMatchObject({
            documentScrollWidth: expect.any(Number),
            bodyScrollWidth: expect.any(Number),
        });
    const sizes = await page.evaluate(() => ({
        document: [document.documentElement.clientWidth, document.documentElement.scrollWidth],
        body: [document.body.clientWidth, document.body.scrollWidth],
        overflowers: [...document.querySelectorAll<HTMLElement>("body *")]
            .map((element) => {
                const bounds = element.getBoundingClientRect();
                return {
                    tag: element.tagName,
                    ariaLabel: element.getAttribute("aria-label"),
                    className: typeof element.className === "string" ? element.className : "",
                    left: Math.round(bounds.left),
                    right: Math.round(bounds.right),
                    width: Math.round(bounds.width),
                };
            })
            .filter((item) => item.left < -1 || item.right > document.documentElement.clientWidth + 1)
            .slice(0, 8),
    }));
    expect(sizes.document[1], `${label} document overflow: ${JSON.stringify(sizes.overflowers)}`).toBeLessThanOrEqual(sizes.document[0] + 1);
    expect(sizes.body[1], `${label} body overflow`).toBeLessThanOrEqual(sizes.body[0] + 1);
}

export async function expectDialogWithinViewport(dialog: Locator) {
    const bounds = await dialog.boundingBox();
    expect(bounds).not.toBeNull();
    const viewport = dialog.page().viewportSize();
    expect(viewport).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport!.width + 1);
}

export async function openCreativeHistory(page: Page) {
    const dialog = page.getByRole("dialog", { name: "创作历史" });
    await expect
        .poll(async () => {
            if (await dialog.isVisible().catch(() => false)) return true;
            await page.getByRole("button", { name: "创作历史" }).click();
            return dialog.isVisible().catch(() => false);
        })
        .toBe(true);
    return dialog;
}
