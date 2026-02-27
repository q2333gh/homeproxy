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
	case "resources":
		return resourcesCommand(subArgs)
	case "acl":
		return aclCommand(subArgs)
	case "cert":
		return certCommand(subArgs)
	case "generator":
		return generatorCommand(subArgs)
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
        rules               Show routing rules
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
    log clean [type]     Clear log file
    
    control <action>     Service control
        start              Start HomeProxy
        stop               Stop HomeProxy
        restart            Restart HomeProxy
        status             Show service status
    
    features             Show sing-box features
    
    resources <action>   Resource management
        version [type]   Show resource version (china_ip4, china_ip6, china_list, gfw_list)
        update <type>    Update resource
    
    acl <action>        ACL list management
        list <type>     List direct_list or proxy_list content
        write <type> --file <path>  Write ACL from file
    
    cert write <filename> --file <path>  Write certificate (client_ca, server_publickey, server_privatekey)
    
    generator <type> [params]  Generate keys (uuid, reality-keypair, wg-keypair, vapid-keypair, ech-keypair)

Options:
    -h, --help           Show this help
`)
}

