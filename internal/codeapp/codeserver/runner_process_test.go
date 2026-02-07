package codeserver

import (
	"path/filepath"
	"reflect"
	"testing"
)

func TestParseCodeServerPIDsFromPSOutput(t *testing.T) {
	t.Parallel()

	socketPath := "/Users/test/.redeven/socks/cs-rvx.sock"
	raw := "\n" +
		"  101 /opt/homebrew/bin/node /opt/homebrew/bin/code-server --session-socket /Users/test/.redeven/socks/cs-rvx.sock /Users/test/work\n" +
		"  102 /opt/homebrew/Cellar/node/bin/node /opt/homebrew/Cellar/code-server/4.108.2/libexec/out/node/entry --session-socket /Users/test/.redeven/socks/cs-rvx.sock\n" +
		"  103 /opt/homebrew/bin/node /opt/homebrew/bin/code-server --session-socket /Users/test/.redeven/socks/cs-other.sock /Users/test/work\n" +
		"  101 /opt/homebrew/bin/node /opt/homebrew/bin/code-server --session-socket /Users/test/.redeven/socks/cs-rvx.sock /Users/test/work\n" +
		"  104 /usr/bin/python script.py\n" +
		" bad-line\n"

	got := parseCodeServerPIDsFromPSOutput(raw, socketPath)
	want := []int{101, 102}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("parseCodeServerPIDsFromPSOutput() = %+v, want %+v", got, want)
	}
}

func TestSessionSocketPathForCodeSpace(t *testing.T) {
	t.Parallel()

	r := &Runner{stateDir: "/tmp/redeven"}
	got := r.sessionSocketPathForCodeSpace("rv/x\\id")
	want := filepath.Join("/tmp/redeven", "socks", "cs-rv_x_id.sock")
	if got != want {
		t.Fatalf("sessionSocketPathForCodeSpace() = %q, want %q", got, want)
	}
}
