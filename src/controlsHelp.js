const os = require("os");
const isMacOS = os.platform() === "darwin";

const controlsHelp = {
	default: [
		[
			["m", "toggle mark"],
			["t", "toggle all marks"],
			["U", "unmark all"],
			["s", "mark by partial filename"],
		],
		[
			["Enter/o", "Open file / view directory"],
			["R", "rename"],
			["M", "move"],
			["D", "delete"],
			["cd", "create directory"],
			["cf", "create file"],
		],
		[
			["u", "up to parent directory"],
			["g", "go to directory"],
			["p", "move to previous file"],
			["n", "move to next file"],
			["rv", "refresh view"],
		],
		[
			["B", "go to anywhere"],
			["ab", "add to bookmarks"],
			["aw", "add to workspace"],
			["rb", "remove from bookmark"],
			["rw", "remove from workspace"],
		],
		[
			["P", "toggle Preview mode on/off"],
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
