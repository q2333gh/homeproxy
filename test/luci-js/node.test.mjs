import test from 'node:test';
import assert from 'node:assert/strict';

import { loadLuciModule } from './load-luci-module.mjs';

function createHpStub() {
  return {
    calcStringMD5(label) {
      return `md5:${label}`;
    },
    decodeBase64Str(value) {
      return Buffer.from(value, 'base64').toString('utf8');
    },
    shadowsocks_encrypt_methods: ['aes-128-gcm', 'chacha20-poly1305'],
  };
}

function createFeatures(overrides = {}) {
  return {
    with_quic: true,
    with_utls: true,
    ...overrides,
  };
}

test('node parser normalizes vmess ws links', () => {
  const hp = createHpStub();
  const parser = loadLuciModule(
    'htdocs/luci-static/resources/homeproxy/node_parser.js',
    { hp }
  );

  const payload = Buffer.from(JSON.stringify({
    v: '2',
    ps: 'demo',
    add: '[2001:db8::1]',
    port: '443',
    id: 'uuid-demo',
    aid: '0',
    net: 'ws',
    host: 'cdn.example.com',
    path: '/ws?ed=2048',
    tls: 'tls',
    sni: 'edge.example.com',
    alpn: 'h2,http/1.1',
    fp: 'chrome',
  })).toString('base64');

  const config = parser.parseShareLink(`vmess://${payload}`, createFeatures());

  assert.equal(config.type, 'vmess');
  assert.equal(config.address, '2001:db8::1');
  assert.equal(config.ws_path, '/ws');
  assert.equal(config.websocket_early_data, '2048');
  assert.equal(config.websocket_early_data_header, 'Sec-WebSocket-Protocol');
  assert.deepEqual(config.tls_alpn, ['h2', 'http/1.1']);
});

test('node parser rejects unsupported protocols by feature gate', () => {
  const hp = createHpStub();
  const parser = loadLuciModule(
    'htdocs/luci-static/resources/homeproxy/node_parser.js',
    { hp }
  );

  const config = parser.parseShareLink(
    'hy2://password@example.com:443#demo',
    createFeatures({ with_quic: false })
  );

  assert.equal(config, null);
});

test('node parser handles shadowsocks SIP002 links', () => {
  const hp = createHpStub();
  const parser = loadLuciModule(
    'htdocs/luci-static/resources/homeproxy/node_parser.js',
    { hp }
  );

  const userinfo = Buffer.from('aes-128-gcm:secret@server.example.com:8388').toString('base64');
  const config = parser.parseShareLink(
    `ss://${userinfo}#edge`,
    createFeatures()
  );

  assert.equal(config.type, 'shadowsocks');
  assert.equal(config.address, 'server.example.com');
  assert.equal(config.password, 'secret');
  assert.equal(config.label, 'edge');
});

test('node import helpers dedupe links and apply defaults', () => {
  const hp = createHpStub();
  const nodeparser = loadLuciModule(
    'htdocs/luci-static/resources/homeproxy/node_parser.js',
    { hp }
  );
  const writes = [];
  const uci = {
    add(_config, sectionType, nameHash) {
      writes.push(['add', sectionType, nameHash]);
      return `sid:${nameHash}`;
    },
    set(config, sid, key, value) {
      writes.push(['set', config, sid, key, value]);
    },
  };
  const importer = loadLuciModule(
    'htdocs/luci-static/resources/homeproxy/node_import.js',
    {
      hp,
      nodeparser,
      uci,
      ui: {},
    }
  );

  assert.deepEqual(
    importer.dedupeShareLinks('a\nb\na\n\n'),
    ['a', 'b']
  );

  const imported = importer.importShareLinks(
    'homeproxy',
    [
      'https://user:pass@example.com:8443#node1',
      'https://user:pass@example.com:8443#node1',
      `vmess://${Buffer.from(JSON.stringify({
        v: '2',
        ps: 'vmess-1',
        add: 'vmess.example.com',
        port: '443',
        id: 'uuid-demo',
        aid: '0',
        net: 'tcp',
        type: 'none',
        tls: 'tls',
        host: '',
        path: '',
      })).toString('base64')}`,
    ],
    createFeatures(),
    {
      allow_insecure: '1',
      packet_encoding: 'xudp',
    }
  );

  assert.equal(imported, 3);
  assert.ok(writes.some((entry) => entry.includes('tls_insecure')));
  assert.ok(writes.some((entry) => entry.includes('packet_encoding')));
});
