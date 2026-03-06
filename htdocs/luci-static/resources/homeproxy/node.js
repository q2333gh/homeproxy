/*
 * SPDX-License-Identifier: GPL-2.0-only
 *
 * Copyright (C) 2022-2025 ImmortalWrt.org
 */

'use strict';
'require homeproxy as hp';
'require uci';
'require ui';

function allowInsecureConfirm(ev, _section_id, value) {
	if (value === '1' && !confirm(_('Are you sure to allow insecure?')))
		ev.target.firstElementChild.checked = null;
}

function fillWSConfig(config, path) {
	config.ws_path = path;
	if (config.ws_path && config.ws_path.includes('?ed=')) {
		config.websocket_early_data_header = 'Sec-WebSocket-Protocol';
		config.websocket_early_data = config.ws_path.split('?ed=')[1];
		config.ws_path = config.ws_path.split('?ed=')[0];
	}
}

function parseAnyTLSLink(url) {
	let params = url.searchParams;

	if (!url.username)
		return null;

	return {
		label: url.hash ? decodeURIComponent(url.hash.slice(1)) : null,
		type: 'anytls',
		address: url.hostname,
		port: url.port || '80',
		password: url.username ? decodeURIComponent(url.username) : null,
		tls: '1',
		tls_sni: params.get('sni'),
		tls_insecure: (params.get('insecure') === '1') ? '1' : '0'
	};
}

function parseHttpLink(url, scheme) {
	return {
		label: url.hash ? decodeURIComponent(url.hash.slice(1)) : null,
		type: 'http',
		address: url.hostname,
		port: url.port || '80',
		username: url.username ? decodeURIComponent(url.username) : null,
		password: url.password ? decodeURIComponent(url.password) : null,
		tls: (scheme === 'https') ? '1' : '0'
	};
}

function parseHysteriaLink(url, features) {
	let params = url.searchParams;

	if (!features.with_quic || (params.get('protocol') && params.get('protocol') !== 'udp'))
		return null;

	return {
		label: url.hash ? decodeURIComponent(url.hash.slice(1)) : null,
		type: 'hysteria',
		address: url.hostname,
		port: url.port || '80',
		hysteria_protocol: params.get('protocol') || 'udp',
		hysteria_auth_type: params.get('auth') ? 'string' : null,
		hysteria_auth_payload: params.get('auth'),
		hysteria_obfs_password: params.get('obfsParam'),
		hysteria_down_mbps: params.get('downmbps'),
		hysteria_up_mbps: params.get('upmbps'),
		tls: '1',
		tls_sni: params.get('peer'),
		tls_alpn: params.get('alpn'),
		tls_insecure: (params.get('insecure') === '1') ? '1' : '0'
	};
}

function parseHysteria2Link(url, features) {
	let params = url.searchParams;

	if (!features.with_quic)
		return null;

	return {
		label: url.hash ? decodeURIComponent(url.hash.slice(1)) : null,
		type: 'hysteria2',
		address: url.hostname,
		port: url.port || '80',
		password: url.username ? (
			decodeURIComponent(url.username + (url.password ? (':' + url.password) : ''))
		) : null,
		hysteria_obfs_type: params.get('obfs'),
		hysteria_obfs_password: params.get('obfs-password'),
		tls: '1',
		tls_sni: params.get('sni'),
		tls_insecure: params.get('insecure') ? '1' : '0'
	};
}

function parseSocksLink(url, scheme) {
	return {
		label: url.hash ? decodeURIComponent(url.hash.slice(1)) : null,
		type: 'socks',
		address: url.hostname,
		port: url.port || '80',
		username: url.username ? decodeURIComponent(url.username) : null,
		password: url.password ? decodeURIComponent(url.password) : null,
		socks_version: (scheme.includes('4')) ? '4' : '5'
	};
}

function parseShadowsocksLink(uri) {
	try {
		try {
			let suri = uri.split('#'), slabel = '';
			if (suri.length <= 2) {
				if (suri.length === 2)
					slabel = '#' + suri[1];
				uri = hp.decodeBase64Str(suri[0]) + slabel;
			}
		} catch (e) { }

		let url = new URL('http://' + uri);
		let userinfo;
		if (url.username && url.password) {
			userinfo = [url.username, decodeURIComponent(url.password)];
		} else if (url.username) {
			userinfo = hp.decodeBase64Str(decodeURIComponent(url.username)).split(':');
			if (userinfo.length > 1)
				userinfo = [userinfo[0], userinfo.slice(1).join(':')];
		}

		if (!userinfo || !hp.shadowsocks_encrypt_methods.includes(userinfo[0]))
			return null;

		let plugin, plugin_opts;
		if (url.search && url.searchParams.get('plugin')) {
			let plugin_info = url.searchParams.get('plugin').split(';');
			plugin = plugin_info[0];
			plugin_opts = (plugin_info.length > 1) ? plugin_info.slice(1).join(';') : null;
		}

		return {
			label: url.hash ? decodeURIComponent(url.hash.slice(1)) : null,
			type: 'shadowsocks',
			address: url.hostname,
			port: url.port || '80',
			shadowsocks_encrypt_method: userinfo[0],
			password: userinfo[1],
			shadowsocks_plugin: plugin,
			shadowsocks_plugin_opts: plugin_opts
		};
	} catch (e) {
		let legacy = uri.split('@');
		if (legacy.length < 2)
			return null;
		else if (legacy.length > 2)
			legacy = [legacy.slice(0, -1).join('@'), legacy.slice(-1).toString()];

		return {
			type: 'shadowsocks',
			address: legacy[1].split(':')[0],
			port: legacy[1].split(':')[1],
			shadowsocks_encrypt_method: legacy[0].split(':')[0],
			password: legacy[0].split(':').slice(1).join(':')
		};
	}
}

function parseTrojanLink(url) {
	let params = url.searchParams;

	if (!url.username)
		return null;

	let config = {
		label: url.hash ? decodeURIComponent(url.hash.slice(1)) : null,
		type: 'trojan',
		address: url.hostname,
		port: url.port || '80',
		password: decodeURIComponent(url.username),
		transport: params.get('type') !== 'tcp' ? params.get('type') : null,
		tls: '1',
		tls_sni: params.get('sni')
	};

	switch (params.get('type')) {
	case 'grpc':
		config.grpc_servicename = params.get('serviceName');
		break;
	case 'ws':
		config.ws_host = params.get('host') ? decodeURIComponent(params.get('host')) : null;
		fillWSConfig(config, params.get('path') ? decodeURIComponent(params.get('path')) : null);
		break;
	}

	return config;
}

function parseTuicLink(url) {
	let params = url.searchParams;

	if (!url.username)
		return null;

	return {
		label: url.hash ? decodeURIComponent(url.hash.slice(1)) : null,
		type: 'tuic',
		address: url.hostname,
		port: url.port || '80',
		uuid: url.username,
		password: url.password ? decodeURIComponent(url.password) : null,
		tuic_congestion_control: params.get('congestion_control'),
		tuic_udp_relay_mode: params.get('udp_relay_mode'),
		tls: '1',
		tls_sni: params.get('sni'),
		tls_alpn: params.get('alpn') ? decodeURIComponent(params.get('alpn')).split(',') : null
	};
}

function parseVlessLink(url, features) {
	let params = url.searchParams;

	if (params.get('type') === 'kcp')
		return null;
	else if (params.get('type') === 'quic' && ((params.get('quicSecurity') && params.get('quicSecurity') !== 'none') || !features.with_quic))
		return null;
	if (!url.username || !params.get('type'))
		return null;

	let config = {
		label: url.hash ? decodeURIComponent(url.hash.slice(1)) : null,
		type: 'vless',
		address: url.hostname,
		port: url.port || '80',
		uuid: url.username,
		transport: params.get('type') !== 'tcp' ? params.get('type') : null,
		tls: ['tls', 'xtls', 'reality'].includes(params.get('security')) ? '1' : '0',
		tls_sni: params.get('sni'),
		tls_alpn: params.get('alpn') ? decodeURIComponent(params.get('alpn')).split(',') : null,
		tls_reality: (params.get('security') === 'reality') ? '1' : '0',
		tls_reality_public_key: params.get('pbk') ? decodeURIComponent(params.get('pbk')) : null,
		tls_reality_short_id: params.get('sid'),
		tls_utls: features.with_utls ? params.get('fp') : null,
		vless_flow: ['tls', 'reality'].includes(params.get('security')) ? params.get('flow') : null
	};

	switch (params.get('type')) {
	case 'grpc':
		config.grpc_servicename = params.get('serviceName');
		break;
	case 'http':
	case 'tcp':
		if (config.transport === 'http' || params.get('headerType') === 'http') {
			config.http_host = params.get('host') ? decodeURIComponent(params.get('host')).split(',') : null;
			config.http_path = params.get('path') ? decodeURIComponent(params.get('path')) : null;
		}
		break;
	case 'httpupgrade':
		config.httpupgrade_host = params.get('host') ? decodeURIComponent(params.get('host')) : null;
		config.http_path = params.get('path') ? decodeURIComponent(params.get('path')) : null;
		break;
	case 'ws':
		config.ws_host = params.get('host') ? decodeURIComponent(params.get('host')) : null;
		fillWSConfig(config, params.get('path') ? decodeURIComponent(params.get('path')) : null);
		break;
	}

	return config;
}

function parseVmessLink(uri, features) {
	if (uri.includes('&'))
		return null;

	uri = JSON.parse(hp.decodeBase64Str(uri));

	if (uri.v != '2')
		return null;
	else if (uri.net === 'kcp')
		return null;
	else if (uri.net === 'quic' && ((uri.type && uri.type !== 'none') || !features.with_quic))
		return null;

	let config = {
		label: uri.ps,
		type: 'vmess',
		address: uri.add,
		port: uri.port,
		uuid: uri.id,
		vmess_alterid: uri.aid,
		vmess_encrypt: uri.scy || 'auto',
		transport: (uri.net !== 'tcp') ? uri.net : null,
		tls: uri.tls === 'tls' ? '1' : '0',
		tls_sni: uri.sni || uri.host,
		tls_alpn: uri.alpn ? uri.alpn.split(',') : null,
		tls_utls: features.with_utls ? uri.fp : null
	};

	switch (uri.net) {
	case 'grpc':
		config.grpc_servicename = uri.path;
		break;
	case 'h2':
	case 'tcp':
		if (uri.net === 'h2' || uri.type === 'http') {
			config.transport = 'http';
			config.http_host = uri.host ? uri.host.split(',') : null;
			config.http_path = uri.path;
		}
		break;
	case 'httpupgrade':
		config.httpupgrade_host = uri.host;
		config.http_path = uri.path;
		break;
	case 'ws':
		config.ws_host = uri.host;
		fillWSConfig(config, uri.path);
		break;
	}

	return config;
}

function parseShareLinkByScheme(scheme, uri, features) {
	switch (scheme) {
	case 'anytls':
		return parseAnyTLSLink(new URL('http://' + uri));
	case 'http':
	case 'https':
		return parseHttpLink(new URL('http://' + uri), scheme);
	case 'hysteria':
		return parseHysteriaLink(new URL('http://' + uri), features);
	case 'hysteria2':
	case 'hy2':
		return parseHysteria2Link(new URL('http://' + uri), features);
	case 'socks':
	case 'socks4':
	case 'socks4a':
	case 'socsk5':
	case 'socks5h':
		return parseSocksLink(new URL('http://' + uri), scheme);
	case 'ss':
		return parseShadowsocksLink(uri);
	case 'trojan':
		return parseTrojanLink(new URL('http://' + uri));
	case 'tuic':
		return parseTuicLink(new URL('http://' + uri));
	case 'vless':
		return parseVlessLink(new URL('http://' + uri), features);
	case 'vmess':
		return parseVmessLink(uri, features);
	default:
		return null;
	}
}

function normalizeParsedConfig(config) {
	if (!config || !config.address || !config.port)
		return null;
	else if (!config.label)
		config.label = config.address + ':' + config.port;

	config.address = config.address.replace(/\[|\]/g, '');
	return config;
}

function parseShareLink(uri, features) {
	let parsed = uri.split('://');
	if (!parsed[0] || !parsed[1])
		return null;

	return normalizeParsedConfig(parseShareLinkByScheme(parsed[0], parsed[1], features));
}

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
		let config = parseShareLink(link, features);
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
	allowInsecureConfirm,
	handleLinkImport,
	parseShareLink
};
