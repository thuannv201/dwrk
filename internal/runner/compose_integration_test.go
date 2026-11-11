package runner

import (
	"crypto/rand"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"changeme/internal/config"
)

func TestComposeIntegration(t *testing.T) {
	if os.Getenv("DWRK_TEST_DOCKER") != "1" {
		t.Skip("set DWRK_TEST_DOCKER=1 to test with an existing rhysd/actionlint:latest image")
	}
	dir := t.TempDir()
	file := filepath.Join(dir, "compose.yaml")
	project := "dwrk-test-" + strings.ToLower(rand.Text())
	yaml := "services:\n  fixture:\n    image: rhysd/actionlint:latest\n    pull_policy: never\n    network_mode: none\n    entrypoint: [\"/bin/sh\", \"-c\"]\n    command: [\"echo fixture-ready; sleep 120\"]\n    healthcheck:\n      test: [\"CMD\", \"/bin/sh\", \"-c\", \"exit 0\"]\n      interval: 1s\n      timeout: 1s\n      retries: 3\n"
	if err := os.WriteFile(file, []byte(yaml), 0600); err != nil {
		t.Fatal(err)
	}
	m := New()
	t.Cleanup(func() {
		m.Close()
		output, err := exec.Command("docker", "compose", "--project-name", project, "--file", file, "rm", "--force", "--stop").CombinedOutput()
		if err != nil {
			t.Errorf("fixture cleanup: %s %v", output, err)
		}
	})
	c := config.Command{ID: "compose", Name: "Compose fixture", Kind: "service", Driver: "docker-compose", Compose: &config.Compose{ProjectName: project, Files: []string{"compose.yaml"}, Services: []string{"fixture"}}}
	if err := m.Start(config.Workspace{ID: "w"}, config.Project{ID: "p", Directory: dir}, c, config.Default().Settings); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if t.Failed() {
			t.Logf("compose state: %+v", m.Snapshot(c.ID).Runs[c.ID])
		}
	})
	waitFor(t, func() bool { r := m.Snapshot(c.ID).Runs[c.ID]; return r.Status == "running" && r.Health == "ready" })
	waitFor(t, func() bool {
		for _, line := range m.Snapshot(c.ID).Runs[c.ID].Logs {
			if strings.Contains(line.Message, "fixture-ready") {
				return true
			}
		}
		return false
	})
	if err := m.Stop(c.ID, false); err != nil {
		t.Fatal(err)
	}
	if m.Snapshot(c.ID).Runs[c.ID].Status != "stopped" {
		t.Fatal("compose did not stop")
	}
}
