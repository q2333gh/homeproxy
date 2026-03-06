/*
 * SPDX-License-Identifier: GPL-2.0-only
 *
 * Copyright (C) 2022-2025 ImmortalWrt.org
 */

'use strict';
'require homeproxy as hp';

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

const shareLinkParsers = {
	anytls: (uri) => parseAnyTLSLink(new URL('http://' + uri)),
	http: (uri) => parseHttpLink(new URL('http://' + uri), 'http'),
	https: (uri) => parseHttpLink(new URL('http://' + uri), 'https'),
	hysteria: (uri, features) => parseHysteriaLink(new URL('http://' + uri), features),
	hysteria2: (uri, features) => parseHysteria2Link(new URL('http://' + uri), features),
	hy2: (uri, features) => parseHysteria2Link(new URL('http://' + uri), features),
	socks: (uri) => parseSocksLink(new URL('http://' + uri), 'socks'),
	socks4: (uri) => parseSocksLink(new URL('http://' + uri), 'socks4'),
	socks4a: (uri) => parseSocksLink(new URL('http://' + uri), 'socks4a'),
	socsk5: (uri) => parseSocksLink(new URL('http://' + uri), 'socsk5'),
	socks5h: (uri) => parseSocksLink(new URL('http://' + uri), 'socks5h'),
	ss: (uri) => parseShadowsocksLink(uri),
	trojan: (uri) => parseTrojanLink(new URL('http://' + uri)),
	tuic: (uri) => parseTuicLink(new URL('http://' + uri)),
	vless: (uri, features) => parseVlessLink(new URL('http://' + uri), features),
	vmess: (uri, features) => parseVmessLink(uri, features)
};

function parseShareLinkByScheme(scheme, uri, features) {
	let parser = shareLinkParsers[scheme];
	return parser ? parser(uri, features) : null;
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

return {
	fillWSConfig,
	normalizeParsedConfig,
	parseShareLink,
	parseShareLinkByScheme,
	shareLinkParsers
};
