import { App, Modal, Notice, Setting } from "obsidian";

export interface BudgetFormData {
	date: Date;
	fromAccount: string;
	toAccount: string;
	amount: number;
	tag: string;
	details: string;
}

interface FormOptions {
	accounts: {
		[path: string]: string;
	};
	tags: {
		[path: string]: string;
	};
}

export default class BudgetFormModal extends Modal {
	onSubmit: (result: BudgetFormData, onSuccess: () => void) => void;
	input: BudgetFormData;
	errors: string[];
	formOptions: FormOptions;

	constructor(
		initialData: BudgetFormData,
		formOptions: FormOptions,
		app: App,
		onSubmit: (result: BudgetFormData, onSuccess: () => void) => void
	) {
		super(app);
		this.onSubmit = onSubmit;
		this.input = { ...initialData };
		this.errors = [];
		this.formOptions = formOptions;
	}

	onOpen() {
		const { contentEl } = this;

		contentEl.createEl("h1", { text: "Insert the following:" });

		const localDateTime = new Date(
			this.input.date.getTime() -
				this.input.date.getTimezoneOffset() * 60000
		);
		localDateTime.setMilliseconds(0);
		localDateTime.setSeconds(0);

		new Setting(contentEl).setName("Date").addText((component) => {
			if (component.inputEl.parentElement) {
				// Add an input for date and remove the original text box child input
				component.inputEl.parentElement
					.createEl("input", {
						type: "datetime-local",
						value: localDateTime.toISOString().slice(0, -1),
					})
					.addEventListener("input", (ev: Event) => {
						if (ev.target instanceof HTMLInputElement) {
							this.input.date = new Date(ev.target.value);
						}
					});
				component.inputEl.parentElement.removeChild(component.inputEl);
			}
		});

		new Setting(contentEl)
			.setName("From account")
			.addDropdown((component) => {
				component.addOptions(this.formOptions.accounts);
				component.setValue(this.input.fromAccount);
				component.onChange((value) => {
					this.input.fromAccount = value;
				});
			});

		new Setting(contentEl)
			.setName("To account")
			.addDropdown((component) => {
				component.addOptions(this.formOptions.accounts);
				component.setValue(this.input.toAccount);
				component.onChange((value) => {
					this.input.toAccount = value;
				});
			});

		new Setting(contentEl).setName("Amount").addText((component) => {
			if (component.inputEl.parentElement) {
				component.inputEl.parentElement
					.createEl("input", {
						type: "number",
						value: this.input.amount.toString(),
					})
					.addEventListener("input", (ev: Event) => {
						if (ev.target instanceof HTMLInputElement) {
							this.input.amount = parseFloat(ev.target.value);
						}
					});
				component.inputEl.parentElement.removeChild(component.inputEl);
			}
		});

		new Setting(contentEl).setName("Tag").addDropdown((component) => {
			component.addOptions(this.formOptions.tags);
			component.setValue(this.input.tag);
			component.onChange((value) => {
				this.input.tag = value;
			});
		});

		new Setting(contentEl).setName("Details").addText((text) => {
			text.setValue(this.input.details);
			text.onChange((value) => {
				this.input.details = value;
			});
		});

		new Setting(contentEl).addButton((btn) =>
			btn
				.setButtonText("Submit")
				.setCta()
				.onClick(() => {
					if (this.validateInputAndShowErrors()) {
						this.onSubmit(this.input, () => this.close());
					}
				})
		);
	}

	private validateInputAndShowErrors(): boolean {
		const emptyObjects = Object.entries(this.input).filter(([, v]) => !v);
		if (emptyObjects.length !== 0) {
			new Notice(
				"Please write something in " +
					emptyObjects.map(([k, ]) => k).join(", ")
			);
			return false;
		}
		if (this.input.fromAccount === this.input.toAccount) {
			new Notice("From and to account cannot be the same!");
			return false;
		}
		return true;
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
