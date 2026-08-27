import type { Model } from "@earendil-works/pi-ai";

/**
 * Highest thinking level exposed by the model via its `thinkingLevelMap`, or
 * an empty string when the model does not support thinking at all.
 *
 * The order is the documented one for ThinkingLevel in @earendil-works/pi-ai:
 * off < minimal < low < medium < high < xhigh < max.
 *
 * Models with `reasoning: true` but no `thinkingLevelMap` (most custom OpenAI
 * providers) fall back to the bare "yes" so the column still shows up.
 */
export function maxThinkingLevelLabel(model: Model<any>): string {
	if (!model.reasoning) return "";
	const map = model.thinkingLevelMap ?? {};
	if ("max" in map) return "max";
	if ("xhigh" in map) return "xhigh";
	if ("high" in map) return "high";
	if ("medium" in map) return "medium";
	if ("low" in map) return "low";
	if ("minimal" in map) return "minimal";
	return "yes";
}
