package runner

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"changeme/internal/config"
)

func composeArgs(e *execution) ([]string, error) {
	c := e.command.Compose
	args := []string{"compose", "--project-name", c.ProjectName, "--project-directory", e.directory}
	for _, file := range c.Files {
		real, err := filepath.EvalSymlinks(filepath.Join(e.directory, file))
		if err != nil {
			return nil, err
		}
		rel, err := filepath.Rel(e.directory, real)
		if err != nil || !filepath.IsLocal(rel) {
			return nil, errors.New("compose file escapes working directory")
		}
		args = append(args, "--file", real)
	}
	return args, nil
}

func (m *Manager) startCompose(ctx context.Context, e *execution) {
	args, err := composeArgs(e)
	if err == nil {
		err = m.runHelper(e, exec.Command("docker", append(append([]string{}, args...), append([]string{"up", "-d", "--"}, e.command.Compose.Services...)...)...), 60*time.Second)
	}
	m.mu.Lock()
	e.busy = false
	if err != nil {
		e.run.Status = "unknown"
		e.run.Error = err.Error()
		m.record(e, "compose start failed")
		m.mu.Unlock()
		return
	}
	m.record(e, "compose started; verifying containers")
	m.mu.Unlock()
	m.monitorCompose(ctx, e, args)
}

func (m *Manager) monitorCompose(ctx context.Context, e *execution, args []string) {
	done := make(chan struct{})
	go func() { defer close(done); m.composeLogs(ctx, e, args) }()
	m.watchCompose(ctx, e, args)
	<-done
}

func (m *Manager) watchCompose(ctx context.Context, e *execution, args []string) {
	for {
		status, health, err := composeStatus(e, args)
		m.mu.Lock()
		if !e.busy && ctx.Err() == nil {
			if err != nil {
				e.run.Status = "unknown"
				e.run.Error = err.Error()
			} else {
				e.run.Status = status
				e.run.Health = health
				e.run.Error = ""
				if status == "failed" {
					e.run.Error = "one or more Compose containers exited with a nonzero status"
				}
				if !active(status) && e.run.EndedAt == 0 {
					e.run.EndedAt = time.Now().UnixMilli()
				}
				if !active(status) && e.run.WorkspaceID != m.focus {
					e.cancel()
				}
			}
		}
		m.mu.Unlock()
		timer := time.NewTimer(3 * time.Second)
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
		}
	}
}

// Observe inspects an external environment without running compose up or stop.
func (m *Manager) Observe(w config.Workspace, p config.Project, c config.Command, settings config.Settings) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.closed {
		return errors.New("runtime is shutting down")
	}
	if c.Driver != "docker-compose" {
		return nil
	}
	if previous := m.runs[c.ID]; previous != nil {
		if active(previous.run.Status) {
			return nil
		}
		previous.cancel()
	}
	dir, err := ResolveDirectory(p.Directory, c.WorkingDirectory)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithCancel(context.Background())
	e := &execution{run: Run{ID: rand.Text(), WorkspaceID: w.ID, ProjectID: p.ID, CommandID: c.ID, Status: "starting", Health: "unconfigured", Logs: []Log{}}, command: c, shell: settings.Shell, directory: dir, done: make(chan struct{}), cancel: cancel}
	e.ctx = ctx
	args, err := composeArgs(e)
	if err != nil {
		cancel()
		return err
	}
	m.limits = settings.Logs
	m.runs[c.ID] = e
	m.workers.Add(1)
	go func() { defer m.workers.Done(); m.monitorCompose(ctx, e, args) }()
	return nil
}

type containerStatus struct {
	State    string
	Health   string
	Service  string
	ExitCode int
}

func composeStatus(e *execution, args []string) (string, string, error) {
	cmd := exec.Command("docker", append(append([]string{}, args...), append([]string{"ps", "--all", "--format", "json", "--"}, e.command.Compose.Services...)...)...)
	cmd.Dir = e.directory
	cmd.Env = environment(e.command.Environment)
	data, err := Capture(cmd, 10*time.Second)
	if err != nil {
		return "unknown", "unconfigured", err
	}
	return composeState(data, e.command.Compose.Services)
}

func composeState(data []byte, services []string) (string, string, error) {
	var err error
	containers := []containerStatus{}
	if len(bytes.TrimSpace(data)) > 0 && bytes.TrimSpace(data)[0] == '[' {
		err = json.Unmarshal(data, &containers)
	} else {
		decoder := json.NewDecoder(bytes.NewReader(data))
		for decoder.More() {
			var c containerStatus
			if err = decoder.Decode(&c); err != nil {
				break
			}
			containers = append(containers, c)
		}
	}
	if err != nil {
		return "unknown", "unconfigured", fmt.Errorf("decode compose status: %w", err)
	}
	if len(containers) == 0 {
		return "stopped", "unconfigured", nil
	}
	running := 0
	ready := true
	hasHealth := false
	seen := map[string]bool{}
	for _, c := range containers {
		seen[c.Service] = true
		if c.State == "running" {
			running++
		}
		if c.Health == "" {
			ready = false
		}
		if c.Health != "" {
			hasHealth = true
			if c.Health != "healthy" {
				ready = false
			}
		}
	}
	if running == 0 {
		for _, c := range containers {
			if c.State == "paused" || c.State == "restarting" {
				return "unknown", "unhealthy", nil
			}
		}
		for _, c := range containers {
			if c.ExitCode != 0 {
				return "failed", "unhealthy", nil
			}
		}
		return "stopped", "unconfigured", nil
	}
	for _, service := range services {
		if !seen[service] {
			return "unknown", "unhealthy", nil
		}
	}
	if running != len(containers) {
		return "unknown", "unhealthy", nil
	}
	health := "unconfigured"
	if hasHealth {
		health = "unhealthy"
		if ready {
			health = "ready"
		}
	}
	return "running", health, nil
}

func (m *Manager) stopCompose(e *execution) error {
	args, err := composeArgs(e)
	if err != nil {
		return err
	}
	cmd := exec.Command("docker", append(args, append([]string{"stop", "--"}, e.command.Compose.Services...)...)...)
	if err = m.runHelper(e, cmd, 45*time.Second); err != nil {
		return err
	}
	args, err = composeArgs(e)
	if err != nil {
		return err
	}
	status, _, err := composeStatus(e, args)
	if err != nil {
		return err
	}
	if status != "stopped" && status != "failed" {
		return errors.New("compose containers are not confirmed stopped")
	}
	m.mu.Lock()
	e.run.Status = "stopped"
	e.run.EndedAt = time.Now().UnixMilli()
	e.run.Health = "unconfigured"
	e.run.Error = ""
	e.cancel()
	m.record(e, "compose stopped")
	select {
	case <-e.done:
	default:
		close(e.done)
	}
	m.trim()
	m.mu.Unlock()
	return nil
}

func (m *Manager) composeLogs(ctx context.Context, e *execution, args []string) {
	cmd := exec.Command("docker", append(append([]string{}, args...), append([]string{"logs", "--follow", "--no-color", "--tail", "200", "--"}, e.command.Compose.Services...)...)...)
	cmd.Dir = e.directory
	cmd.Env = environment(e.command.Environment)
	cmd.WaitDelay = time.Second
	out := &logWriter{manager: m, execution: e, stream: "stdout"}
	stderr := &logWriter{manager: m, execution: e, stream: "stderr"}
	cmd.Stdout = out
	cmd.Stderr = stderr
	group, err := startProcess(cmd)
	if err != nil {
		m.appendLog(e, "stderr", "Docker logs unavailable: "+err.Error())
		return
	}
	done := make(chan struct{})
	go func() { _ = cmd.Wait(); close(done) }()
	select {
	case <-ctx.Done():
		_ = group.kill()
		<-done
	case <-done:
	}
	group.close()
	out.flush()
	stderr.flush()
}

type boundedBuffer struct {
	bytes.Buffer
	exceeded bool
}

func (b *boundedBuffer) Write(data []byte) (int, error) {
	n := len(data)
	if b.Len()+n > 1<<20 {
		b.exceeded = true
		remaining := (1 << 20) - b.Len()
		if remaining > 0 {
			_, _ = b.Buffer.Write(data[:remaining])
		}
		return n, nil
	}
	_, _ = b.Buffer.Write(data)
	return n, nil
}

// Capture is for bounded, read-only tool output such as git status and compose ps.
func Capture(cmd *exec.Cmd, timeout time.Duration) ([]byte, error) {
	var stdout, stderr boundedBuffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	cmd.WaitDelay = time.Second
	group, err := startProcess(cmd)
	if err != nil {
		return nil, err
	}
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	select {
	case err = <-done:
	case <-time.After(timeout):
		_ = group.kill()
		<-done
		err = errors.New("tool timed out")
	}
	group.close()
	if stdout.exceeded || stderr.exceeded {
		return nil, errors.New("tool output exceeded 1 MiB")
	}
	if err != nil {
		detail := strings.TrimSpace(stderr.String())
		if len(detail) > 4096 {
			detail = detail[:4096] + "…"
		}
		return nil, fmt.Errorf("tool failed: %w: %s", err, detail)
	}
	return stdout.Bytes(), nil
}

// Close stops monitoring external Compose environments, without stopping containers.
func (m *Manager) Close() {
	m.mu.Lock()
	m.closed = true
	done := []chan struct{}{}
	for _, e := range m.runs {
		e.cancel()
		if e.group != nil {
			_ = e.group.kill()
			done = append(done, e.done)
		}
	}
	m.mu.Unlock()
	for _, channel := range done {
		select {
		case <-channel:
		case <-time.After(5 * time.Second):
		}
	}
	m.workers.Wait()
}
