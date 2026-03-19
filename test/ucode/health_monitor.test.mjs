import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rpcSource = fs.readFileSync('root/usr/share/rpcd/ucode/luci.homeproxy', 'utf8');
const initSource = fs.readFileSync('root/etc/init.d/homeproxy', 'utf8');
const helperSource = fs.readFileSync('root/etc/homeproxy/scripts/connection_check.sh', 'utf8');
const configSource = fs.readFileSync('root/etc/config/homeproxy', 'utf8');
const statusSource = fs.readFileSync('htdocs/luci-static/resources/view/homeproxy/status.js', 'utf8');

test('connection_check uses shared helper instead of inline wget', () => {
  assert.match(rpcSource, /const CHECK_SCRIPT = `\$\{HP_DIR\}\/scripts\/connection_check\.sh`;/);
  assert.match(rpcSource, /function runConnectionCheck\(site\)/);
  assert.match(rpcSource, /return \{ result: runConnectionCheck\(req\.args\?\.site\) \};/);
  assert.doesNotMatch(rpcSource, /connection_check:[\s\S]*wget --spider/);
});

test('shared helper preserves wget google semantics', () => {
  assert.match(helperSource, /google\)/);
  assert.match(helperSource, /URL="https:\/\/www\.google\.com"/);
  assert.match(helperSource, /\/usr\/bin\/wget --spider -qT3/);
});

test('init script wires health monitor and clears runtime markers', () => {
  assert.match(initSource, /config_get_bool health_auto_shutdown "config" "health_auto_shutdown" "0"/);
  assert.match(initSource, /procd_open_instance "health-monitor"/);
  assert.match(initSource, /procd_set_param command \/usr\/bin\/homeproxy health-monitor/);
  assert.match(initSource, /rm -rf "\$HEALTH_LOCK_DIR"/);
  assert.match(initSource, /rm -f "\$HEALTH_SHUTDOWN_FILE"/);
});

test('default config and LuCI surface expose the auto shutdown toggle', () => {
  assert.match(configSource, /option health_auto_shutdown '0'/);
  assert.match(statusSource, /health_auto_shutdown/);
  assert.match(statusSource, /Retry in 2\/4\/8 seconds within a round/);
  assert.match(statusSource, /stop the full HomeProxy service after 3 failed rounds/);
});
