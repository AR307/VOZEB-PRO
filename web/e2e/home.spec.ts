import { expect, test, type Page } from "@playwright/test";

const galleryResponse = {
    code: 0,
    msg: "OK",
    data: {
        items: [
            galleryItem(1, "image", "media", "视觉设计"),
            galleryItem(2, "video", "media", "动态影像"),
            galleryItem(3, "image", "drama", "短剧"),
            galleryItem(4, "image", "media", "品牌内容"),
            galleryItem(5, "image", "canvas", "视觉设计"),
            galleryItem(6, "video", "drama", "短剧"),
        ],
    },
};

test("public homepage is functional for signed-out visitors", async ({ browser }, testInfo) => {
    const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL || "http://127.0.0.1:3100") });
    await context.clearCookies();
    const page = await context.newPage();
    const browserErrors = collectBrowserErrors(page);
    let galleryRequest = "";
    await page.route("**/api/public/gallery?**", async (route) => {
        galleryRequest = route.request().url();
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(galleryResponse) });
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: "释放想象，AI 帮你实现" })).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.getByText("核心能力", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("home-agent-card")).toHaveCount(1);
    await expect(page.getByTestId("home-agent-halo").locator("[data-halo-ring]")).toHaveCount(6);
    await expect(page.getByTestId("home-public-gallery")).toBeVisible();
    await expect(page.locator("header").getByRole("button", { name: "登录", exact: true })).toHaveCount(0);
    await expect(page.getByText("登录后使用 AI 创作", { exact: true })).toHaveCount(0);
    if (testInfo.project.name === "chromium") {
        await page
            .locator("header")
            .getByRole("button", { name: /立即体验/ })
            .click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.getByRole("button", { name: "Close" }).click();
    }
    expect(new URL(galleryRequest).pathname).toBe("/api/public/gallery");
    expect(new URL(galleryRequest).searchParams.get("limit")).toBe("18");

    const prompt = page.getByLabel("描述你想创作的内容");
    await prompt.fill("测试首页创作输入");
    await page.getByRole("button", { name: "生成一张科幻城市概念图" }).click();
    await expect(prompt).toHaveValue("生成一张科幻城市概念图");
    await page.getByRole("button", { name: "AI 绘图" }).click();
    await expect(page.getByRole("button", { name: "AI 绘图" })).toHaveAttribute("aria-pressed", "true");

    await expect(page.getByRole("button", { name: "使用麦克风" })).toHaveCount(0);
    if (testInfo.project.name === "chromium") {
        await prompt.focus();
        expect(await prompt.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("none");

        const planningMode = page.getByLabel("选择 Agent 模式");
        await planningMode.focus();
        expect(await planningMode.evaluate((element) => getComputedStyle(element).borderTopWidth)).toBe("0px");
        expect(await planningMode.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("none");
        await planningMode.click();
        await expect(page.getByRole("listbox", { name: "Agent 模式" })).toBeVisible();
        await expect(page.getByRole("option")).toHaveCount(2);
        await page.getByRole("option", { name: /智能模式/ }).click();
        await expect(page.getByRole("listbox", { name: "Agent 模式" })).toHaveCount(0);

        const send = page.getByRole("button", { name: "发送到创作 Agent" });
        await send.hover();
        const sendStyle = await send.evaluate((element) => ({ backgroundImage: getComputedStyle(element).backgroundImage, color: getComputedStyle(element).color }));
        expect(sendStyle.backgroundImage).toContain("linear-gradient");
        expect(sendStyle.color).toBe("rgb(255, 255, 255)");
    }
    for (const action of ["发送到创作 Agent", "添加附件"]) {
        await page.getByRole("button", { name: action }).click();
        const dialog = page.getByRole("dialog");
        const closeButton = dialog.getByRole("button", { name: "Close" });
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole("heading", { name: "登录后回到刚才的位置" })).toBeVisible();
        await expect(dialog.getByText("登录后将继续刚才的创作操作，输入内容不会丢失。")).toHaveCount(0);
        await expect(closeButton).toBeVisible();
        await closeButton.click();
        await expect(dialog).toBeHidden();
    }

    await expect(page.getByRole("heading", { name: "简单四步，创意即刻落地" })).toBeVisible();
    for (const title of ["选择场景", "输入需求", "生成内容", "发布与分享"]) await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByRole("heading", { name: "开启你的 AI 创作工作流" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "行业场景解决方案" })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "产品" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "平台" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "解决方案" })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "联系我们" })).toHaveCount(0);
    if (testInfo.project.name.startsWith("mobile-")) {
        const footerLayout = await mobileFooterDomState(page);
        expect(footerLayout.navigationCount).toBe(3);
        expect(footerLayout.navigationLeftSpread).toBeLessThanOrEqual(1);
        expect(footerLayout.navigationTops).toEqual([...footerLayout.navigationTops].sort((left, right) => left - right));
        expect(footerLayout.productFirstRowTopDelta).toBeLessThanOrEqual(1);
        expect(footerLayout.productSecondColumnOffset).toBeGreaterThan(120);
        expect(footerLayout.socialLogoTopDelta).toBeLessThanOrEqual(4);
        expect(footerLayout.firstPolicyLeft).toBeGreaterThan(footerLayout.footerCenter);
    }

    await page.getByRole("tab", { name: "视频作品" }).click();
    await expect(page.getByRole("tab", { name: "视频作品" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("home-public-gallery").locator("article")).toHaveCount(1);
    await page.getByRole("tab", { name: "短剧分镜" }).click();
    await expect(page.getByTestId("home-public-gallery").locator("article")).toHaveCount(2);
    const posterTab = page.getByRole("tab", { name: "海报设计" });
    await posterTab.click();
    if (testInfo.project.name === "chromium") await posterTab.hover();
    await expect(posterTab).toHaveCSS("color", "rgb(255, 255, 255)");

    const beforeTheme = await homepageDomState(page);
    await page.getByRole("button", { name: "切换到深色主题" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    expect(await homepageDomState(page)).toEqual(beforeTheme);
    await expectNoHorizontalOverflow(page);
    expect(browserErrors).toEqual([]);
    await context.close();
});

test("signed-in homepage sends the prompt to the existing Agent route", async ({ page }, testInfo) => {
    await page.route("**/api/public/gallery?**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(galleryResponse) }));
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const workspaceEntry = page.locator("header button").filter({ hasText: "进入工作台" });
    await expect(workspaceEntry).toHaveCount(1);
    if (testInfo.project.name === "chromium") await expect(workspaceEntry).toBeVisible();
    await expect(page.locator("header").getByRole("button", { name: /用户|账号|头像/ })).toHaveCount(0);
    await page.getByLabel("描述你想创作的内容").fill("已登录首页提示词");
    await page.getByRole("button", { name: "发送到创作 Agent" }).click();
    await expect(page).toHaveURL(/\/create#source=gallery&prompt=/);
    expect(decodeURIComponent(new URL(page.url()).hash)).toContain("已登录首页提示词");
});

test("homepage gallery hides internal service errors from visitors", async ({ page }) => {
    await page.route("**/api/public/gallery?**", (route) =>
        route.fulfill({
            status: 409,
            contentType: "application/json",
            body: JSON.stringify({ code: 409, data: null, msg: "作品广场需要启用 PostgreSQL 数据库" }),
        }),
    );
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: "作品暂时无法加载" })).toBeVisible();
    await expect(page.getByText("请稍后重试，或刷新页面后再试。")).toBeVisible();
    await expect(page.getByRole("button", { name: "重新加载" })).toBeVisible();
    await expect(page.getByText(/PostgreSQL|数据库|部署/)).toHaveCount(0);
});

test("homepage hero stays centered and responsive", async ({ page }, testInfo) => {
    await page.route("**/api/public/gallery?**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(galleryResponse) }));
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const geometry = await page.evaluate(() => {
        const viewportWidth = document.documentElement.clientWidth;
        const title = document.querySelector("h1")!.getBoundingClientRect();
        const card = document.querySelector<HTMLElement>('[data-testid="home-agent-card"]')!.getBoundingClientRect();
        const halo = document.querySelector<HTMLElement>('[data-testid="home-agent-halo"]')!.getBoundingClientRect();
        const outerRing = document.querySelector<HTMLElement>('[data-testid="home-agent-halo"] > span')!.getBoundingClientRect();
        const textarea = document.querySelector<HTMLElement>("#home-agent-prompt")!.getBoundingClientRect();
        const presets = document.querySelector<HTMLElement>('[aria-label="示例提示词"]')!.getBoundingClientRect();
        const planningMode = document.querySelector<HTMLElement>('[aria-label="选择 Agent 模式"]')!.getBoundingClientRect();
        return {
            viewportWidth,
            titleCenterOffset: Math.abs(title.left + title.width / 2 - viewportWidth / 2),
            cardCenterOffset: Math.abs(card.left + card.width / 2 - viewportWidth / 2),
            cardWidth: card.width,
            haloCenterOffset: Math.abs(halo.left + halo.width / 2 - (card.left + card.width / 2)),
            haloHeight: halo.height,
            haloWidthRatio: halo.width / card.width,
            outerRingCenterAboveCardBottom: card.bottom - (outerRing.top + outerRing.height / 2),
            textareaHeight: textarea.height,
            presetOffset: presets.top - textarea.bottom,
            controlLeftOffsets: [textarea.left, presets.left, planningMode.left].map((left) => Math.abs(left - textarea.left)),
        };
    });
    expect(geometry.titleCenterOffset).toBeLessThanOrEqual(2);
    expect(geometry.cardCenterOffset).toBeLessThanOrEqual(2);
    expect(geometry.cardWidth).toBeLessThanOrEqual(geometry.viewportWidth - (geometry.viewportWidth < 768 ? 24 : 48));
    if (testInfo.project.name === "chromium") {
        expect(geometry.cardWidth).toBeGreaterThan(850);
        expect(geometry.haloCenterOffset).toBeLessThanOrEqual(1);
        expect(geometry.haloHeight).toBeGreaterThanOrEqual(244);
        expect(geometry.haloHeight).toBeLessThanOrEqual(246);
        expect(geometry.haloWidthRatio).toBeGreaterThan(1.33);
        expect(geometry.haloWidthRatio).toBeLessThan(1.35);
        expect(geometry.outerRingCenterAboveCardBottom).toBeGreaterThan(20);
        expect(geometry.outerRingCenterAboveCardBottom).toBeLessThan(36);
        expect(geometry.textareaHeight).toBeGreaterThanOrEqual(90);
        expect(geometry.presetOffset).toBeGreaterThanOrEqual(0);
        expect(geometry.presetOffset).toBeLessThanOrEqual(4);
        expect(Math.max(...geometry.controlLeftOffsets)).toBeLessThanOrEqual(1);
    }
    await expectNoHorizontalOverflow(page);
});

function galleryItem(index: number, mediaType: "image" | "video", sourceType: "media" | "canvas" | "drama", category: string) {
    return {
        slug: `home-e2e-${index}`,
        sourceType,
        viewCount: index * 10,
        likeCount: index * 3,
        isFeatured: false,
        publishedAt: "2026-08-05T00:00:00.000Z",
        title: `首页公开作品 ${index}`,
        description: "公开作品测试数据",
        publicPrompt: `public fixture ${index}`,
        category,
        tags: [],
        authorName: "公开创作者",
        preview: {
            id: `home-preview-${index}`,
            mediaType,
            mimeType: mediaType === "video" ? "video/mp4" : "image/svg+xml",
            url: mediaType === "video" ? "data:video/mp4;base64," : `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="hsl(${index * 48} 58% 62%)"/></svg>`)}`,
        },
    };
}

function collectBrowserErrors(page: Page) {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
    });
    return errors;
}

async function homepageDomState(page: Page) {
    return page.evaluate(() => ({
        mains: document.querySelectorAll("main").length,
        heroes: document.querySelectorAll("h1").length,
        agentCards: document.querySelectorAll('[data-testid="home-agent-card"]').length,
    }));
}

async function mobileFooterDomState(page: Page) {
    return page.evaluate(() => {
        const footer = document.querySelector<HTMLElement>("footer")!;
        const navigations = Array.from(footer.querySelectorAll<HTMLElement>("nav"));
        const navigationRects = navigations.map((navigation) => navigation.getBoundingClientRect());
        const productItems = Array.from(navigations[0].querySelectorAll<HTMLElement>("a, button")).map((item) => item.getBoundingClientRect());
        const social = footer.querySelector<HTMLElement>('a[aria-label="邮箱联系"]');
        const footerLogo = footer.querySelector<HTMLElement>('a[href="/"]');
        const firstPolicy = footer.querySelector<HTMLElement>('[data-testid="home-footer-bottom"] a');
        const footerRect = footer.getBoundingClientRect();
        return {
            navigationCount: navigations.length,
            navigationLeftSpread: Math.max(...navigationRects.map((rect) => rect.left)) - Math.min(...navigationRects.map((rect) => rect.left)),
            navigationTops: navigationRects.map((rect) => Math.round(rect.top)),
            productFirstRowTopDelta: Math.abs(productItems[0].top - productItems[1].top),
            productSecondColumnOffset: productItems[1].left - productItems[0].left,
            socialLogoTopDelta: social && footerLogo ? Math.abs(social.getBoundingClientRect().top - footerLogo.getBoundingClientRect().top) : Number.POSITIVE_INFINITY,
            firstPolicyLeft: firstPolicy?.getBoundingClientRect().left || 0,
            footerCenter: footerRect.left + footerRect.width / 2,
        };
    });
}

async function expectNoHorizontalOverflow(page: Page) {
    const overflow = await page.evaluate(() => {
        const root = document.querySelector<HTMLElement>("main.app-scroll-page");
        return {
            document: [document.documentElement.clientWidth, document.documentElement.scrollWidth],
            body: [document.body.clientWidth, document.body.scrollWidth],
            root: root ? [root.clientWidth, root.scrollWidth] : [0, 1],
        };
    });
    for (const [label, [clientWidth, scrollWidth]] of Object.entries(overflow)) expect(scrollWidth, `${label} horizontal overflow`).toBeLessThanOrEqual(clientWidth + 1);
}
