import { App, PluginSettingTab, Setting } from "obsidian";
import BudgetFormPlugin from "./main";

export interface BudgetFormPluginPluginSettings {
	accountsFolderPath: string;
	tagsFolderPath: string;
	templateFilePath: string;
	createdFilePathTemplate: string;
	summaryFilePath: string;
}

export const DEFAULT_SETTINGS: BudgetFormPluginPluginSettings = {
	accountsFolderPath: "",
	tagsFolderPath: "",
	templateFilePath: "",
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
			.addText((text) =>
				text
					.setValue(this.plugin.settings.accountsFolderPath)
					.onChange(async (value) => {
						this.plugin.settings.accountsFolderPath = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl).setName("Tags Folder Path").addText((text) =>
			text
				.setValue(this.plugin.settings.tagsFolderPath)
				.onChange(async (value) => {
					this.plugin.settings.tagsFolderPath = value;
					await this.plugin.saveSettings();
				})
		);

		new Setting(containerEl).setName("Template File Path").addText((text) =>
			text
				.setValue(this.plugin.settings.templateFilePath)
				.onChange(async (value) => {
					this.plugin.settings.templateFilePath = value;
					await this.plugin.saveSettings();
				})
		);

		new Setting(containerEl)
			.setName("Created Filename template")
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
			);
	}
}
