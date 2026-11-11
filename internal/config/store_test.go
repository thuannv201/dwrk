package config

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func fixture(t *testing.T) Config {
	t.Helper()
	c := Default()
	c.Workspaces = []Workspace{{
		ID: "ws", Name: "Workspace", RootPath: t.TempDir(),
		Projects: []Project{{ID: "project", Name: "API", Directory: t.TempDir(), PrimaryCommandID: "dev", Commands: []Command{
			{ID: "dev", Name: "Dev", Kind: "service", Driver: "process", Run: "go run .", WorkingDirectory: ".", Ports: []int{8080}, HealthCheck: &HealthCheck{URL: "http://localhost:8080/health", IntervalMS: 1000, TimeoutMS: 100, ExpectedStatus: 200}},
			{ID: "test", Name: "Test", Kind: "task", Run: "go test ./..."},
		}}}, StartCommandIDs: []string{"dev"},
	}}
	return c
}

func TestStoreRoundTripAndRevision(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nested", "config.json")
	s := NewStore(path)
	initial, err := s.Load()
	if err != nil || !reflect.DeepEqual(initial, Default()) {
		t.Fatalf("default: %+v, %v", initial, err)
	}
	if _, err := os.Stat(path); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("load must not create a config")
	}
	c := fixture(t)
	first, err := s.Update(0, func(next *Config) error { *next = c; return nil })
	if err != nil {
		t.Fatal(err)
	}
	if first.Revision != 1 || first.LastWorkspaceID != "ws" {
		t.Fatalf("unexpected config: %+v", first)
	}
	loaded, err := NewStore(path).Load()
	if err != nil || !reflect.DeepEqual(loaded, first) {
		t.Fatalf("round trip: %+v, %v", loaded, err)
	}
	second, err := NewStore(path).Update(1, func(next *Config) error { next.Settings.Theme = "light"; return nil })
	if err != nil || second.Revision != 2 {
		t.Fatalf("save: %+v, %v", second, err)
	}
	backup, err := NewStore(path + ".bak").Load()
	if err != nil || !reflect.DeepEqual(backup, first) {
		t.Fatalf("backup: %+v, %v", backup, err)
	}
	called := false
	if _, err := s.Update(1, func(*Config) error { called = true; return nil }); !errors.Is(err, ErrRevisionConflict) || called {
		t.Fatalf("stale revision: %v", err)
	}
	if _, err := s.Update(2, func(next *Config) error { next.Settings.Theme = "invalid"; return nil }); err == nil {
		t.Fatal("invalid config saved")
	}
	unchanged, err := s.Load()
	if err != nil || !reflect.DeepEqual(unchanged, second) {
		t.Fatal("failed save changed config")
	}
}

func TestCorruptAndUnsupportedConfigArePreserved(t *testing.T) {
	for _, data := range []string{`{broken`, `null`, `{}`, `{"schemaVersion":999}`, `{} {}`, `{"unknown":true}`} {
		t.Run(data, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "config.json")
			if err := os.WriteFile(path, []byte(data), 0600); err != nil {
				t.Fatal(err)
			}
			s := NewStore(path)
			if _, err := s.Load(); err == nil {
				t.Fatal("bad config loaded")
			}
			if _, err := s.Update(0, func(*Config) error { return nil }); err == nil {
				t.Fatal("bad config overwritten")
			}
			after, err := os.ReadFile(path)
			if err != nil || string(after) != data {
				t.Fatal("original file changed")
			}
		})
	}
}

func TestFileLockExcludesOtherStores(t *testing.T) {
	s := NewStore(filepath.Join(t.TempDir(), "config.json"))
	lock, err := s.lock()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := NewStore(s.path).Load(); err == nil {
		lock.Close()
		t.Fatal("second handle acquired lock")
	}
	if err := lock.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err := NewStore(s.path).Load(); err != nil {
		t.Fatalf("lock not released: %v", err)
	}
}

func TestWriteFailurePreservesPreviousFile(t *testing.T) {
	s := NewStore(filepath.Join(t.TempDir(), "config.json"))
	if _, err := s.Update(0, func(*Config) error { return nil }); err != nil {
		t.Fatal(err)
	}
	before, err := os.ReadFile(s.path)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(s.path+".bak", 0700); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Update(1, func(c *Config) error { c.Settings.Theme = "light"; return nil }); err == nil {
		t.Fatal("backup failure ignored")
	}
	after, err := os.ReadFile(s.path)
	if err != nil || string(after) != string(before) {
		t.Fatal("failed backup changed config")
	}
	if err := writeFile(filepath.Join(t.TempDir(), "missing", "config.json"), []byte("test")); err == nil {
		t.Fatal("missing directory must fail")
	}
}

func TestValidate(t *testing.T) {
	valid := fixture(t)
	if err := Validate(valid); err != nil {
		t.Fatal(err)
	}
	tests := map[string]func(*Config){
		"duplicate ID":    func(c *Config) { c.Workspaces[0].Projects[0].ID = "ws" },
		"missing primary": func(c *Config) { c.Workspaces[0].Projects[0].PrimaryCommandID = "missing" },
		"task in batch":   func(c *Config) { c.Workspaces[0].StartCommandIDs = []string{"test"} },
		"duplicate start": func(c *Config) { c.Workspaces[0].StartCommandIDs = []string{"dev", "dev"} },
		"relative root":   func(c *Config) { c.Workspaces[0].RootPath = "relative" },
		"invalid port":    func(c *Config) { c.Workspaces[0].Projects[0].Commands[0].Ports = []int{65536} },
		"unsafe health URL": func(c *Config) {
			c.Workspaces[0].Projects[0].Commands[0].HealthCheck.URL = "https://user:secret@localhost"
		},
		"health timeout": func(c *Config) { c.Workspaces[0].Projects[0].Commands[0].HealthCheck.TimeoutMS = 0 },
		"task health": func(c *Config) {
			c.Workspaces[0].Projects[0].Commands[1].HealthCheck = c.Workspaces[0].Projects[0].Commands[0].HealthCheck
		},
		"path escape":      func(c *Config) { c.Workspaces[0].Projects[0].Commands[0].WorkingDirectory = "../outside" },
		"invalid driver":   func(c *Config) { c.Workspaces[0].Projects[0].Commands[0].Driver = "unknown" },
		"unknown kind":     func(c *Config) { c.Workspaces[0].Projects[0].Commands[0].Kind = "unknown" },
		"duplicate name":   func(c *Config) { c.Workspaces[0].Projects[0].Commands[1].Name = " dev " },
		"invalid timezone": func(c *Config) { c.Settings.TimeZone = "invalid" },
		"log bounds":       func(c *Config) { c.Settings.Logs.MaxBytesTotal = 64 << 20 },
	}
	for name, change := range tests {
		t.Run(name, func(t *testing.T) {
			data, _ := json.Marshal(valid)
			var c Config
			if err := json.Unmarshal(data, &c); err != nil {
				t.Fatal(err)
			}
			change(&c)
			if err := Validate(c); err == nil {
				t.Fatal("invalid config accepted")
			}
		})
	}
	valid.Workspaces[0].Projects = nil
	valid.Workspaces[0].StartCommandIDs = nil
	if err := Validate(valid); err != nil {
		t.Fatalf("empty workspace must be valid: %v", err)
	}
}

func TestComposeAndResources(t *testing.T) {
	c := fixture(t)
	cmd := &c.Workspaces[0].Projects[0].Commands[0]
	cmd.Driver, cmd.Run, cmd.HealthCheck = "docker-compose", "", nil
	cmd.Compose = &Compose{ProjectName: "dwrk-test", Files: []string{"compose.yaml"}, Services: []string{"db"}}
	c.Workspaces[0].Resources = []Resource{{ID: "docs", Name: "Docs", Kind: "directory", Target: t.TempDir()}, {ID: "url", Name: "Local", Kind: "url", Target: "http://localhost:8080"}}
	if err := Validate(c); err != nil {
		t.Fatalf("valid compose and resources: %v", err)
	}
	cmd.Compose.Files[0] = "../outside.yaml"
	if err := Validate(c); err == nil {
		t.Fatal("compose path escape accepted")
	}
	cmd.Compose.Files[0] = "compose.yaml"
	cmd.Run = "docker compose up"
	if err := Validate(c); err == nil {
		t.Fatal("conflicting compose/process config accepted")
	}
	cmd.Run = ""
	c.Workspaces[0].Resources[1].Target = "file:///secret"
	if err := Validate(c); err == nil {
		t.Fatal("unsafe resource URL accepted")
	}
	c.Workspaces[0].Resources[1].Target = "http://localhost:8080"
	cmd.Environment = map[string]string{"INVALID=KEY": "value"}
	if err := Validate(c); err == nil {
		t.Fatal("invalid environment key accepted")
	}
}
