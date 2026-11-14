//go:build !unix

package store

// FreeDisk is the space left on the data folder's disk, or -1 when unknown (always here).
func (s *Store) FreeDisk() int64 { return -1 }
