//go:build windows

package codeserver

import "os/exec"

func setCmdProcessGroup(cmd *exec.Cmd) {
	// Not supported on Windows in this MVP implementation.
}

func killCmdProcessGroup(cmd *exec.Cmd) error {
	if cmd == nil || cmd.Process == nil {
		return nil
	}
	_ = cmd.Process.Kill()
	return nil
}
