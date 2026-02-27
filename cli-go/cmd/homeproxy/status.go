package main

import (
	"encoding/json"
	"fmt"

	"homeproxy-cli/internal/system"
)

type singboxFeatures struct {
	Result struct {
		Version string `json:"version"`
	} `json:"result"`
}

func statusCommand() error {
	if err := system.CheckInstalled(); err != nil {
		return err
	}

	logInfo("HomeProxy Status")
	fmt.Println("==================")

	running, _, _ := system.ServiceStatus()
	if running {
		logInfo("Service: RUNNING")
	} else {
		logInfo("Service: NOT RUNNING")
	}

	mainNode, _ := system.UCIGet("homeproxy.config.main_node")
	if mainNode != "" && mainNode != "nil" {
		label, err := system.UCIGet(fmt.Sprintf("homeproxy.%s.label", mainNode))
		if err != nil || label == "" {
			label = mainNode
		}
		logInfo("Main Node: " + label)
	} else {
		logInfo("Main Node: Not configured")
	}

	mode, _ := system.UCIGet("homeproxy.config.routing_mode")
	if mode != "" {
		logInfo("Routing: " + mode)
	}

	raw, err := system.UBUSCall(system.RPCObject, "singbox_get_features", map[string]any{})
	if err == nil && raw != "" {
		var f singboxFeatures
		if jsonErr := json.Unmarshal([]byte(raw), &f); jsonErr == nil && f.Result.Version != "" {
			logInfo("Version: " + f.Result.Version)
		}
	}

	return nil
}

