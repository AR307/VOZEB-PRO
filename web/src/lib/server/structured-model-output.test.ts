import { describe, expect, it } from "vitest";

import { extractJsonObjectText, strictJsonObjectText } from "./structured-model-output";

describe("strictJsonObjectText", () => {
    it("accepts plain or fenced JSON objects", () => {
        expect(strictJsonObjectText('{"ok":true}')).toBe('{"ok":true}');
        expect(strictJsonObjectText('```json\n{"ok":true}\n```')).toBe('{"ok":true}');
    });

    it("rejects prose and JSON arrays", () => {
        expect(strictJsonObjectText('Use this plan: {"ok":true}')).toBe("");
        expect(strictJsonObjectText("[]")).toBe("");
    });

    it("extracts one valid object from provider wrapper prose", () => {
        expect(extractJsonObjectText('结果如下：{"ok":true}\n请审核。')).toBe('{"ok":true}');
        expect(extractJsonObjectText('{"text":"包含 } 字符"}')).toBe('{"text":"包含 } 字符"}');
        expect(extractJsonObjectText("[]")).toBe("");
    });
});
