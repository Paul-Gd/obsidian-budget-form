import {
	Notice,
	ObsidianProtocolData,
	Plugin,
} from "obsidian";
import BudgetFormModal, { BudgetFormData } from "./BudgetFormModal";
import {
	focusOrOpenFileInEditor,
	loadFileLinksFromFolder,
	readFileContent,
	initializeJsonFile,
	getAllBudgetEntries,
	saveAllBudgetEntries,
} from "./helpers";
import {
	BudgetFormPluginPluginSettings,
	BudgetFormSettingTab,
	DEFAULT_SETTINGS,
} from "./BudgetFormSettingTab";
import {
	initHledger,
	accounts,
	balance,
	print,
	commodities,
} from "./hledger-wasm";

export default class SimpleBudgetFormPlugin extends Plugin {
	settings: BudgetFormPluginPluginSettings;

	getInitialDefaultData(): BudgetFormData {
		return {
			date: new Date(),
			amount: 0,
			details: "",
			fromAccount: "",
			toAccount: "",
			tag: "",
		};
	}

	async onload() {
		await this.loadSettings();
		try {
			await initializeJsonFile(this.settings.jsonFilePath, this.app.vault);
		} catch (e) {
			// JSON file may already exist on disk — safe to ignore
		}

		this.initHledgerWasm();

		// This creates an icon in the left ribbon.
		this.addRibbonIcon(
			"dollar-sign",
			"Add a new budget entry",
			this.openBudgetFormModal.bind(this)
		);
		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: "budget-form-modal",
			name: "Add a new budget entry",
			callback: this.openBudgetFormModal.bind(this),
		});
		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new BudgetFormSettingTab(this.app, this));
		// This adds handler for obsidian urls
		// Example obsidian://budgetForm/openBudgetFormData?amount=10.23&details=something&fromAccount=cash&toAccount=expenses&tag=going%20out
		this.registerObsidianProtocolHandler(
			"budgetForm/openBudgetFormData",
			this.handleObsidianProtocolOpenBudgetForm.bind(this)
		);
	}

	private handleObsidianProtocolOpenBudgetForm(data: ObsidianProtocolData) {
		console.log("opening link", data);
		const formData: BudgetFormData = this.getInitialDefaultData();
		if (!isNaN(parseFloat(data.amount))) {
			formData.amount = parseFloat(data.amount);
		}
		if ("details" in data) {
			formData.details = data.details;
		}
		if ("fromAccount" in data) {
			formData.fromAccount = data.fromAccount;
		}
		if ("toAccount" in data) {
			formData.toAccount = data.toAccount;
		}
		if ("tag" in data) {
			formData.tag = data.tag;
		}

		this.openBudgetFormModal(formData).then();
	}

	private async openBudgetFormModal(partialInitialData?: BudgetFormData) {
		if (
			!this.settings.accountsFolderPath ||
			!this.settings.tagsFolderPath ||
			!this.settings.templateFilePath ||
			!this.settings.jsonFilePath
		) {
			new Notice(
				"Define 'Accounts Folder Path', 'Tags Folder Path', 'Template File Path', and 'JSON File Path' from settings"
			);
			return;
		}
		const { accounts, tags, entryTemplate } =
			await this.getPluginSettings();
		if (!accounts || !tags || !entryTemplate) {
			new Notice(
				"Could not find accounts folder, tags folder, or template file!"
			);
			return;
		}
		const initialData = this.getInitialData(
			partialInitialData,
			accounts,
			tags
		);

		new BudgetFormModal(
			initialData,
			{ accounts, tags },
			this.app,
			this.saveEntryToJson.bind(this)
		).open();
	}

	private getInitialData(
		partialInitialData: BudgetFormData | undefined,
		accounts: { [p: string]: string },
		tags: { [p: string]: string }
	): BudgetFormData {
		const initialData: BudgetFormData = {
			...this.getInitialDefaultData(),
			...partialInitialData,
		};

		if (initialData.toAccount) {
			initialData.toAccount = (Object.entries(accounts).find(
				([, value]) => value === initialData.toAccount
			) || [initialData.toAccount])[0];
		}
		if (initialData.fromAccount) {
			initialData.fromAccount = (Object.entries(accounts).find(
				([, value]) => value === initialData.fromAccount
			) || [initialData.fromAccount])[0];
		}

		if (initialData.tag) {
			initialData.tag = (Object.entries(tags).find(
				([, value]) => value === initialData.tag
			) || [initialData.tag])[0];
		}
		return initialData;
	}

	private async saveEntryToJson(formData: BudgetFormData, onSuccess: () => void) {
		try {
			const entries = await getAllBudgetEntries(this.settings.jsonFilePath, this.app.vault);
			const newEntry = {
				date: formData.date.toISOString(),
				fromAccount: formData.fromAccount,
				toAccount: formData.toAccount,
				amount: formData.amount,
				tag: formData.tag,
				details: formData.details.toLowerCase().trim(),
			};
			// entries.push(newEntry);
			await saveAllBudgetEntries(this.settings.jsonFilePath, entries, this.app.vault);
			onSuccess();

			const summaryFilePath = this.settings.summaryFilePath;
			if (summaryFilePath)
				await focusOrOpenFileInEditor(
					summaryFilePath,
					this.app.workspace,
					this.app.vault
				);
		} catch (error) {
			new Notice(error.message);
		}
	}

	private async getPluginSettings() {
		const accounts = loadFileLinksFromFolder(
			this.settings.accountsFolderPath,
			this.app.vault
		);
		const tags = loadFileLinksFromFolder(
			this.settings.tagsFolderPath,
			this.app.vault
		);
		const entryTemplate = await readFileContent(
			this.settings.templateFilePath,
			this.app.vault
		);
		return { accounts, tags, entryTemplate };
	}

	private async initHledgerWasm() {
		try {
			await initHledger(this.app);

			const demoJournal = `
2023-01-01 opening balance  ; created:1672600010
    assets:bank             RON1000
    equity:opening-balances

2023-01-15 groceries  ; created:1673800000
    expenses:food        RON150
    assets:bank

2023-01-20 salary  ; created:1674200000
    assets:bank          RON5000
    income:work:salary
`;
			const [accs, bal, txns, coms] = await Promise.all([
				accounts(demoJournal),
				balance(demoJournal),
				print(demoJournal),
				commodities(demoJournal),
			]);

			console.log("hledger-wasm accounts:", accs);
			console.log("hledger-wasm balance:", bal);
			console.log("hledger-wasm print:", txns);
			console.log("hledger-wasm commodities:", coms);
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
