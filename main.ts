import { Notice, ObsidianProtocolData, Plugin, TFile } from "obsidian";
import BudgetFormModal, { BudgetFormData } from "./BudgetFormModal";
import {
	BudgetFormPluginSettings,
	BudgetFormSettingTab,
	DEFAULT_SETTINGS,
} from "./BudgetFormSettingTab";
import { initHledger, accounts, commodities } from "./hledger-wasm";
import { JournalView, JOURNAL_VIEW_TYPE } from "./JournalView";

const DEFAULT_CURRENCY = "RON";

export default class SimpleBudgetFormPlugin extends Plugin {
	settings: BudgetFormPluginSettings;
	cachedAccounts: string[] = [];
	cachedCommodities: string[] = [DEFAULT_CURRENCY];

	async onload() {
		await this.loadSettings();
		await this.initHledgerWasm();

		this.registerView(JOURNAL_VIEW_TYPE, (leaf) => new JournalView(leaf, this));
		this.registerExtensions(["journal"], JOURNAL_VIEW_TYPE);

		this.addRibbonIcon("dollar-sign", "Add a new budget entry", () =>
			this.openBudgetFormModal()
		);

		this.addCommand({
			id: "budget-form-modal",
			name: "Add a new budget entry",
			callback: () => this.openBudgetFormModal(),
		});

		this.addSettingTab(new BudgetFormSettingTab(this.app, this));

		// Example: obsidian://budgetForm/openBudgetFormData?amount=10.23&details=emag&fromAccount=assets:cash&toAccount=expenses:electronics&currency=RON
		this.registerObsidianProtocolHandler(
			"budgetForm/openBudgetFormData",
			this.handleProtocolUrl.bind(this)
		);
	}

	private handleProtocolUrl(data: ObsidianProtocolData) {
		const prefill: Partial<BudgetFormData> = {};

		if (data.amount && !isNaN(parseFloat(data.amount))) {
			prefill.fromAmount = parseFloat(data.amount);
		}
		if (data.currency) {
			prefill.fromCurrency = data.currency;
		}
		if (data.details) {
			prefill.details = data.details;
		}
		if (data.fromAccount) {
			prefill.fromAccount = data.fromAccount;
		}
		if (data.toAccount) {
			prefill.toAccount = data.toAccount;
		}
		if (data.toAmount && !isNaN(parseFloat(data.toAmount))) {
			prefill.toAmount = parseFloat(data.toAmount);
		}
		if (data.toCurrency) {
			prefill.toCurrency = data.toCurrency;
		}

		this.openBudgetFormModal(prefill);
	}

	private async openBudgetFormModal(prefill?: Partial<BudgetFormData>) {
		if (!this.settings.journalFilePath) {
			new Notice("Set the journal file path in plugin settings first");
			return;
		}

		const journalFile = this.app.vault.getAbstractFileByPath(
			this.settings.journalFilePath
		);
		if (!(journalFile instanceof TFile)) {
			new Notice(
				`Journal file not found: ${this.settings.journalFilePath}`
			);
			return;
		}

		const initialData: BudgetFormData = {
			date: new Date(),
			fromAccount: "",
			toAccount: "",
			fromAmount: 0,
			fromCurrency: DEFAULT_CURRENCY,
			toAmount: null,
			toCurrency: DEFAULT_CURRENCY,
			details: "",
			...prefill,
		};

		// Open form immediately with cached data
		const modal = new BudgetFormModal(
			initialData,
			{ accounts: this.cachedAccounts, commodities: this.cachedCommodities },
			this.app,
			(formData, onSuccess) =>
				this.appendTransaction(formData, journalFile, onSuccess)
		);
		modal.open();

		// Refresh dropdowns in the background if cache is empty
		if (this.cachedAccounts.length === 0) {
			this.refreshCache(journalFile).then(() => modal.updateOptions({
				accounts: this.cachedAccounts,
				commodities: this.cachedCommodities,
			}));
		}
	}

	async refreshCache(journalFile?: TFile): Promise<void> {
		if (!journalFile) {
			const f = this.app.vault.getAbstractFileByPath(this.settings.journalFilePath);
			if (!(f instanceof TFile)) return;
			journalFile = f;
		}

		const journalContent = await this.app.vault.read(journalFile);
		const [accountList, commodityList] = await Promise.all([
			accounts(journalContent),
			commodities(journalContent),
		]);

		if (!commodityList.includes(DEFAULT_CURRENCY)) {
			commodityList.unshift(DEFAULT_CURRENCY);
		}

		this.cachedAccounts = accountList;
		this.cachedCommodities = commodityList;
	}

	private async appendTransaction(
		data: BudgetFormData,
		journalFile: TFile,
		onSuccess: () => void
	) {
		try {
			const transaction = formatTransaction(data);
			await this.app.vault.append(journalFile, transaction);
			new Notice("Transaction added");
			onSuccess();
		} catch (e) {
			new Notice(
				`Failed to save: ${e instanceof Error ? e.message : String(e)}`
			);
		}
	}

	private async initHledgerWasm() {
		try {
			await initHledger(this.app);
		} catch (e) {
			console.error("hledger-wasm init failed:", e);
		}
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

function formatTransaction(data: BudgetFormData): string {
	const yyyy = data.date.getFullYear();
	const mm = String(data.date.getMonth() + 1).padStart(2, "0");
	const dd = String(data.date.getDate()).padStart(2, "0");
	const dateStr = `${yyyy}-${mm}-${dd}`;
	const created = Math.floor(data.date.getTime() / 1000);
	const details = data.details.replace(/\n/g, " ").trim().toLowerCase();

	const lines = [`${dateStr} ${details}  ; created:${created}`];

	if (data.toAmount !== null) {
		lines.push(
			`    ${data.toAccount}  ${data.toCurrency}${data.toAmount}`
		);
	} else {
		lines.push(`    ${data.toAccount}`);
	}
	lines.push(
		`    ${data.fromAccount}  ${data.fromCurrency}-${data.fromAmount}`
	);

	return "\n" + lines.join("\n") + "\n";
}
