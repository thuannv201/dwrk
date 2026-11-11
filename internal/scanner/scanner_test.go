package scanner

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestScan(t *testing.T) {
	root := t.TempDir()
	for _, name := range []string{".git", "package.json", "services/api/go.mod", "services/api/pom.xml", "node_modules/ignored/package.json", "build/ignored/go.mod"} {
		path := filepath.Join(root, name)
		if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte("not executed"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	r, err := Scan(context.Background(), root)
	if err != nil || len(r.Projects) != 2 {
		t.Fatalf("scan: %+v %v", r, err)
	}
	for _, p := range r.Projects {
		if len(p.Commands) != 0 {
			t.Fatal("scan must not authorize executable commands")
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := Scan(ctx, root); err == nil {
		t.Fatal("cancel ignored")
	}
	if _, err := Scan(context.Background(), "relative"); err == nil {
		t.Fatal("relative scan accepted")
	}
}
