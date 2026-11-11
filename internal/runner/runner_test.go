package runner

import (
	"bytes"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"changeme/internal/config"
)

func TestRunnerHelper(t *testing.T) {
	if os.Getenv("DWRK_RUN_HELPER") != "1" {
		return
	}
	switch os.Args[len(os.Args)-1] {
	case "success":
		fmt.Println("hello")
		fmt.Fprint(os.Stderr, "tail without newline")
		os.Exit(0)
	case "fail":
		os.Exit(7)
	case "hold":
		child := exec.Command(os.Args[0], "-test.run=TestRunnerHelper", "--", "child")
		child.Stdout = os.Stdout
		child.Stderr = os.Stderr
		if err := child.Start(); err != nil {
			os.Exit(9)
		}
		for {
			time.Sleep(time.Second)
		}
	case "child":
		for {
			if err := os.WriteFile(os.Getenv("DWRK_HEARTBEAT"), []byte(time.Now().String()), 0600); err != nil {
				os.Exit(8)
			}
			time.Sleep(30 * time.Millisecond)
		}
	}
}

func waitFor(t *testing.T, condition func() bool) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		if condition() {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("timed out")
}
func setup(t *testing.T, kind, run string) (*Manager, config.Workspace, config.Project, config.Command, config.Settings) {
	t.Helper()
	m := New()
	s := config.Default().Settings
	s.Shell = config.Tool{Executable: os.Args[0], Args: []string{"-test.run=TestRunnerHelper", "--"}}
	c := config.Command{ID: "test", Name: "Test", Kind: kind, Run: run, Environment: map[string]string{"DWRK_RUN_HELPER": "1", "DWRK_HEARTBEAT": filepath.Join(t.TempDir(), "heartbeat")}}
	p := config.Project{ID: "p", Directory: t.TempDir()}
	w := config.Workspace{ID: "w"}
	t.Cleanup(m.Close)
	return m, w, p, c, s
}

func TestTasksAndLogs(t *testing.T) {
	for _, mode := range []string{"success", "fail"} {
		t.Run(mode, func(t *testing.T) {
			m, w, p, c, s := setup(t, "task", mode)
			if err := m.Start(w, p, c, s); err != nil {
				t.Fatal(err)
			}
			waitFor(t, func() bool { return !m.HasActive(c.ID) })
			r := m.Snapshot(c.ID).Runs[c.ID]
			if mode == "success" {
				messages := map[string]bool{}
				for _, line := range r.Logs {
					messages[line.Message] = true
				}
				if r.Status != "succeeded" || *r.ExitCode != 0 || len(r.Logs) != 2 || !messages["tail without newline"] || !messages["hello"] {
					t.Fatalf("result: %+v", r)
				}
			} else if r.Status != "failed" || *r.ExitCode != 7 {
				t.Fatalf("result: %+v", r)
			}
		})
	}
}

func TestCancelAndFailedCustomStop(t *testing.T) {
	for _, kind := range []string{"task", "service"} {
		t.Run(kind, func(t *testing.T) {
			m, w, p, c, s := setup(t, kind, "hold")
			if kind == "service" {
				c.Stop = "fail"
			}
			if err := m.Start(w, p, c, s); err != nil {
				t.Fatal(err)
			}
			if kind == "service" {
				if err := m.Stop(c.ID, false); err == nil {
					t.Fatal("failed stop reported success")
				}
				if m.Snapshot(c.ID).Runs[c.ID].Status != "unknown" || !m.HasActive(c.ID) {
					t.Fatal("failed stop lost the active process")
				}
			}
			if err := m.Stop(c.ID, true); err != nil {
				t.Fatal(err)
			}
			if kind == "task" && m.Snapshot(c.ID).Runs[c.ID].Status != "cancelled" {
				t.Fatal("cancelled task reported wrong state")
			}
		})
	}
}

func TestDefaultShellExitCode(t *testing.T) {
	text := "printf 'hello'; exit 7"
	expected := "hello"
	if runtime.GOOS == "windows" {
		text = "Write-Output 'Xin chào'; exit 7"
		expected = "Xin chào"
	}
	cmd := shellCommand(config.Tool{}, text)
	var output bytes.Buffer
	cmd.Stdout = &output
	group, err := startProcess(cmd)
	if err != nil {
		t.Fatal(err)
	}
	defer group.close()
	if err := cmd.Wait(); err == nil || cmd.ProcessState.ExitCode() != 7 || !strings.Contains(output.String(), expected) {
		t.Fatalf("shell result: %v %q", err, output.String())
	}
}

func TestStopOwnTreePreservesOtherCommand(t *testing.T) {
	m, w, p, c, s := setup(t, "service", "hold")
	if err := m.Start(w, p, c, s); err != nil {
		t.Fatal(err)
	}
	if err := m.Start(w, p, c, s); err == nil {
		t.Fatal("duplicate process started")
	}
	other := c
	other.ID = "other"
	other.Environment = map[string]string{"DWRK_RUN_HELPER": "1", "DWRK_HEARTBEAT": filepath.Join(t.TempDir(), "other")}
	if err := m.Start(w, p, other, s); err != nil {
		t.Fatal(err)
	}
	waitFor(t, func() bool {
		_, a := os.Stat(c.Environment["DWRK_HEARTBEAT"])
		_, b := os.Stat(other.Environment["DWRK_HEARTBEAT"])
		return a == nil && b == nil
	})
	if err := m.Stop(c.ID, true); err != nil {
		t.Fatal(err)
	}
	before, _ := os.ReadFile(c.Environment["DWRK_HEARTBEAT"])
	time.Sleep(150 * time.Millisecond)
	after, _ := os.ReadFile(c.Environment["DWRK_HEARTBEAT"])
	if string(before) != string(after) {
		t.Fatal("child process survived tree stop")
	}
	if !m.HasActive(other.ID) {
		t.Fatal("unrelated command stopped")
	}
	if err := m.Stop(other.ID, true); err != nil {
		t.Fatal(err)
	}
}

func TestPortAndPathChecks(t *testing.T) {
	m, w, p, c, s := setup(t, "service", "hold")
	listener, err := net.Listen("tcp", ":0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	c.Ports = []int{listener.Addr().(*net.TCPAddr).Port}
	if err := m.Start(w, p, c, s); err == nil {
		t.Fatal("occupied port accepted")
	}
	if _, err := ResolveDirectory(p.Directory, "../outside"); err == nil {
		t.Fatal("path escape accepted")
	}
	link := filepath.Join(p.Directory, "outside")
	if err := os.Symlink(t.TempDir(), link); err == nil {
		if _, err := ResolveDirectory(p.Directory, "outside"); err == nil {
			t.Fatal("symlink escape accepted")
		}
	}
}

func TestLogLimits(t *testing.T) {
	m := New()
	m.limits.MaxLinesPerRun = 3
	m.limits.MaxBytesPerRun = 100
	e := &execution{run: Run{CommandID: "one", Status: "running"}}
	m.runs["one"] = e
	w := &logWriter{manager: m, execution: e, stream: "stdout"}
	_, _ = w.Write([]byte(strings.Repeat("long", 10000)))
	w.flush()
	if len(e.run.Logs) > 3 || e.bytes > 100 || e.run.Dropped == 0 {
		t.Fatalf("unbounded logs: %d %d", len(e.run.Logs), e.bytes)
	}
}

func TestHealthCheck(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) }))
	defer server.Close()
	m, w, p, c, s := setup(t, "service", "hold")
	c.HealthCheck = &config.HealthCheck{URL: server.URL, IntervalMS: 1000, TimeoutMS: 500, ExpectedStatus: 204}
	if err := m.Start(w, p, c, s); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if t.Failed() {
			t.Logf("health run: %+v", m.Snapshot(c.ID).Runs[c.ID])
		}
	})
	waitFor(t, func() bool { return m.Snapshot(c.ID).Runs[c.ID].Health == "ready" })
	if err := m.Stop(c.ID, true); err != nil {
		t.Fatal(err)
	}
}

func TestComposeState(t *testing.T) {
	cases := []struct{ data, status, health string }{
		{`[{"State":"running","Health":"healthy","Service":"api"}]`, "running", "ready"},
		{`[{"State":"running","Health":"healthy","Service":"api"},{"State":"running","Health":"","Service":"db"}]`, "running", "unhealthy"},
		{`[{"State":"exited","ExitCode":1,"Service":"api"}]`, "failed", "unhealthy"},
		{`[{"State":"paused","Service":"api"}]`, "unknown", "unhealthy"},
		{`[]`, "stopped", "unconfigured"},
	}
	for _, tc := range cases {
		status, health, err := composeState([]byte(tc.data), []string{"api"})
		if err != nil || status != tc.status || health != tc.health {
			t.Fatalf("%s: %s %s %v", tc.data, status, health, err)
		}
	}
	if _, _, err := composeState([]byte(`not json`), nil); err == nil {
		t.Fatal("invalid status accepted")
	}
}
