package config

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

const maxConfigBytes = 5 << 20

var ErrRevisionConflict = errors.New("config changed; reload before saving")

// Store reads from disk for every operation so multiple app instances see revisions.
type Store struct{ path string }

func NewStore(path string) *Store { return &Store{path: path} }

func UserStore() (*Store, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return nil, fmt.Errorf("locate user config: %w", err)
	}
	return NewStore(filepath.Join(dir, "dwrk", "config.json")), nil
}

func (s *Store) Load() (Config, error) {
	lock, err := s.lock()
	if err != nil {
		return Config{}, err
	}
	defer lock.Close()
	c, _, err := s.read()
	return c, err
}

// Update validates the entire result and commits it only when the revision matches.
// The callback must not call back into this Store while holding the file lock.
func (s *Store) Update(expectedRevision uint64, change func(*Config) error) (Config, error) {
	lock, err := s.lock()
	if err != nil {
		return Config{}, err
	}
	defer lock.Close()
	c, previous, err := s.read()
	if err != nil {
		return Config{}, err
	}
	if c.Revision != expectedRevision {
		return Config{}, ErrRevisionConflict
	}
	if err := change(&c); err != nil {
		return Config{}, err
	}
	if expectedRevision == ^uint64(0) {
		return Config{}, errors.New("config revision exhausted")
	}
	c.SchemaVersion = SchemaVersion
	c.Revision = expectedRevision + 1
	normalizeSelection(&c)
	if err := Validate(c); err != nil {
		return Config{}, err
	}
	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return Config{}, err
	}
	if len(data) > maxConfigBytes {
		return Config{}, errors.New("config exceeds 5 MiB")
	}
	if previous != nil {
		if err := writeFile(s.path+".bak", previous); err != nil {
			return Config{}, fmt.Errorf("backup config: %w", err)
		}
	}
	if err := writeFile(s.path, data); err != nil {
		return Config{}, fmt.Errorf("save config: %w", err)
	}
	return c, nil
}

func (s *Store) lock() (*os.File, error) {
	if err := os.MkdirAll(filepath.Dir(s.path), 0700); err != nil {
		return nil, err
	}
	f, err := os.OpenFile(s.path+".lock", os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, err
	}
	if err := lockFile(f); err != nil {
		f.Close()
		return nil, fmt.Errorf("config is busy: %w", err)
	}
	return f, nil // Closing the handle releases the OS lock, including after a crash.
}

func (s *Store) read() (Config, []byte, error) {
	f, err := os.Open(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return Default(), nil, nil
	}
	if err != nil {
		return Config{}, nil, err
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, maxConfigBytes+1))
	if err != nil {
		return Config{}, nil, err
	}
	if len(data) > maxConfigBytes {
		return Config{}, nil, errors.New("config exceeds 5 MiB")
	}
	var c Config
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&c); err != nil {
		return Config{}, nil, fmt.Errorf("decode config (original file preserved): %w", err)
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return Config{}, nil, errors.New("config must contain exactly one JSON object")
	}
	if err := Validate(c); err != nil {
		return Config{}, nil, fmt.Errorf("invalid config (original file preserved): %w", err)
	}
	normalizeSelection(&c)
	return c, data, nil
}

func normalizeSelection(c *Config) {
	for _, w := range c.Workspaces {
		if w.ID == c.LastWorkspaceID {
			return
		}
	}
	c.LastWorkspaceID = ""
	if len(c.Workspaces) > 0 {
		c.LastWorkspaceID = c.Workspaces[0].ID
	}
}

func writeFile(path string, data []byte) error {
	f, err := os.CreateTemp(filepath.Dir(path), ".dwrk-config-*")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	if _, err := f.Write(data); err != nil {
		f.Close()
		return err
	}
	if err := f.Sync(); err != nil {
		f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	return replaceFile(f.Name(), path)
}
