package main

import "strings"

// dataFolderWarning: on Windows, file modes (0600 keys, 0700 folders) do nothing, so what keeps other users of the
// machine away from node.key and operator.key is where the folder is. Under the user's profile it inherits an ACL
// that admits only that user (and administrators); elsewhere (C:\relay, a shared drive) it usually admits every
// local user. Elsewhere no warning: unix modes do the work.
func dataFolderWarning(dir, goos, profile string) string {
	if goos != "windows" || profile == "" {
		return ""
	}
	// dir is absolute (the caller's filepath.Abs); compared as Windows compares paths: case and slashes aside.
	low := func(s string) string { return strings.TrimRight(strings.ToLower(strings.ReplaceAll(s, "/", `\`)), `\`) }
	a, p := low(dir), low(profile)
	if a == p || strings.HasPrefix(a, p+`\`) {
		return ""
	}
	return "the data folder " + dir + " is not under your user profile (" + profile + "): on Windows file modes do not " +
		"protect the keys in it, the folder's permissions do; keep it under your profile, or let only your user read it"
}
