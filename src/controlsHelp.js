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
exports.controlsHelp = controlsHelp;

const getControlsHelpString = (groups) => {
	const string = groups.map((group) => {
		return group.map((item) => ` ${item.join(" = ")}`).join("\n");
	}).join("\n\n");
	return string;
};

this.controlsHelpStrings = {}
for (key in controlsHelp) {
	this.controlsHelpStrings[key] = getControlsHelpString(controlsHelp[key]);
}

exports.controlsHelpStrings = this.controlsHelpStrings;
