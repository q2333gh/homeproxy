count code lines:  
```bash
cloc . --exclude-dir=sing-box-ref,.git,.cursor,terminals --git --timeout 0 \
> cloc.md 2>&1 || echo 'CLOC_MISSING' >> cloc.md
```



original home-proxy creators info: 
TODO:
- Subscription page slow response with a large number of nodes
- Refactor nft rules
- Move ACL settings to a dedicated page
- Any other improvements
