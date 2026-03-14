package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRunCLIHelp(t *testing.T) {
	t.Run("top level help flag prints quick start", func(t *testing.T) {
		code, stdout, stderr := runCLITest(t, "--help")
		if code != 0 {
			t.Fatalf("exit code = %d, want 0", code)
		}
		if stderr != "" {
			t.Fatalf("stderr = %q, want empty", stderr)
		}
		assertContainsAll(t, stdout,
			"Redeven agent runtime and Local UI launcher.",
			"Quick start:",
			"redeven bootstrap --controlplane https://region.example.invalid --env-id env_123 --env-token <token>",
			"redeven run --mode local",
		)
	})

	t.Run("run help includes mode and bind guidance", func(t *testing.T) {
		code, stdout, stderr := runCLITest(t, "help", "run")
		if code != 0 {
			t.Fatalf("exit code = %d, want 0", code)
		}
		if stderr != "" {
			t.Fatalf("stderr = %q, want empty", stderr)
		}
		assertContainsAll(t, stdout,
			"redeven run",
			"Modes:",
			"Local UI bind rules:",
			"Accepted examples: localhost:23998, 127.0.0.1:24000, 0.0.0.0:24000, 192.168.1.11:24000",
			"redeven run --mode hybrid --local-ui-bind 127.0.0.1:24000",
		)
	})

	t.Run("bootstrap help includes required flags and example", func(t *testing.T) {
		code, stdout, stderr := runCLITest(t, "bootstrap", "--help")
		if code != 0 {
			t.Fatalf("exit code = %d, want 0", code)
		}
		if stderr != "" {
			t.Fatalf("stderr = %q, want empty", stderr)
		}
		assertContainsAll(t, stdout,
			"Required flags:",
			"--controlplane <url>",
			"--env-id <env_public_id>",
			"--env-token <token>",
			"redeven bootstrap --controlplane https://region.example.invalid --env-id env_123 --env-token <token>",
		)
	})

	t.Run("knowledge bundle help is available through help command", func(t *testing.T) {
		code, stdout, stderr := runCLITest(t, "help", "knowledge", "bundle")
		if code != 0 {
			t.Fatalf("exit code = %d, want 0", code)
		}
		if stderr != "" {
			t.Fatalf("stderr = %q, want empty", stderr)
		}
		assertContainsAll(t, stdout,
			"redeven knowledge bundle",
			"--verify-only",
			"--validate-source-only",
		)
	})
}

func TestRunCLIStartupGuidanceErrors(t *testing.T) {
	t.Run("unknown command points to help", func(t *testing.T) {
		code, stdout, stderr := runCLITest(t, "nope")
		if code != 2 {
			t.Fatalf("exit code = %d, want 2", code)
		}
		if stdout != "" {
			t.Fatalf("stdout = %q, want empty", stdout)
		}
		assertContainsAll(t, stderr,
			"unknown command: nope",
			"Run `redeven help` for usage and startup examples.",
			"Quick start:",
		)
	})

	t.Run("renamed local ui flag shows migration hint", func(t *testing.T) {
		code, stdout, stderr := runCLITest(t, "run", "--local-ui-port", "12345")
		if code != 2 {
			t.Fatalf("exit code = %d, want 2", code)
		}
		if stdout != "" {
			t.Fatalf("stdout = %q, want empty", stdout)
		}
		assertContainsAll(t, stderr,
			"unknown flag for `redeven run`: --local-ui-port",
			"Hint: `--local-ui-port` was replaced by `--local-ui-bind <host:port>`.",
			"Example: redeven run --mode hybrid --local-ui-bind 127.0.0.1:24000",
		)
	})

	t.Run("bootstrap missing flags are listed explicitly", func(t *testing.T) {
		code, _, stderr := runCLITest(t, "bootstrap")
		if code != 2 {
			t.Fatalf("exit code = %d, want 2", code)
		}
		assertContainsAll(t, stderr,
			"missing required flags for `redeven bootstrap`: --controlplane, --env-id, --env-token",
			"Example: redeven bootstrap --controlplane https://region.example.invalid --env-id env_123 --env-token <token>",
		)
	})

	t.Run("run incomplete inline bootstrap flags explain the missing flag", func(t *testing.T) {
		code, _, stderr := runCLITest(t, "run", "--mode", "hybrid", "--controlplane", "https://region.example.invalid", "--env-id", "env_123")
		if code != 2 {
			t.Fatalf("exit code = %d, want 2", code)
		}
		assertContainsAll(t, stderr,
			"incomplete bootstrap flags for `redeven run`: missing flag --env-token",
			"Hint: provide --controlplane, --env-id, and --env-token together, or run `redeven bootstrap` first.",
		)
	})

	t.Run("invalid mode includes allowed values", func(t *testing.T) {
		code, _, stderr := runCLITest(t, "run", "--mode", "bad")
		if code != 2 {
			t.Fatalf("exit code = %d, want 2", code)
		}
		assertContainsAll(t, stderr,
			"invalid value for `--mode`: bad",
			"Allowed values: remote, hybrid, local.",
			"Example: redeven run --mode hybrid",
		)
	})

	t.Run("invalid local ui bind includes accepted examples", func(t *testing.T) {
		code, _, stderr := runCLITest(t, "run", "--mode", "local", "--local-ui-bind", "example.com:12345")
		if code != 2 {
			t.Fatalf("exit code = %d, want 2", code)
		}
		assertContainsAll(t, stderr,
			"invalid value for `--local-ui-bind`: host must be localhost or an IP literal",
			"Accepted examples: localhost:23998, 127.0.0.1:24000, 0.0.0.0:24000, 192.168.1.11:24000",
		)
	})

	t.Run("non loopback bind without password gives exact next step", func(t *testing.T) {
		code, _, stderr := runCLITest(t, "run", "--mode", "local", "--local-ui-bind", "0.0.0.0:12345")
		if code != 2 {
			t.Fatalf("exit code = %d, want 2", code)
		}
		assertContainsAll(t, stderr,
			"non-loopback `--local-ui-bind` requires an access password",
			"Hint: set exactly one of --password, --password-env, or --password-file.",
			"REDEVEN_LOCAL_UI_PASSWORD=replace-with-a-long-password redeven run --mode hybrid --local-ui-bind 0.0.0.0:24000 --password-env REDEVEN_LOCAL_UI_PASSWORD",
		)
	})

	t.Run("multiple password sources explain the conflict", func(t *testing.T) {
		code, _, stderr := runCLITest(t, "run", "--mode", "local", "--password", "a", "--password-env", "TEST_PASSWORD")
		if code != 2 {
			t.Fatalf("exit code = %d, want 2", code)
		}
		assertContainsAll(t, stderr,
			"invalid password flags: use only one of --password, --password-env, or --password-file",
			"Hint: choose a single password source for one startup command.",
		)
	})

	t.Run("missing password env gives export example", func(t *testing.T) {
		code, _, stderr := runCLITest(t, "run", "--mode", "local", "--password-env", "MISSING_PASSWORD")
		if code != 2 {
			t.Fatalf("exit code = %d, want 2", code)
		}
		assertContainsAll(t, stderr,
			"invalid password flags: password env var \"MISSING_PASSWORD\" is not set",
			"Hint: export MISSING_PASSWORD with a non-empty password before running `redeven run`.",
			"MISSING_PASSWORD=replace-with-a-long-password redeven run --mode hybrid --local-ui-bind 0.0.0.0:24000 --password-env MISSING_PASSWORD",
		)
	})

	t.Run("empty password file explains how to fix it", func(t *testing.T) {
		passwordFile := filepath.Join(t.TempDir(), "password.txt")
		if err := os.WriteFile(passwordFile, []byte("\n"), 0o600); err != nil {
			t.Fatalf("WriteFile() error = %v", err)
		}

		code, _, stderr := runCLITest(t, "run", "--mode", "local", "--password-file", passwordFile)
		if code != 2 {
			t.Fatalf("exit code = %d, want 2", code)
		}
		assertContainsAll(t, stderr,
			"invalid password flags: password file",
			"is empty",
			"Hint: write the full access password to the file and retry.",
		)
	})

	t.Run("hybrid mode without bootstrap config gives both supported recovery paths", func(t *testing.T) {
		code, _, stderr := runCLITest(t, "run", "--mode", "hybrid")
		if code != 1 {
			t.Fatalf("exit code = %d, want 1", code)
		}
		assertContainsAll(t, stderr,
			"agent is not bootstrapped for remote or hybrid mode:",
			"Hint: run `redeven bootstrap` first, or pass --controlplane, --env-id, and --env-token directly to `redeven run`.",
			"redeven bootstrap --controlplane https://region.example.invalid --env-id env_123 --env-token <token>",
			"redeven run --mode hybrid --controlplane https://region.example.invalid --env-id env_123 --env-token <token>",
		)
	})
}

func runCLITest(t *testing.T, args ...string) (int, string, string) {
	t.Helper()

	t.Setenv("HOME", t.TempDir())

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	code := runCLI(args, &stdout, &stderr)
	return code, stdout.String(), stderr.String()
}

func assertContainsAll(t *testing.T, text string, needles ...string) {
	t.Helper()
	for _, needle := range needles {
		if !strings.Contains(text, needle) {
			t.Fatalf("expected output to contain %q\nfull output:\n%s", needle, text)
		}
	}
}
