//go:build darwin || linux

package config

import (
	"os"

	"golang.org/x/sys/unix"
)

func lockFile(f *os.File) error {
	return unix.Flock(int(f.Fd()), unix.LOCK_EX|unix.LOCK_NB)
}

func replaceFile(source, destination string) error {
	return os.Rename(source, destination)
}
