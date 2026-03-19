package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"homeproxy-cli/internal/system"
)

const (
	healthLockDir      = "/var/run/homeproxy/health-monitor.lock"
	healthShutdownFile = "/var/run/homeproxy/health-shutdown.lock"
	healthCheckScript  = "/etc/homeproxy/scripts/connection_check.sh"
	healthDNSMasqConf  = "/tmp/dnsmasq.d/dnsmasq-homeproxy.conf"
	healthDNSMasqDir   = "/tmp/dnsmasq.d/dnsmasq-homeproxy.d"
	healthGracePeriod  = 60 * time.Second
	healthCheckPeriod  = 30 * time.Second
	healthMaxFailures  = 3
)

var healthRetrySchedule = []time.Duration{2 * time.Second, 4 * time.Second, 8 * time.Second}

type healthConfig struct {
	enabled  bool
	outbound string
}

type healthMonitor struct {
	state         string
	failureRounds int
	stopTriggered bool
	logPath       string
}

var (
	healthSleep = func(ctx context.Context, d time.Duration) error {
		timer := time.NewTimer(d)
		defer timer.Stop()

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-timer.C:
			return nil
		}
	}
	healthLoadConfig    = loadHealthConfig
	healthRunCheck      = runSharedConnectionCheck
	healthServiceStatus = system.ServiceStatus
	healthServiceStop   = system.ServiceStop
	healthProcessExists = processExists
	healthStat          = os.Stat
	healthMkdir         = os.Mkdir
	healthRemoveAll     = os.RemoveAll
	healthWriteFile     = os.WriteFile
)

func healthMonitorCommand(args []string) error {
	if len(args) != 0 {
		return fmt.Errorf("usage: homeproxy health-monitor")
	}
	if err := system.CheckInstalled(); err != nil {
		return err
	}
	if err := requireRoot(); err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	monitor := &healthMonitor{
		state:   "warming_up",
		logPath: system.LogFile("homeproxy"),
	}

	return monitor.run(ctx)
}

func (m *healthMonitor) run(ctx context.Context) error {
	if err := healthMkdir(healthLockDir, 0o700); err != nil {
		if os.IsExist(err) {
			m.log("monitor already running, exiting")
			return nil
		}
		return err
	}
	defer func() {
		_ = healthRemoveAll(healthLockDir)
		if !m.stopTriggered {
			m.log("state=%s exiting", m.state)
		}
	}()

	if err := healthWriteFile(filepath.Join(healthLockDir, "pid"), []byte(fmt.Sprintf("%d\n", os.Getpid())), 0o644); err != nil {
		return err
	}

	m.log(
		"monitor started pid=%d grace=%ds interval=%ds threshold=%d retry_delays=%s site=google lock=%s",
		os.Getpid(),
		int(healthGracePeriod/time.Second),
		int(healthCheckPeriod/time.Second),
		healthMaxFailures,
		"2s,4s,8s",
		healthLockDir,
	)

	if err := healthSleep(ctx, healthGracePeriod); err != nil {
		return nil
	}

	for {
		cfg, err := healthLoadConfig()
		if err != nil {
			m.state = "exiting"
			m.log("config read failed: %v", err)
			return err
		}

		if !cfg.enabled {
			m.state = "exiting"
			m.log("monitor disabled by config, exiting")
			return nil
		}

		if _, err := healthStat(healthShutdownFile); err == nil {
			m.state = "exiting"
			m.log("shutdown marker already exists, exiting")
			return nil
		} else if !os.IsNotExist(err) {
			return err
		}

		if cfg.outbound == "" || cfg.outbound == "nil" {
			m.state = "exiting"
			m.log("no client outbound configured, exiting")
			return nil
		}

		m.state = "healthy"
		if m.runRound(ctx) {
			if err := healthSleep(ctx, healthCheckPeriod); err != nil {
				return nil
			}
			continue
		}

		m.failureRounds++
		m.log("round failed after attempts=%d, failure_rounds=%d/%d", len(healthRetrySchedule)+1, m.failureRounds, healthMaxFailures)
		if m.failureRounds < healthMaxFailures {
			if err := healthSleep(ctx, healthCheckPeriod); err != nil {
				return nil
			}
			continue
		}

		return m.stopService()
	}
}

func (m *healthMonitor) runRound(ctx context.Context) bool {
	attempt := 1
	if healthRunCheck("google") {
		if m.failureRounds > 0 {
			m.log("round recovered on attempt=%d, failure_rounds reset from %d to 0", attempt, m.failureRounds)
			m.failureRounds = 0
		}
		return true
	}

	m.state = "retrying"
	for _, delay := range healthRetrySchedule {
		m.log("round_failure attempt=%d next_retry_in=%ds failure_rounds=%d", attempt, int(delay/time.Second), m.failureRounds)
		if err := healthSleep(ctx, delay); err != nil {
			m.state = "exiting"
			return true
		}
		attempt++

		if _, err := healthStat(healthShutdownFile); err == nil {
			m.state = "exiting"
			m.log("shutdown marker appeared during retry, exiting")
			return true
		}

		if healthRunCheck("google") {
			m.log("round recovered on attempt=%d, failure_rounds reset from %d to 0", attempt, m.failureRounds)
			m.failureRounds = 0
			m.state = "healthy"
			return true
		}
	}

	return false
}

func (m *healthMonitor) stopService() error {
	m.state = "shutdown_pending"
	m.stopTriggered = true
	if err := healthWriteFile(healthShutdownFile, []byte("1\n"), 0o644); err != nil {
		return err
	}
	m.log("failure threshold reached, preparing full stop")

	running, _, err := healthServiceStatus()
	if err != nil {
		m.log("stop pre-check failed: %v", err)
		return err
	}
	if !running {
		m.log("stop pre-check: homeproxy already not running, exiting")
		return nil
	}

	if err := healthServiceStop(); err != nil {
		m.log("stop command failed: %v", err)
		return err
	}

	postFailed := false
	if healthProcessExists("/var/run/homeproxy/sing-box-c.json") {
		postFailed = true
	}

	if stat, err := healthStat(system.LogDir + "/fw4_post.nft"); err == nil && stat.Size() > 0 {
		postFailed = true
	} else if err != nil && !os.IsNotExist(err) {
		postFailed = true
	}

	if fileExists(healthDNSMasqConf) || fileExists(healthDNSMasqDir) {
		postFailed = true
	}

	if postFailed {
		m.log("shutdown post-check failed")
	} else {
		m.log("shutdown verified")
	}

	m.state = "exiting"
	return nil
}

func (m *healthMonitor) log(format string, args ...any) {
	line := fmt.Sprintf("%s [HEALTH] %s\n", time.Now().Format("2006-01-02 15:04:05"), fmt.Sprintf(format, args...))
	f, err := os.OpenFile(m.logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		fmt.Fprint(os.Stderr, line)
		return
	}
	defer f.Close()
	_, _ = f.WriteString(line)
}

func loadHealthConfig() (healthConfig, error) {
	enabled, err := system.UCIGet("homeproxy.config.health_auto_shutdown")
	if err != nil {
		return healthConfig{}, err
	}

	routingMode, err := system.UCIGet("homeproxy.config.routing_mode")
	if err != nil {
		return healthConfig{}, err
	}

	outboundPath := "homeproxy.config.main_node"
	if strings.TrimSpace(routingMode) == "custom" {
		outboundPath = "homeproxy.routing.default_outbound"
	}

	outbound, err := system.UCIGet(outboundPath)
	if err != nil {
		return healthConfig{}, err
	}

	return healthConfig{
		enabled:  strings.TrimSpace(enabled) == "1",
		outbound: strings.TrimSpace(outbound),
	}, nil
}

func runSharedConnectionCheck(site string) bool {
	cmd := exec.Command("/bin/sh", healthCheckScript, site)
	cmd.Stdout = nil
	cmd.Stderr = nil
	return cmd.Run() == nil
}

func processExists(pattern string) bool {
	return exec.Command("pgrep", "-f", pattern).Run() == nil
}

func fileExists(path string) bool {
	_, err := healthStat(path)
	return err == nil || !errors.Is(err, os.ErrNotExist)
}
