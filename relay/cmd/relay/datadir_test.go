package main

import "testing"

// On Windows a data folder outside the user's profile is warned about at start: file modes protect nothing there.
func TestDataFolderWarning(t *testing.T) {
	for _, c := range []struct {
		dir, goos, profile string
		warn               bool
	}{
		{`C:\Users\fred\relay-lan`, "windows", `C:\Users\fred`, false},
		{`c:\users\FRED\games\relay-data`, "windows", `C:\Users\Fred\`, false},
		{`C:\relay`, "windows", `C:\Users\fred`, true},
		{`C:\Users\fred2\relay`, "windows", `C:\Users\fred`, true},
		{`D:\shared\relay-data`, "windows", `C:\Users\fred`, true},
		{`/srv/relay`, "linux", `/home/fred`, false},
		{`C:\relay`, "windows", "", false},
	} {
		if got := dataFolderWarning(c.dir, c.goos, c.profile) != ""; got != c.warn {
			t.Errorf("%s (%s, profile %s): warned %v, want %v", c.dir, c.goos, c.profile, got, c.warn)
		}
	}
}
