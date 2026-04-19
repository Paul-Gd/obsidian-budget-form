import { TFile, Vault } from "obsidian";

export function isFile(filePath: string, vault: Vault): boolean {
	return vault.getAbstractFileByPath(filePath) instanceof TFile;
}
