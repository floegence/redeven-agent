//go:build windows

package codeserver

import (
	"os"
	"os/exec"
)

func setCmdProcessGroup(cmd *exec.Cmd) {
	// Not supported on Windows in this MVP implementation.
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
	p, err := os.FindProcess(pid)
	if err != nil {
		return nil
	}
	_ = p.Kill()
	return nil
}
