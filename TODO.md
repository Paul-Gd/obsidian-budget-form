# Plugin Overhaul: hledger-wasm Integration

## What we're building

Replace the per-file budget entry system + DataviewJS summary with a single `.journal` file powered by hledger-wasm. When a user opens a `.journal` file in Obsidian:
- **Reading mode**: interactive UI (filters, tables, balances)
- **Live preview**: render the raw journal text normally

A form inserts new transactions directly into the journal file as text.

---

## Phase 1: Get hledger-wasm running in Obsidian

### 1.1 Install and bundle hledger-wasm

- `npm install hledger-wasm`
- The WASM binary is 17.7MB. Cannot be bundled into main.js. Must be copied as a static asset.
- Update esbuild.config.mjs to copy `node_modules/hledger-wasm/dist/hledger-wasm.wasm` to `budget-form-example-vault/.obsidian/plugins/obsidian-budget-form/`.

### 1.2 Adapt the bridge for Obsidian

The stock bridge uses `fetch()` to load the WASM file. Obsidian has no web server. We need to:
- Use `app.vault.adapter.readBinary()` to read the WASM file from the plugin folder.
- Write our own wrapper that replaces `fetch()` with the adapter call.
- The bridge re-instantiates WASM on every command (re-fetches + re-compiles). We should compile once via `WebAssembly.compile()` and cache the `WebAssembly.Module`, then `WebAssembly.instantiate(cachedModule, ...)` per command.

### 1.3 Verify JSON output

The bridge does `JSON.parse(result)` on all command output. Standard hledger needs `-O json` to produce JSON. Test whether this WASM build defaults to JSON or if we must add the flag. If JSON isn't available, parse the text output ourselves.

### 1.4 Milestone: console.log proof of life

- On plugin load, init hledger-wasm with a hardcoded journal string (demo.journal content).
- Call `accounts()`, `balance()`, `print()`, `commodities()` and log results.
- This proves the WASM pipeline works before building any UI.

---

## Phase 2: Associate .journal files with a custom view

### 2.1 Register a custom view for .journal files

When the user opens a `.journal` file:
- **Reading mode**: replace the content area with our custom UI (Phase 3).
- **Live preview / source mode**: show the raw journal text (Obsidian default, no work needed).

Use a custom `ViewPlugin` that detects `.journal` files and renders our UI in reading mode.

### 2.2 Read journal content

- Read file content via `vault.read(file)`.
- Pass content string to hledger-wasm functions.
- Cache results until the file changes (listen to `vault.on('modify', ...)`).

---

## Phase 3: Reading mode UI

Replaces what summary.md + DataviewJS currently does.

### 3.1 Filters bar (top of page)

- **Month selector**: dropdown with months. "All" option.
- **Account selector**: dropdown populated from `accounts(journal)`. Empty = `print` output. Selected = `aregister` output.

### 3.2 Transactions table

**No account selected** (uses `print` with `-p` for month filter):
| Date | Details | Amount | From | To |
Sorted descending. No running balance.

**Account selected** (uses `aregister` with `-p` for month filter):
| Date | Details | Amount | From | To | Running Balance |
Sorted descending. Running balance from aregister.

All date/month filtering is done via hledger `-p` flag. No JS filtering.

### 3.3 Asset balances section

Below the transactions table:
| Account | Balance |
Uses `balance(journal)` with account query `assets` to get only asset balances. Filtering at hledger level, not in JS.

---

## Phase 4: New transaction form

### 4.1 Form fields

1. **Date + Time** (datetime-local input)
   - Date → transaction date (YYYY-MM-DD)
   - Time → unix timestamp for `created` tag
2. **From account** dropdown from `accounts(journal)`. Accounts are created manually in the journal by user.
3. **To account** dropdown, same source. Must differ from "from". Check at validation, when user attempts to save.
4. **From amount** (required) + **currency dropdown** (default: RON). Always written as negative in template.
5. **To amount** (optional) + **currency dropdown** (default: RON). Only written if provided. For same-currency transfers, omit — hledger infers it.
6. **Details**: text input. Newlines stripped.

Currency dropdown populated from `commodities(journal)`.

### 4.2 Transaction template

Standard (same currency, to-amount omitted):
```
2026-04-18 groceries  ; created:1713450000
    expenses:food
    assets:revolut      RON-41.81
```

Mixed currencies (both amounts provided):
```
2026-04-18 exchange  ; created:1713450000
    assets:euro          EUR50
    assets:revolut      RON-250
```

### 4.3 Insert into journal

- Append transaction text to end of the `.journal` file via `vault.modify()`.
- Refresh the reading-mode view after insertion.

---

## Phase 5: URL protocol handler

### 5.1 Update obsidian:// URL scheme

Current: `obsidian://budgetForm/openBudgetFormData?amount=...&details=...&fromAccount=...&toAccount=...&tag=...`

New params (tag removed, currency added):
`obsidian://budgetForm/openBudgetFormData?amount=...&currency=...&details=...&fromAccount=...&toAccount=...&toAmount=...&toCurrency=...`

- `amount` (required) — the from-amount (will be negative in journal)
- `currency` (optional, default RON) — currency for from-amount
- `details` (optional)
- `fromAccount` (optional) — must match an existing account name
- `toAccount` (optional) — must match an existing account name
- `toAmount` (optional) — only for mixed-currency transactions
- `toCurrency` (optional) — currency for to-amount

Pre-fills the form modal with these values. User reviews and submits.

---

## What gets deleted

- `budgetEntries.json` storage logic (`getAllBudgetEntries`, `saveAllBudgetEntries` in helpers.ts)
- `accountsFolderPath` setting (accounts come from hledger)
- `tagsFolderPath` setting (tags are gone, sub-accounts replace them)
- `templateFilePath` setting (template is now a hardcoded format)
- `summaryFilePath` setting and auto-open-after-insert behavior (dropped entirely)
- Individual markdown file creation for budget entries
- DataviewJS dependency for summary view
- Tag dropdown from form

## What stays (rewritten)

- Modal form pattern (BudgetFormModal.ts) — new fields
- URL protocol handler — new param names, no tag
- Settings tab — simplified to just journal file path
- Ribbon icon + command registration

---

## Risks

1. **hledger-wasm JSON output**: Must test if `-O json` is needed. Blocks Phase 1.
2. **Mobile WASM loading**: `vault.adapter.readBinary()` on mobile — user will verify.
3. **Performance**: 17.7MB WASM compile time. Caching the compiled module is critical.
