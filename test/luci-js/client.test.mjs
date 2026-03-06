import test from 'node:test';
import assert from 'node:assert/strict';

import { loadLuciModule } from './load-luci-module.mjs';

function createValidationStub() {
  return {
    types: {
      hostname() {
        return /^[a-z0-9.-]+$/i.test(this.value || '');
      },
      ip4addr() {
        return /^(\d{1,3}\.){3}\d{1,3}$/.test(this.value || '');
      },
      ip6addr() {
        return /:/.test(this.value || '');
      },
      ipaddr() {
        return /^(\d{1,3}\.){3}\d{1,3}$/.test(this.value || '') || /:/.test(this.value || '');
      },
      port() {
        return /^\d+$/.test(this.value || '');
      },
      portrange() {
        return /^\d+:\d+$/.test(this.value || '');
      },
    },
  };
}

function createClientModule(sectionsFixture) {
  const rpc = {
    declare() {
      return async () => ({});
    },
  };
  const uci = {
    sections(_config, sectionType, cb) {
      for (const item of sectionsFixture[sectionType] || []) {
        cb(item);
      }
    },
  };

  return loadLuciModule('htdocs/luci-static/resources/homeproxy/client.js', {
    rpc,
    uci,
    validation: createValidationStub(),
  });
}

function createOption() {
  return {
    values: [],
    value(value, label) {
      this.values.push([value, label]);
    },
    super(name, sectionId) {
      return { name, sectionId };
    },
  };
}

test('client semantic loaders only expose enabled entries', () => {
  const client = createClientModule({
    dns_server: [
      { '.name': 'dns1', label: 'DNS 1', enabled: '1' },
      { '.name': 'dns2', label: 'DNS 2', enabled: '0' },
    ],
    routing_node: [
      { '.name': 'node1', label: 'Node 1', enabled: '1' },
      { '.name': 'node2', label: 'Node 2', enabled: '0' },
      { '.name': 'self', label: 'Self', enabled: '1' },
    ],
    ruleset: [
      { '.name': 'ruleset1', label: 'Rule 1', enabled: '1' },
      { '.name': 'ruleset2', label: 'Rule 2', enabled: '0' },
    ],
  });

  const dnsOption = createOption();
  client.bindEnabledDnsServerLoad(dnsOption, 'homeproxy', [
    ['default-dns', 'Default DNS'],
  ].map(([value, label]) => ({ value, label })));
  dnsOption.load('config');
  assert.deepEqual(dnsOption.values, [
    ['default-dns', 'Default DNS'],
    ['dns1', 'DNS 1'],
  ]);

  const nodeOption = createOption();
  client.bindEnabledRoutingNodeLoad(nodeOption, 'homeproxy', [], (res, sectionId) => res['.name'] !== sectionId);
  nodeOption.load('self');
  assert.deepEqual(nodeOption.values, [
    ['node1', 'Node 1'],
  ]);

  const rulesetOption = createOption();
  client.bindEnabledRuleSetLoad(rulesetOption, 'homeproxy');
  rulesetOption.load('config');
  assert.deepEqual(rulesetOption.values, [
    ['ruleset1', 'Rule 1'],
  ]);
});

test('client dns validation respects ipv6 toggle', () => {
  const client = createClientModule({});
  const option = {
    section: {
      formvalue(_sectionId, key) {
        if (key === 'ipv6_support') {
          return '0';
        }
        return '0';
      },
    },
  };

  assert.equal(
    client.validateDnsServer(option, 'config', '1.1.1.1', true),
    true
  );
  assert.match(
    client.validateDnsServer(option, 'config', '[2001:db8::1]', true),
    /valid DNS server address/
  );

  option.section.formvalue = () => '1';
  assert.equal(
    client.validateDnsServer(option, 'config', 'tls://[2001:db8::1]', true),
    true
  );
});
