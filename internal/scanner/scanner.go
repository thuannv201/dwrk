package scanner

import (
	"context"
	"crypto/rand"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"changeme/internal/config"
)

type Result struct {
	Projects []config.Project `json:"projects"`
	Warnings []string         `json:"warnings"`
}

var ignored = map[string]bool{".git": true, "node_modules": true, "target": true, "dist": true, "build": true, ".idea": true, ".gradle": true, "vendor": true}
var markers = map[string]string{".git": "git", "package.json": "typescript", "pom.xml": "spring", "build.gradle": "java", "build.gradle.kts": "java", "go.mod": "go", "compose.yaml": "docker", "compose.yml": "docker", "docker-compose.yml": "docker", "docker-compose.yaml": "docker"}

// Scan detects directories only; importing a result never creates executable commands.
func Scan(ctx context.Context, root string) (Result, error) {
	result := Result{Projects: []config.Project{}, Warnings: []string{}}
	if !filepath.IsAbs(root) {
		return result, fmt.Errorf("scan path must be absolute")
	}
	info, err := os.Lstat(root)
	if err != nil {
		return result, err
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return result, fmt.Errorf("select a real directory, not a symlink or junction")
	}
	found := map[string]map[string]bool{}
	visited := 0
	err = filepath.WalkDir(root, func(path string, entry fs.DirEntry, walkErr error) error {
		if err := ctx.Err(); err != nil {
			return err
		}
		visited++
		if visited > 100000 {
			return fmt.Errorf("scan exceeded 100000 entries; select a smaller directory")
		}
		if walkErr != nil {
			if path == root {
				return walkErr
			}
			if len(result.Warnings) < 100 {
				result.Warnings = append(result.Warnings, path+": "+walkErr.Error())
			}
			return nil
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return nil
		}
		if technology, ok := markers[strings.ToLower(entry.Name())]; ok {
			dir := filepath.Dir(path)
			if found[dir] == nil {
				found[dir] = map[string]bool{}
			}
			found[dir][technology] = true
		}
		if entry.IsDir() && path != root && ignored[strings.ToLower(entry.Name())] {
			return filepath.SkipDir
		}
		return nil
	})
	if err != nil {
		return result, err
	}
	for dir, technologies := range found {
		names := []string{}
		for technology := range technologies {
			names = append(names, technology)
		}
		sort.Strings(names)
		result.Projects = append(result.Projects, config.Project{ID: rand.Text(), Name: filepath.Base(dir), Directory: dir, Technologies: names, Commands: []config.Command{}})
	}
	sort.Slice(result.Projects, func(i, j int) bool { return result.Projects[i].Directory < result.Projects[j].Directory })
	return result, nil
}
