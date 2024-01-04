import {
	Notice,
	ObsidianProtocolData,
	Plugin,
} from "obsidian";
import BudgetFormModal, { BudgetFormData } from "./BudgetFormModal";
import {
	createMarkdownFile,
	focusOrOpenFileInEditor,
	loadFileLinksFromFolder,
	readFileContent,
} from "./helpers";
import {
	BudgetFormPluginPluginSettings,
	BudgetFormSettingTab,
	DEFAULT_SETTINGS,
} from "./BudgetFormSettingTab";

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
			!this.settings.templateFilePath
		) {
			new Notice(
				"Define 'Accounts Folder Path', 'Tags Folder Path' and 'Tags Folder Path' from settings"
			);
			return;
		}
		const { accounts, tags, entryTemplate } =
			await this.getPluginSettings();
		if (!accounts || !tags || !entryTemplate) {
			new Notice(
				"Could not find accounts folder, tags folder or template files!"
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
			this.createFile.bind(this)
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

	private async createFile(formData: BudgetFormData, onSuccess: () => void) {
		const createdFileTemplate = await readFileContent(
			this.settings.templateFilePath,
			this.app.vault
		);
		if (!createdFileTemplate) {
			new Notice("Could not read file template!");
			return;
		}
		const createdFilePathTemplate = this.settings.createdFilePathTemplate;
		const processedFormData = {
			...formData,
			date: formData.date.toISOString(),
		};
		const fileContent = Object.entries(processedFormData).reduce(
			(acc, [k, v]) => acc.replace(`{${k}}`, v.toString()),
			createdFileTemplate
		);
		const fileName = createdFilePathTemplate
			.replace(/{year}/g, formData.date.getFullYear().toString())
			.replace(
				/{month}/g,
				(formData.date.getMonth() + 1).toString().padStart(2, "0")
			)
			.replace(
				/{day}/g,
				formData.date.getDate().toString().padStart(2, "0")
			)
			.replace(/{details}/g, formData.details.toLowerCase().trim());
		try {
			await createMarkdownFile(fileName, fileContent, this.app.vault);
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
