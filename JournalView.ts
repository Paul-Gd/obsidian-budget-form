import { TextFileView, WorkspaceLeaf, setIcon } from "obsidian";
import {
	balance,
	print,
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
			const [bal, txns] = await Promise.all([
				balance(this.data),
				print(this.data),
			]);

			if (thisRender !== this.renderVersion) return;
			this.previewEl.empty();

			this.buildTransactionsTable(this.previewEl, txns);
			this.buildBalanceTable(this.previewEl, bal);
		} catch (e) {
			if (thisRender !== this.renderVersion) return;
			this.previewEl.empty();
			this.previewEl.createDiv({
				cls: "journal-error",
				text: e instanceof Error ? e.message : String(e),
			});
		}
	}

	private formatAmount(amt: HledgerAmount): string {
		const value = amt.aquantity.floatingPoint;
		const formatted = value.toFixed(amt.aquantity.decimalPlaces);
		return `${amt.acommodity}${formatted}`;
	}

	private buildBalanceTable(
		container: HTMLElement,
		rows: [string, HledgerAmount[]][]
	): void {
		const section = container.createDiv({ cls: "journal-section" });
		section.createEl("h3", { text: "Balance" });

		const table = section.createEl("table", { cls: "journal-table" });
		const thead = table.createEl("thead");
		const headerRow = thead.createEl("tr");
		headerRow.createEl("th", { text: "Account" });
		headerRow.createEl("th", { text: "Balance", cls: "journal-amount" });

		const tbody = table.createEl("tbody");
		for (const [account, amounts] of rows) {
			const row = tbody.createEl("tr");
			row.createEl("td", { text: account });
			row.createEl("td", {
				text: amounts.map((a) => this.formatAmount(a)).join(", "),
				cls: "journal-amount",
			});
		}
	}

	private buildTransactionsTable(
		container: HTMLElement,
		txns: HledgerTransaction[]
	): void {
		const section = container.createDiv({ cls: "journal-section" });
		section.createEl("h3", { text: `Transactions (${txns.length})` });

		const table = section.createEl("table", { cls: "journal-table" });
		const thead = table.createEl("thead");
		const headerRow = thead.createEl("tr");
		for (const col of ["Date", "Description", "Amount", "From", "To"]) {
			const cls = col === "Amount" ? "journal-amount" : undefined;
			headerRow.createEl("th", { text: col, cls });
		}

		const tbody = table.createEl("tbody");
		const reversed = [...txns].reverse();
		for (const txn of reversed) {
			const fromPosting = txn.tpostings.find(
				(p) => p.pamount.length > 0 && p.pamount[0].aquantity.floatingPoint < 0
			);
			const toPosting = txn.tpostings.find(
				(p) => p.pamount.length > 0 && p.pamount[0].aquantity.floatingPoint >= 0
			);

			const row = tbody.createEl("tr");
			row.createEl("td", { text: txn.tdate });
			row.createEl("td", { text: txn.tdescription });
			row.createEl("td", {
				text: toPosting
					? this.formatAmount(toPosting.pamount[0])
					: "",
				cls: "journal-amount",
			});
			row.createEl("td", { text: fromPosting?.paccount ?? "" });
			row.createEl("td", { text: toPosting?.paccount ?? "" });
		}
	}
}
