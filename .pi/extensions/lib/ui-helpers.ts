/**
 * Shared UI helpers for Arc Agent extensions.
 *
 * These wrap the pi extension UI context with a stable, smaller surface so
 * that call sites read like a verb rather than a property path, and so the
 * common "show a list, optionally allow cancel" pattern does not have to
 * be reimplemented in every extension.
 */

export type NotifyKind = "info" | "warning" | "error";

export type UI = {
	select: (title: string, options: string[]) => Promise<string | undefined>;
	input: (title: string, preset?: string) => Promise<string | undefined>;
	confirm: (title: string, defaultValue?: boolean) => Promise<boolean | undefined>;
	notify: (message: string, kind?: NotifyKind) => void;
};

/** Emit a notification. Thin wrapper kept so call sites can swap the body later. */
export function notify(ui: UI, message: string, kind: NotifyKind = "info"): void {
	ui.notify(message, kind);
}

/** Run a select with a sentinel "cancel" option prepended. */
export async function pickFromList(
	ui: UI,
	title: string,
	options: string[],
	cancelLabel = "(cancel)",
): Promise<string | undefined> {
	const choice = await ui.select(title, [cancelLabel, ...options]);
	if (!choice || choice === cancelLabel) return undefined;
	return choice;
}
