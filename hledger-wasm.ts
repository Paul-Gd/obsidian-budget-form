/**
 * hledger-wasm wrapper adapted for Obsidian.
 *
 * All WASM execution runs in a Web Worker so it never blocks the main thread.
 * The main thread sends journal content + command to the worker via postMessage
 * and receives the result back asynchronously.
 */
import { App } from "obsidian";

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<
	number,
	{ resolve: (v: string) => void; reject: (e: Error) => void }
>();

function sendToWorker(
	type: string,
	data: Record<string, unknown>,
	transfer?: Transferable[]
): Promise<string> {
	if (!worker) {
		return Promise.reject(
			new Error("hledger WASM not initialized. Call initHledger() first.")
		);
	}
	return new Promise((resolve, reject) => {
		const id = ++nextId;
		pending.set(id, { resolve, reject });
		worker!.postMessage({ type, id, ...data }, transfer ?? []);
	});
}

export async function initHledger(app: App): Promise<void> {
	if (worker) return;

	const pluginDir = `${app.vault.configDir}/plugins/obsidian-budget-form`;
	const [wasmBytes, workerCode] = await Promise.all([
		app.vault.adapter.readBinary(`${pluginDir}/hledger-wasm.wasm`),
		app.vault.adapter.read(`${pluginDir}/hledger-worker.js`),
	]);

	worker = new Worker(
		URL.createObjectURL(
			new Blob([workerCode], { type: "application/javascript" })
		)
	);

	worker.onmessage = (e: MessageEvent) => {
		const { id, result, error } = e.data;
		const p = pending.get(id);
		if (!p) return;
		pending.delete(id);
		if (error) {
			p.reject(new Error(error));
		} else {
			p.resolve(result ?? "");
		}
	};

	worker.onerror = (e: ErrorEvent) => {
		console.error("hledger worker error:", e.message);
	};

	// Transfer the ArrayBuffer so it's not copied
	await sendToWorker("init", { wasmBytes }, [wasmBytes]);
}

async function runHledger(
	journalContent: string,
	command: string,
	...args: string[]
): Promise<string> {
	return sendToWorker("run", {
		journal: journalContent,
		command,
		args,
	});
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
): Promise<HledgerRegisterEntry[]> {
	const raw = await runHledger(journal, "aregister", account, ...args);
	if (!raw) return [];
	return JSON.parse(raw);
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

export interface HledgerBalanceAssertion {
	baamount: HledgerAmount;
	baexact: boolean;
}

export interface HledgerPosting {
	paccount: string;
	pamount: HledgerAmount[];
	pbalanceassertion: HledgerBalanceAssertion | null;
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

export interface HledgerRegisterEntry {
	tindex: number;
	tdate: string;
	tdescription: string;
	otherAccounts: string[];
	change: HledgerAmount[];
	balance: HledgerAmount[];
}