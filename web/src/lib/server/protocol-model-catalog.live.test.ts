import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { emptyAdvancedConfig, protocolAuthHeaders, registeredChannelProtocolDefinitions } from "@/lib/channel-protocol-registry";
import { createProtocolFixtureServer } from "../../../scripts/protocol-fixture-server.mjs";

const CATALOG_CASES = registeredChannelProtocolDefinitions.flatMap((definition) => definition.modelCatalogPaths.map((path) => ({ definition, path })));

describe("registered protocol model catalogs over a local TCP interface", () => {
    let fixture: ReturnType<typeof createProtocolFixtureServer>;
    let origin = "";

    beforeAll(async () => {
        fixture = createProtocolFixtureServer();
        await new Promise<void>((resolve) => fixture.server.listen(0, "127.0.0.1", resolve));
        const address = fixture.server.address();
        if (!address || typeof address === "string") throw new Error("Protocol fixture did not expose a TCP port");
        origin = `http://127.0.0.1:${address.port}`;
    });

    afterAll(async () => {
        await new Promise<void>((resolve, reject) => fixture.server.close((error?: Error) => (error ? reject(error) : resolve())));
    });

    it.each(CATALOG_CASES)("receives the $definition.id catalog response from $path", async ({ definition, path }) => {
        const advanced = { ...emptyAdvancedConfig(), protocol: definition.id, authMode: definition.authMode };
        const response = await fetch(`${origin}${path}`, { headers: protocolAuthHeaders("fixture-key", advanced, definition.apiFormat) });
        const payload = await response.json();

        expect(response.ok).toBe(true);
        expect(payload).toBeTruthy();
        const request = fixture.requests.at(-1);
        expect(request?.path).toBe(path);
        if (definition.authMode === "none") expect(request?.headers.authorization).toBeUndefined();
        else if (definition.id === "gemini") expect(request?.headers["x-goog-api-key"]).toBe("fixture-key");
        else expect(request?.headers.authorization).toBe("Bearer fixture-key");
    });
});
