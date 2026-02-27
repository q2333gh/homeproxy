package system

import (
	"bytes"
	"fmt"
	"os/exec"
	"strings"
)

// runCommand executes a command and returns trimmed stdout or an error that includes stderr.
func runCommand(name string, args ...string) (string, error) {
	cmd := exec.Command(name, args...)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		errMsg := strings.TrimSpace(stderr.String())
		if errMsg == "" {
			errMsg = err.Error()
		}
		return "", fmt.Errorf("%s %v failed: %s", name, args, errMsg)
	}

	return strings.TrimSpace(stdout.String()), nil
}

