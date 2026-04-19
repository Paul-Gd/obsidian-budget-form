/**
 * Web Worker that runs hledger WASM off the main thread.
 *
 * Protocol:
 *   Main → Worker: { type: "init", id, wasmBytes: ArrayBuffer }
 *   Main → Worker: { type: "run", id, journal: string, command: string, args: string[] }
 *   Worker → Main: { id, result: string } | { id, error: string }
 */
import {
	WASI,
	OpenFile,
	File,
	ConsoleStdout,
	PreopenDirectory,
} from "@bjorn3/browser_wasi_shim";

let cachedModule: WebAssembly.Module | null = null;

self.onmessage = async (e: MessageEvent) => {
	const { type, id } = e.data;

	if (type === "init") {
		try {
			cachedModule = await WebAssembly.compile(e.data.wasmBytes);
			self.postMessage({ id });
		} catch (err: unknown) {
			self.postMessage({
				id,
				error: err instanceof Error ? err.message : String(err),
			});
		}
		return;
	}

	if (type === "run") {
		try {
			const result = runHledger(
				e.data.journal,
				e.data.command,
				e.data.args
			);
			self.postMessage({ id, result });
		} catch (err: unknown) {
			self.postMessage({
				id,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}
};

function runHledger(
	journalContent: string,
	command: string,
	args: string[]
): string {
	if (!cachedModule) {
		throw new Error("WASM module not initialized");
	}

	let stdout = "";
	let stderr = "";

	const journalBytes = new TextEncoder().encode(journalContent);
	const fds = [
		new OpenFile(new File([])),
		ConsoleStdout.lineBuffered((msg: string) => {
			stdout += msg + "\n";
		}),
		ConsoleStdout.lineBuffered((msg: string) => {
			stderr += msg + "\n";
		}),
		new PreopenDirectory(
			"/",
			new Map([["journal.hledger", new File(journalBytes)]])
		),
	];

	const wasi = new WASI(
		["hledger", command, "-f", "/journal.hledger", ...args],
		[],
		fds,
		{ debug: false }
	);

	// WebAssembly.instantiate is synchronous when given a Module (not a BufferSource)
	const instance = new WebAssembly.Instance(cachedModule, {
		wasi_snapshot_preview1: wasi.wasiImport,
	});

	wasi.initialize(instance as any);

	try {
		(instance.exports._start as Function)();
	} catch {
		// WASM exits via exceptions for both success and failure
	}

	if (stderr.trim() && !stdout.trim()) {
		throw new Error(stderr.trim());
	}

	return stdout.trim();
}