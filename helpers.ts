import {
	Notice,
	TFile,
	TFolder,
	Vault,
	Workspace,
	WorkspaceLeaf,
} from "obsidian";
import { BudgetFormData } from "./BudgetFormModal";

/**
 * Initializes the JSON file if it doesn't exist.
 * @param filePath Path to the JSON file.
 * @param vault App vault.
 */
export async function initializeJsonFile(filePath: string, vault: Vault): Promise<void> {
	const file = vault.getAbstractFileByPath(filePath);
	if (!(file instanceof TFile)) {
		await vault.create(filePath, JSON.stringify([]));
	}
}

/**
 * Retrieves all budget entries from the JSON file.
 * @param filePath Path to the JSON file.
 * @param vault App vault.
 */
export async function getAllBudgetEntries(filePath: string, vault: Vault): Promise<BudgetFormData[]> {
	const content = await readFileContent(filePath, vault);
	return content ? JSON.parse(content) : [];
}

/**
 * Saves all budget entries to the JSON file.
 * @param filePath Path to the JSON file.
 * @param entries Array of budget entries.
 * @param vault App vault.
 */
export async function saveAllBudgetEntries(filePath: string, entries: BudgetFormData[], vault: Vault): Promise<void> {
	const jsonContent = JSON.stringify(entries, null, 2);
	const file = vault.getAbstractFileByPath(filePath);
	if (file instanceof TFile) {
		await vault.modify(file, jsonContent);
	} else {
		await vault.create(filePath, jsonContent);
	}
}

/**
 * Exports an object with the file names and file path from a folder, sorted by file name
 * @param path file path
 * @param vault app vault
 */
export function loadFileLinksFromFolder(
	path: string,
	vault: Vault
): { [path: string]: string } | null {
	const folder = vault.getAbstractFileByPath(path);
	if (folder instanceof TFolder) {
		return Object.fromEntries(
			folder.children
				.filter((fileOrFolder) => fileOrFolder instanceof TFile)
				.sort((a, b) => a.name.localeCompare(b.name))
				.map((file: TFile) => [
					`[[${file.path}]]`,
					file.basename,
				])
		);
	}
	return null;
}

/**
 * Reads file content. Returns null if no file was found.
 * @param filePath file path
 * @param vault app vault
 */
export async function readFileContent(
	filePath: string,
	vault: Vault
): Promise<string | null> {
	const file = vault.getAbstractFileByPath(filePath);
	if (!(file instanceof TFile)) {
		return null;
	}
	return await vault.cachedRead(file);
}

/**
 * Check to see if there is a file at this path
 * @param filePath file path to check
 * @param vault app vault
 */
export function isFile(filePath: string, vault: Vault): boolean {
	return vault.getAbstractFileByPath(filePath) instanceof TFile;
}

/**
 * Check to see if there is a folder at this path
 * @param folderPath folder path to check
 * @param vault app vault
 */
export function isFolder(folderPath: string, vault: Vault): boolean {
	return vault.getAbstractFileByPath(folderPath) instanceof TFolder;
}

/**
 * Set the tab with the file to active or opens a new tab if the file is not present in the current tabs
 * @param filePath file path
 * @param workspace app workspace
 * @param vault app vault
 */
export async function focusOrOpenFileInEditor(
	filePath: string,
	workspace: Workspace,
	vault: Vault
) {
	const markdownLeaf = workspace
		.getLeavesOfType("markdown")
		.find((leaf: WorkspaceLeaf) => leaf.view.getState().file === filePath);
	if (markdownLeaf) {
		workspace.setActiveLeaf(markdownLeaf);
	} else {
		const file = vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) {
			new Notice(
				`Could not open file because path is invalid: "${filePath}"`
			);
			return;
		}
		await workspace.getLeaf("tab").openFile(file);
	}
}
