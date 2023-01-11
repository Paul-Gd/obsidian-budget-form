import { Notice, Plugin } from "obsidian";
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

	getInitialData(): BudgetFormData {
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
		this.addRibbonIcon("dollar-sign", "Add/edit entry", async () => {
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

			new BudgetFormModal(
				this.getInitialData(),
				{ accounts, tags },
				this.app,
				this.createFile.bind(this)
			).open();
		});
		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new BudgetFormSettingTab(this.app, this));
	}

	async createFile(formData: BudgetFormData, onSuccess: () => void) {
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
