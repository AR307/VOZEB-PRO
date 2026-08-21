import { jsonrepair } from "jsonrepair";

export function strictJsonObjectText(value: unknown) {
    if (typeof value !== "string") return "";
    const text = value.trim();
    if (text.startsWith("{") && text.endsWith("}")) return text;
    const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1]?.trim() || "";
    return fenced.startsWith("{") && fenced.endsWith("}") ? fenced : "";
}

export function extractJsonObjectText(value: unknown) {
    if (typeof value !== "string") return "";
    const text = value.trim();
    const strict = strictJsonObjectText(text);
    if (strict) return strict;
    for (let start = 0; start < text.length; start += 1) {
        if (text[start] !== "{") continue;
        let depth = 0;
        let escaped = false;
        let inString = false;
        for (let index = start; index < text.length; index += 1) {
            const character = text[index];
            if (escaped) {
                escaped = false;
                continue;
            }
            if (character === "\\" && inString) {
                escaped = true;
                continue;
            }
            if (character === '"') {
                inString = !inString;
                continue;
            }
            if (inString) continue;
            if (character === "{") depth += 1;
            if (character !== "}") continue;
            depth -= 1;
            if (depth !== 0) continue;
            const candidate = text.slice(start, index + 1);
            try {
                const parsed = JSON.parse(candidate);
                return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? candidate : "";
            } catch {
                try {
                    const repaired = jsonrepair(candidate);
                    const parsed = JSON.parse(repaired);
                    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? repaired : "";
                } catch {
                    break;
                }
            }
        }
    }
    return "";
}
