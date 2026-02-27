package main

import (
	"fmt"
	"os"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "Error:", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	if len(args) == 0 {
		printUsage()
		return nil
	}

	if len(args) == 1 && (args[0] == "-h" || args[0] == "--help" || args[0] == "help") {
		printUsage()
		return nil
	}

	command := args[0]
	subArgs := args[1:]

	switch command {
	case "status":
		return statusCommand()
	case "node":
		return nodeCommand(subArgs)
	case "routing":
		return routingCommand(subArgs)
	case "dns":
		return dnsCommand(subArgs)
	case "subscription":
		return subscriptionCommand(subArgs)
	case "control":
		return controlCommand(subArgs)
	case "log":
		return logCommand(subArgs)
	case "features":
		return featuresCommand()
	default:
		printUsage()
		return fmt.Errorf("unknown command: %s", command)
	}
}

func printUsage() {
	fmt.Println(`HomeProxy CLI - Command line interface for HomeProxy

Usage: homeproxy <command> [options]

Commands:
    node <action>        Node management
        list                List all nodes
        test [name]         Test node connection
        set-main <name>     Set main node
        add <type> <addr> <port> [label]  Add new node
        remove <name>       Remove node
        edit <name> <key> <value>  Edit node
        import <url>        Import from URL
        export [name]       Export nodes
    
    routing <action>     Routing management
        get                 Get current routing mode
        set <mode>          Set routing mode
        set-node <type> <name>  Set routing node
        status              Show routing status
    
    dns <action>         DNS management
        get                 Get DNS servers
        set <server>        Set DNS server
        set-china <server>  Set China DNS server
        test [domain]       Test DNS resolution
        cache <enable|disable>  DNS cache control
        strategy [mode]     DNS strategy
        status              Show DNS status
    
    subscription <action> Subscription management
        list                List subscriptions
        add <url>           Add subscription
        remove [url]        Remove subscription(s)
        update              Update subscriptions
        auto-update <on|off>  Toggle auto-update
        filter <action>     Manage filter keywords
        status              Show subscription status
    
    status               Show HomeProxy status
    
    log [type]           Show logs (homeproxy|sing-box-c|sing-box-s)
    
    control <action>     Service control
        start              Start HomeProxy
        stop               Stop HomeProxy
        restart            Restart HomeProxy
        status             Show service status
    
    features             Show sing-box features

Options:
    -h, --help           Show this help
`)
}

