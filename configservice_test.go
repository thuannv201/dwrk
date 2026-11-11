package main

import (
	"errors"
	"path/filepath"
	"runtime"
	"testing"

	"changeme/internal/runner"

	"changeme/internal/config"
)

func TestConfigService(t *testing.T) {
	s := NewConfigService(config.NewStore(filepath.Join(t.TempDir(), "config.json")))
	c, err := s.GetConfig()
	if err != nil {
		t.Fatal(err)
	}
	w := config.Workspace{ID: "one", Name: "One", RootPath: t.TempDir()}
	c, err = s.SaveWorkspace(w, c.Revision)
	if err != nil || len(c.Workspaces) != 1 {
		t.Fatalf("create: %+v, %v", c, err)
	}
	w.Name = "Renamed"
	c, err = s.SaveWorkspace(w, c.Revision)
	if err != nil || len(c.Workspaces) != 1 || c.Workspaces[0].Name != "Renamed" {
		t.Fatalf("update: %+v, %v", c, err)
	}
	if _, err := s.RemoveWorkspace(w.ID, 0); !errors.Is(err, config.ErrRevisionConflict) {
		t.Fatalf("stale delete: %v", err)
	}
	c, err = s.SaveWorkspace(config.Workspace{ID: "two", Name: "Two", RootPath: t.TempDir()}, c.Revision)
	if err != nil {
		t.Fatal(err)
	}
	c, err = s.SelectWorkspace("two", c.Revision)
	if err != nil || c.LastWorkspaceID != "two" {
		t.Fatalf("select: %+v, %v", c, err)
	}
	c, err = s.RemoveWorkspace("two", c.Revision)
	if err != nil || c.LastWorkspaceID != "one" {
		t.Fatalf("selection after removal: %+v, %v", c, err)
	}
	settings := c.Settings
	settings.Theme = "light"
	c, err = s.SaveSettings(settings, c.Revision)
	if err != nil || c.Settings.Theme != "light" {
		t.Fatalf("settings: %+v, %v", c, err)
	}
	if _, err := s.RemoveWorkspace("missing", c.Revision); err == nil {
		t.Fatal("unknown workspace deleted")
	}
	if _, err := s.SelectWorkspace("missing", c.Revision); err == nil {
		t.Fatal("unknown workspace selected")
	}
	c, err = s.RemoveWorkspace("one", c.Revision)
	if err != nil || len(c.Workspaces) != 0 || c.LastWorkspaceID != "" {
		t.Fatalf("delete: %+v, %v", c, err)
	}
}

func TestImportsAndActiveCommandGuard(t *testing.T) {
	s := NewConfigService(config.NewStore(filepath.Join(t.TempDir(), "config.json")))
	m := runner.New()
	defer m.Close()
	s.runtime = m
	w := config.Workspace{ID: "w", Name: "W", RootPath: t.TempDir()}
	c, err := s.SaveWorkspace(w, 0)
	if err != nil {
		t.Fatal(err)
	}
	run := "sleep 20"
	if runtime.GOOS == "windows" {
		run = "Start-Sleep -Seconds 20"
	}
	p := config.Project{ID: "p", Name: "P", Directory: t.TempDir(), PrimaryCommandID: "dev", Commands: []config.Command{{ID: "dev", Name: "Dev", Kind: "service", Driver: "process", Run: run}}}
	c, err = s.ImportProjects(w.ID, []config.Project{p, p}, c.Revision)
	if err != nil {
		t.Fatal(err)
	}
	if len(c.Workspaces[0].Projects) != 1 {
		t.Fatal("duplicate import accepted")
	}
	runtimeService := NewRuntimeService(s, m)
	if err := runtimeService.Start("dev"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.SaveWorkspace(w, c.Revision); err == nil {
		t.Fatal("active project removed")
	}
	if _, err := s.RemoveWorkspace(w.ID, c.Revision); err == nil {
		t.Fatal("active workspace removed")
	}
	export, err := s.ExportConfig([]string{w.ID})
	if err != nil {
		t.Fatal(err)
	}
	imported, err := s.ImportConfig(export, c.Revision)
	if err != nil {
		t.Fatal(err)
	}
	if len(imported.Workspaces) != 2 || !m.HasActive("dev") {
		t.Fatal("import affected existing service")
	}
	if err := runtimeService.Stop("dev", true); err != nil {
		t.Fatal(err)
	}
	if _, err := s.RemoveWorkspace(w.ID, imported.Revision); err != nil {
		t.Fatal(err)
	}
}
