import { toPagePath } from '../../../runtime/router.js';
import { adminBase } from '../../../runtime/menu.js';

/*
 * Addresses the Dashboard's data gives: admin links are paths relative to `wp-admin/` (as
 * WordPress resolves them, `network/…` and `user/…` for the other admins), other links are
 * absolute. A relative path becomes an address of the admin site, on the site shown, which the
 * router opens (Ruling Q6: the router's own address convention, not a WordPress decision).
 */

const ABSOLUTE = /^(?:[a-z][a-z0-9+.-]*:|\/)/i;

/**
 * The address of a link of the Dashboard's data.
 *
 * @param {string} path  Path relative to `wp-admin/`, or an absolute URL or path.
 * @param {object} where Location (`pathname`); default the document's.
 * @return {string} The address, or '' for none.
 */
export function adminHref( path, where = globalThis.location ?? { pathname: '/wp-admin/', search: '' } ) {
	if ( typeof path !== 'string' || path === '' ) {
		return '';
	}
	if ( ABSOLUTE.test( path ) ) {
		return path;
	}
	return adminBase( toPagePath( where ).siteId ) + path;
}

/** The core widgets and the contracts that render them; any other box is a plugin's. */
export const WIDGET_CONTRACTS = Object.freeze( {
	dashboard_browser_nag: 'core/dashboard-browser-nag',
	dashboard_php_nag: 'core/dashboard-php-nag',
	dashboard_site_health: 'core/dashboard-site-health',
	dashboard_right_now: 'core/dashboard-at-a-glance',
	network_dashboard_right_now: 'core/dashboard-network-right-now',
	dashboard_activity: 'core/dashboard-activity',
	dashboard_recent_comments: 'core/dashboard-recent-comments',
	dashboard_quick_press: 'core/dashboard-quick-draft',
	dashboard_primary: 'core/dashboard-events-news',
} );

/** The contract of a core widget, or null. */
export const widgetContract = ( id ) => ( Object.hasOwn( WIDGET_CONTRACTS, id ) ? WIDGET_CONTRACTS[ id ] : null );
