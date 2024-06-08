const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

let currentDirectory = false;
let lastWorkingDirectory = false;

class DiredProvider {
	constructor() {
		this._onDidChange = new vscode.EventEmitter();
		this.onDidChange = this._onDidChange.event;
	}

	provideTextDocumentContent(uri) {
		if (!currentDirectory) {
			return "No directory selected.";
		}

		const tryReadingDirectory = (dir) => {
			let files;
			try {
				files = fs.readdirSync(dir);
			} catch(err) {
				vscode.window.showErrorMessage(`Error reading directory: ${err.message}`);
				return false;
			}
			currentDirectory = dir;
			return files;
		}

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

		return fileContent;
	}

	notifyContentChanged() {
		this._onDidChange.fire(vscode.Uri.parse('dired://authority/dired'));
	}
}

const showCurrentDirectory = async (provider = null) => {
	if (!currentDirectory) return;

	const uri = vscode.Uri.parse('dired://authority/dired');
	const document = await vscode.workspace.openTextDocument(uri);
	const editor = await vscode.window.showTextDocument(document, { preview: false });
	await vscode.languages.setTextDocumentLanguage(document, "dired");
	if (!editor) {
		return;
	}
	editor.options.readOnly = true;

	lastWorkingDirectory = currentDirectory;

	if (provider) {
		provider.notifyContentChanged();
	}

	const moveCursor = () => {
		const range = editor.document.lineAt(2).range;
		editor.selection = new vscode.Selection(range.start, range.start);
		editor.revealRange(range);
	}
	moveCursor();

	const moveToFirstFile = (e) => {
		if (e.document.uri.toString() !== document.uri.toString()) return;
		moveCursor();
		vscode.workspace.onDidChangeTextDocument(moveToFirstFileDisposable.dispose);
	};

	const moveToFirstFileDisposable = vscode.workspace.onDidChangeTextDocument(moveToFirstFile);
	
}

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

const diredMark = async (args) => {
	const editor = vscode.window.activeTextEditor;
	if (!editor) return;

	const currentLine = editor.document.lineAt(editor.selection.active.line);
	console.log(currentLine.text);
	return currentLine.text;
}

const diredSelect = async (provider) => {
	console.log("diredSelect");
	const editor = vscode.window.activeTextEditor;
	if (!editor) return;

	const currentLine = editor.document.lineAt(editor.selection.active.line).text;
	console.log("currentLine", currentLine);
	if (currentLine.endsWith(path.sep)) {
		currentDirectory = path.join(currentDirectory, currentLine.slice(0, -1));
		showCurrentDirectory(provider);
	}
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
	];
	commands.forEach((item) => {
		const registered = vscode.commands.registerCommand(`extension.${item[0]}`, item[1]);
		context.subscriptions.push(registered);
	});
}

exports.activate = activate;

function deactivate() { }
exports.deactivate = deactivate;
