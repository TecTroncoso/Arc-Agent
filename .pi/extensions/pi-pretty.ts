import { createRequire } from "node:module";

type PiPrettyExtension = (pi: unknown, deps?: unknown) => Promise<unknown>;

let piPrettyExtension: PiPrettyExtension | undefined;
try {
	const requireFromHere = createRequire(import.meta.url);
	const mod = requireFromHere("@heyhuynhgiabuu/pi-pretty") as
		| PiPrettyExtension
		| { default: PiPrettyExtension };
	piPrettyExtension =
		typeof mod === "function" ? mod : mod.default;
} catch {
	// Optional dependency: this extension is a no-op when
	// @heyhuynhgiabuu/pi-pretty is not installed in the environment.
	piPrettyExtension = undefined;
}

export default async function arcPrettyExtension(
	pi: unknown,
	deps?: unknown,
): Promise<unknown> {
	if (!piPrettyExtension) return undefined;
	return piPrettyExtension(pi, deps);
}

