//go:build !windows

package codeserver

import (
	"os/exec"
	"syscall"
)

func setCmdProcessGroup(cmd *exec.Cmd) {
	if cmd == nil {
		return
	}
	// Create a new process group for the child so we can kill the whole group.
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
}

func killCmdProcessGroup(cmd *exec.Cmd) error {
	if cmd == nil || cmd.Process == nil {
		return nil
	}
	return killProcessGroupByPID(cmd.Process.Pid)
}

func killProcessGroupByPID(pid int) error {
	if pid <= 0 {
		return nil
	}
	// Best-effort: kill the process group first, then the process itself.
	_ = syscall.Kill(-pid, syscall.SIGKILL)
	_ = syscall.Kill(pid, syscall.SIGKILL)
	return nil
}
