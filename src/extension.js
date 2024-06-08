const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

let currentDirectory = false;
let lastWorkingDirectory = false;
let lastFileLineNumber = 2; // On which line the last file is located
let currentDocumentContent = "";

const getCurrentFileContent = () => {
	if (!currentDirectory) {
		return "No directory selected.";
	}

	const renameModeOn = isRenameModeEnabled();

	console.log("rename mode is", renameModeOn);

	let files = tryReadingDirectory(currentDirectory);
	if (!files && lastWorkingDirectory !== false) {
		files = tryReadingDirectory(lastWorkingDirectory);
	}

	let fileContent = `${currentDirectory}${path.sep}\n\n`;

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
	}).join('\n');

	lastFileLineNumber = files.length + 1;

	fileContent += "\n\n";
	fileContent += controlsHelpStrings[renameModeOn ? "rename" : "default"];

	return fileContent;
}

const controlsHelp = {
	default: [
		[
			["m", "toggle mark (NOT YET IMPLEMENTED)"],
			["t", "toggle all marks (NOT YET IMPLEMENTED)"],
			["U", "unmark all (NOT YET IMPLEMENTED)"],
			["*.", "mark by file extension (NOT YET IMPLEMENTED)"],
		],
		[
			["Enter/o", "Open file / view directory"],
			["R", "rename"],
			["M", "move (NOT YET IMPLEMENTED)"],
			["D", "delete (NOT YET IMPLEMENTED)"],
			["cd", "create directory (NOT YET IMPLEMENTED)"],
			["cf", "create file (NOT YET IMPLEMENTED)"],
		],
		[
			["u", "up to parent directory"],
			["g", "goto directory (NOT YET IMPLEMENTED)"],
			["p", "move to previous file (NOT YET IMPLEMENTED)"],
			["n", "move to next file (NOT YET IMPLEMENTED)"],
			["r", "refresh view (NOT YET IMPLEMENTED)"],
		],
		[
			["B", "Goto Anywhere (goto any directory, bookmark or project dir) (NOT YET IMPLEMENTED)"],
			["ab", "add to bookmarks (NOT YET IMPLEMENTED)"],
			["ap", "add to project (NOT YET IMPLEMENTED)"],
			["rb", "remove from bookmark (NOT YET IMPLEMENTED)"],
			["ra", "remove from project (NOT YET IMPLEMENTED)"],
		],
		[
			["P", "toggle Preview mode on/off (NOT YET IMPLEMENTED)"],
			["j", "jump to file/dir name (NOT YET IMPLEMENTED)"],
		],
	],
	rename: [
		[
			["Ctrl+Enter", "Confirm changes"],
			["Shift+Escape", "Cancel"],
		],
	]
};

const getControlsHelpString = (groups) => {
	const string = groups.map((group) => {
		return group.map((item) => ` ${item.join(" = ")}`).join("\n");
	}).join("\n\n");
	return string;
}

const controlsHelpStrings = {};
for (key in controlsHelp) {
	controlsHelpStrings[key] = getControlsHelpString(controlsHelp[key]);
}

/**
 * Turn Rename mode on/off
 * @param {boolean} on - if true, Rename mode is on
 */
const setRenameMode = async (on=true) => {
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
const enterRenameMode = async (provider=null) => {
	if (isRenameModeEnabled()) return;
	await setRenameMode(true);
	await showCurrentDirectory(provider);
}

/**
 * Cancel edits and exit Rename mode
 */
const diredRenameCancel = async (provider = null) => {
	await setRenameMode(false);
	if (provider) {
		provider.notifyContentChanged();
	}
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
 * Allows changing the dired temp file contents and watching for changes.
 */
class DiredProvider {
	constructor() {
		this._onDidChange = new vscode.EventEmitter();
		this.onDidChange = this._onDidChange.event;
	}

	/**
	 * Writes the text contents to the temp file.
	*/
	provideTextDocumentContent(uri) {
		return getCurrentFileContent();
	}

	notifyContentChanged() {
		this._onDidChange.fire(vscode.Uri.parse('dired://authority/dired'));
	}
}

/**
 * Show contents of the current directory as a read-only text buffer.
 */
const showCurrentDirectory = async (provider = null) => {
	if (!currentDirectory) return;

	const uri = vscode.Uri.parse('dired://authority/dired');
	const document = await vscode.workspace.openTextDocument(uri);
	const renameModeOn = isRenameModeEnabled(); // Check if Rename mode is enabled
	const editor = await vscode.window.showTextDocument(document, { preview: false, readOnly: false });
	await vscode.languages.setTextDocumentLanguage(document, "dired");
	if (!editor) {
		return;
	}

	lastWorkingDirectory = currentDirectory;

	editor.options.readOnly = !renameModeOn;

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

	const parentDir = path.resolve(currentDirectory, '..');
	if (parentDir === currentDirectory) {
		vscode.window.showInformationMessage("You are in the root directory.");
		return;
	}
	if (!parentDir) {
		vscode.window.showInformationMessage("Cannot read the parent directory.");
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
 * Marks the current file/directory as seleceted to allow multiple file operations.
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

function activate(context) {
	const provider = new DiredProvider();
	const providerRegistration = vscode.workspace.registerTextDocumentContentProvider('dired', provider);

	context.subscriptions.push(providerRegistration);

	const commands = [
		["diredBuffer", () => diredBuffer(provider)],
		["diredMark", diredMark],
		["diredSelect", () => diredSelect(provider)],
		["diredUp", () => diredUp(provider)],
		["diredRename", () => enterRenameMode(provider)],
		["diredRenameCancel", () => diredRenameCancel(provider)],
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
