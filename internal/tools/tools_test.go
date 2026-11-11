package tools

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestGitReadOnlyStatus(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git is not installed")
	}
	dir := t.TempDir()
	if output, err := exec.Command("git", "init", "-q", dir).CombinedOutput(); err != nil {
		t.Fatalf("git init: %s %v", output, err)
	}
	if err := os.WriteFile(filepath.Join(dir, "file with spaces.txt"), []byte("hello"), 0600); err != nil {
		t.Fatal(err)
	}
	status, err := Git(dir)
	if err != nil {
		t.Fatal(err)
	}
	if status.Branch == "" || status.ChangeCount != 1 || len(status.Changes) != 1 || status.Upstream != "" {
		t.Fatalf("status: %+v", status)
	}
	if _, err := os.Stat(filepath.Join(dir, ".git", "index")); err == nil {
		t.Fatal("git status unexpectedly wrote an index")
	}
}

func TestGitChangePathsWithSpaces(t *testing.T) {
	if actual := gitChange("1 .M N... 100644 100644 100644 aaa bbb file with spaces.txt"); actual != ".M file with spaces.txt" {
		t.Fatal(actual)
	}
	if actual := gitChange("2 R. N... 100644 100644 100644 aaa bbb R100 renamed file.txt"); actual != "R. renamed file.txt" {
		t.Fatal(actual)
	}
}
