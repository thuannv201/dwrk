package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"changeme/internal/config"
	"changeme/internal/scanner"
	"changeme/internal/tools"

	"github.com/wailsapp/wails/v3/pkg/application"
)

type DesktopService struct {
	app        *application.App
	config     *ConfigService
	scanMu     sync.Mutex
	scanCancel context.CancelFunc
}

func NewDesktopService(c *ConfigService) *DesktopService { return &DesktopService{config: c} }

func (s *DesktopService) PickDirectory() (string, error) {
	path, err := s.app.Dialog.OpenFile().CanChooseFiles(false).CanChooseDirectories(true).SetTitle("Chọn thư mục").PromptForSingleSelection()
	if dialogCancelled(err) {
		return "", nil
	}
	return path, err
}

// Wails' Windows cancellation sentinel lives in an internal package.
func dialogCancelled(err error) bool { return err != nil && err.Error() == "cancelled by user" }

func (s *DesktopService) Scan(path string) (scanner.Result, error) {
	s.scanMu.Lock()
	if s.scanCancel != nil {
		s.scanCancel()
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	s.scanCancel = cancel
	s.scanMu.Unlock()
	defer cancel()
	return scanner.Scan(ctx, path)
}
func (s *DesktopService) CancelScan() {
	s.scanMu.Lock()
	defer s.scanMu.Unlock()
	if s.scanCancel != nil {
		s.scanCancel()
	}
}

func (s *DesktopService) ExportConfig(ids []string) (bool, error) {
	text, err := s.config.ExportConfig(ids)
	if err != nil {
		return false, err
	}
	path, err := s.app.Dialog.SaveFile().SetFilename("dwrk-config.json").AddFilter("DWRK config", "*.json").PromptForSingleSelection()
	if dialogCancelled(err) {
		return false, nil
	}
	if err != nil || path == "" {
		return false, err
	}
	// The native save dialog is the only source of this destination path.
	err = s.config.store.Export(path, []byte(text))
	return err == nil, err
}

func (s *DesktopService) OpenProject(id, kind string) error {
	c, err := s.config.GetConfig()
	if err != nil {
		return err
	}
	for _, w := range c.Workspaces {
		for _, p := range w.Projects {
			if p.ID == id {
				return s.openDirectory(c.Settings, p.Directory, kind)
			}
		}
	}
	return errors.New("project not found")
}
func (s *DesktopService) OpenWorkspace(id, kind string) error {
	c, err := s.config.GetConfig()
	if err != nil {
		return err
	}
	for _, w := range c.Workspaces {
		if w.ID == id {
			return s.openDirectory(c.Settings, w.RootPath, kind)
		}
	}
	return errors.New("workspace not found")
}
func (s *DesktopService) openDirectory(settings config.Settings, path, kind string) error {
	if kind == "folder" {
		info, err := os.Stat(path)
		if err != nil {
			return err
		}
		if !info.IsDir() {
			return errors.New("workspace path is not a directory")
		}
		return s.app.Browser.OpenFile(path)
	}
	if kind == "docs" {
		path = filepath.Join(path, "docs")
		info, err := os.Stat(path)
		if err != nil {
			return err
		}
		if !info.IsDir() {
			return errors.New("docs path is not a directory")
		}
		return s.app.Browser.OpenFile(path)
	}
	tool := settings.Editor
	if kind == "terminal" {
		tool = settings.Terminal
	} else if kind != "editor" {
		return errors.New("unsupported tool")
	}
	return tools.OpenTool(tool, kind, path)
}
func (s *DesktopService) OpenResource(id string) error {
	c, err := s.config.GetConfig()
	if err != nil {
		return err
	}
	for _, w := range c.Workspaces {
		for _, r := range w.Resources {
			if r.ID == id {
				if r.Kind == "url" {
					return s.app.Browser.OpenURL(r.Target)
				}
				if _, err := os.Stat(r.Target); err != nil {
					return err
				}
				return s.app.Browser.OpenFile(r.Target)
			}
		}
	}
	return errors.New("resource not found")
}
func (s *DesktopService) OpenCommandURL(id string) error {
	c, err := s.config.GetConfig()
	if err != nil {
		return err
	}
	_, _, cmd, err := findCommand(c, id)
	if err != nil {
		return err
	}
	url := cmd.URL
	if url == "" && len(cmd.Ports) > 0 {
		url = fmt.Sprintf("http://localhost:%d", cmd.Ports[0])
	}
	if url == "" {
		return errors.New("configure a command URL or port")
	}
	return s.app.Browser.OpenURL(url)
}
func (s *DesktopService) GitStatus(id string) (tools.GitStatus, error) {
	c, err := s.config.GetConfig()
	if err != nil {
		return tools.GitStatus{}, err
	}
	for _, w := range c.Workspaces {
		for _, p := range w.Projects {
			if p.ID == id {
				return tools.Git(p.Directory)
			}
		}
	}
	return tools.GitStatus{}, errors.New("project not found")
}
func (s *DesktopService) Quit() { s.app.Quit() }
