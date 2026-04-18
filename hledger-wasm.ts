/**
 * hledger-wasm wrapper adapted for Obsidian.
 *
 * The stock bridge uses fetch() which doesn't work in Obsidian.
 * We load the WASM binary via vault.adapter.readBinary() and cache
 * the compiled WebAssembly.Module so we don't recompile on every command.
 */
import { App } from "obsidian";
import {
	WASI,
	OpenFile,
	File,
	ConsoleStdout,
	PreopenDirectory,
} from "@bjorn3/browser_wasi_shim";

let cachedModule: WebAssembly.Module | null = null;

export async function initHledger(app: App): Promise<void> {
	if (cachedModule) return;

	const pluginDir = `${app.vault.configDir}/plugins/obsidian-budget-form`;
	const wasmBytes = await app.vault.adapter.readBinary(
		`${pluginDir}/hledger-wasm.wasm`
	);
	cachedModule = await WebAssembly.compile(wasmBytes);
}

async function runHledger(
	journalContent: string,
	command: string,
	...args: string[]
): Promise<string> {
	if (!cachedModule) {
		throw new Error("hledger WASM not initialized. Call initHledger() first.");
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
		["hledger", command, "/journal.hledger", ...args],
		[],
		fds,
		{ debug: false }
	);

	const instance = await WebAssembly.instantiate(cachedModule, {
		wasi_snapshot_preview1: wasi.wasiImport,
	});

	// browser_wasi_shim expects a specific shape, but WebAssembly.Instance.exports is generic
	wasi.initialize(instance as any);

	try {
		(instance.exports._start as Function)();
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : String(e);
		const isNormalExit =
			msg === "exit with exit code 0" || msg.includes("unreachable");
		if (!isNormalExit) {
			console.error("hledger error:", e);
		}
	}

	if (stderr.trim()) {
		console.warn("hledger stderr:", stderr);
	}

	return stdout.trim();
}

export async function accounts(journal: string): Promise<string[]> {
	const raw = await runHledger(journal, "accounts");
	if (!raw) return [];
	return JSON.parse(raw);
}

export async function balance(
	journal: string,
	...args: string[]
): Promise<[string, HledgerAmount[]][]> {
	const raw = await runHledger(journal, "balance", ...args);
	if (!raw) return [];
	return JSON.parse(raw);
}

export async function print(
	journal: string,
	...args: string[]
): Promise<HledgerTransaction[]> {
	const raw = await runHledger(journal, "print", ...args);
	if (!raw) return [];
	return JSON.parse(raw);
}

export async function aregister(
	journal: string,
	account: string,
	...args: string[]
): Promise<string> {
	const raw = await runHledger(journal, "aregister", account, ...args);
	return raw;
}

export async function commodities(journal: string): Promise<string[]> {
	const raw = await runHledger(journal, "commodities");
	if (!raw) return [];
	return JSON.parse(raw);
}

// Types derived from hledger JSON output

export interface HledgerAmount {
	acommodity: string;
	aquantity: {
		decimalMantissa: number;
		decimalPlaces: number;
		floatingPoint: number;
	};
	acost: unknown;
}

export interface HledgerPosting {
	paccount: string;
	pamount: HledgerAmount[];
	pcomment: string;
	ptype: string;
}

export interface HledgerTransaction {
	tdate: string;
	tdescription: string;
	tpostings: HledgerPosting[];
	ttags: [string, string][];
	tcomment: string;
	tindex: number;
}
