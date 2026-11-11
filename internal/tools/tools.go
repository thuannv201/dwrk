package tools

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"changeme/internal/config"
	"changeme/internal/runner"
)

func OpenTool(tool config.Tool, kind, directory string) error {
	info, err := os.Stat(directory)
	if err != nil {
		return err
	}
	if !info.IsDir() {
		return errors.New("not a directory")
	}
	if tool.Executable == "" {
		switch kind {
		case "editor":
			if runtime.GOOS == "windows" {
				for _, path := range []string{filepath.Join(os.Getenv("LOCALAPPDATA"), "Programs", "Microsoft VS Code", "Code.exe"), filepath.Join(os.Getenv("ProgramFiles"), "Microsoft VS Code", "Code.exe")} {
					if _, err := os.Stat(path); err == nil {
						tool = config.Tool{Executable: path, Args: []string{"{directory}"}}
						break
					}
				}
				if tool.Executable == "" {
					return errors.New("configure the editor executable in settings")
				}
			} else if runtime.GOOS == "darwin" {
				tool = config.Tool{Executable: "open", Args: []string{"-a", "Visual Studio Code", "{directory}"}}
			} else {
				tool = config.Tool{Executable: "code", Args: []string{"{directory}"}}
			}
		case "terminal":
			if runtime.GOOS == "windows" {
				tool = config.Tool{Executable: "powershell.exe", Args: []string{"-NoLogo", "-NoProfile", "-NoExit"}}
			} else if runtime.GOOS == "darwin" {
				tool = config.Tool{Executable: "open", Args: []string{"-a", "Terminal", "{directory}"}}
			} else {
				tool = config.Tool{Executable: "x-terminal-emulator"}
			}
		default:
			return errors.New("unsupported tool")
		}
	}
	args := make([]string, len(tool.Args))
	for i, arg := range tool.Args {
		args[i] = strings.ReplaceAll(arg, "{directory}", directory)
	}
	cmd := exec.Command(tool.Executable, args...)
	cmd.Dir = directory
	if err := cmd.Start(); err != nil {
		return err
	}
	go func() { _ = cmd.Wait() }()
	return nil
}

type GitStatus struct {
	Root        string   `json:"root"`
	Branch      string   `json:"branch"`
	Upstream    string   `json:"upstream"`
	Ahead       int      `json:"ahead"`
	Behind      int      `json:"behind"`
	Changes     []string `json:"changes"`
	ChangeCount int      `json:"changeCount"`
}

func Git(directory string) (GitStatus, error) {
	result := GitStatus{Changes: []string{}}
	cmd := exec.Command("git", "--no-optional-locks", "-C", directory, "-c", "core.fsmonitor=false", "rev-parse", "--show-toplevel")
	data, err := runner.Capture(cmd, 5*time.Second)
	if err != nil {
		return result, err
	}
	result.Root = strings.TrimSpace(string(data))
	cmd = exec.Command("git", "--no-optional-locks", "-C", directory, "-c", "core.fsmonitor=false", "status", "--porcelain=v2", "--branch", "-z")
	data, err = runner.Capture(cmd, 10*time.Second)
	if err != nil {
		return result, err
	}
	entries := strings.Split(string(data), "\x00")
	for i := 0; i < len(entries); i++ {
		line := entries[i]
		switch {
		case strings.HasPrefix(line, "# branch.head "):
			result.Branch = strings.TrimPrefix(line, "# branch.head ")
		case strings.HasPrefix(line, "# branch.upstream "):
			result.Upstream = strings.TrimPrefix(line, "# branch.upstream ")
		case strings.HasPrefix(line, "# branch.ab "):
			fields := strings.Fields(line)
			if len(fields) == 4 {
				result.Ahead, _ = strconv.Atoi(strings.TrimPrefix(fields[2], "+"))
				result.Behind, _ = strconv.Atoi(strings.TrimPrefix(fields[3], "-"))
			}
		case line != "" && !strings.HasPrefix(line, "#"):
			result.ChangeCount++
			if len(result.Changes) < 200 {
				result.Changes = append(result.Changes, gitChange(line))
			}
			if strings.HasPrefix(line, "2 ") {
				i++
			}
		}
	}
	return result, nil
}

func gitChange(line string) string {
	if strings.HasPrefix(line, "? ") {
		return "?? " + line[2:]
	}
	fields := 0
	switch {
	case strings.HasPrefix(line, "1 "):
		fields = 9
	case strings.HasPrefix(line, "2 "):
		fields = 10
	case strings.HasPrefix(line, "u "):
		fields = 11
	}
	if fields > 0 {
		parts := strings.SplitN(line, " ", fields)
		if len(parts) == fields {
			return parts[1] + " " + parts[fields-1]
		}
	}
	return line
}
