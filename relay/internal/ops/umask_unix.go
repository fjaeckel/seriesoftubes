//go:build unix

package ops

import "syscall"

// umask keeps the socket private from the moment it is created.
func umask(m int) int { return syscall.Umask(m) }
