/*
 * SPDX-License-Identifier: GPL-2.0-only
 *
 * Copyright (C) 2022-2025 ImmortalWrt.org
 */

'use strict';
'require rpc';
'require uci';
'require validation';

const callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: ['name'],
	expect: { '': {} }
});

const callReadDomainList = rpc.declare({
	object: 'luci.homeproxy',
	method: 'acllist_read',
	params: ['type'],
	expect: { '': {} }
});

const callWriteDomainList = rpc.declare({
	object: 'luci.homeproxy',
	method: 'acllist_write',
	params: ['type', 'content'],
	expect: { '': {} }
});

function getServiceStatus() {
	return L.resolveDefault(callServiceList('homeproxy'), {}).then((res) => {
		let isRunning = false;
		try {
			isRunning = res['homeproxy']['instances']['sing-box-c']['running'];
		} catch (e) { }
		return isRunning;
	});
}

function renderStatus(isRunning, version) {
	let spanTemp = '<em><span style="color:%s"><strong>%s (sing-box v%s) %s</strong></span></em>';
	let renderHTML;
	if (isRunning)
		renderHTML = spanTemp.format('green', _('HomeProxy'), version, _('RUNNING'));
	else
		renderHTML = spanTemp.format('red', _('HomeProxy'), version, _('NOT RUNNING'));

	return renderHTML;
}

let stubValidator = {
	factory: validation,
	apply(type, value, args) {
		if (value != null)
			this.value = value;

		return validation.types[type].apply(this, args);
	},
	assert(condition) {
		return !!condition;
	}
};

function validateDnsServer(option, section_id, value, allowIPv6ByConfig) {
	if (section_id && !['wan'].includes(value)) {
		if (!value)
			return _('Expecting: %s').format(_('non-empty value'));

		let allowIPv6 = !allowIPv6ByConfig;
		if (allowIPv6ByConfig)
			allowIPv6 = option.section.formvalue(section_id, 'ipv6_support') === '1';

		try {
			let url = new URL(value.replace(/^.*:\/\//, 'http://'));
			if (stubValidator.apply('hostname', url.hostname))
				return true;
			else if (stubValidator.apply('ip4addr', url.hostname))
				return true;
			else if (allowIPv6 && stubValidator.apply('ip6addr', url.hostname.match(/^\[(.+)\]$/)?.[1]))
				return true;
			else
				return _('Expecting: %s').format(_('valid DNS server address'));
		} catch (e) { }

		if (!stubValidator.apply(allowIPv6 ? 'ipaddr' : 'ip4addr', value))
			return _('Expecting: %s').format(_('valid DNS server address'));
	}

	return true;
}

function bindDomainListOption(option, listType) {
	option.load = function () {
		return L.resolveDefault(callReadDomainList(listType)).then((res) => {
			return res.content;
		}, {});
	};

	option.write = function (_section_id, value) {
		return callWriteDomainList(listType, value);
	};

	option.remove = function () {
		let routing_mode = this.section.formvalue('config', 'routing_mode');
		if (routing_mode !== 'custom')
			return callWriteDomainList(listType, '');
		return true;
	};

	option.validate = function (section_id, value) {
		if (section_id && value)
			for (let i of value.split('\n'))
				if (i && !stubValidator.apply('hostname', i))
					return _('Expecting: %s').format(_('valid hostname'));

		return true;
	};

	return option;
}

function bindSectionListLoad(option, uciconfig, sectionType, baseValues, predicate) {
	option.load = function (section_id) {
		delete this.keylist;
		delete this.vallist;

		for (let item of (baseValues || []))
			this.value(item.value, item.label);

		uci.sections(uciconfig, sectionType, (res) => {
			if (!predicate || predicate(res, section_id))
				this.value(res['.name'], res.label);
		});

		return this.super('load', section_id);
	};

	return option;
}

function bindEnabledDnsServerLoad(option, uciconfig, baseValues, predicate) {
	return bindSectionListLoad(option, uciconfig, 'dns_server', baseValues, (res, section_id) => {
		return res.enabled === '1' && (!predicate || predicate(res, section_id));
	});
}

function bindEnabledRoutingNodeLoad(option, uciconfig, baseValues, predicate) {
	return bindSectionListLoad(option, uciconfig, 'routing_node', baseValues, (res, section_id) => {
		return res.enabled === '1' && (!predicate || predicate(res, section_id));
	});
}

function bindEnabledRuleSetLoad(option, uciconfig) {
	return bindSectionListLoad(option, uciconfig, 'ruleset', [], (res) => res.enabled === '1');
}

return {
	callReadDomainList,
	callWriteDomainList,
	bindDomainListOption,
	bindEnabledDnsServerLoad,
	bindEnabledRoutingNodeLoad,
	bindEnabledRuleSetLoad,
	bindSectionListLoad,
	getServiceStatus,
	renderStatus,
	stubValidator,
	validateDnsServer
};
