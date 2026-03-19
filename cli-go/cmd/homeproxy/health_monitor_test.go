package main

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"homeproxy-cli/internal/system"
)

func TestHealthMonitorStopsAfterThreeFailedRounds(t *testing.T) {
	dir := t.TempDir()
	logPath := filepath.Join(dir, "homeproxy.log")
	lockDir := filepath.Join(dir, "lock")
	shutdownFile := filepath.Join(dir, "shutdown.lock")
	fw4Post := filepath.Join(dir, "fw4_post.nft")

	origMkdir := healthMkdir
	origRemoveAll := healthRemoveAll
	origWriteFile := healthWriteFile
	origStat := healthStat
	origSleep := healthSleep
	origRunCheck := healthRunCheck
	origLoad := healthLoadConfig
	origStatus := healthServiceStatus
	origStop := healthServiceStop
	origProc := healthProcessExists
	defer func() {
		healthMkdir = origMkdir
		healthRemoveAll = origRemoveAll
		healthWriteFile = origWriteFile
		healthStat = origStat
		healthSleep = origSleep
		healthRunCheck = origRunCheck
		healthLoadConfig = origLoad
		healthServiceStatus = origStatus
		healthServiceStop = origStop
		healthProcessExists = origProc
	}()

	healthMkdir = func(path string, perm os.FileMode) error { return os.Mkdir(lockDir, perm) }
	healthRemoveAll = os.RemoveAll
	healthWriteFile = func(path string, data []byte, perm os.FileMode) error {
		switch path {
		case healthShutdownFile:
			return os.WriteFile(shutdownFile, data, perm)
		case filepath.Join(healthLockDir, "pid"):
			return os.WriteFile(filepath.Join(lockDir, "pid"), data, perm)
		default:
			return os.WriteFile(path, data, perm)
		}
	}
	healthStat = func(path string) (os.FileInfo, error) {
		switch path {
		case healthLockDir:
			return os.Stat(lockDir)
		case healthShutdownFile:
			return os.Stat(shutdownFile)
		case system.LogDir + "/fw4_post.nft":
			return os.Stat(fw4Post)
		case healthDNSMasqConf, healthDNSMasqDir:
			return nil, os.ErrNotExist
		default:
			return nil, os.ErrNotExist
		}
	}
	sleepCount := 0
	healthSleep = func(ctx context.Context, _ time.Duration) error {
		sleepCount++
		return nil
	}
	healthLoadConfig = func() (healthConfig, error) {
		return healthConfig{enabled: true, outbound: "node-a"}, nil
	}
	healthRunCheck = func(site string) bool {
		return false
	}
	running := true
	healthServiceStatus = func() (bool, string, error) {
		return running, "running", nil
	}
	stopped := 0
	healthServiceStop = func() error {
		stopped++
		running = false
		_ = os.WriteFile(fw4Post, []byte{}, 0o644)
		_ = os.Remove(shutdownFile)
		return nil
	}
	healthProcessExists = func(pattern string) bool { return false }

	m := &healthMonitor{state: "warming_up", logPath: logPath}
	if err := m.run(context.Background()); err != nil {
		t.Fatalf("run: %v", err)
	}
	if stopped != 1 {
		t.Fatalf("expected one stop, got %d", stopped)
	}
	content, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatalf("read log: %v", err)
	}
	logText := string(content)
	if !strings.Contains(logText, "failure threshold reached, preparing full stop") {
		t.Fatalf("expected threshold log, got: %s", logText)
	}
	if !strings.Contains(logText, "shutdown verified") {
		t.Fatalf("expected shutdown verified log, got: %s", logText)
	}
	if sleepCount == 0 {
		t.Fatal("expected sleeps to be used")
	}
}

func TestHealthMonitorRecoversWithinRound(t *testing.T) {
	dir := t.TempDir()
	logPath := filepath.Join(dir, "homeproxy.log")
	lockDir := filepath.Join(dir, "lock")

	origMkdir := healthMkdir
	origRemoveAll := healthRemoveAll
	origWriteFile := healthWriteFile
	origStat := healthStat
	origSleep := healthSleep
	origRunCheck := healthRunCheck
	origLoad := healthLoadConfig
	defer func() {
		healthMkdir = origMkdir
		healthRemoveAll = origRemoveAll
		healthWriteFile = origWriteFile
		healthStat = origStat
		healthSleep = origSleep
		healthRunCheck = origRunCheck
		healthLoadConfig = origLoad
	}()

	healthMkdir = func(path string, perm os.FileMode) error { return os.Mkdir(lockDir, perm) }
	healthRemoveAll = os.RemoveAll
	healthWriteFile = func(path string, data []byte, perm os.FileMode) error {
		switch path {
		case filepath.Join(healthLockDir, "pid"):
			return os.WriteFile(filepath.Join(lockDir, "pid"), data, perm)
		default:
			return os.WriteFile(path, data, perm)
		}
	}
	healthStat = func(path string) (os.FileInfo, error) {
		switch path {
		case healthLockDir:
			return os.Stat(lockDir)
		case healthShutdownFile, system.LogDir + "/fw4_post.nft", healthDNSMasqConf, healthDNSMasqDir:
			return nil, os.ErrNotExist
		default:
			return nil, os.ErrNotExist
		}
	}
	checkCount := 0
	healthRunCheck = func(site string) bool {
		checkCount++
		return checkCount == 2
	}
	loopCount := 0
	healthSleep = func(ctx context.Context, d time.Duration) error {
		loopCount++
		if loopCount > 2 {
			return context.Canceled
		}
		return nil
	}
	healthLoadConfig = func() (healthConfig, error) {
		return healthConfig{enabled: true, outbound: "node-a"}, nil
	}

	m := &healthMonitor{state: "warming_up", logPath: logPath}
	if err := m.run(context.Background()); err != nil {
		t.Fatalf("run: %v", err)
	}

	content, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatalf("read log: %v", err)
	}
	logText := string(content)
	if !strings.Contains(logText, "round recovered on attempt=2") {
		t.Fatalf("expected recovery log, got: %s", logText)
	}
}
