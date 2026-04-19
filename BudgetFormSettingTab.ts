import { App, Notice, PluginSettingTab, Setting, TFile } from "obsidian";
import BudgetFormPlugin from "./main";

export interface JournalViewState {
	selectedMonth: string;
	selectedAccount: string;
	selectedLimit: number;
}

export interface BudgetFormPluginSettings {
	journalFilePath: string;
	journalViewState: JournalViewState;
}

export const DEFAULT_SETTINGS: BudgetFormPluginSettings = {
	journalFilePath: "",
	journalViewState: {
		selectedMonth: "",
		selectedAccount: "",
		selectedLimit: 0,
	},
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

		containerEl.createEl("h2", {
			text: "Budget Form Settings",
		});

		new Setting(containerEl)
			.setName("Journal File Path")
			.setDesc(
				"Path to the .journal file where transactions are stored"
			)
			.addText((text) =>
				text
					.setPlaceholder("finance/main.journal")
					.setValue(this.plugin.settings.journalFilePath)
					.onChange(async (value) => {
						this.plugin.settings.journalFilePath = value;
						await this.plugin.saveSettings();
					})
			)
			.addButton((cb) =>
				cb
					.setButtonText("Test")
					.setCta()
					.onClick(() => {
						const path =
							this.plugin.settings.journalFilePath;
						const isValid =
							this.plugin.app.vault.getAbstractFileByPath(
								path
							) instanceof TFile;
						new Notice(
							isValid
								? "File path is valid!"
								: "File path is INVALID!"
						);
					})
			);
	}
}
