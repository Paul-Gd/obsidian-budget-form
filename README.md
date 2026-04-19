# Obsidian Budget Form

A simple, **opinionated** Obsidian plugin for personal accounting using [hledger](https://hledger.org/) journal files. Transactions are stored in a standard `.journal` file and processed in-browser via [hledger-wasm](https://github.com/reesericci/hledger-wasm).

## Example

Check the [example vault](./budget-form-example-vault) (download `budget-form-example-vault.zip`
from [the release page](https://github.com/Paul-Gd/obsidian-budget-form/releases)) to try this plugin out.

## How to install

Download the latest version (`budget-form-plugin.zip`)
from [the release page](https://github.com/Paul-Gd/obsidian-budget-form/releases) and unzip it in the plugin folder (
usually located at `/path-to-your-vault/.obsidian/plugins`).

The release zip includes `hledger-wasm.wasm` (~17MB) bundled alongside `main.js`.

## How to use

### Journal view

Open any `.journal` file in Obsidian. The plugin registers a custom view with two modes:

- **Preview mode** — interactive UI with filters, transaction tables, and balances
- **Source mode** — CodeMirror editor with line numbers for direct editing

Toggle between modes using the code icon in the view actions bar.

### Preview mode UI

**Filters** (top of page):
- **Month** — filter transactions by month
- **Account** — select an account to see its register, or "All" for all transactions
- **Last** — limit the number of rows displayed

**Transactions table**:
- With no account selected: shows all transactions (date, details, amount, from, to)
- With an account selected: shows that account's register with running balance

**Asset balances**: always visible below the transactions, showing the balance of all `assets:*` accounts.

**Balance assertions**: collapsible section showing the most recent balance assertion per account (date, account, asserted balance).

### Adding transactions

Click the `$` ribbon icon or run the command `Obsidian Budget Form: Add new budget entry`. The form has the following fields:

- **Date + Time** — date becomes the transaction date, time is stored as a `created` tag (unix timestamp)
- **From account** — source account (dropdown from journal accounts)
- **To account** — destination account (must differ from "from")
- **From amount + currency** — required, always written as negative in the journal. Default currency: RON
- **To amount + currency** — optional, only needed for multi-currency transactions. When omitted, hledger infers the balancing amount
- **Details** — transaction description (newlines stripped)

New accounts must be added manually to the journal file (e.g. `account expenses:subscriptions`).

### Journal format

Transactions are appended to the journal file in standard hledger format:

```
2026-04-18 groceries  ; created:1713450000
    expenses:food
    assets:revolut      RON-41.81
```

Multi-currency example:

```
2026-04-18 exchange  ; created:1713450000
    assets:euro          EUR50
    assets:revolut      RON-250
```

### Balance assertions

Balance assertions let you record the known balance of an account at a point in time, useful for reconciling against bank statements. They look like this in the journal:

```
2026-04-19 assert balances  ; assert:
    assets:revolut             RON0 = RON 309.79
    assets:acc1                RON0 = RON 2057.38
```

An assertion can cover any subset of accounts — it doesn't need to list them all.

If an assertion doesn't match the calculated balance, hledger will report an error when the journal is opened in preview mode, showing the expected vs actual balance and which account is wrong.

The preview mode has a collapsible **"Recent Balance Assertions"** section that shows the latest assertion date and amount for each account.

To add assertions, edit the journal in source mode or use the hledger CLI:

```bash
hledger -f main.journal close --assert >> main.journal
```

## Plugin settings

- **Journal File Path** — path to the `.journal` file where transactions are stored

## Obsidian URL

Pre-fill the form via URL:

```
obsidian://budgetForm/openBudgetFormData?amount=10.23&details=groceries&fromAccount=assets:cash&toAccount=expenses:food&currency=RON
```

Supported parameters: `amount`, `currency`, `details`, `fromAccount`, `toAccount`, `toAmount`, `toCurrency`.
