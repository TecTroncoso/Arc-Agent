import type { Model } from "@earendil-works/pi-ai";

/**
 * Returns the highest thinking level that the model actually supports, or an
 * empty string when the model does not support thinking at all.
 *
 * A level is "supported" when its entry in `thinkingLevelMap` exists AND is
 * not `null` (a null entry means the model explicitly does not support that
 * level, even if the key is present in the map). The order is the documented
 * one for ThinkingLevel in @earendil-works/pi-ai:
 * off < minimal < low < medium < high < xhigh < max.
 *
 * Models with `reasoning: true` but no `thinkingLevelMap` (most custom OpenAI
 * providers) fall back to the bare "yes" so the column still shows up.
 */
function supported(map: Record<string, unknown>, level: string): boolean {
	return level in map && map[level] !== null;
}

export function maxThinkingLevelLabel(model: Model<any>): string {
	if (!model.reasoning) return "";
	const map = (model.thinkingLevelMap ?? {}) as Record<string, unknown>;
	if (supported(map, "max")) return "max";
	if (supported(map, "xhigh")) return "xhigh";
	if (supported(map, "high")) return "high";
	if (supported(map, "medium")) return "medium";
	if (supported(map, "low")) return "low";
	if (supported(map, "minimal")) return "minimal";
	return "yes";
}

/**
 * Formats a token count for compact display: 200000 -> "200K", 131072 -> "131.1K",
 * 1000000 -> "1M", 1048576 -> "1.0M". Values below 1000 are shown as-is.
 */
export function formatTokenCount(tokens: number): string {
	if (tokens >= 1_000_000) {
		const millions = tokens / 1_000_000;
		return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}M`;
	}
	if (tokens >= 1_000) {
		const thousands = tokens / 1_000;
		return `${Number.isInteger(thousands) ? thousands : thousands.toFixed(1)}K`;
	}
	return String(tokens);
}
