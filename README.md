<div align="center">
	<img src="https://raw.githubusercontent.com/Baegus/sublime-dired-vscode/main/logo.png" alt="Logo" width="256">
</div>

# Sublime Dired for VS Code
This Visual Studio Code extension lets you edit *(rename, move, create, delete, preview)* directories and files right from your text editor's buffer, enabling **very efficient, keyboard-driven file management**.

![Demo Animation](https://raw.githubusercontent.com/Baegus/sublime-dired-vscode/main/demo.gif)

*Inspired by the [dired extension for Sublime Text](https://packagecontrol.io/packages/dired). Originally inspired by [dired mode in Emacs](https://www.gnu.org/software/emacs/manual/html_node/emacs/Dired.html).*

## Basic usage
1. After installation, open the command palette and type "Dired".
2. Choose one of the available commands:
	- **Browse...** opens the native directory picker of your operating system.
	- **Enter path manually** opens a text input box, allowing you to type in any valid directory path.
	- **Go to anywhere** gives you a list of options. You can open your home directory, a previously bookmarked one, or use any of the previously mentioned commands to open any directory.
3. Your selected directory will open in a new text buffer. Select any entry by moving your cursor up and down or by using `p`and `n`. Confirm your selection by pressing `Enter` or go up a directory using `u`.
4. Perform additional actions using commands shown under the directory listing. For example: `D (Shift+D)` will delete the currently selected entry. You can also affect multiple files and directories at once using marks (`m`).

## Rename Mode
Switch to Rename mode using `R (Shift+R)` and easily edit the names of your files and directories, just like any other text file. This makes it possible to use advanced text editing features like multi-cursor editing, search & replace, or even other extensions such as [Enumarator](https://marketplace.visualstudio.com/items?itemName=swindh.enumerator) to easily organize files using number sequences.

While renaming an entry, the original name is shown next to the edited line.

No entries will get renamed until you confirm your changes using `Ctrl+Enter` (or `Cmd+Enter`). Ensure you haven't added or removed any lines before confirming.

You can also discard all changes using `Shift+Escape`.

## Preview Mode
Toggle Preview Mode using `P (Shift+P)`. This opens a new editor view beside the current one and shows a simple preview of the entry that's currently selected by the cursor. Previewing works with every text or image file format that can be opened by VSCode.

## Workspace and Bookmarks
You can add selected (or currently open) directories to your workspace using this extension. You can also bookmark directories to make them available from the **Go to anywhere** menu. Bookmarks can also be edited from your *User Settings (JSON)* under the `dired.bookmarks` key.

## Hiding (ignoring) entries
If you don't want to show files or directories matching a certain RegExp in Dired, you can define them in your *User Settings (JSON)* under the `dired.omitPatterns` key.

## Donate
If you like this extension, you can [give me a tip using PayPal](https://paypal.me/Baegus). Thank you so much for your support!