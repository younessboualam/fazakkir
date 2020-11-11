chrome.runtime.onInstalled.addListener(function(details) {
	if (details.reason == "install") {
		chrome.tabs.create({url: "chrome://newtab", selected: true})
	}
})

chrome.browserAction.onClicked.addListener(function(tab) {
	chrome.tabs.create({url: "chrome://newtab", selected: true})
})