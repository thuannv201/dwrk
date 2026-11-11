package config

import (
	"bytes"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// Parse validates exported config without touching the user's current configuration.
func Parse(data []byte) (Config, error) {
	if len(data) > maxConfigBytes {
		return Config{}, errors.New("config exceeds 5 MiB")
	}
	var header struct {
		Format string `json:"format"`
	}
	if err := json.Unmarshal(data, &header); err == nil && header.Format == "dwrk-mock" {
		return parseMockExport(data)
	}
	var c Config
	d := json.NewDecoder(bytes.NewReader(data))
	d.DisallowUnknownFields()
	if err := d.Decode(&c); err != nil {
		return Config{}, err
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return Config{}, errors.New("config must contain one JSON object")
	}
	if err := Validate(c); err != nil {
		return Config{}, err
	}
	return c, nil
}

// Read files exported by the original frontend preview, then use the backend schema.
func parseMockExport(data []byte) (Config, error) {
	type command struct {
		ID          string       `json:"id"`
		Name        string       `json:"name"`
		Kind        string       `json:"kind"`
		Run         string       `json:"run"`
		Stop        string       `json:"stop"`
		Port        *int         `json:"port"`
		HealthCheck *HealthCheck `json:"healthCheck"`
	}
	type project struct {
		ID               string    `json:"id"`
		Name             string    `json:"name"`
		Directory        string    `json:"directory"`
		Technology       string    `json:"technology"`
		TechnologyLabel  string    `json:"technologyLabel"`
		Branch           string    `json:"branch"`
		PrimaryCommandID string    `json:"primaryCommandId"`
		Commands         []command `json:"commands"`
	}
	var legacy struct {
		Format        string `json:"format"`
		SchemaVersion int    `json:"schemaVersion"`
		Workspaces    []struct {
			ID       string    `json:"id"`
			Name     string    `json:"name"`
			RootPath string    `json:"rootPath"`
			Projects []project `json:"projects"`
		} `json:"workspaces"`
	}
	d := json.NewDecoder(bytes.NewReader(data))
	d.DisallowUnknownFields()
	if err := d.Decode(&legacy); err != nil {
		return Config{}, err
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return Config{}, errors.New("config must contain one JSON object")
	}
	if legacy.SchemaVersion != 1 {
		return Config{}, errors.New("unsupported mock schema version")
	}
	c := Default()
	for _, w := range legacy.Workspaces {
		next := Workspace{ID: w.ID, Name: w.Name, RootPath: w.RootPath, Projects: []Project{}, Resources: []Resource{}, StartCommandIDs: []string{}}
		for _, p := range w.Projects {
			np := Project{ID: p.ID, Name: p.Name, Directory: p.Directory, Technologies: []string{p.Technology}, PrimaryCommandID: p.PrimaryCommandID, Commands: []Command{}}
			for _, cmd := range p.Commands {
				nc := Command{ID: cmd.ID, Name: cmd.Name, Kind: cmd.Kind, Run: cmd.Run, Stop: cmd.Stop, HealthCheck: cmd.HealthCheck, WorkingDirectory: ".", Environment: map[string]string{}}
				if cmd.Kind == "service" {
					nc.Driver = "process"
					if cmd.ID == p.PrimaryCommandID {
						next.StartCommandIDs = append(next.StartCommandIDs, cmd.ID)
					}
				}
				if cmd.Port != nil {
					nc.Ports = []int{*cmd.Port}
				}
				np.Commands = append(np.Commands, nc)
			}
			next.Projects = append(next.Projects, np)
		}
		c.Workspaces = append(c.Workspaces, next)
	}
	if err := Validate(c); err != nil {
		return Config{}, err
	}
	return c, nil
}

func CopyWorkspaces(workspaces []Workspace) []Workspace {
	data, _ := json.Marshal(workspaces)
	var copies []Workspace
	_ = json.Unmarshal(data, &copies)
	for i := range copies {
		w := &copies[i]
		w.ID, w.Name = rand.Text(), w.Name+" (import)"
		commands := map[string]string{}
		for j := range w.Projects {
			p := &w.Projects[j]
			p.ID = rand.Text()
			for k := range p.Commands {
				cmd := &p.Commands[k]
				old := cmd.ID
				cmd.ID = rand.Text()
				commands[old] = cmd.ID
			}
			p.PrimaryCommandID = commands[p.PrimaryCommandID]
		}
		for j, id := range w.StartCommandIDs {
			w.StartCommandIDs[j] = commands[id]
		}
		for j := range w.Resources {
			w.Resources[j].ID = rand.Text()
		}
	}
	return copies
}

func WriteExport(path string, data []byte) error {
	if _, err := Parse(data); err != nil {
		return err
	}
	return writeFile(path, data)
}

func (s *Store) Export(path string, data []byte) error {
	for _, reserved := range []string{s.path, s.path + ".bak", s.path + ".lock"} {
		a, b := filepath.Clean(path), filepath.Clean(reserved)
		if a == b || (runtime.GOOS == "windows" && strings.EqualFold(a, b)) {
			return errors.New("export destination cannot replace the application's config files")
		}
	}
	return WriteExport(path, data)
}

func (s *Store) RestoreBackup() (Config, error) {
	lock, err := s.lock()
	if err != nil {
		return Config{}, err
	}
	defer lock.Close()
	if _, _, err := s.read(); err == nil {
		if _, err := os.Stat(s.path); err == nil {
			return Config{}, errors.New("current config is valid; backup recovery is not required")
		}
	}
	backup, err := os.Open(s.path + ".bak")
	if err != nil {
		return Config{}, err
	}
	data, err := io.ReadAll(io.LimitReader(backup, maxConfigBytes+1))
	_ = backup.Close()
	if err != nil {
		return Config{}, err
	}
	c, err := Parse(data)
	if err != nil {
		return Config{}, fmt.Errorf("invalid backup: %w", err)
	}
	if c.Revision == ^uint64(0) {
		return Config{}, errors.New("config revision exhausted")
	}
	c.Revision++
	if original, err := os.Open(s.path); err == nil {
		data, readErr := io.ReadAll(io.LimitReader(original, maxConfigBytes+1))
		_ = original.Close()
		if readErr != nil {
			return Config{}, readErr
		}
		if len(data) > maxConfigBytes {
			return Config{}, errors.New("preserve oversized config manually before recovery")
		}
		if err := writeFile(s.path+".rejected-"+time.Now().Format("20060102-150405.000000000"), data); err != nil {
			return Config{}, err
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return Config{}, err
	}
	normalizeSelection(&c)
	data, err = json.MarshalIndent(c, "", "  ")
	if err != nil {
		return Config{}, err
	}
	if err := writeFile(s.path, data); err != nil {
		return Config{}, err
	}
	return c, nil
}
