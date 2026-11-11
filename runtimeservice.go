package main

import (
	"errors"
	"fmt"
	"strings"

	"changeme/internal/config"
	"changeme/internal/runner"
)

type RuntimeService struct {
	config  *ConfigService
	manager *runner.Manager
}

func NewRuntimeService(c *ConfigService, m *runner.Manager) *RuntimeService {
	return &RuntimeService{config: c, manager: m}
}

func findCommand(c config.Config, id string) (config.Workspace, config.Project, config.Command, error) {
	for _, w := range c.Workspaces {
		for _, p := range w.Projects {
			for _, cmd := range p.Commands {
				if cmd.ID == id {
					return w, p, cmd, nil
				}
			}
		}
	}
	return config.Workspace{}, config.Project{}, config.Command{}, errors.New("command not found")
}

func (s *RuntimeService) Snapshot(commandID string) runner.Snapshot {
	return s.manager.Snapshot(commandID)
}

func (s *RuntimeService) RefreshWorkspace(workspaceID string) error {
	s.config.gate.Lock()
	defer s.config.gate.Unlock()
	c, err := s.config.store.Load()
	if err != nil {
		return err
	}
	for _, w := range c.Workspaces {
		if w.ID != workspaceID {
			continue
		}
		s.manager.Focus(workspaceID)
		for _, p := range w.Projects {
			for _, cmd := range p.Commands {
				if cmd.Driver == "docker-compose" {
					if err := s.manager.Observe(w, p, cmd, c.Settings); err != nil {
						return err
					}
				}
			}
		}
		return nil
	}
	return errors.New("workspace not found")
}

func (s *RuntimeService) Start(commandID string) error {
	s.config.gate.Lock()
	defer s.config.gate.Unlock()
	c, err := s.config.store.Load()
	if err != nil {
		return err
	}
	w, p, cmd, err := findCommand(c, commandID)
	if err != nil {
		return err
	}
	return s.manager.Start(w, p, cmd, c.Settings)
}
func (s *RuntimeService) Stop(commandID string, force bool) error {
	return s.manager.Stop(commandID, force)
}
func (s *RuntimeService) Restart(commandID string) error {
	if err := s.Stop(commandID, false); err != nil {
		return err
	}
	return s.Start(commandID)
}

func (s *RuntimeService) Workspace(workspaceID string, start bool) error {
	c, err := s.config.store.Load()
	if err != nil {
		return err
	}
	for _, w := range c.Workspaces {
		if w.ID != workspaceID {
			continue
		}
		failures := []string{}
		if start {
			for _, id := range w.StartCommandIDs {
				if !s.manager.HasActive(id) {
					if err := s.Start(id); err != nil {
						failures = append(failures, id+": "+err.Error())
					}
				}
			}
		} else {
			for _, p := range w.Projects {
				for _, cmd := range p.Commands {
					if cmd.Kind == "service" && s.manager.HasActive(cmd.ID) {
						if err := s.Stop(cmd.ID, false); err != nil {
							failures = append(failures, cmd.ID+": "+err.Error())
						}
					}
				}
			}
		}
		if len(failures) > 0 {
			return fmt.Errorf("some commands failed: %s", strings.Join(failures, "; "))
		}
		return nil
	}
	return errors.New("workspace not found")
}

func (s *RuntimeService) StopOwned() error {
	failures := []string{}
	for _, r := range s.manager.OwnedActive() {
		if err := s.manager.Stop(r.CommandID, false); err != nil {
			failures = append(failures, err.Error())
		}
	}
	if len(failures) > 0 {
		return errors.New(strings.Join(failures, "; "))
	}
	return nil
}
