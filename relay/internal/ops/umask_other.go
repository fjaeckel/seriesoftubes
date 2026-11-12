//go:build !unix

package ops

// Windows has no umask; the socket file's permissions are set right after creation.
func umask(m int) int { return m }
