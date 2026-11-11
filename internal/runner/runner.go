package runner

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"net"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"time"

	"changeme/internal/config"
)

type Log struct {
	Sequence  int64  `json:"sequence"`
	Timestamp int64  `json:"timestamp"`
	Stream    string `json:"stream"`
	Level     string `json:"level"`
	Message   string `json:"message"`
}

// Count entry overhead too, so streams of empty lines still consume the byte budget.
func logBytes(line Log) int { return len(line.Message) + 64 }

type Run struct {
	ID          string `json:"id"`
	WorkspaceID string `json:"workspaceId"`
	ProjectID   string `json:"projectId"`
	CommandID   string `json:"commandId"`
	Status      string `json:"status"`
	StartedAt   int64  `json:"startedAt"`
	EndedAt     int64  `json:"endedAt,omitempty"`
	ExitCode    *int   `json:"exitCode,omitempty"`
	Health      string `json:"health"`
	HealthError string `json:"healthError,omitempty"`
	Error       string `json:"error,omitempty"`
	Dropped     int64  `json:"dropped"`
	Logs        []Log  `json:"logs"`
}
type History struct {
	WorkspaceID string `json:"workspaceId"`
	Timestamp   int64  `json:"timestamp"`
	Message     string `json:"message"`
}
type Snapshot struct {
	Runs    map[string]Run `json:"runs"`
	History []History      `json:"history"`
}
type execution struct {
	run       Run
	command   config.Command
	shell     config.Tool
	directory string
	group     *processGroup
	done      chan struct{}
	cancel    context.CancelFunc
	ctx       context.Context
	bytes     int
	sequence  int64
	stopping  bool
	busy      bool
}
type Manager struct {
	mu      sync.Mutex
	runs    map[string]*execution
	history []History
	limits  config.LogLimits
	closed  bool
	workers sync.WaitGroup
	focus   string
}

func New() *Manager {
	return &Manager{runs: map[string]*execution{}, history: []History{}, limits: config.Default().Settings.Logs}
}

func active(status string) bool {
	return status == "starting" || status == "running" || status == "stopping" || status == "unknown"
}

func (m *Manager) HasActive(commandID string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	e := m.runs[commandID]
	return e != nil && active(e.run.Status)
}

func (m *Manager) Focus(workspaceID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.focus = workspaceID
	for _, e := range m.runs {
		if e.command.Driver == "docker-compose" && e.run.WorkspaceID != workspaceID && !active(e.run.Status) {
			e.cancel()
		}
	}
}

func (m *Manager) OwnedActive() []Run {
	m.mu.Lock()
	defer m.mu.Unlock()
	result := []Run{}
	for _, e := range m.runs {
		if e.group != nil && active(e.run.Status) {
			r := e.run
			r.Logs = nil
			result = append(result, r)
		}
	}
	return result
}

func (m *Manager) Snapshot(commandID string) Snapshot {
	m.mu.Lock()
	defer m.mu.Unlock()
	s := Snapshot{Runs: map[string]Run{}, History: append([]History{}, m.history...)}
	for id, e := range m.runs {
		r := e.run
		r.Logs = []Log{}
		if id == commandID {
			start := len(e.run.Logs) - 200
			if start < 0 {
				start = 0
			}
			r.Logs = append(r.Logs, e.run.Logs[start:]...)
		}
		s.Runs[id] = r
	}
	return s
}

func (m *Manager) Start(w config.Workspace, p config.Project, c config.Command, settings config.Settings) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.closed {
		return errors.New("runtime is shutting down")
	}
	if previous := m.runs[c.ID]; previous != nil && active(previous.run.Status) {
		return errors.New("command is already active")
	}
	if previous := m.runs[c.ID]; previous != nil {
		previous.cancel()
	}
	dir, err := ResolveDirectory(p.Directory, c.WorkingDirectory)
	if err != nil {
		return err
	}
	if c.Driver != "docker-compose" {
		for _, port := range c.Ports {
			listener, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
			if err != nil {
				return fmt.Errorf("port %d is unavailable: %w", port, err)
			}
			_ = listener.Close()
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	e := &execution{run: Run{ID: rand.Text(), WorkspaceID: w.ID, ProjectID: p.ID, CommandID: c.ID, Status: "starting", StartedAt: time.Now().UnixMilli(), Health: "unconfigured", Logs: []Log{}}, command: c, shell: settings.Shell, directory: dir, done: make(chan struct{}), cancel: cancel}
	e.ctx = ctx
	if c.HealthCheck != nil {
		e.run.Health = "checking"
	}
	m.limits = settings.Logs
	m.runs[c.ID] = e
	if c.Driver == "docker-compose" {
		e.busy = true
		m.workers.Add(1)
		go func() { defer m.workers.Done(); m.startCompose(ctx, e) }()
		return nil
	}
	cmd := shellCommand(settings.Shell, c.Run)
	cmd.Dir = dir
	cmd.Env = environment(c.Environment)
	out := &logWriter{manager: m, execution: e, stream: "stdout"}
	stderr := &logWriter{manager: m, execution: e, stream: "stderr"}
	cmd.Stdout = out
	cmd.Stderr = stderr
	cmd.WaitDelay = 2 * time.Second
	e.group, err = startProcess(cmd)
	if err != nil {
		cancel()
		e.run.Status = "failed"
		e.run.Error = err.Error()
		e.run.EndedAt = time.Now().UnixMilli()
		close(e.done)
		return err
	}
	e.run.Status = "running"
	m.record(e, "started")
	m.workers.Add(1)
	go func() {
		defer m.workers.Done()
		err := cmd.Wait()
		out.flush()
		stderr.flush()
		m.mu.Lock()
		e.group.close()
		e.group = nil
		code := cmd.ProcessState.ExitCode()
		e.run.ExitCode = &code
		if e.stopping {
			if e.command.Kind == "task" {
				e.run.Status = "cancelled"
			} else {
				e.run.Status = "stopped"
			}
		} else if err != nil || e.command.Kind == "service" {
			e.run.Status = "failed"
			if err != nil {
				e.run.Error = err.Error()
			} else {
				e.run.Error = "service exited unexpectedly"
			}
		} else {
			e.run.Status = "succeeded"
		}
		e.run.EndedAt = time.Now().UnixMilli()
		e.run.Health = "unconfigured"
		m.record(e, e.run.Status)
		m.trim()
		cancel()
		close(e.done)
		m.mu.Unlock()
	}()
	if c.HealthCheck != nil {
		m.workers.Add(1)
		go func() { defer m.workers.Done(); m.healthLoop(ctx, e) }()
	}
	return nil
}

func shellCommand(tool config.Tool, text string) *exec.Cmd {
	if tool.Executable != "" {
		return exec.Command(tool.Executable, append(append([]string{}, tool.Args...), text)...)
	}
	if runtime.GOOS == "windows" {
		return exec.Command("powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)\n"+text+"\nif (-not $?) { exit 1 }; if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }")
	}
	return exec.Command("/bin/sh", "-c", text)
}

func environment(overrides map[string]string) []string {
	result := []string{}
	for _, entry := range os.Environ() {
		key, _, _ := strings.Cut(entry, "=")
		found := false
		for other := range overrides {
			if key == other || (runtime.GOOS == "windows" && strings.EqualFold(key, other)) {
				found = true
				break
			}
		}
		if !found {
			result = append(result, entry)
		}
	}
	for key, value := range overrides {
		result = append(result, key+"="+value)
	}
	return result
}

func (m *Manager) Stop(commandID string, force bool) error {
	m.mu.Lock()
	e := m.runs[commandID]
	if e == nil || !active(e.run.Status) {
		m.mu.Unlock()
		return nil
	}
	if e.busy || e.run.Status == "stopping" {
		m.mu.Unlock()
		return errors.New("command operation is in progress")
	}
	e.stopping = true
	e.run.Status = "stopping"
	e.busy = true
	m.mu.Unlock()
	var err error
	if e.command.Driver == "docker-compose" {
		err = m.stopCompose(e)
	} else if e.command.Stop != "" && !force {
		err = m.runHelper(e, shellCommand(e.shell, e.command.Stop), 15*time.Second)
		if err == nil {
			select {
			case <-e.done:
			case <-time.After(5 * time.Second):
				err = errors.New("stop command finished but process is still active; use force stop")
			}
		}
	} else {
		m.mu.Lock()
		if e.group != nil {
			err = e.group.kill()
		}
		m.mu.Unlock()
		if err == nil {
			select {
			case <-e.done:
			case <-time.After(5 * time.Second):
				err = errors.New("process has not stopped yet")
			}
		}
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	e.busy = false
	if !active(e.run.Status) {
		return nil
	}
	if err != nil && active(e.run.Status) {
		e.run.Status = "unknown"
		e.run.Error = err.Error()
		e.stopping = false
	}
	return err
}

func (m *Manager) record(e *execution, message string) {
	m.history = append([]History{{WorkspaceID: e.run.WorkspaceID, Timestamp: time.Now().UnixMilli(), Message: e.command.Name + ": " + message}}, m.history...)
	if len(m.history) > 50 {
		m.history = m.history[:50]
	}
}

func (m *Manager) trim() {
	for {
		completed := 0
		var oldest *execution
		total := 0
		for _, e := range m.runs {
			total += e.bytes
			if !active(e.run.Status) {
				completed++
				if oldest == nil || e.run.EndedAt < oldest.run.EndedAt {
					oldest = e
				}
			}
		}
		if completed > m.limits.MaxCompletedRuns && oldest != nil {
			oldest.cancel()
			delete(m.runs, oldest.run.CommandID)
			continue
		}
		if total <= m.limits.MaxBytesTotal {
			break
		}
		var target *execution
		for _, e := range m.runs {
			if len(e.run.Logs) > 0 && (target == nil || e.run.Logs[0].Timestamp < target.run.Logs[0].Timestamp) {
				target = e
			}
		}
		if target == nil {
			break
		}
		target.bytes -= logBytes(target.run.Logs[0])
		target.run.Logs[0] = Log{}
		target.run.Logs = target.run.Logs[1:]
		target.run.Dropped++
	}
}

func (m *Manager) appendLog(e *execution, stream, message string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	e.sequence++
	level := "INFO"
	if stream == "stderr" {
		level = "WARN"
	}
	e.run.Logs = append(e.run.Logs, Log{Sequence: e.sequence, Timestamp: time.Now().UnixMilli(), Stream: stream, Level: level, Message: message})
	e.bytes += logBytes(e.run.Logs[len(e.run.Logs)-1])
	for len(e.run.Logs) > 0 && (len(e.run.Logs) > m.limits.MaxLinesPerRun || e.bytes > m.limits.MaxBytesPerRun) {
		e.bytes -= logBytes(e.run.Logs[0])
		e.run.Logs[0] = Log{}
		e.run.Logs = e.run.Logs[1:]
		e.run.Dropped++
	}
	m.trim()
}

type logWriter struct {
	mu        sync.Mutex
	manager   *Manager
	execution *execution
	stream    string
	pending   string
}

func (w *logWriter) Write(data []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	count := len(data)
	for len(data) > 0 {
		length := len(data)
		if length > 8192-len(w.pending) {
			length = 8192 - len(w.pending)
		}
		w.pending += string(data[:length])
		data = data[length:]
		for {
			line, rest, ok := strings.Cut(w.pending, "\n")
			if !ok {
				break
			}
			w.manager.appendLog(w.execution, w.stream, strings.TrimSuffix(strings.ToValidUTF8(line, "�"), "\r"))
			w.pending = rest
		}
		if len(w.pending) >= 8192 {
			w.manager.appendLog(w.execution, w.stream, strings.ToValidUTF8(w.pending, "�"))
			w.pending = ""
		}
	}
	return count, nil
}

func (w *logWriter) flush() {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.pending != "" {
		w.manager.appendLog(w.execution, w.stream, strings.ToValidUTF8(w.pending, "�"))
		w.pending = ""
	}
}

func (m *Manager) runHelper(e *execution, cmd *exec.Cmd, timeout time.Duration) error {
	cmd.Dir = e.directory
	cmd.Env = environment(e.command.Environment)
	out := &logWriter{manager: m, execution: e, stream: "stdout"}
	stderr := &logWriter{manager: m, execution: e, stream: "stderr"}
	cmd.Stdout = out
	cmd.Stderr = stderr
	cmd.WaitDelay = time.Second
	group, err := startProcess(cmd)
	if err != nil {
		return err
	}
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	select {
	case err = <-done:
	case <-e.ctx.Done():
		_ = group.kill()
		<-done
		err = e.ctx.Err()
	case <-time.After(timeout):
		_ = group.kill()
		<-done
		err = errors.New("command timed out")
	}
	group.close()
	out.flush()
	stderr.flush()
	return err
}
