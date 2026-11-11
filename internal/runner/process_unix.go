//go:build linux || darwin

package runner

import (
	"os/exec"
	"syscall"
)

type processGroup struct{ pid int }

func startProcess(cmd *exec.Cmd) (*processGroup, error) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	return &processGroup{pid: cmd.Process.Pid}, nil
}
func (p *processGroup) kill() error { return syscall.Kill(-p.pid, syscall.SIGKILL) }
func (p *processGroup) close()      { _ = p.kill() }
