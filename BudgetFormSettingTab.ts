import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import BudgetFormPlugin from "./main";
import { isFile, isFolder } from "./helpers";

export interface BudgetFormPluginPluginSettings {
	accountsFolderPath: string;
	tagsFolderPath: string;
	templateFilePath: string;
	createdFilePathTemplate: string;
	summaryFilePath: string;
}

export const DEFAULT_SETTINGS: BudgetFormPluginPluginSettings = {
	accountsFolderPath: "finance/budget/accounts",
	tagsFolderPath: "finance/budget/tags",
	templateFilePath: "finance/budget/template/budget entry.md",
	createdFilePathTemplate:
		"finance/budget/{year}/{month}/{day}-{month}-{year}-{details}",
	summaryFilePath: "",
};

export class BudgetFormSettingTab extends PluginSettingTab {
	plugin: BudgetFormPlugin;

	constructor(app: App, plugin: BudgetFormPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl("h2", { text: "Settings for my awesome plugin." });

		new Setting(containerEl)
			.setName("Accounts Folder Path")
			.setDesc(
				"The files from this folder will be linked in the to and from account fields"
			)
			.addText((text) =>
				text
					.setValue(this.plugin.settings.accountsFolderPath)
					.onChange(async (value) => {
						this.plugin.settings.accountsFolderPath = value;
						await this.plugin.saveSettings();
					})
			)
			.addButton((cb) =>
				cb
					.setButtonText("Test")
					.setCta()
					.onClick(() => {
						this.isFolder(this.plugin.settings.accountsFolderPath);
					})
			);

		new Setting(containerEl)
			.setName("Tags Folder Path")
			.setDesc(
				"The files from this folder will be linked in the tag field"
			)
			.addText((text) =>
				text
					.setValue(this.plugin.settings.tagsFolderPath)
					.onChange(async (value) => {
						this.plugin.settings.tagsFolderPath = value;
						await this.plugin.saveSettings();
					})
			)
			.addButton((cb) =>
				cb
					.setButtonText("Test")
					.setCta()
					.onClick(() => {
						this.isFolder(this.plugin.settings.tagsFolderPath);
					})
			);

		new Setting(containerEl)
			.setName("Template File Path")
			.setDesc(
				"This file will be used as a template to insert the values filled in the form"
			)
			.addText((text) =>
				text
					.setValue(this.plugin.settings.templateFilePath)
					.onChange(async (value) => {
						this.plugin.settings.templateFilePath = value;
						await this.plugin.saveSettings();
					})
			)
			.addButton((cb) =>
				cb
					.setButtonText("Test")
					.setCta()
					.onClick(() => {
						this.isFile(this.plugin.settings.templateFilePath);
					})
			);

		new Setting(containerEl)
			.setName("Created Filename template")
			.setDesc("The file path of the newly created form ")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.createdFilePathTemplate)
					.onChange(async (value) => {
						this.plugin.settings.createdFilePathTemplate = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Summary File path")
			.setDesc(
				"If you want to display the summary after a new note is created, complete the summary path"
			)
			.addText((text) =>
				text
					.setValue(this.plugin.settings.summaryFilePath)
					.onChange(async (value) => {
						this.plugin.settings.summaryFilePath = value;
						await this.plugin.saveSettings();
					})
			)
			.addButton((cb) =>
				cb
					.setButtonText("Test")
					.setCta()
					.onClick(() => {
						this.isFile(this.plugin.settings.summaryFilePath);
					})
			);
	}

	private isFolder(folderPath: string) {
		if (isFolder(folderPath, this.plugin.app.vault)) {
			new Notice("Folder path is valid!");
		} else {
			new Notice("Folder path is INVALID!");
		}
	}

	private isFile(filePath: string) {
		if (isFile(filePath, this.plugin.app.vault)) {
			new Notice("File path is valid!");
		} else {
			new Notice("File path is INVALID!");
		}
	}
}
