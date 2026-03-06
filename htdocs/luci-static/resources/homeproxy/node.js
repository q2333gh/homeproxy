/*
 * SPDX-License-Identifier: GPL-2.0-only
 *
 * Copyright (C) 2022-2025 ImmortalWrt.org
 */

'use strict';
'require homeproxy.node_import as nodeimport';
'require homeproxy.node_parser as nodeparser';

function allowInsecureConfirm(ev, _section_id, value) {
	if (value === '1' && !confirm(_('Are you sure to allow insecure?')))
		ev.target.firstElementChild.checked = null;
}

return {
	allowInsecureConfirm,
	applyImportDefaults: nodeimport.applyImportDefaults,
	dedupeShareLinks: nodeimport.dedupeShareLinks,
	handleImportSubmit: nodeimport.handleImportSubmit,
	handleLinkImport: nodeimport.handleLinkImport,
	importShareLinks: nodeimport.importShareLinks,
	parseShareLink: nodeparser.parseShareLink,
	parseShareLinkByScheme: nodeparser.parseShareLinkByScheme
};
