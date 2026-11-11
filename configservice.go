package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"runtime"
	"strings"
	"sync"

	"changeme/internal/config"
	"changeme/internal/runner"
)

// ConfigService is the Wails boundary; persistence and validation stay in config.
type ConfigService struct {
	store   *config.Store
	gate    sync.Mutex
	runtime *runner.Manager
}

func NewConfigService(store *config.Store) *ConfigService { return &ConfigService{store: store} }

func (s *ConfigService) GetConfig() (config.Config, error) { return s.store.Load() }

func (s *ConfigService) RestoreBackup() (config.Config, error) {
	s.gate.Lock()
	defer s.gate.Unlock()
	if s.runtime != nil {
		for _, run := range s.runtime.Snapshot("").Runs {
			if s.runtime.HasActive(run.CommandID) {
				return config.Config{}, errors.New("stop active commands before restoring config")
			}
		}
	}
	return s.store.RestoreBackup()
}

func (s *ConfigService) SaveWorkspace(workspace config.Workspace, expectedRevision uint64) (config.Config, error) {
	s.gate.Lock()
	defer s.gate.Unlock()
	return s.store.Update(expectedRevision, func(c *config.Config) error {
		for i, w := range c.Workspaces {
			if w.ID == workspace.ID {
				if err := s.guardActive(w, workspace); err != nil {
					return err
				}
				c.Workspaces[i] = workspace
				return nil
			}
		}
		c.Workspaces = append(c.Workspaces, workspace)
		return nil
	})
}

func (s *ConfigService) RemoveWorkspace(id string, expectedRevision uint64) (config.Config, error) {
	s.gate.Lock()
	defer s.gate.Unlock()
	return s.store.Update(expectedRevision, func(c *config.Config) error {
		for i, w := range c.Workspaces {
			if w.ID == id {
				if err := s.guardActive(w, config.Workspace{}); err != nil {
					return err
				}
				c.Workspaces = append(c.Workspaces[:i], c.Workspaces[i+1:]...)
				return nil
			}
		}
		return errors.New("workspace not found")
	})
}

func (s *ConfigService) guardActive(previous, next config.Workspace) error {
	if s.runtime == nil {
		return nil
	}
	for _, p := range previous.Projects {
		for _, cmd := range p.Commands {
			if !s.runtime.HasActive(cmd.ID) {
				continue
			}
			found := false
			for _, np := range next.Projects {
				if np.ID != p.ID {
					continue
				}
				for _, nc := range np.Commands {
					if nc.ID == cmd.ID && nc.Kind == cmd.Kind && nc.Driver == cmd.Driver {
						found = true
					}
				}
			}
			if !found {
				return errors.New("stop active commands before removing or changing their kind/driver")
			}
		}
	}
	return nil
}

func samePath(a, b string) bool {
	a = filepath.Clean(a)
	b = filepath.Clean(b)
	if runtime.GOOS == "windows" {
		return strings.EqualFold(a, b)
	}
	return a == b
}

func (s *ConfigService) ImportProjects(workspaceID string, projects []config.Project, expectedRevision uint64) (config.Config, error) {
	s.gate.Lock()
	defer s.gate.Unlock()
	return s.store.Update(expectedRevision, func(c *config.Config) error {
		for i := range c.Workspaces {
			w := &c.Workspaces[i]
			if w.ID != workspaceID {
				continue
			}
			for _, p := range projects {
				directory, err := runner.ResolveDirectory(p.Directory, "")
				if err != nil {
					return err
				}
				p.Directory = directory
				exists := false
				for _, other := range w.Projects {
					if samePath(p.Directory, other.Directory) {
						exists = true
						break
					}
				}
				if !exists {
					w.Projects = append(w.Projects, p)
				}
			}
			return nil
		}
		return errors.New("workspace not found")
	})
}

func (s *ConfigService) PreviewConfig(text string) ([]config.Workspace, error) {
	c, err := config.Parse([]byte(text))
	if err != nil {
		return nil, err
	}
	return c.Workspaces, nil
}

func (s *ConfigService) ImportConfig(text string, expectedRevision uint64) (config.Config, error) {
	imported, err := config.Parse([]byte(text))
	if err != nil {
		return config.Config{}, err
	}
	if len(imported.Workspaces) == 0 {
		return config.Config{}, errors.New("config has no workspaces")
	}
	s.gate.Lock()
	defer s.gate.Unlock()
	return s.store.Update(expectedRevision, func(c *config.Config) error {
		c.Workspaces = append(c.Workspaces, config.CopyWorkspaces(imported.Workspaces)...)
		return nil
	})
}

func (s *ConfigService) ExportConfig(ids []string) (string, error) {
	c, err := s.store.Load()
	if err != nil {
		return "", err
	}
	selected := []config.Workspace{}
	for _, id := range ids {
		found := false
		for _, w := range c.Workspaces {
			if w.ID == id {
				selected = append(selected, w)
				found = true
				break
			}
		}
		if !found {
			return "", fmt.Errorf("workspace not found: %s", id)
		}
	}
	if len(selected) == 0 {
		return "", errors.New("select at least one workspace")
	}
	c.Workspaces = selected
	c.LastWorkspaceID = ""
	c.Revision = 0
	// Export portable workspace configuration, without machine-specific tool settings.
	c.Settings = config.Default().Settings
	data, err := json.MarshalIndent(c, "", "  ")
	return string(data), err
}

func (s *ConfigService) SaveSettings(settings config.Settings, expectedRevision uint64) (config.Config, error) {
	return s.store.Update(expectedRevision, func(c *config.Config) error { c.Settings = settings; return nil })
}

func (s *ConfigService) SelectWorkspace(id string, expectedRevision uint64) (config.Config, error) {
	return s.store.Update(expectedRevision, func(c *config.Config) error {
		for _, w := range c.Workspaces {
			if w.ID == id {
				c.LastWorkspaceID = id
				return nil
			}
		}
		return errors.New("workspace not found")
	})
}
