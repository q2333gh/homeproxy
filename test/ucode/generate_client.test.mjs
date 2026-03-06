import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('root/etc/homeproxy/scripts/generate_client.uc', 'utf8');

test('generate_client proxy_mode guards keep redirect/tproxy/tun branches intact', () => {
  assert.match(source, /if \(match\(proxy_mode, \/redirect\/\)\)/);
  assert.match(source, /if \(match\(proxy_mode, \/tproxy\/\)\)/);
  assert.match(source, /if \(match\(proxy_mode, \/tun\/\)\)/);

  assert.doesNotMatch(source, /if \(match\(proxy_mode\), \/tproxy\/\)/);
  assert.doesNotMatch(source, /if \(match\(proxy_mode\), \/tun\/\)/);
});

test('generate_client still emits dedicated redirect, tproxy and tun inbounds', () => {
  assert.match(source, /type: 'redirect'/);
  assert.match(source, /type: 'tproxy'/);
  assert.match(source, /type: 'tun'/);
  assert.match(source, /tag: 'redirect-in'/);
  assert.match(source, /tag: 'tproxy-in'/);
  assert.match(source, /tag: 'tun-in'/);
});

test('generate_client builds explicit context before assembling config', () => {
  assert.match(source, /function build_context\(\)/);
  assert.match(source, /const ctx = build_context\(\);/);
  assert.match(source, /const routing_mode = ctx\.routing_mode,/);
});
