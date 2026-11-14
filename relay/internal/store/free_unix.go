//go:build unix

package store

import "syscall"

// FreeDisk is the space left for the relay's user on the data folder's disk, or -1 when unknown
// (a memory store, an error).
func (s *Store) FreeDisk() int64 {
	if s.dir == "" {
		return -1
	}
	var st syscall.Statfs_t
	if syscall.Statfs(s.dir, &st) != nil {
		return -1
	}
	return int64(st.Bavail) * int64(st.Bsize) //nolint:unconvert // field types differ by platform
}
