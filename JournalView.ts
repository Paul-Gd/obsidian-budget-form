import { TextFileView, WorkspaceLeaf, setIcon } from "obsidian";

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
import { EditorView, lineNumbers, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
	accounts,
	balance,
	print,
	aregister,
	HledgerAmount,
	HledgerTransaction,
	HledgerRegisterEntry,
} from "./hledger-wasm";
import type SimpleBudgetFormPlugin from "./main";

export const JOURNAL_VIEW_TYPE = "journal-view";

type ViewMode = "source" | "preview";

export class JournalView extends TextFileView {
	private plugin: SimpleBudgetFormPlugin;
	private mode: ViewMode = "preview";
	private editorEl: HTMLDivElement;
	private editorView: EditorView | null = null;
	private previewEl: HTMLDivElement;
	private toggleAction: HTMLElement;
	private renderVersion = 0;
	private selectedMonth: string;
	private selectedAccount: string;
	private selectedLimit: number;

	getViewType(): string {
		return JOURNAL_VIEW_TYPE;
	}

	constructor(leaf: WorkspaceLeaf, plugin: SimpleBudgetFormPlugin) {
		super(leaf);
		this.plugin = plugin;
		const saved = plugin.settings.journalViewState;
		this.selectedMonth = saved.selectedMonth;
		this.selectedAccount = saved.selectedAccount;
		this.selectedLimit = saved.selectedLimit;
	}

	getDisplayText(): string {
		return this.file?.basename ?? "Journal";
	}

	async onOpen(): Promise<void> {
		this.editorEl = this.contentEl.createDiv({ cls: "journal-source" });
		this.editorEl.hide();

		this.previewEl = this.contentEl.createDiv({ cls: "journal-preview" });

		this.toggleAction = this.addAction(
			"code",
			"Toggle source/preview",
			() => this.toggleMode()
		);
	}

	async onClose(): Promise<void> {
		if (this.editorView) {
			this.editorView.destroy();
			this.editorView = null;
		}
		this.contentEl.empty();
	}

	getViewData(): string {
		if (this.mode === "source" && this.editorView) {
			return this.editorView.state.doc.toString();
		}
		return this.data;
	}

	setViewData(data: string, clear: boolean): void {
		this.data = data;
		if (this.editorView) {
			this.editorView.dispatch({
				changes: {
					from: 0,
					to: this.editorView.state.doc.length,
					insert: data,
				},
			});
		}
		if (clear) {
			this.renderVersion++;
			this.mode = "preview";
		}
		if (this.mode === "preview") {
			this.renderPreview();
		}
	}

	clear(): void {
		this.data = "";
		if (this.editorView) {
			this.editorView.dispatch({
				changes: {
					from: 0,
					to: this.editorView.state.doc.length,
					insert: "",
				},
			});
		}
		this.previewEl.empty();
		this.renderVersion++;
	}

	private createEditorView(): void {
		if (this.editorView) return;

		this.editorView = new EditorView({
			state: EditorState.create({
				doc: this.data,
				extensions: [
					lineNumbers(),
					history(),
					keymap.of([...defaultKeymap, ...historyKeymap]),
					EditorView.updateListener.of((update) => {
						if (update.docChanged) {
							this.requestSave();
						}
					}),
				],
			}),
			parent: this.editorEl,
		});
	}

	private toggleMode(): void {
		if (this.mode === "source") {
			if (this.editorView) {
				this.data = this.editorView.state.doc.toString();
			}
			this.mode = "preview";
			this.editorEl.hide();
			this.previewEl.show();
			setIcon(this.toggleAction, "code");
			this.renderPreview();
		} else {
			this.createEditorView();
			if (this.editorView) {
				this.editorView.dispatch({
					changes: {
						from: 0,
						to: this.editorView.state.doc.length,
						insert: this.data,
					},
				});
			}
			this.mode = "source";
			this.previewEl.hide();
			this.editorEl.show();
			setIcon(this.toggleAction, "book-open");
		}
	}

	private persistViewState(): void {
		this.plugin.settings.journalViewState = {
			selectedMonth: this.selectedMonth,
			selectedAccount: this.selectedAccount,
			selectedLimit: this.selectedLimit,
		};
		this.plugin.saveSettings();
	}

	private async renderPreview(): Promise<void> {
		const thisRender = ++this.renderVersion;
		this.previewEl.empty();

		// Build skeleton immediately with cached accounts
		const cachedAccountList = this.plugin.cachedAccounts;
		this.buildFilterBar(this.previewEl, cachedAccountList);
		let txnEl = this.previewEl.createDiv({ cls: "journal-loading", text: "Loading..." });
		let balanceEl = this.previewEl.createDiv();
		let assertionsEl = this.previewEl.createDiv();

		// Yield so the browser paints the skeleton before WASM blocks the main thread
		await sleep(0);
		if (thisRender !== this.renderVersion) return;

		const dateFilter: string[] = this.selectedMonth
			? [`date:${this.selectedMonth}`]
			: [];

		try {
			// Fire accounts + transactions in parallel
			const txnQuery = this.selectedAccount
				? aregister(this.data, this.selectedAccount, ...dateFilter)
				: print(this.data, ...dateFilter);
			const accountsQuery = cachedAccountList.length > 0
				? Promise.resolve(cachedAccountList)
				: accounts(this.data);

			const [txnResult, accountList] = await Promise.all([txnQuery, accountsQuery]);
			if (thisRender !== this.renderVersion) return;

			// Rebuild the page with fresh accounts if cache was empty
			if (accountList !== cachedAccountList) {
				this.plugin.cachedAccounts = accountList;
				this.previewEl.empty();
				this.buildFilterBar(this.previewEl, accountList);
				txnEl = this.previewEl.createDiv();
				balanceEl = this.previewEl.createDiv();
				assertionsEl = this.previewEl.createDiv();
			}

			this.renderTransactions(txnEl, txnResult);

			// Yield again so transactions are painted before balance query blocks
			await sleep(0);
			if (thisRender !== this.renderVersion) return;

			await this.renderDeferredSections(thisRender, balanceEl, assertionsEl);
		} catch (e) {
			if (thisRender !== this.renderVersion) return;
			this.previewEl.empty();
			this.previewEl.createEl("pre", {
				cls: "journal-error",
				text: e instanceof Error ? e.message : String(e),
			});
		}
	}

	private renderTransactions(
		container: HTMLElement,
		result: HledgerTransaction[] | HledgerRegisterEntry[]
	): void {
		container.empty();
		container.removeClass("journal-loading");
		if (this.selectedAccount) {
			const allEntries = result as HledgerRegisterEntry[];
			const entries = this.selectedLimit
				? allEntries.slice(0, this.selectedLimit)
				: allEntries;
			this.buildRegisterTable(
				container,
				entries,
				`${this.selectedAccount} (${entries.length} of ${allEntries.length})`
			);
		} else {
			const allTxns = result as HledgerTransaction[];
			const txns = this.selectedLimit
				? allTxns.slice(-this.selectedLimit)
				: allTxns;
			this.buildTransactionsTable(
				container,
				txns,
				`Transactions (${txns.length} of ${allTxns.length})`
			);
		}
	}

	private async renderDeferredSections(
		thisRender: number,
		balanceContainer: HTMLElement,
		assertionsContainer: HTMLElement
	): Promise<void> {
		const assetBal = await balance(this.data, "assets");
		if (thisRender !== this.renderVersion) return;
		this.buildBalanceTable(balanceContainer, assetBal);
		this.buildAssertionsToggle(assertionsContainer, thisRender);
	}

	private buildFilterBar(
		container: HTMLElement,
		accountList: string[]
	): void {
		const bar = container.createDiv({ cls: "journal-filters" });

		const monthGroup = bar.createDiv({ cls: "journal-filter" });
		monthGroup.createEl("label", { text: "Month" });
		const monthSelect = monthGroup.createEl("select");

		const allMonthOpt = monthSelect.createEl("option", { text: "All" });
		allMonthOpt.value = "";
		for (const month of this.extractMonths()) {
			const opt = monthSelect.createEl("option", { text: month });
			opt.value = month;
		}
		monthSelect.value = this.selectedMonth;
		monthSelect.addEventListener("change", () => {
			this.selectedMonth = monthSelect.value;
			this.persistViewState();
			this.renderPreview();
		});

		const accountGroup = bar.createDiv({ cls: "journal-filter" });
		accountGroup.createEl("label", { text: "Account" });
		const accountSelect = accountGroup.createEl("select");

		const allAccOpt = accountSelect.createEl("option", { text: "All" });
		allAccOpt.value = "";
		for (const acc of accountList) {
			const displayName = acc.startsWith("assets:") ? acc.slice(7) : acc;
			const opt = accountSelect.createEl("option", { text: displayName });
			opt.value = acc;
		}
		accountSelect.value = this.selectedAccount;
		accountSelect.addEventListener("change", () => {
			this.selectedAccount = accountSelect.value;
			this.persistViewState();
			this.renderPreview();
		});

		const limitGroup = bar.createDiv({ cls: "journal-filter" });
		limitGroup.createEl("label", { text: "Last" });
		const limitInput = limitGroup.createEl("input", {
			type: "number",
			value: this.selectedLimit ? String(this.selectedLimit) : "",
			placeholder: "All",
		});
		limitInput.style.width = "5em";
		limitInput.addEventListener("change", () => {
			const val = parseInt(limitInput.value);
			this.selectedLimit = val > 0 ? val : 0;
			this.persistViewState();
			this.renderPreview();
		});
	}

	private extractMonths(): string[] {
		const datePattern = /^\d{4}-\d{2}-\d{2}/gm;
		const months = new Set<string>();
		let match;
		while ((match = datePattern.exec(this.data)) !== null) {
			months.add(match[0].substring(0, 7));
		}
		return [...months].sort().reverse();
	}

	private formatAmount(amt: HledgerAmount): string {
		const value = amt.aquantity.floatingPoint;
		const formatted = value.toFixed(amt.aquantity.decimalPlaces);
		return `${amt.acommodity}${formatted}`;
	}

	private amountColorCls(amt: HledgerAmount): string {
		const value = amt.aquantity.floatingPoint;
		if (value > 0) return "journal-amount journal-amount-positive";
		if (value < 0) return "journal-amount journal-amount-negative";
		return "journal-amount";
	}

	private buildBalanceTable(
		container: HTMLElement,
		rows: [string, HledgerAmount[]][]
	): void {
		if (rows.length === 0) return;

		const section = container.createDiv({ cls: "journal-section" });
		section.createEl("h3", { text: "Asset Balances" });

		const table = section.createEl("table", { cls: "journal-table" });
		const thead = table.createEl("thead");
		const headerRow = thead.createEl("tr");
		headerRow.createEl("th", { text: "Account" });
		headerRow.createEl("th", { text: "Balance", cls: "journal-amount" });

		const tbody = table.createEl("tbody");
		for (const [account, amounts] of rows) {
			const row = tbody.createEl("tr");
			row.createEl("td", { text: account });
			const amountCell = row.createEl("td", { cls: "journal-amount" });
			for (let i = 0; i < amounts.length; i++) {
				if (i > 0) amountCell.createEl("br");
				amountCell.createEl("span", {
					text: this.formatAmount(amounts[i]),
					cls: this.amountColorCls(amounts[i]),
				});
			}
		}
	}

	private buildRegisterTable(
		container: HTMLElement,
		entries: HledgerRegisterEntry[],
		title: string
	): void {
		const section = container.createDiv({ cls: "journal-section" });
		section.createEl("h3", { text: title });

		const table = section.createEl("table", { cls: "journal-table" });
		const thead = table.createEl("thead");
		const headerRow = thead.createEl("tr");
		for (const col of ["Date", "Details", "Other Account", "Amount", "Balance"]) {
			const cls = col === "Amount" || col === "Balance" ? "journal-amount" : undefined;
			headerRow.createEl("th", { text: col, cls });
		}

		const tbody = table.createEl("tbody");
		for (const entry of entries) {
			const row = tbody.createEl("tr");
			row.createEl("td", { text: entry.tdate });
			row.createEl("td", { text: entry.tdescription });
			row.createEl("td", { text: entry.otherAccounts.map(a => this.shortAccountName(a)).join(", ") });
			this.renderAmounts(row, entry.change);
			this.renderAmounts(row, entry.balance);
		}
	}

	private renderAmounts(row: HTMLElement, amounts: HledgerAmount[]): void {
		const cell = row.createEl("td", { cls: "journal-amount" });
		for (let i = 0; i < amounts.length; i++) {
			if (i > 0) cell.createEl("br");
			cell.createEl("span", {
				text: this.formatAmount(amounts[i]),
				cls: this.amountColorCls(amounts[i]),
			});
		}
	}

	private buildTransactionsTable(
		container: HTMLElement,
		txns: HledgerTransaction[],
		title: string
	): void {
		const section = container.createDiv({ cls: "journal-section" });
		section.createEl("h3", { text: title });

		const table = section.createEl("table", { cls: "journal-table" });
		const thead = table.createEl("thead");
		const headerRow = thead.createEl("tr");
		for (const col of ["Date", "Details", "Amount", "From", "To"]) {
			const cls = col === "Amount" ? "journal-amount" : undefined;
			headerRow.createEl("th", { text: col, cls });
		}

		const tbody = table.createEl("tbody");
		const reversed = [...txns].reverse();
		for (const txn of reversed) {
			const fromPosting = txn.tpostings.find(
				(p) =>
					p.pamount.length > 0 &&
					p.pamount[0].aquantity.floatingPoint < 0
			);
			const toPosting = txn.tpostings.find(
				(p) =>
					p.pamount.length > 0 &&
					p.pamount[0].aquantity.floatingPoint >= 0
			);

			const row = tbody.createEl("tr");
			row.createEl("td", { text: txn.tdate });
			row.createEl("td", { text: txn.tdescription });

			const amountCell = row.createEl("td", { cls: "journal-amount" });
			if (toPosting) {
				amountCell.addClass(
					toPosting.pamount[0].aquantity.floatingPoint >= 0
						? "journal-amount-positive"
						: "journal-amount-negative"
				);
				amountCell.setText(this.formatAmount(toPosting.pamount[0]));
			}

			row.createEl("td", { text: this.shortAccountName(fromPosting?.paccount ?? "") });
			row.createEl("td", { text: this.shortAccountName(toPosting?.paccount ?? "") });
		}
	}

	private buildAssertionsToggle(
		container: HTMLElement,
		expectedRender: number
	): void {
		const section = container.createDiv({ cls: "journal-section" });
		const details = section.createEl("details", {
			cls: "journal-assertions-toggle",
		});
		details.createEl("summary", { text: "Recent Balance Assertions" });
		const content = details.createDiv();
		let loaded = false;

		details.addEventListener("toggle", async () => {
			if (!details.open || loaded) return;
			loaded = true;
			content.createDiv({ cls: "journal-loading", text: "Loading..." });

			try {
				const allTxns = await print(this.data);
				if (expectedRender !== this.renderVersion) return;

				const latestByAccount = this.extractLatestAssertions(allTxns);
				content.empty();

				if (latestByAccount.length === 0) {
					content.createDiv({
						cls: "journal-loading",
						text: "No balance assertions found.",
					});
					return;
				}

				this.buildAssertionsTable(content, latestByAccount);
			} catch (e) {
				content.empty();
				content.createEl("pre", {
					cls: "journal-error",
					text: e instanceof Error ? e.message : String(e),
				});
			}
		});
	}

	private extractLatestAssertions(
		txns: HledgerTransaction[]
	): { date: string; account: string; amount: HledgerAmount }[] {
		const latest = new Map<
			string,
			{ date: string; account: string; amount: HledgerAmount; tindex: number }
		>();

		for (const txn of txns) {
			for (const posting of txn.tpostings) {
				if (!posting.pbalanceassertion) continue;

				const existing = latest.get(posting.paccount);
				const isNewer = !existing || txn.tindex > existing.tindex;
				if (isNewer) {
					latest.set(posting.paccount, {
						date: txn.tdate,
						account: posting.paccount,
						amount: posting.pbalanceassertion.baamount,
						tindex: txn.tindex,
					});
				}
			}
		}

		return [...latest.values()].sort((a, b) =>
			b.date.localeCompare(a.date)
		);
	}

	private buildAssertionsTable(
		container: HTMLElement,
		rows: { date: string; account: string; amount: HledgerAmount }[]
	): void {
		const table = container.createEl("table", { cls: "journal-table" });
		const thead = table.createEl("thead");
		const headerRow = thead.createEl("tr");
		headerRow.createEl("th", { text: "Date" });
		headerRow.createEl("th", { text: "Account" });
		headerRow.createEl("th", { text: "Asserted Balance", cls: "journal-amount" });

		const tbody = table.createEl("tbody");
		for (const row of rows) {
			const tr = tbody.createEl("tr");
			tr.createEl("td", { text: row.date });
			tr.createEl("td", { text: row.account });
			tr.createEl("td", {
				text: this.formatAmount(row.amount),
				cls: this.amountColorCls(row.amount),
			});
		}
	}

	private shortAccountName(account: string): string {
		return account.startsWith("assets:") ? account.slice(7) : account;
	}
}
