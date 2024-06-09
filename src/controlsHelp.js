const os = require('os');
const isMacOS = os.platform() === "darwin";

const controlsHelp = {
	default: [
		// [
			// ["m", "toggle mark (NOT YET IMPLEMENTED)"],
			// ["t", "toggle all marks (NOT YET IMPLEMENTED)"],
			// ["U", "unmark all (NOT YET IMPLEMENTED)"],
			// ["*.", "mark by file extension (NOT YET IMPLEMENTED)"],
		// ],
		[
			["Enter/o", "Open file / view directory"],
			["R", "rename"],
			// ["M", "move (NOT YET IMPLEMENTED)"],
			["D", "delete"],
			["cd", "create directory"],
			["cf", "create file"],
		],
		[
			["u", "up to parent directory"],
			// ["g", "goto directory (NOT YET IMPLEMENTED)"],
			["p", "move to previous file"],
			["n", "move to next file"],
			["rv", "refresh view"],
		],
		// [
			// ["B", "Goto Anywhere (goto any directory, bookmark or project dir) (NOT YET IMPLEMENTED)"],
			// ["ab", "add to bookmarks (NOT YET IMPLEMENTED)"],
			// ["ap", "add to project (NOT YET IMPLEMENTED)"],
			// ["rb", "remove from bookmark (NOT YET IMPLEMENTED)"],
			// ["ra", "remove from project (NOT YET IMPLEMENTED)"],
		// ],
		[
			// ["P", "toggle Preview mode on/off (NOT YET IMPLEMENTED)"],
			["j", "jump to file/dir name"],
		],
	],
	rename: [
		[
			["Ctrl+Enter", "Confirm changes"],
			["Shift+Escape", "Cancel"],
		],
	]
};
exports.controlsHelp = controlsHelp;

const getControlsHelpString = (groups) => {
	const string = groups.map((group) => {
		return group.map((item) => {
			let itemString = item.join(" = ")
			if (isMacOS) itemString = itemString.replaceAll("Ctrl","Cmd");
			return ` ${itemString}`;
		}).join("\n");
	}).join("\n\n");
	return string;
};

this.controlsHelpStrings = {}
for (key in controlsHelp) {
	this.controlsHelpStrings[key] = getControlsHelpString(controlsHelp[key]);
}

exports.controlsHelpStrings = this.controlsHelpStrings;
