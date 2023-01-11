import {
	Notice,
	TFile,
	TFolder,
	Vault,
	Workspace,
	WorkspaceLeaf,
} from "obsidian";

/**
 * Creates the specified markdown file along with the folder required. If file exists, attempts
 * to create a new unique file by appending a number from 0 to attempts to the end of the file.
 * @param filePath file path of the file to be created
 * @param fileContent content of the file to be created
 * @param vault app vault
 * @param attempts how many times to attempt to create a unique file
 */
export async function createMarkdownFile(
	filePath: string,
	fileContent: any,
	vault: Vault,
	attempts: number = 10
): Promise<TFile> {
	const folderNameMatch = filePath.match(/.*\//);
	if (!folderNameMatch) {
		throw new Error(`Could not extract folder from "${folderNameMatch}"`);
	}
	let abstractFileByPath = vault.getAbstractFileByPath(
		folderNameMatch[0].slice(0, -1)
	);
	if (!abstractFileByPath) {
		await vault.createFolder(folderNameMatch[0]);
	}
	let createdFile: TFile | null = null;
	for (let i = 0; i < attempts; i++) {
		const formattedFileName =
			(i ? filePath + i.toString() : filePath) + ".md";
		const file = vault.getAbstractFileByPath(formattedFileName);
		if (file === null) {
			createdFile = await vault.create(formattedFileName, fileContent);
			break;
		}
	}
	if (!createdFile) {
		throw new Error(`Could not create file! Attempted ${attempts} times`);
	}
	return createdFile;
}

/**
 * Exports an object with the file names and file path from a folder
 * @param path file path
 * @param vault app vault
 */
export function loadFileLinksFromFolder(
	path: string,
	vault: Vault
): { [path: string]: string } | null {
	const accounts = vault.getAbstractFileByPath(path);
	if (accounts instanceof TFolder) {
		return Object.fromEntries(
			accounts.children
				.filter((fileOrFolder) => fileOrFolder instanceof TFile)
				.map((accountFile: TFile) => [
					`[[${accountFile.path}]]`,
					accountFile.basename,
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
	const templateFile = vault.getAbstractFileByPath(filePath);
	if (!(templateFile instanceof TFile)) {
		return null;
	}
	return await vault.cachedRead(templateFile);
}

/**
 * Check to see if there is a file at this path
 * @param filePath file path to check
 * @param vault app vault
 */
export function isFile(filePath: string, vault: Vault) {
	return vault.getAbstractFileByPath(filePath) instanceof TFile;
}

/**
 * Check to see if there is a folder at this path
 * @param folderPath folder path to check
 * @param vault app vault
 */
export function isFolder(folderPath: string, vault: Vault) {
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
	const markdownLeave = workspace
		.getLeavesOfType("markdown")
		.find((leaf: WorkspaceLeaf) => leaf.view.getState().file === filePath);
	if (markdownLeave) workspace.setActiveLeaf(markdownLeave);
	else {
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
