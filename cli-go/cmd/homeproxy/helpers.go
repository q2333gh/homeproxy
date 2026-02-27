package main

import (
	"fmt"
	"os"
	"strings"

	"homeproxy-cli/internal/system"
)

// requireRoot returns an error if the process is not running as root.
func requireRoot() error {
	if os.Geteuid() != 0 {
		return fmt.Errorf("this command requires root privileges")
	}
	return nil
}

// uciCommitAndReload commits the homeproxy UCI config and reloads the service.
func uciCommitAndReload() error {
	if err := system.UCICommit("homeproxy"); err != nil {
		return err
	}
	return system.ServiceReload()
}

// validateOneOf returns an error if value is not in allowed.
func validateOneOf(value string, allowed []string, name string) error {
	if containsString(allowed, value) {
		return nil
	}
	return fmt.Errorf("invalid %s: %s (use: %s)", name, value, strings.Join(allowed, ", "))
}
