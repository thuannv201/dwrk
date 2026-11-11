package config

import (
	"fmt"
	"net/url"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"time"
	_ "time/tzdata"
)

var composeName = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]*$`)

func httpURL(value string) bool {
	u, err := url.Parse(value)
	return err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Hostname() != "" && u.User == nil
}

func relativePath(value string) bool {
	return value != "" && filepath.IsLocal(value)
}

func Validate(c Config) error {
	if c.SchemaVersion != SchemaVersion {
		return fmt.Errorf("unsupported config schema version %d", c.SchemaVersion)
	}
	if err := validateSettings(c.Settings); err != nil {
		return err
	}
	ids := make(map[string]bool)
	checkID := func(id string) error {
		if strings.TrimSpace(id) == "" || ids[id] {
			return fmt.Errorf("config IDs must be nonempty and globally unique")
		}
		ids[id] = true
		return nil
	}
	for _, w := range c.Workspaces {
		if err := checkID(w.ID); err != nil {
			return err
		}
		if strings.TrimSpace(w.Name) == "" || !filepath.IsAbs(w.RootPath) {
			return fmt.Errorf("workspace needs a name and absolute root path")
		}
		services := make(map[string]bool)
		directories := make(map[string]bool)
		for _, p := range w.Projects {
			if err := checkID(p.ID); err != nil {
				return err
			}
			if strings.TrimSpace(p.Name) == "" || !filepath.IsAbs(p.Directory) {
				return fmt.Errorf("project needs a name and absolute directory")
			}
			key := filepath.Clean(p.Directory)
			if runtime.GOOS == "windows" {
				key = strings.ToLower(key)
			}
			if directories[key] {
				return fmt.Errorf("project directories must be unique within a workspace")
			}
			directories[key] = true
			primaryFound := p.PrimaryCommandID == ""
			names := make(map[string]bool)
			for _, cmd := range p.Commands {
				if err := checkID(cmd.ID); err != nil {
					return err
				}
				name := strings.ToLower(strings.TrimSpace(cmd.Name))
				if name == "" || names[name] {
					return fmt.Errorf("command names must be nonempty and unique within a project")
				}
				names[name] = true
				if err := validateCommand(cmd); err != nil {
					return fmt.Errorf("command %s: %w", cmd.ID, err)
				}
				primaryFound = primaryFound || cmd.ID == p.PrimaryCommandID
				if cmd.Kind == "service" {
					services[cmd.ID] = true
				}
			}
			if !primaryFound {
				return fmt.Errorf("primary command must belong to its project")
			}
		}
		seen := make(map[string]bool)
		for _, id := range w.StartCommandIDs {
			if !services[id] || seen[id] {
				return fmt.Errorf("start commands must reference distinct services in the workspace")
			}
			seen[id] = true
		}
		for _, r := range w.Resources {
			if err := checkID(r.ID); err != nil {
				return err
			}
			if strings.TrimSpace(r.Name) == "" {
				return fmt.Errorf("resource needs a name")
			}
			switch r.Kind {
			case "url":
				if !httpURL(r.Target) {
					return fmt.Errorf("resource URL must use HTTP/HTTPS without credentials")
				}
			case "file", "directory":
				if !filepath.IsAbs(r.Target) {
					return fmt.Errorf("resource path must be absolute")
				}
			default:
				return fmt.Errorf("unsupported resource kind")
			}
		}
	}
	return nil
}

func validateSettings(s Settings) error {
	for _, tool := range []Tool{s.Editor, s.Terminal, s.Shell} {
		if strings.ContainsRune(tool.Executable, '\x00') {
			return fmt.Errorf("invalid tool executable")
		}
		for _, arg := range tool.Args {
			if strings.ContainsRune(arg, '\x00') {
				return fmt.Errorf("invalid tool argument")
			}
		}
	}
	if s.Theme != "dark" && s.Theme != "light" && s.Theme != "system" {
		return fmt.Errorf("unsupported theme")
	}
	if strings.TrimSpace(s.Locale) == "" {
		return fmt.Errorf("locale is required")
	}
	if strings.TrimSpace(s.TimeZone) == "" || s.TimeZone == "Local" {
		return fmt.Errorf("time zone is required")
	}
	if _, err := time.LoadLocation(s.TimeZone); err != nil {
		return fmt.Errorf("invalid time zone")
	}
	l := s.Logs
	if l.MaxLinesPerRun < 1 || l.MaxLinesPerRun > 2000 || l.MaxBytesPerRun < 1 || l.MaxBytesPerRun > 2<<20 || l.MaxBytesTotal < l.MaxBytesPerRun || l.MaxBytesTotal > 32<<20 || l.MaxCompletedRuns < 0 || l.MaxCompletedRuns > 20 {
		return fmt.Errorf("log limits exceed backend bounds")
	}
	return nil
}

func validateCommand(c Command) error {
	if c.Kind != "service" && c.Kind != "task" {
		return fmt.Errorf("unsupported kind")
	}
	if c.WorkingDirectory != "" && !relativePath(c.WorkingDirectory) {
		return fmt.Errorf("working directory must stay within the project")
	}
	keys := map[string]bool{}
	for key, value := range c.Environment {
		if key == "" || strings.ContainsAny(key, "=\x00") || strings.ContainsRune(value, '\x00') {
			return fmt.Errorf("invalid environment variable")
		}
		if runtime.GOOS == "windows" {
			key = strings.ToLower(key)
		}
		if keys[key] {
			return fmt.Errorf("duplicate environment variable")
		}
		keys[key] = true
	}
	if c.Kind == "task" {
		if c.Driver != "" || c.Compose != nil || c.HealthCheck != nil || len(c.Ports) != 0 || c.Stop != "" || c.URL != "" {
			return fmt.Errorf("task cannot have service settings")
		}
	} else if c.Driver != "process" && c.Driver != "docker-compose" {
		return fmt.Errorf("unsupported service driver")
	}
	if c.Driver == "docker-compose" {
		if c.Compose == nil || !composeName.MatchString(c.Compose.ProjectName) || len(c.Compose.Files) == 0 {
			return fmt.Errorf("compose needs a project name and files")
		}
		if c.Run != "" || c.Stop != "" || c.HealthCheck != nil {
			return fmt.Errorf("compose cannot also use process commands or health checks")
		}
		for _, file := range c.Compose.Files {
			if !relativePath(file) {
				return fmt.Errorf("compose files must stay within the working directory")
			}
		}
		for _, service := range c.Compose.Services {
			if strings.TrimSpace(service) == "" || strings.HasPrefix(service, "-") || strings.ContainsRune(service, '\x00') {
				return fmt.Errorf("invalid compose service")
			}
		}
	} else if strings.TrimSpace(c.Run) == "" || c.Compose != nil {
		return fmt.Errorf("process command needs run text and cannot contain compose settings")
	}
	ports := map[int]bool{}
	for _, port := range c.Ports {
		if port < 1 || port > 65535 {
			return fmt.Errorf("port must be between 1 and 65535")
		}
		if ports[port] {
			return fmt.Errorf("ports cannot repeat within a command")
		}
		ports[port] = true
	}
	if c.URL != "" && !httpURL(c.URL) {
		return fmt.Errorf("URL must use HTTP/HTTPS without credentials")
	}
	if h := c.HealthCheck; h != nil {
		if !httpURL(h.URL) || h.IntervalMS < 1000 || h.IntervalMS > 86400000 || h.TimeoutMS < 100 || h.TimeoutMS > 60000 || h.ExpectedStatus < 200 || h.ExpectedStatus > 299 {
			return fmt.Errorf("invalid HTTP health check")
		}
	}
	return nil
}
