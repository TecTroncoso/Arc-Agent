import type { Model } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { maxThinkingLevelLabel } from "../src/modes/interactive/components/thinking-level-format.ts";

function fakeModel(reasoning: boolean, thinkingLevelMap?: Record<string, unknown>): Model<any> {
	return {
		id: "m",
		name: "m",
		api: "openai-completions",
		provider: "test",
		baseUrl: "https://example.test",
		reasoning,
		thinkingLevelMap,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 1,
		maxTokens: 1,
	} as unknown as Model<any>;
}

describe("maxThinkingLevelLabel", () => {
	it("returns empty when the model does not support reasoning", () => {
		expect(maxThinkingLevelLabel(fakeModel(false))).toBe("");
	});

	it("returns the highest level in the map", () => {
		expect(maxThinkingLevelLabel(fakeModel(true, { low: "low", high: "high" }))).toBe("high");
		expect(maxThinkingLevelLabel(fakeModel(true, { minimal: "min", xhigh: "xhigh" }))).toBe("xhigh");
	});

	it("prefers max over every other level", () => {
		expect(maxThinkingLevelLabel(fakeModel(true, { off: null, low: "low", high: "high", max: "max" }))).toBe("max");
	});

	it("falls back to yes for reasoning without an explicit map", () => {
		expect(maxThinkingLevelLabel(fakeModel(true))).toBe("yes");
	});

	it("returns yes when the map is empty", () => {
		expect(maxThinkingLevelLabel(fakeModel(true, {}))).toBe("yes");
	});

	it("walks minimal/low/medium/high when only low is set", () => {
		expect(maxThinkingLevelLabel(fakeModel(true, { low: "low" }))).toBe("low");
	});

	it("returns xhigh when only xhigh is supported (no max)", () => {
		expect(maxThinkingLevelLabel(fakeModel(true, { xhigh: "xhigh" }))).toBe("xhigh");
	});

	it("returns xhigh when max is explicitly null but xhigh is set", () => {
		expect(maxThinkingLevelLabel(fakeModel(true, { xhigh: "xhigh", max: null }))).toBe("xhigh");
	});

	it("returns max when max is present, even alongside xhigh", () => {
		expect(maxThinkingLevelLabel(fakeModel(true, { off: null, xhigh: "xhigh", max: "max" }))).toBe("max");
	});
});
