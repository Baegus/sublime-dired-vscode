const vscode = require("vscode");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { controlsHelpStrings } = require("./controlsHelp");

let currentDirectory = false; // Current working directory
let lastWorkingDirectory = false; // The last successfully opened directory
let lastEntryLineNumber = 2; // On which line the last file is located

const omitRegexes = []; // Parsed omitPatterns (filled in setupOmitPatterns())

/**
 * Gets the final entry array of files and directories.
 * Skips ones matching any of the omitPatterns regexes.
 * Skips unreadable directories.
 * Adds path separator to directories.
 * @param {array} entries - entries to process (NOT full paths)
 * @param {string} dir - directory path (current or preview directory)
 */
const getFilesAndDirectories = (entries,dir=currentDirectory) => {
	const entryArray = [];
	entries.forEach((entry) => {
		for (const omitRegex of omitRegexes) {
			if (omitRegex.test(entry)) return;
		}
		const entryPath = path.join(dir, entry);
		let text = entry;
		try {
			const stats = fs.statSync(entryPath);
			if (stats.isDirectory()) {
				text += path.sep;
			}
		} catch (err) {
			// console.log(`Access to ${entry} is denied`);
			return;
		}
		entryArray.push(text);
	});
	return entryArray;
}

let originalEntries = []; // Original entry names before renaming

/**
 * Create the content of the current Dired view text buffer
 * @param {boolean} renaming - if true, Rename mode is on
 */
const getCurrentFileContent = (renaming = false) => {
	if (!currentDirectory) {
		return "No directory selected.";
	}

	let entries = tryReadingDirectory(currentDirectory);
	if (!entries && lastWorkingDirectory !== false) {
		entries = tryReadingDirectory(lastWorkingDirectory);
	}

	let fileContent = `${renaming?"Renaming in ":""}${currentDirectory}${path.sep}\n\n`;

	if (!entries) {
		fileContent += "Error reading from disk.";
		return fileContent;
	}

	const entryArray = getFilesAndDirectories(entries);

	fileContent += entryArray.join("\n");

	// Store original entries
	if (renaming) {
		originalEntries = entryArray.slice();
	}

	lastEntryLineNumber = entryArray.length + 1;

	fileContent += "\n\n";
	fileContent += controlsHelpStrings[renaming ? "rename" : "default"];

	return fileContent;
}

/**
 * Turn Rename mode on/off
 * @param {boolean} on - if true, Rename mode is on
 */
const setRenameMode = async (on = true) => {
	const config = vscode.workspace.getConfiguration("dired");
	await config.update("renameMode", on, vscode.ConfigurationTarget.Global);
	if (renameDecorationListener) renameDecorationListener.dispose();
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
 * @param {vscode.TextDocumentContentProvider} provider
 */
const enterRenameMode = async (provider = null) => {
	if (isRenameModeEnabled()) return;
	removeAllMarks();
	await setRenameMode(true);
	await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
	await showRenameBuffer(provider);
}

/**
 * Cancel edits and exit Rename mode
 * @param {vscode.TextDocumentContentProvider} provider
 */
const diredRenameCancel = async (provider = null) => {
	await setRenameMode(false);
	// Reset the document to its original state to avoid save prompt and close:
	await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
	await showCurrentDirectory(provider);
}

let renameDecorationListener = null;
/**
 * Show the rename buffer for editing
 * @param {vscode.TextDocumentContentProvider} provider
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

	// Add decorations to show original names
	updateRenameDecorations(editor);

	// Listen for changes in the text editor to update decorations dynamically
	if (renameDecorationListener) renameDecorationListener.dispose();
	renameDecorationListener = vscode.workspace.onDidChangeTextDocument(event => {
		if (event.document != document) return;
		updateRenameDecorations(editor);
	});

	await moveCursorToFirstEntry();
}

let renameDecorations = null; // Decorations showing the original entry names while renaming
/**
 * Update the decorations in the rename buffer
 * @param {vscode.TextEditor} editor
 */
const updateRenameDecorations = (editor) => {
	if (renameDecorations) {
		renameDecorations.dispose();
	}

	renameDecorations = vscode.window.createTextEditorDecorationType({
		after: { margin: '0 0 0 3ch', color: 'gray', fontStyle: 'italic' }
	});

	const decorations = [];
	for (let i = 2; i <= lastEntryLineNumber; i++) {
		const originalName = originalEntries[i - 2];
		const lineText = editor.document.lineAt(i).text;
		if (originalName && originalName !== lineText) {
			decorations.push({
				range: new vscode.Range(new vscode.Position(i, lineText.length), new vscode.Position(i, lineText.length)),
				renderOptions: { after: { contentText: ` ← ${originalName}` } }
			});
		}
	}

	editor.setDecorations(renameDecorations, decorations);
}


/**
 * Try reading the desired directory. If reading fails, returns false.
 * @param {string} dir - Path of the directory to read.
 * @returns {array} - Array of file and directory names
 */
const tryReadingDirectory = (dir, preview=false) => {
	let files;
	try {
		files = fs.readdirSync(dir);
	} catch (err) {
		vscode.window.showErrorMessage(`Error reading directory: ${err.message}`);
		return false;
	}
	if (!preview) {
		currentDirectory = dir;
	}
	return files;
}

/**
 * Update the actual files and directories based on the changes made in the rename buffer
 * @param {vscode.TextDocumentContentProvider} provider
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
		if (oldFiles[i].endsWith(path.sep) !== newFiles[i].endsWith(path.sep)) {
			vscode.window.showWarningMessage("Removing slashes from directories is not allowed. Filenames can't end with slashes.");
			return;
		}
	}

	// Use a temporary filename to handle renames
	const tempFileSuffix = "_tempDiredRename";
	const tempFilesMap = {};


	for (let i = 0; i < oldFiles.length; i++) {
		if (oldFiles[i] === newFiles[i]) continue;
		const oldPath = path.join(currentDirectory, oldFiles[i]);
		if (newFiles[i].endsWith(path.sep)) newFiles[i] = newFiles[i].slice(0,-1);
		const tempPath = path.join(currentDirectory, newFiles[i] + tempFileSuffix);
		tempFilesMap[newFiles[i]] = tempPath; // Store the temporary path for final renaming
		fs.renameSync(oldPath, tempPath);
	}

	for (let i = 0; i < newFiles.length; i++) {
		if (oldFiles[i] === newFiles[i]) continue;
		const newPath = path.join(currentDirectory, newFiles[i]);
		const tempPath = tempFilesMap[newFiles[i]];
		fs.renameSync(tempPath, newPath);
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

let currentPreviewDirectory = null;
/**
 * Allows changing the dired preview buffer contents and watching for changes.
 */
class DiredPreviewProvider {
	constructor() {
		this._onDidChange = new vscode.EventEmitter();
		this.onDidChange = this._onDidChange.event;
	}

	/**
	 * Provides the text document content for the dired buffer.
	*/
	provideTextDocumentContent(uri) {
		if (!currentPreviewDirectory) return "";
		const entries = tryReadingDirectory(currentPreviewDirectory, true);
		if (!entries) {
			return "Cannot read this directory for previewing.";
		}
		const entryArray = getFilesAndDirectories(entries, currentPreviewDirectory);
		return `Preview of ${currentPreviewDirectory}\n\n${entryArray.join("\n")}`;
	}

	notifyContentChanged() {
		this._onDidChange.fire(vscode.Uri.parse("diredPreview://authority/directory preview"));
	}
}

/**
 * Show contents of the current directory as a read-only text buffer.
 * @param {vscode.TextDocumentContentProvider} provider
 */
const showCurrentDirectory = async (provider = null) => {
	if (!currentDirectory) return;

	removeAllMarks();

	const uri = vscode.Uri.parse("dired://authority/dired");
	const document = await vscode.workspace.openTextDocument(uri);

	const editor = await vscode.window.showTextDocument(document, { preview: false });

	await vscode.languages.setTextDocumentLanguage(document, "dired");

	if (!editor) {
		return;
	}

	lastWorkingDirectory = currentDirectory;

	if (provider) {
		provider.notifyContentChanged();
	}

	await moveCursorToFirstEntry();

	const moveCursorOnChange = async (e) => {
		if (e.document.uri.toString() !== document.uri.toString()) return;
		await moveCursorToFirstEntry();
		vscode.workspace.onDidChangeTextDocument(moveCursorOnChangeDisposable.dispose);
	};

	const moveCursorOnChangeDisposable = vscode.workspace.onDidChangeTextDocument(moveCursorOnChange);
}

/**
 * Go up a directory, if possible.
 * @param {vscode.TextDocumentContentProvider} provider
 */
const diredUp = async (provider) => {
	if (!currentDirectory) return;

	removeAllMarks();

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
 * @param {vscode.TextDocumentContentProvider} provider
 */
const diredBrowse = async (provider, defaultURI=null) => {
	const config = {
		canSelectFolders: true,
		canSelectFiles: false,
		canSelectMany: false
	};

	if (defaultURI && currentDirectory) {
		config.uri = vscode.Uri.file(currentDirectory)
	}

	const uri = await vscode.window.showOpenDialog(config);

	if (!uri || uri.length === 0) {
		return;
	}

	currentDirectory = uri[0].fsPath;
	await showCurrentDirectory(provider);
}

/**
 * Refreshes the current directory listing (when files changed outside of the editor)
 * @param {vscode.TextDocumentContentProvider} provider
 */
const diredRefresh = async (provider) => {
	await showCurrentDirectory(provider);
}

/**
 * Checks if a given line number is a file or a directory (isn't out of range)
 * @param {int} lineNumber - the line number to check
 * @returns {boolean} isValidEntry
 */
const isLineFileOrDir = (lineNumber) => {
	if (lineNumber < 2) return false;
	if (lineNumber > lastEntryLineNumber) return false;
	return true;
}

/**
 * Opens the file/directory based on the current cursor position.
 * @param {vscode.TextDocumentContentProvider} provider
 */
const diredSelect = async (provider) => {
	const editor = vscode.window.activeTextEditor;
	if (!editor) return;

	removeAllMarks();

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

	const fileUri = vscode.Uri.file(filePath);
	await vscode.commands.executeCommand('vscode.open', fileUri);
}

/**
 * Returns all marked items. If there are none, returns the item on cursor's position
 * @returns {array} - full paths of selected entries
 */
const getPathsOfSelectedEntries = () => {
	const editor = vscode.window.activeTextEditor;
	if (!editor) return [];

	const paths = [];
	const fullPathFromLineNumber = (lineNumber) => {
		lineNumber = parseInt(lineNumber);
		return path.join(currentDirectory, editor.document.lineAt(lineNumber).text);
	}

	for (const lineNumber in markedLines) {
		paths.push(fullPathFromLineNumber(lineNumber));
	}

	if (paths.length === 0) {
		// No marked lines, select the item on cursor position(s):
		const selections = editor.selections;
		selections.forEach(selection => {
			const lineNumber = selection.active.line;
			if (!isLineFileOrDir(lineNumber)) return;
			paths.push(fullPathFromLineNumber(lineNumber));
		});
	}

	return paths;
}

/**
 * Deletes selected files/directories
 * @param {vscode.TextDocumentContentProvider} provider
 */
const diredDelete = async (provider) => {
	const editor = vscode.window.activeTextEditor;
	if (!editor) return;

	const pathsToDelete = getPathsOfSelectedEntries();

	if (pathsToDelete.length === 0) return;

	const dirCount = pathsToDelete.filter(fullPath => fullPath.endsWith(path.sep)).length;
	const fileCount = pathsToDelete.length - dirCount;

	const prompts = [];
	if (dirCount > 0) {
		prompts.push(`${dirCount} ${dirCount > 1 ? "directories" : "directory"}`);
	}
	if (fileCount > 0) {
		prompts.push(`${fileCount} ${fileCount > 1 ? "files" : "file"}`);
	}
	const typeString = prompts.join(" and ");

	const confirmButton = "Confirm delete";
	
	const answer = await vscode.window.showInformationMessage(
		`Delete ${typeString}?`,
		{ modal: true },
		{ title: confirmButton },
	);

	if (!answer) return;
	if (answer.title !== confirmButton) return;

	pathsToDelete.forEach((fullPath) => {
		if (fullPath.endsWith(path.sep))  {
			fs.rmSync(fullPath, { recursive: true, force: true })
		} else {
			fs.unlinkSync(fullPath);
		}
	});
	await showCurrentDirectory(provider);
}

/**
 * Moves selected files/directories to a specified location from a file browser
 * @param {vscode.TextDocumentContentProvider} provider
 */
const diredMove = async (provider) => {
	const editor = vscode.window.activeTextEditor;
	if (!editor) return;

	const pathsToMove = getPathsOfSelectedEntries();

	if (pathsToMove.length === 0) return;

	const uri = await vscode.window.showOpenDialog({
		canSelectFolders: true,
		canSelectFiles: false,
		canSelectMany: false,
		defaultUri: vscode.Uri.file(currentDirectory),
	});

	if (!uri || uri.length === 0) {
		return;
	}

	const moveToPath = uri[0].fsPath;

	if (moveToPath === currentDirectory) {
		vscode.window.showInformationMessage("The destination path is the same as the source path.");
		return;
	}

	pathsToMove.forEach((fullPath) => {
		const fileName = path.basename(fullPath);
		const newFullPath = path.join(moveToPath, fileName);
		fs.renameSync(fullPath, newFullPath);
	});
	await showCurrentDirectory(provider);
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
	if (fs.existsSync(filePath)) {
		vscode.window.showWarningMessage("This file already exists.");
		return;
	}
	fs.writeFileSync(filePath, "", { flag: "w" });
}

/**
 * Show an input box to enter the name(s) of directories to create
 * @param {vscode.TextDocumentContentProvider} provider
 */
const diredCreateDirectory = async (provider = null) => {
	const value = await vscode.window.showInputBox({ prompt: "Enter directory name, you can use \\ or / to create structures" });
	if (!value) {
		vscode.window.showWarningMessage("No directory name provided");
		return;
	}

	// Process the input and create the directories:
	createDirectories(path.join(currentDirectory, value));
	diredRefresh(provider);
}

/**
 * Show an input box to enter the name(s) of directories and/or a filename to create
 * @param {vscode.TextDocumentContentProvider} provider
 */
const diredCreateFile = async (provider = null) => {
	const value = await vscode.window.showInputBox({ prompt: "Enter file name, you can use \\ or / to create structures" });
	if (!value) {
		vscode.window.showWarningMessage("No file name provided");
		return;
	}

	// Process the input and create the file
	const filePath = path.join(currentDirectory, value);
	createFile(filePath);
	diredRefresh(provider);
}

/**
 * Moves the cursor by n items forwards or backwards
 * @param {vscode.TextDocumentContentProvider} provider
 * @param {int} direction - how many items forwards should we move, may be negative
 */
const moveCursorBy = (provider = null, direction = 1) => {
	const editor = vscode.window.activeTextEditor;
	if (!editor) return;

	const currentLineNumber = editor.selection.active.line;
	let targetLine = currentLineNumber+direction;
	if (!isLineFileOrDir(targetLine)) {
		if (targetLine < 2) {
			targetLine = 2;
		} else {
			targetLine = lastEntryLineNumber;
		}
	}

	const range = editor.document.lineAt(targetLine).range;
	editor.selection = new vscode.Selection(range.start, range.start);
	editor.revealRange(range);
}

/**
 * Moves the cursor to the first file / directory
 */
const moveCursorToFirstEntry = async () => {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return;
	}

	const range = editor.document.lineAt(2).range;
	editor.selection = new vscode.Selection(range.start, range.start);
	editor.revealRange(range);
}

/**
 * Show an input box to enter the name(s) of directory / file to move the cursor to.
 * @param {vscode.TextDocumentContentProvider} provider
 */
const moveCursorToName = async (provider = null) => {
	const editor = vscode.window.activeTextEditor;
	if (!editor) return;

	const document = editor.document;
	const text = document.getText();
	const lines = text.split("\n").slice(2,lastEntryLineNumber+1);

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

let previewEnabled = false;
let previewEditor = null;
let diredEditor = null;
let selectionChangeListener = null;

/**
 * Shows a second editor view alongside the current one and previews (opens) the file 
 * on the cursor position.
 * @param {vscode.TextDocumentContentProvider} provider
*/
const toggleDiredPreviewMode = async (provider, previewProvider) => {
	const editor = vscode.window.activeTextEditor;
	if (!editor) return;

	diredEditor = editor;

	if (previewEnabled) {
		// Disable preview mode by closing the preview editor and removing the listener
		if (previewEditor) {
			await vscode.commands.executeCommand("workbench.action.closeEditorsInOtherGroups");
			previewEditor = null;
		}
		if (selectionChangeListener) {
			selectionChangeListener.dispose();
		}
		previewEnabled = false;
		vscode.window.showInformationMessage("Dired Preview Mode Disabled");
		return;
	}

	previewEnabled = true;
	await updatePreview(editor, previewProvider);

	selectionChangeListener = vscode.window.onDidChangeTextEditorSelection(async (event) => {
		if (event.textEditor !== editor) return;
		if (previewEnabled) {
			await updatePreview(event.textEditor, previewProvider, true);
		}
	});

	vscode.window.showInformationMessage("Dired Preview Mode Enabled");

	provider.notifyContentChanged();
}

const updatePreview = async (editor, previewProvider) => {
	const currentLineNumber = editor.selection.active.line;
	if (!isLineFileOrDir(currentLineNumber)) return;

	const currentLine = editor.document.lineAt(currentLineNumber).text;
	
	const openEditorOptions = { preview: true, viewColumn: vscode.ViewColumn.Beside, preserveFocus: true };

	if (currentLine.endsWith(path.sep)) {
		// Current line is a directory, preview its contents:
		currentPreviewDirectory = path.join(currentDirectory,currentLine);
		const previewUri = vscode.Uri.parse("diredPreview://authority/directory preview");
		const previewDocument = await vscode.workspace.openTextDocument(previewUri);
		const previewEditor = await vscode.window.showTextDocument(previewDocument, openEditorOptions);
		await vscode.languages.setTextDocumentLanguage(previewDocument, "dired");
		previewProvider.notifyContentChanged();
		return;
	}

	// Current line is a file, open it in preview mode:
	const filePath = path.join(currentDirectory, currentLine);
	const fileUri = vscode.Uri.file(filePath);
	await vscode.commands.executeCommand('vscode.open', fileUri, openEditorOptions);

	// Set focus back to the dired editor
	await vscode.window.showTextDocument(diredEditor.document, { viewColumn: diredEditor.viewColumn, preserveFocus: true });
}

let markedLines = {}; // An object to store marked lines and their CSS decorations

/**
 * Add a given line number to makredLines and set its decoration
 * @param {vscode.Editor} editor
 * @param {int} lineNumber - the line number to mark
*/
const addMark = async (editor, lineNumber) => {
	if (!editor || !lineNumber) return;

	const range = editor.document.lineAt(lineNumber).range;

	const decorationType = vscode.window.createTextEditorDecorationType({
		textDecoration: "underline",
		backgroundColor: "rgba(177, 200, 0, 0.3)",
		outline: "1px solid black",
	});
		
	editor.setDecorations(decorationType, [range]);
	markedLines[lineNumber] = decorationType;

}

/**
 * Removes all marked items
*/
const removeAllMarks = async () => {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return;
	}

	for (const lineNumber in markedLines) {
		removeMark(editor, lineNumber);
	}
}

/**
 * Remove a given line number from makredLines and reset its decoration
 * @param {vscode.Editor} editor
 * @param {int} lineNumber - the line number to unmark
*/
const removeMark = async (editor, lineNumber) => {
	if (!editor || !lineNumber) return;

	const originalDecoration = markedLines[lineNumber];

	if (!originalDecoration) return;

	originalDecoration.dispose();
	delete markedLines[lineNumber];
}

/**
 * The command to (un)mark the line with the cursor on
 * @param {vscode.TextDocumentContentProvider} provider
*/
const diredToggleMark = async (provider = null) => {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return;
	}

	const selections = editor.selections;
	selections.forEach(selection => {
		const lineNumber = selection.active.line;
		if (!isLineFileOrDir(lineNumber)) return;
	
		if (markedLines[lineNumber]) {
			removeMark(editor,lineNumber);
			return;
		}
		addMark(editor,lineNumber);
	});
}

/**
 * Mark unmarked items, unmark marked items
 * @param {vscode.TextDocumentContentProvider} provider
*/
const diredInvertMarks = async (provider = null) => {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return;
	}

	for (let i=2;i<=lastEntryLineNumber;i++) {
		if (markedLines[i]) {
			removeMark(editor, i);
		} else {
			addMark(editor, i);
		}
	}
}


/**
 * Shows a textbox to enter a search query, marks all files / directories
 * containing entered string.
*/
const diredMarkByPartialName = async () => {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return;
	}

	const value = await vscode.window.showInputBox({ prompt: "Enter a search string, all entries containing it will get marked" });
	if (!value) {
		vscode.window.showWarningMessage("No search string provided");
		return;
	}

	for(let i=2;i<=lastEntryLineNumber;i++) {
		const currentLineText = editor.document.lineAt(i).text;
		if (currentLineText.includes(value)) {
			addMark(editor,i);
		}
	}
}

/**
 * Adds a single path to the current workspace (or creates a new one, if no workspace is open)
 * @param {string} fullPath - Full path of the added directory (will get converted to a VSCode Uri)
*/
const addToWorkspace = (fullPath) => {
	const uri = vscode.Uri.file(fullPath);
	const existingFolder = vscode.workspace.workspaceFolders
		? vscode.workspace.workspaceFolders.find(folder => folder.uri.fsPath === fullPath)
		: null;

	if (existingFolder) {
		vscode.window.showInformationMessage(`Folder ${fullPath} is already in the workspace`);
		return;
	}
	const currentWorkspaceFolders = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders.length : 0;
	vscode.workspace.updateWorkspaceFolders(
		currentWorkspaceFolders,
		null,
		{ uri: uri }
	);
}

/**
 * Shows an input box to decide which directory will get added to the current workspace.
 * The user can select the currently open directory or the selected/marked directories.
*/
const diredAddToWorkspace = async () => {
	const actions = {
		"Add the selected files / directories": () => {
			const entries = getPathsOfSelectedEntries();
			entries.forEach((entry) => {
				addToWorkspace(entry);
			});
		},
		"Add the currently open directory": () => {
			addToWorkspace(currentDirectory);
		},
	};
	const selectedOption = await vscode.window.showQuickPick(Object.keys(actions), {
		placeHolder: "Select what to add to the current workspace",
		canPickMany: false,
	});
	if (!selectedOption) return;

	actions[selectedOption]();
}

/**
 * Removes a single path from the current workspace
 * @param {string} fullPath - Full path of the removed directory (will get converted to a VSCode Uri)
*/
const removeFromWorkspace = (fullPath) => {
	if (fullPath.endsWith(path.sep)) fullPath = fullPath.slice(0,-1);
	const existingFolder = vscode.workspace.workspaceFolders
		? vscode.workspace.workspaceFolders.find(folder => folder.uri.fsPath === fullPath)
		: null;

	if (!existingFolder) {
		vscode.window.showInformationMessage(`Folder ${fullPath} is not in the workspace`);
		return;
	}

	const index = vscode.workspace.workspaceFolders.indexOf(existingFolder);
	vscode.workspace.updateWorkspaceFolders(index, 1);
}

/**
 * Shows an input box to decide which directory will get removed from the current workspace.
 * The user can select the currently open directory or the selected/marked directories.
*/
const diredRemoveFromWorkspace = async () => {
	const actions = {
		"Remove the selected files / directories": () => {
			const entries = getPathsOfSelectedEntries();
			entries.forEach((entry) => {
				removeFromWorkspace(entry);
			});
		},
		"Remove the directory currently open in dired": () => {
			removeFromWorkspace(currentDirectory);
		},
	};

	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (workspaceFolders) {
		workspaceFolders.map(dir => {
			actions[`Remove ${dir.uri.fsPath}`] = () => {
				removeFromWorkspace(dir.uri.fsPath);
			};
		});
	}

	const selectedOption = await vscode.window.showQuickPick(Object.keys(actions), {
		placeHolder: "Select what to remove from the current workspace",
		canPickMany: false,
	});

	if (!selectedOption) return;

	actions[selectedOption]();
}

/**
 * Adds a single path to bookmarks
 * @param {string} fullPath - Full path of the added directory
*/
const addToBookmarks = async (fullPath) => {
	const config = vscode.workspace.getConfiguration("dired");
	const bookmarkArray = config.get("bookmarks") || [];
	if (bookmarkArray.includes(fullPath)) return;
	bookmarkArray.push(fullPath);
	await config.update("bookmarks", bookmarkArray, vscode.ConfigurationTarget.Global);
}


/**
 * Removes a single path from bookmarks
 * @param {string} fullPath - Full path of the added directory
*/
const removeFromBookmarks = async (fullPath) => {
	const config = vscode.workspace.getConfiguration("dired");
	const bookmarkArray = config.get("bookmarks").filter((bookmark) => {
		return bookmark !== fullPath;
	});
	await config.update("bookmarks", bookmarkArray, vscode.ConfigurationTarget.Global);
}

/**
 * Shows an input box to decide which directory will get added to bookmarks.
 * The user can select the currently open directory or the selected/marked directories.
*/
const diredAddToBookmarks = async () => {
	const actions = {
		"Add the selected files / directories": () => {
			const entries = getPathsOfSelectedEntries();
			entries.forEach((entry) => {
				addToBookmarks(entry);
			});
		},
		"Add the currently open directory": () => {
			addToBookmarks(currentDirectory);
		},
	};
	const selectedOption = await vscode.window.showQuickPick(Object.keys(actions), {
		placeHolder: "Select what to add to Dired bookmakrs",
		canPickMany: false,
	});
	if (!selectedOption) return;

	actions[selectedOption]();

	
}

/**
 * Shows an input box to decide which directory will get removed from bookmarks.
*/
const diredRemoveFromBookmarks = async () => {
	const config = vscode.workspace.getConfiguration("dired");
	const bookmarkArray = config.get("bookmarks") || [];
	if (bookmarkArray.length === 0) {
		vscode.window.showInformationMessage(`There are no saved bookmarks.`);
		return;
	}
	const selectedOption = await vscode.window.showQuickPick(bookmarkArray, {
		placeHolder: "Select what to remove from bookmarks",
		canPickMany: false,
	});

	if (!selectedOption) return;

	removeFromBookmarks(selectedOption);
}


/**
 * Opens a file browser to change the currently opened directory.
 * Always opens in the currently open directory.
 * @param {vscode.TextDocumentContentProvider} provider
*/
const diredGoto = (provider) => {
	diredBrowse(provider, currentDirectory);
}


/**
 * Shows an input box to decide if Dired will open one of the project directories or open a file browser.
 * @param {vscode.TextDocumentContentProvider} provider
*/
const diredGotoAnywhere = async (provider) => {
	const actions = {};
	const workspaceFolders = vscode.workspace.workspaceFolders;

	if (workspaceFolders) {
		workspaceFolders.map(dir => {
			actions[`Workspace: ${dir.uri.fsPath}`] = dir.uri.fsPath;
		});
	}

	const config = vscode.workspace.getConfiguration("dired");
	const bookmarkArray = config.get("bookmarks") || [];
	bookmarkArray.forEach((bookmarkPath) => {
		actions[`Bookmark: ${bookmarkPath}`] = bookmarkPath;
	})

	actions[`Home: ${os.homedir()}`] = os.homedir();

	const browseAction = "Browse...";
	actions[browseAction] = "";

	const selectedOption = await vscode.window.showQuickPick(Object.keys(actions), {
		placeHolder: "Select a directory to open...",
		canPickMany: false,
	});

	if (!selectedOption) return;

	if (selectedOption === browseAction) {
		diredBrowse(provider);
		return;
	}

	currentDirectory = actions[selectedOption];
	await showCurrentDirectory(provider);
}

/**
 * Parses omit patterns from the user's config.
 * If the config entry doesn't exist, creates default ones for commonly hidden files (.DS_Store etc.)
 * If a RegExp is invalid, throws a warning.
*/
const setupOmitPatterns = async () => {
	const config = vscode.workspace.getConfiguration("dired");
	const userOmitPatterns = config.get("omitPatterns");
	userOmitPatterns.forEach((omitPattern) => {
		try {
			const patternRegExp = new RegExp(omitPattern);
			omitRegexes.push(patternRegExp);
		} catch (err) {
			vscode.window.showWarningMessage(`Invalid RegExp pattern in omitPatterns config: ${omitPattern}`);
			return;
		}
	});
}


function activate(context) {
	const provider = new DiredProvider();
	const providerRegistration = vscode.workspace.registerTextDocumentContentProvider("dired", provider);

	const previewProvider = new DiredPreviewProvider();
	const previewProviderRegistration = vscode.workspace.registerTextDocumentContentProvider("diredPreview", previewProvider);
	
	context.subscriptions.push(providerRegistration);
	context.subscriptions.push(previewProviderRegistration);

	const commands = [
		["diredBrowse", () => diredBrowse(provider)],
		["diredRefresh", () => diredRefresh(provider)],
		["diredSelect", () => diredSelect(provider)],
		["diredUp", () => diredUp(provider)],
		["diredRename", () => enterRenameMode(provider)],
		["diredRenameCancel", () => diredRenameCancel(provider)],
		["diredRenameCommit", () => applyRenameChanges(provider)],
		["diredDelete", () => diredDelete(provider)],
		["diredMove", () => diredMove(provider)],
		["diredCreateFile", () => diredCreateFile(provider)],
		["diredCreateDirectory", () => diredCreateDirectory(provider)],
		["diredPrev", () => moveCursorBy(provider, -1)],
		["diredNext", () => moveCursorBy(provider, 1)],
		["diredJumpToName", () => moveCursorToName(provider)],
		["diredPreview", () => toggleDiredPreviewMode(provider, previewProvider)],
		["diredToggleMark", () => diredToggleMark(provider)],
		["diredInvertMarks", () => diredInvertMarks(provider)],
		["diredUnmarkAll", () => removeAllMarks()],
		["diredMarkByPartialName", () => diredMarkByPartialName()],
		["diredAddToWorkspace", () => diredAddToWorkspace()],
		["diredAddToBookmarks", () => diredAddToBookmarks()],
		["diredRemoveFromWorkspace", () => diredRemoveFromWorkspace()],
		["diredRemoveFromBookmarks", () => diredRemoveFromBookmarks()],
		["diredGoto", () => diredGoto(provider)],
		["diredGotoAnywhere", () => diredGotoAnywhere(provider)],

		
	];
	commands.forEach((item) => {
		const registered = vscode.commands.registerCommand(`extension.${item[0]}`, item[1]);
		context.subscriptions.push(registered);
	});

	setupOmitPatterns(); // Parse user omitPatterns or create the default ones
	diredRenameCancel(provider); // Make sure we're not in Rename mode by default
	removeAllMarks(); // Remove any leftover marks from previous sessions
}

exports.activate = activate;

function deactivate() { }
exports.deactivate = deactivate;
