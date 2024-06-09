const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const { controlsHelp, controlsHelpStrings } = require("./controlsHelp");

let currentDirectory = false;
let lastWorkingDirectory = false;
let lastFileLineNumber = 2; // On which line the last file is located

const getCurrentFileContent = (renaming=false) => {
	if (!currentDirectory) {
		return "No directory selected.";
	}

	let files = tryReadingDirectory(currentDirectory);
	if (!files && lastWorkingDirectory !== false) {
		files = tryReadingDirectory(lastWorkingDirectory);
	}

	let fileContent = `${renaming?"Renaming in ":""}${currentDirectory}${path.sep}\n\n`;

	if (!files) {
		fileContent += "Error reading from disk.";
		return fileContent;
	}

	fileContent += files.map(file => {
		const filePath = path.join(currentDirectory, file);
		let text = file;
		try {
			const stats = fs.statSync(filePath);
			if (stats.isDirectory()) {
				text += path.sep;
			}
		} catch (err) {
			return `${file} (access denied)`;
		}
		return text;
	}).join("\n");

	lastFileLineNumber = files.length + 1;

	fileContent += "\n\n";
	fileContent += controlsHelpStrings[renaming ? "rename" : "default"];

	return fileContent;
};

/**
 * Turn Rename mode on/off
 * @param {boolean} on - if true, Rename mode is on
 */
const setRenameMode = async (on = true) => {
	const config = vscode.workspace.getConfiguration("dired");
	await config.update("renameMode", on, vscode.ConfigurationTarget.Global);
}

/**
 * Check if we're in Rename mode
 */
const isRenameModeEnabled = () => {
	const config = vscode.workspace.getConfiguration("dired");
	return config.get("renameMode");
}

/**
 * Enter Rename mode
 */
const enterRenameMode = async (provider = null) => {
	if (isRenameModeEnabled()) return;
	await setRenameMode(true);
	await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
	await showRenameBuffer(provider);
}

/**
 * Cancel edits and exit Rename mode
 */
const diredRenameCancel = async (provider = null) => {
	await setRenameMode(false);
	// Reset the document to its original state to avoid save prompt and close:
	await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
	await showCurrentDirectory(provider);
}

/**
 * Show the rename buffer for editing
 */
const showRenameBuffer = async (provider = null) => {
	const content = getCurrentFileContent(true);

	const document = await vscode.workspace.openTextDocument({ content, language: "dired" });
	const editor = await vscode.window.showTextDocument(document, { preview: false, viewColumn: vscode.ViewColumn.Active, readOnly: false });

	if (!editor) {
		return;
	}

	if (provider) {
		provider.notifyContentChanged();
	}

	const moveCursorToFirstEntry = () => {
		const range = editor.document.lineAt(2).range;
		editor.selection = new vscode.Selection(range.start, range.start);
		editor.revealRange(range);
	}
	moveCursorToFirstEntry();
}

/**
 * Try reading the desired directory. If reading fails, returns false.
 * @param {string} dir - Path of the directory to read.
 * @returns {array} - Array of file and directory names
 */
const tryReadingDirectory = (dir) => {
	let files;
	try {
		files = fs.readdirSync(dir);
	} catch (err) {
		vscode.window.showErrorMessage(`Error reading directory: ${err.message}`);
		return false;
	}
	currentDirectory = dir;
	return files;
}

/**
 * Update the actual files and directories based on the changes made in the rename buffer
 */
const applyRenameChanges = async (provider = null) => {
	const editor = vscode.window.activeTextEditor;
	if (!editor) return;

	const newContent = editor.document.getText();
	const oldContent = getCurrentFileContent(true);

	const entriesToArray = (entriesString) => {
		return entriesString.split("\n").slice(2, -3);
	}

	// Compare oldContent and newContent to find renames
	const oldFiles = entriesToArray(oldContent);
	const newFiles = entriesToArray(newContent);

	if (newFiles.length !== oldFiles.length) {
		vscode.window.showWarningMessage("Adding or removing lines isn't allowed in Rename mode. Make sure you keep the file count the same.");
		return;
	}

	const duplicates = newFiles.filter((item, index) => newFiles.indexOf(item) !== index);
	if (duplicates.length > 0) {
		vscode.window.showWarningMessage(`Some entries have the same names: ${duplicates.join("; ")}`);
		return;
	}

	for (let i = 0; i < oldFiles.length; i++) {
		if (oldFiles[i] === newFiles[i]) continue;
		const oldPath = path.join(currentDirectory, oldFiles[i]);
		const newPath = path.join(currentDirectory, newFiles[i]);
		fs.renameSync(oldPath, newPath);
	}

	await setRenameMode(false);

	// Reset the document to its original state to avoid save prompt and close:
	await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
	await showCurrentDirectory(provider);
}

/**
 * Allows changing the dired buffer contents and watching for changes.
 */
class DiredProvider {
	constructor() {
		this._onDidChange = new vscode.EventEmitter();
		this.onDidChange = this._onDidChange.event;
	}

	/**
	 * Provides the text document content for the dired buffer.
	*/
	provideTextDocumentContent(uri) {
		return getCurrentFileContent();
	}

	notifyContentChanged() {
		this._onDidChange.fire(vscode.Uri.parse("dired://authority/dired"));
	}
}

/**
 * Show contents of the current directory as a read-only text buffer.
 */
const showCurrentDirectory = async (provider = null) => {
	if (!currentDirectory) return;

	const uri = vscode.Uri.parse("dired://authority/dired");
	const document = await vscode.workspace.openTextDocument(uri);

	const renameModeOn = isRenameModeEnabled(); // Check if Rename mode is enabled
	const editor = await vscode.window.showTextDocument(document, { preview: false });

	await vscode.languages.setTextDocumentLanguage(document, "dired");

	if (!editor) {
		return;
	}

	lastWorkingDirectory = currentDirectory;

	if (provider) {
		provider.notifyContentChanged();
	}

	const moveCursorToFirstEntry = () => {
		const range = editor.document.lineAt(2).range;
		editor.selection = new vscode.Selection(range.start, range.start);
		editor.revealRange(range);
	}
	moveCursorToFirstEntry();

	const moveCursorOnChange = (e) => {
		if (e.document.uri.toString() !== document.uri.toString()) return;
		moveCursorToFirstEntry();
		vscode.workspace.onDidChangeTextDocument(moveCursorOnChangeDisposable.dispose);
	};

	const moveCursorOnChangeDisposable = vscode.workspace.onDidChangeTextDocument(moveCursorOnChange);
}

/**
 * Go up a directory, if possible.
 */
const diredUp = async (provider) => {
	if (!currentDirectory) return;

	const parentDir = path.resolve(currentDirectory, "..");
	if (parentDir === currentDirectory) {
		vscode.window.showInformationMessage("You are in the root directory.");
		return;
	}
	if (!parentDir) {
		vscode.window.showWarningMessage("Cannot read the parent directory.");
		return;
	}

	currentDirectory = parentDir;
	await showCurrentDirectory(provider);
}

/**
 * Opens a directory selection dialog, then opens the selected directory as a dired buffer.
 */
const diredBuffer = async (provider) => {
	const uri = await vscode.window.showOpenDialog({
		canSelectFolders: true,
		canSelectFiles: false,
		canSelectMany: false
	});

	if (!uri || uri.length === 0) {
		return;
	}

	currentDirectory = uri[0].fsPath;
	await showCurrentDirectory(provider);
}

/**
 * Refreshes the current directory listing (when files changed outside of the editor)
 */
const diredRefresh = async (provider) => {
	await showCurrentDirectory(provider);
}

/**
 * Marks the current file/directory as selected to allow multiple file operations.
 * NOT YET IMPLEMENTED.
 */
const diredMark = async (args) => {
	const editor = vscode.window.activeTextEditor;
	if (!editor) return;

	const currentLine = editor.document.lineAt(editor.selection.active.line);
	console.log(currentLine.text);
	return currentLine.text;
}

/**
 * Checks if a given line number is a file or a directory (isn't out of range)
 * @param {int} lineNumber - the line number to check
 * @returns {boolean} isValidEntry
 */
const isLineFileOrDir = (lineNumber) => {
	if (lineNumber < 2) return false;
	if (lineNumber > lastFileLineNumber) return false;
	return true;
}

/**
 * Opens the file/directory based on the current cursor position.
 */
const diredSelect = async (provider) => {
	const editor = vscode.window.activeTextEditor;
	if (!editor) return;

	const currentLineNumber = editor.selection.active.line;
	if (!isLineFileOrDir(currentLineNumber)) return;

	const currentLine = editor.document.lineAt(currentLineNumber).text;
	if (currentLine.endsWith(path.sep)) {
		// Current line is a directory, open it in dired mode:
		currentDirectory = path.join(currentDirectory, currentLine.slice(0, -1));
		showCurrentDirectory(provider);
		return;
	}
	// Current line is a file, open it in VSCode:
	const filePath = path.join(currentDirectory, currentLine);
	vscode.workspace.openTextDocument(path.join(currentDirectory, currentLine)).then(doc => {
		vscode.window.showTextDocument(doc);
	});
}

/**
 * Deletes a single file/directory based on the current cursor position.
 */
const diredDelete = async (provider) => {
	const editor = vscode.window.activeTextEditor;
	if (!editor) return;

	const currentLineNumber = editor.selection.active.line;
	if (!isLineFileOrDir(currentLineNumber)) return;

	const currentLine = editor.document.lineAt(currentLineNumber).text;
	const fullPath = path.join(currentDirectory, currentLine);
	const isDirectory = currentLine.endsWith(path.sep);
	const typeString = isDirectory ? "directory" : "file";
	const confirmButton = "Confirm delete";
	vscode.window.showInformationMessage(
		`Delete ${typeString} ${currentLine}?`,
		{ modal: true },
		{ title: confirmButton },
	).then(async (answer) => {
		if (!answer) return;
		if (answer.title !== confirmButton) return;
		if (isDirectory)  {
			fs.rmSync(fullPath, { recursive: true, force: true })
		} else {
			fs.unlinkSync(fullPath);
		}
		await showCurrentDirectory(provider);
	});
}

/**
 * Recursively create directories from a path
 * @param {string} targetDir - the full directory structure that will get created
 */
const createDirectories = (targetDir) => {
	const sep = path.sep;
	const initDir = path.isAbsolute(targetDir) ? sep : "";
	targetDir.split(sep).reduce((parentDir, childDir) => {
		const curDir = path.resolve(parentDir, childDir);
		try {
			if (!fs.existsSync(curDir)) {
				fs.mkdirSync(curDir);
			}
		} catch (err) {
			vscode.window.showErrorMessage(`Failed to create directory: ${err.message}`);
			throw err;
		}

		return curDir;
	}, initDir);
}

/**
 * Recursively create directories and, finally, a single empty file, from a path
 * @param {string} filePath - the full directory structure that will get created and/or a filename
 */
const createFile = (filePath) => {
	const dir = path.dirname(filePath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	fs.writeFileSync(filePath, "", { flag: "w" });
}

/**
 * Show an input box to enter the name(s) of directories to create
 */
const diredCreateDirectory = (provider = null) => {
	vscode.window.showInputBox({ prompt: "Enter directory name, you can use \\ or / to create structures" }).then(value => {
		if (!value) {
			vscode.window.showWarningMessage("No directory name provided");
			return;
		}

		// Process the input and create the directories:
		createDirectories(path.join(currentDirectory, value));
		diredRefresh(provider);
	});
}

/**
 * Show an input box to enter the name(s) of directories and/or a filename to create
 */
const diredCreateFile = (provider = null) => {
	vscode.window.showInputBox({ prompt: "Enter file name, you can use \\ or / to create structures" }).then(value => {
		if (!value) {
			vscode.window.showWarningMessage("No file name provided");
			return;
		}

		// Process the input and create the file
		const filePath = path.join(currentDirectory, value);
		createFile(filePath);
		diredRefresh(provider);
	});
}

/**
 * Moves the cursor by n items forwards or backwards
 * @param {int} direction - how many items forwards should we move, may be negative
 */
const moveCursorTo = (provider = null, direction = 1) => {
	const editor = vscode.window.activeTextEditor;
	if (!editor) return;

	const currentLineNumber = editor.selection.active.line;
	let targetLine = currentLineNumber+direction;
	if (!isLineFileOrDir(targetLine)) {
		if (targetLine < 2) {
			targetLine = 2;
		} else {
			targetLine = lastFileLineNumber;
		}
	}

	const range = editor.document.lineAt(targetLine).range;
	editor.selection = new vscode.Selection(range.start, range.start);
	editor.revealRange(range);
}

/**
 * Show an input box to enter the name(s) of directory / file to move the cursor to.
 */
const moveCursorToName = async (provider = null) => {
	const editor = vscode.window.activeTextEditor;
	if (!editor) return;

	const document = editor.document;
	const text = document.getText();
	const lines = text.split("\n").slice(2,lastFileLineNumber+1);

	const selectedValue = await vscode.window.showQuickPick(lines, {
		placeHolder: "Enter file / directory name to move the cursor to",
		canPickMany: false,
	});

	if (!selectedValue) return;

	const targetLine = lines.indexOf(selectedValue) + 2;

	const range = editor.document.lineAt(targetLine).range;
	editor.selection = new vscode.Selection(range.start, range.start);
	editor.revealRange(range);
}


function activate(context) {
	const provider = new DiredProvider();
	const providerRegistration = vscode.workspace.registerTextDocumentContentProvider("dired", provider);

	context.subscriptions.push(providerRegistration);

	const commands = [
		["diredBuffer", () => diredBuffer(provider)],
		["diredRefresh", () => diredRefresh(provider)],
		["diredMark", diredMark],
		["diredSelect", () => diredSelect(provider)],
		["diredUp", () => diredUp(provider)],
		["diredRename", () => enterRenameMode(provider)],
		["diredRenameCancel", () => diredRenameCancel(provider)],
		["diredRenameCommit", () => applyRenameChanges(provider)],
		["diredDelete", () => diredDelete(provider)],
		["diredCreateFile", () => diredCreateFile(provider)],
		["diredCreateDirectory", () => diredCreateDirectory(provider)],
		["diredPrev", () => moveCursorTo(provider, -1)],
		["diredNext", () => moveCursorTo(provider, 1)],
		["diredJumpToName", () => moveCursorToName(provider)],
	];
	commands.forEach((item) => {
		const registered = vscode.commands.registerCommand(`extension.${item[0]}`, item[1]);
		context.subscriptions.push(registered);
	});

	diredRenameCancel(provider); // Make sure we're not in Rename mode by default
}

exports.activate = activate;

function deactivate() { }
exports.deactivate = deactivate;
