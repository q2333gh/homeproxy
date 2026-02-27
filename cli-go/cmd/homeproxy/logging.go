package main

import (
	"fmt"
	"os"
)

func logInfo(msg string) {
	fmt.Fprintf(os.Stdout, "[INFO] %s\n", msg)
}

func logWarn(msg string) {
	fmt.Fprintf(os.Stdout, "[WARN] %s\n", msg)
}

func logError(msg string) {
	fmt.Fprintf(os.Stderr, "[ERROR] %s\n", msg)
}

