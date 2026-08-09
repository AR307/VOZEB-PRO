import { afterEach, describe, expect, it, vi } from "vitest";

import { listBillingCoupons } from "./billing";

describe("billing API client", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("sends the requested coupon page and page size to the server", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue({ code: 0, data: { coupons: [{ id: "coupon-page-two" }], templates: [], total: 18, page: 2, pageSize: 8 }, msg: "" }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const result = await listBillingCoupons({ page: 2, pageSize: 8 });

        expect(fetchMock).toHaveBeenCalledWith("/api/billing/coupons?page=2&pageSize=8", { cache: "no-store" });
        expect(result).toMatchObject({ coupons: [{ id: "coupon-page-two" }], total: 18, page: 2, pageSize: 8 });
    });

    it("can skip claimable templates when the caller only needs owned coupons", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue({ code: 0, data: { coupons: [], total: 0, page: 1, pageSize: 50 }, msg: "" }),
        });
        vi.stubGlobal("fetch", fetchMock);

        await listBillingCoupons({ productId: "product-one", quantity: 2, pageSize: 50, includeTemplates: false });

        expect(fetchMock).toHaveBeenCalledWith("/api/billing/coupons?pageSize=50&productId=product-one&quantity=2&includeTemplates=false", { cache: "no-store" });
    });
});
