import { App, Modal, Notice, Setting } from "obsidian";

export interface BudgetFormData {
	date: Date;
	fromAccount: string;
	toAccount: string;
	fromAmount: number;
	fromCurrency: string;
	toAmount: number | null;
	toCurrency: string;
	details: string;
}

interface FormOptions {
	accounts: string[];
	commodities: string[];
}

export default class BudgetFormModal extends Modal {
	private input: BudgetFormData;
	private formOptions: FormOptions;
	private onSubmit: (data: BudgetFormData, onSuccess: () => void) => void;
	private fromAccountSelect: HTMLSelectElement | null = null;
	private toAccountSelect: HTMLSelectElement | null = null;
	private fromCurrencySelect: HTMLSelectElement | null = null;
	private toCurrencySelect: HTMLSelectElement | null = null;

	constructor(
		initialData: BudgetFormData,
		formOptions: FormOptions,
		app: App,
		onSubmit: (data: BudgetFormData, onSuccess: () => void) => void
	) {
		super(app);
		this.input = { ...initialData };
		this.formOptions = formOptions;
		this.onSubmit = onSubmit;
	}

	updateOptions(options: FormOptions): void {
		this.formOptions = options;
		this.repopulateSelect(this.fromAccountSelect, options.accounts, this.input.fromAccount);
		this.repopulateSelect(this.toAccountSelect, options.accounts, this.input.toAccount);
		this.repopulateSelect(this.fromCurrencySelect, options.commodities, this.input.fromCurrency);
		this.repopulateSelect(this.toCurrencySelect, options.commodities, this.input.toCurrency);
	}

	private repopulateSelect(
		select: HTMLSelectElement | null,
		items: string[],
		currentValue: string
	): void {
		if (!select) return;
		select.empty();
		select.createEl("option", { value: "", text: "" });
		for (const item of items) {
			select.createEl("option", { value: item, text: item });
		}
		select.value = currentValue;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h1", { text: "New transaction" });

		// Date + time
		const localDateTime = new Date(
			this.input.date.getTime() -
				this.input.date.getTimezoneOffset() * 60000
		);
		localDateTime.setMilliseconds(0);
		localDateTime.setSeconds(0);

		new Setting(contentEl).setName("Date").addText((component) => {
			if (!component.inputEl.parentElement) return;
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
		});

		// Account dropdowns
		new Setting(contentEl).setName("From account").addDropdown((dd) => {
			this.fromAccountSelect = dd.selectEl;
			dd.addOption("", "");
			for (const acc of this.formOptions.accounts) dd.addOption(acc, acc);
			dd.setValue(this.input.fromAccount);
			dd.onChange((v) => { this.input.fromAccount = v; });
		});

		new Setting(contentEl).setName("To account").addDropdown((dd) => {
			this.toAccountSelect = dd.selectEl;
			dd.addOption("", "");
			for (const acc of this.formOptions.accounts) dd.addOption(acc, acc);
			dd.setValue(this.input.toAccount);
			dd.onChange((v) => { this.input.toAccount = v; });
		});

		// From amount (required) + currency
		new Setting(contentEl)
			.setName("From amount")
			.addText((component) => {
				if (!component.inputEl.parentElement) return;
				const numInput = component.inputEl.parentElement.createEl(
					"input",
					{
						type: "number",
						value:
							this.input.fromAmount > 0
								? this.input.fromAmount.toString()
								: "",
					}
				);
				numInput.step = "0.01";
				numInput.addEventListener("input", (ev: Event) => {
					if (ev.target instanceof HTMLInputElement) {
						this.input.fromAmount =
							parseFloat(ev.target.value) || 0;
					}
				});
				component.inputEl.parentElement.removeChild(
					component.inputEl
				);
			})
			.addDropdown((dd) => {
				this.fromCurrencySelect = dd.selectEl;
				for (const c of this.formOptions.commodities) dd.addOption(c, c);
				dd.setValue(this.input.fromCurrency);
				dd.onChange((v) => { this.input.fromCurrency = v; });
			});

		// To amount (optional) + currency
		new Setting(contentEl)
			.setName("To amount (optional)")
			.addText((component) => {
				if (!component.inputEl.parentElement) return;
				const numInput = component.inputEl.parentElement.createEl(
					"input",
					{
						type: "number",
						value:
							this.input.toAmount !== null
								? this.input.toAmount.toString()
								: "",
					}
				);
				numInput.step = "0.01";
				numInput.placeholder = "Leave empty for same currency";
				numInput.addEventListener("input", (ev: Event) => {
					if (ev.target instanceof HTMLInputElement) {
						const val = ev.target.value.trim();
						this.input.toAmount = val
							? parseFloat(val) || 0
							: null;
					}
				});
				component.inputEl.parentElement.removeChild(
					component.inputEl
				);
			})
			.addDropdown((dd) => {
				this.toCurrencySelect = dd.selectEl;
				for (const c of this.formOptions.commodities) dd.addOption(c, c);
				dd.setValue(this.input.toCurrency);
				dd.onChange((v) => { this.input.toCurrency = v; });
			});

		// Details
		new Setting(contentEl).setName("Details").addText((text) => {
			text.setValue(this.input.details);
			text.onChange((v) => {
				this.input.details = v;
			});
		});

		// Submit
		new Setting(contentEl).addButton((btn) =>
			btn
				.setButtonText("Submit")
				.setCta()
				.onClick(() => {
					if (this.validate()) {
						this.onSubmit(this.input, () => this.close());
					}
				})
		);
	}

	private validate(): boolean {
		if (!this.input.fromAccount || !this.input.toAccount) {
			new Notice("Select both From and To accounts");
			return false;
		}
		if (this.input.fromAccount === this.input.toAccount) {
			new Notice("From and To accounts cannot be the same");
			return false;
		}
		if (!this.input.fromAmount || this.input.fromAmount <= 0) {
			new Notice("From amount must be greater than 0");
			return false;
		}
		if (!this.input.details.trim()) {
			new Notice("Details cannot be empty");
			return false;
		}
		return true;
	}

	onClose() {
		this.contentEl.empty();
	}
}
