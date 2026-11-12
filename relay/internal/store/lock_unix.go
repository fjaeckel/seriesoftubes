//go:build unix

package store

import (
	"errors"
	"os"
	"syscall"
)

// lockDir takes an exclusive lock on the data folder's lock file, held until it is closed: two
// relays on one folder would delete each other's operator socket and compact one store twice.
func lockDir(path string) (*os.File, error) {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, err
	}
	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		f.Close()
		if errors.Is(err, syscall.EWOULDBLOCK) {
			return nil, ErrLocked
		}
		return nil, err
	}
	return f, nil
}
