package runner

import (
	"fmt"
	"os"
	"path/filepath"
)

// ResolveDirectory checks real paths at execution time, including symlinks/junctions.
func ResolveDirectory(project, relative string) (string, error) {
	if !filepath.IsAbs(project) {
		return "", fmt.Errorf("project directory must be absolute")
	}
	if relative == "" {
		relative = "."
	}
	if !filepath.IsLocal(relative) {
		return "", fmt.Errorf("working directory escapes project")
	}
	root, err := filepath.EvalSymlinks(project)
	if err != nil {
		return "", err
	}
	dir, err := filepath.EvalSymlinks(filepath.Join(root, relative))
	if err != nil {
		return "", err
	}
	rel, err := filepath.Rel(root, dir)
	if err != nil || !filepath.IsLocal(rel) {
		return "", fmt.Errorf("working directory escapes project after resolving links")
	}
	info, err := os.Stat(dir)
	if err != nil {
		return "", err
	}
	if !info.IsDir() {
		return "", fmt.Errorf("working directory is not a directory")
	}
	return dir, nil
}
