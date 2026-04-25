package main

import (
	"context"
	"crypto/tls"
	"flag"
	"fmt"
	"net"
	"net/http"
	"sort"
	"sync"
	"time"
)

type hostResult struct {
	Host        string
	HTTPCode    int
	HTTPSCode   int
	HTTPReach   bool
	HTTPSReach  bool
	AnyReach    bool
	AnyURL      string
	ProbeErrMsg string
}

func main() {
	timeout := flag.Duration("timeout", 1200*time.Millisecond, "single request timeout")
	concurrency := flag.Int("concurrency", 4096, "max concurrent hosts")
	start3rd := flag.Int("start", 0, "3rd octet start")
	end3rd := flag.Int("end", 255, "3rd octet end")
	flag.Parse()

	if *start3rd < 0 || *start3rd > 255 || *end3rd < 0 || *end3rd > 255 || *start3rd > *end3rd {
		fmt.Println("invalid range: start/end must be within [0,255] and start <= end")
		return
	}
	if *concurrency < 1 {
		fmt.Println("invalid concurrency: must be >= 1")
		return
	}

	tr := &http.Transport{
		DialContext: (&net.Dialer{
			Timeout: *timeout,
		}).DialContext,
		TLSClientConfig:     &tls.Config{InsecureSkipVerify: true},
		TLSHandshakeTimeout: *timeout,
		DisableKeepAlives:   true,
	}
	client := &http.Client{
		Transport: tr,
		Timeout:   *timeout,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 1 {
				return http.ErrUseLastResponse
			}
			return nil
		},
	}

	var wg sync.WaitGroup
	sem := make(chan struct{}, *concurrency)
	results := make(chan hostResult, 1<<16)

	startTime := time.Now()
	totalHosts := (*end3rd - *start3rd + 1) * 256
	fmt.Printf("Scanning 192.168.%d-%d.0/24, total hosts: %d, concurrency: %d, timeout: %s\n",
		*start3rd, *end3rd, totalHosts, *concurrency, timeout.String())

	for i := *start3rd; i <= *end3rd; i++ {
		for j := 0; j <= 255; j++ {
			host := fmt.Sprintf("192.168.%d.%d", i, j)
			wg.Add(1)
			sem <- struct{}{}
			go func(h string) {
				defer wg.Done()
				defer func() { <-sem }()
				results <- probeHost(client, h)
			}(host)
		}
	}

	go func() {
		wg.Wait()
		close(results)
	}()

	var all []hostResult
	var reachables []hostResult
	for r := range results {
		all = append(all, r)
		if r.AnyReach {
			reachables = append(reachables, r)
		}
	}

	sort.Slice(reachables, func(i, j int) bool {
		return reachables[i].Host < reachables[j].Host
	})

	elapsed := time.Since(startTime)
	fmt.Printf("\nDone in %s\n", elapsed.Round(time.Millisecond))
	fmt.Printf("Reachable hosts: %d / %d\n", len(reachables), len(all))
	if len(reachables) == 0 {
		fmt.Println("No reachable web hosts found in scanned range.")
		return
	}

	fmt.Println("\nReachable list:")
	for _, r := range reachables {
		fmt.Printf("- %-15s reachable via %-22s (http:%d https:%d)\n", r.Host, r.AnyURL, r.HTTPCode, r.HTTPSCode)
	}
}

func probeHost(client *http.Client, host string) hostResult {
	r := hostResult{Host: host}
	ctx := context.Background()

	httpURL := "http://" + host
	req1, _ := http.NewRequestWithContext(ctx, http.MethodGet, httpURL, nil)
	resp1, err1 := client.Do(req1)
	if err1 == nil {
		r.HTTPReach = true
		r.HTTPCode = resp1.StatusCode
		r.AnyReach = true
		r.AnyURL = httpURL
		resp1.Body.Close()
	}

	httpsURL := "https://" + host
	req2, _ := http.NewRequestWithContext(ctx, http.MethodGet, httpsURL, nil)
	resp2, err2 := client.Do(req2)
	if err2 == nil {
		r.HTTPSReach = true
		r.HTTPSCode = resp2.StatusCode
		if !r.AnyReach {
			r.AnyReach = true
			r.AnyURL = httpsURL
		}
		resp2.Body.Close()
	}

	if err1 != nil && err2 != nil {
		r.ProbeErrMsg = "http/https both failed"
	}

	return r
}
