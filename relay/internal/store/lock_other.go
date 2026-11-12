//go:build !unix

package store

import "os"

// lockDir only opens the lock file where flock is not available (Windows): `relay serve` still
// refuses to start while another one answers on the folder's operator socket.
func lockDir(path string) (*os.File, error) {
	return os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o600)
}
