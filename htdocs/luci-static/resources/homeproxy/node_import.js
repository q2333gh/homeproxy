/*
 * SPDX-License-Identifier: GPL-2.0-only
 *
 * Copyright (C) 2022-2025 ImmortalWrt.org
 */

'use strict';
'require homeproxy as hp';
'require homeproxy.node_parser as nodeparser';
'require uci';
'require ui';

function dedupeShareLinks(input) {
	let lines = input.trim().split('\n');
	return lines.reduce((result, line) => {
		if (line && !result.includes(line))
			result.push(line);
		return result;
	}, []);
}

function applyImportDefaults(config, defaults) {
	let normalized = Object.assign({}, config);

	if (normalized.tls === '1' && defaults.allow_insecure === '1')
		normalized.tls_insecure = '1';
	if (['vless', 'vmess'].includes(normalized.type))
		normalized.packet_encoding = defaults.packet_encoding;

	return normalized;
}

function addNodeConfig(uciconfig, config) {
	let nameHash = hp.calcStringMD5(config.label);
	let sid = uci.add(uciconfig, 'node', nameHash);

	Object.keys(config).forEach((key) => {
		uci.set(uciconfig, sid, key, config[key]);
	});
}

function importShareLinks(uciconfig, input_links, features, defaults) {
	let imported_node = 0;

	input_links.forEach((link) => {
		let config = nodeparser.parseShareLink(link, features);
		if (!config)
			return;

		addNodeConfig(uciconfig, applyImportDefaults(config, defaults));
		imported_node++;
	});

	return imported_node;
}

function renderImportResult(imported_node, total) {
	if (imported_node === 0)
		ui.addNotification(null, E('p', _('No valid share link found.')));
	else
		ui.addNotification(null, E('p', _('Successfully imported %s nodes of total %s.').format(
			imported_node, total)));
}

function refreshImportSection(section) {
	return uci.save()
		.then(L.bind(section.map.load, section.map))
		.then(L.bind(section.map.reset, section.map))
		.then(L.ui.hideModal)
		.catch(() => {});
}

function handleImportSubmit(section, textarea, data, features) {
	let input_links = dedupeShareLinks(textarea.getValue());
	if (!input_links.length)
		return ui.hideModal();

	let defaults = {
		allow_insecure: uci.get(data[0], 'subscription', 'allow_insecure'),
		packet_encoding: uci.get(data[0], 'subscription', 'packet_encoding')
	};
	let imported_node = importShareLinks(data[0], input_links, features, defaults);

	renderImportResult(imported_node, input_links.length);
	return refreshImportSection(section);
}

function handleLinkImport(section, data, features) {
	let textarea = new ui.Textarea();
	ui.showModal(_('Import share links'), [
		E('p', _('Support Hysteria, Shadowsocks, Trojan, v2rayN (VMess), and XTLS (VLESS) online configuration delivery standard.')),
		textarea.render(),
		E('div', { class: 'right' }, [
			E('button', {
				class: 'btn',
				click: ui.hideModal
			}, [ _('Cancel') ]),
			'',
			E('button', {
				class: 'btn cbi-button-action',
				click: ui.createHandlerFn(section, () => handleImportSubmit(section, textarea, data, features))
			}, [ _('Import') ])
		])
	]);
}

return {
	addNodeConfig,
	applyImportDefaults,
	dedupeShareLinks,
	handleImportSubmit,
	handleLinkImport,
	importShareLinks,
	refreshImportSection,
	renderImportResult
};
