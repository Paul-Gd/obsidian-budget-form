import { TextFileView, WorkspaceLeaf, setIcon } from "obsidian";
import {
	accounts,
	balance,
	print,
	aregister,
	HledgerAmount,
	HledgerTransaction,
} from "./hledger-wasm";

export const JOURNAL_VIEW_TYPE = "journal-view";

type ViewMode = "source" | "preview";

export class JournalView extends TextFileView {
	private mode: ViewMode = "preview";
	private editorEl: HTMLTextAreaElement;
	private previewEl: HTMLDivElement;
	private toggleAction: HTMLElement;
	private renderVersion = 0;
	private selectedMonth = "";
	private selectedAccount = "";

	getViewType(): string {
		return JOURNAL_VIEW_TYPE;
	}

	getDisplayText(): string {
		return this.file?.basename ?? "Journal";
	}

	async onOpen(): Promise<void> {
		this.editorEl = this.contentEl.createEl("textarea", {
			cls: "journal-source",
		});
		this.editorEl.addEventListener("input", () => {
			this.requestSave();
		});
		this.editorEl.hide();

		this.previewEl = this.contentEl.createDiv({ cls: "journal-preview" });

		this.toggleAction = this.addAction(
			"code",
			"Toggle source/preview",
			() => this.toggleMode()
		);
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	getViewData(): string {
		if (this.mode === "source") {
			return this.editorEl.value;
		}
		return this.data;
	}

	setViewData(data: string, clear: boolean): void {
		this.data = data;
		this.editorEl.value = data;
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
		this.editorEl.value = "";
		this.previewEl.empty();
		this.renderVersion++;
	}

	private toggleMode(): void {
		if (this.mode === "source") {
			this.data = this.editorEl.value;
			this.mode = "preview";
			this.editorEl.hide();
			this.previewEl.show();
			setIcon(this.toggleAction, "code");
			this.renderPreview();
		} else {
			this.editorEl.value = this.data;
			this.mode = "source";
			this.previewEl.hide();
			this.editorEl.show();
			setIcon(this.toggleAction, "book-open");
		}
	}

	private async renderPreview(): Promise<void> {
		const thisRender = ++this.renderVersion;
		this.previewEl.empty();
		this.previewEl.createDiv({ cls: "journal-loading", text: "Loading..." });

		try {
			const accountList = await accounts(this.data);
			if (thisRender !== this.renderVersion) return;

			this.previewEl.empty();
			this.buildFilterBar(this.previewEl, accountList);

			const dateFilter: string[] = this.selectedMonth
				? [`date:${this.selectedMonth}`]
				: [];

			if (this.selectedAccount) {
				const entries = await aregister(
					this.data,
					this.selectedAccount,
					...dateFilter
				);
				if (thisRender !== this.renderVersion) return;
				this.buildRegisterTable(
					this.previewEl,
					entries,
					`${this.selectedAccount} (${entries.length})`,
					this.selectedAccount
				);
			} else {
				const txns = await print(this.data, ...dateFilter);
				if (thisRender !== this.renderVersion) return;
				this.buildTransactionsTable(
					this.previewEl,
					txns,
					`Transactions (${txns.length})`
				);
			}

			// Asset balances — always full history, not filtered by period
			const assetBal = await balance(this.data, "assets");
			if (thisRender !== this.renderVersion) return;
			this.buildBalanceTable(this.previewEl, assetBal);
		} catch (e) {
			if (thisRender !== this.renderVersion) return;
			this.previewEl.empty();
			this.previewEl.createDiv({
				cls: "journal-error",
				text: e instanceof Error ? e.message : String(e),
			});
		}
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
			this.renderPreview();
		});

		const accountGroup = bar.createDiv({ cls: "journal-filter" });
		accountGroup.createEl("label", { text: "Account" });
		const accountSelect = accountGroup.createEl("select");

		const allAccOpt = accountSelect.createEl("option", { text: "All" });
		allAccOpt.value = "";
		for (const acc of accountList) {
			const opt = accountSelect.createEl("option", { text: acc });
			opt.value = acc;
		}
		accountSelect.value = this.selectedAccount;
		accountSelect.addEventListener("change", () => {
			this.selectedAccount = accountSelect.value;
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
		txns: HledgerTransaction[],
		title: string,
		selectedAccount: string
	): void {
		const section = container.createDiv({ cls: "journal-section" });
		section.createEl("h3", { text: title });

		const table = section.createEl("table", { cls: "journal-table" });
		const thead = table.createEl("thead");
		const headerRow = thead.createEl("tr");
		for (const col of ["Date", "Details", "Other Account", "Amount"]) {
			const cls = col === "Amount" ? "journal-amount" : undefined;
			headerRow.createEl("th", { text: col, cls });
		}

		const tbody = table.createEl("tbody");
		const reversed = [...txns].reverse();
		for (const txn of reversed) {
			const matchedPosting = txn.tpostings.find(
				(p) => p.paccount === selectedAccount
			);
			const otherPosting = txn.tpostings.find(
				(p) => p.paccount !== selectedAccount
			);

			const row = tbody.createEl("tr");
			row.createEl("td", { text: txn.tdate });
			row.createEl("td", { text: txn.tdescription });
			row.createEl("td", { text: otherPosting?.paccount ?? "" });

			const amountCell = row.createEl("td", { cls: "journal-amount" });
			const changeAmounts = matchedPosting?.pamount ?? [];
			for (let i = 0; i < changeAmounts.length; i++) {
				if (i > 0) amountCell.createEl("br");
				amountCell.createEl("span", {
					text: this.formatAmount(changeAmounts[i]),
					cls: this.amountColorCls(changeAmounts[i]),
				});
			}
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

			row.createEl("td", { text: fromPosting?.paccount ?? "" });
			row.createEl("td", { text: toPosting?.paccount ?? "" });
		}
	}
}
