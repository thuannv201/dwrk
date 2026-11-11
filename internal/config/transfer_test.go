package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestTransferCopiesReferencesAndRecoversBackup(t *testing.T) {
	c := fixture(t)
	c.Workspaces[0].Resources = []Resource{{ID: "docs", Name: "Docs", Kind: "url", Target: "http://localhost"}}
	data, err := json.Marshal(c)
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := Parse(data)
	if err != nil {
		t.Fatal(err)
	}
	copies := CopyWorkspaces(parsed.Workspaces)
	w := copies[0]
	p := w.Projects[0]
	if w.ID == c.Workspaces[0].ID || p.ID == c.Workspaces[0].Projects[0].ID || p.PrimaryCommandID != p.Commands[0].ID || w.StartCommandIDs[0] != p.Commands[0].ID || w.Resources[0].ID == "docs" {
		t.Fatalf("bad copy: %+v", w)
	}
	s := NewStore(filepath.Join(t.TempDir(), "config.json"))
	if _, err := s.Update(0, func(next *Config) error { *next = c; return nil }); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Update(1, func(next *Config) error { next.Settings.Theme = "light"; return nil }); err != nil {
		t.Fatal(err)
	}
	if err := s.Export(s.path, data); err == nil {
		t.Fatal("export can overwrite live config")
	}
	if _, err := s.RestoreBackup(); err == nil {
		t.Fatal("healthy config should not be replaced by backup")
	}
	if err := os.WriteFile(s.path, []byte("broken"), 0600); err != nil {
		t.Fatal(err)
	}
	restored, err := s.RestoreBackup()
	if err != nil {
		t.Fatal(err)
	}
	if restored.Revision != 2 || restored.Settings.Theme != "dark" {
		t.Fatalf("wrong backup: %+v", restored)
	}
	rejected, err := filepath.Glob(s.path + ".rejected-*")
	if err != nil || len(rejected) != 1 {
		t.Fatalf("no preserved corrupt file: %v %v", rejected, err)
	}
	original, err := os.ReadFile(rejected[0])
	if err != nil || string(original) != "broken" {
		t.Fatal("corrupt original was not preserved")
	}
}

func TestLegacyMockExport(t *testing.T) {
	path := t.TempDir()
	legacy := map[string]any{"format": "dwrk-mock", "schemaVersion": 1, "workspaces": []any{map[string]any{"id": "w", "name": "W", "rootPath": path, "projects": []any{map[string]any{"id": "p", "name": "P", "directory": path, "technology": "go", "technologyLabel": "Go", "branch": "main", "primaryCommandId": "dev", "commands": []any{map[string]any{"id": "dev", "name": "Dev", "kind": "service", "run": "go run .", "port": 8080}}}}}}}
	data, _ := json.Marshal(legacy)
	c, err := Parse(data)
	if err != nil {
		t.Fatal(err)
	}
	cmd := c.Workspaces[0].Projects[0].Commands[0]
	if cmd.Driver != "process" || cmd.Ports[0] != 8080 || c.Workspaces[0].StartCommandIDs[0] != "dev" {
		t.Fatalf("bad conversion: %+v", c)
	}
	legacy["schemaVersion"] = 2
	data, _ = json.Marshal(legacy)
	if _, err := Parse(data); err == nil {
		t.Fatal("unknown legacy version accepted")
	}
}
