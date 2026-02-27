package main

import (
	"bufio"
	"fmt"
	"os"

	"homeproxy-cli/internal/system"
)

const defaultLogLines = 50

func logCommand(args []string) error {
	if err := system.CheckInstalled(); err != nil {
		return err
	}

	logType := "homeproxy"
	if len(args) > 0 && args[0] != "" {
		logType = args[0]
	}

	path := system.LogFile(logType)
	file, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("log file not found: %s", path)
	}
	defer file.Close()

	lines := make([]string, 0, defaultLogLines)
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("failed to read log file: %w", err)
	}

	start := 0
	if len(lines) > defaultLogLines {
		start = len(lines) - defaultLogLines
	}

	for _, line := range lines[start:] {
		fmt.Println(line)
	}

	return nil
}

