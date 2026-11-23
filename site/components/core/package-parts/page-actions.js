import { ref } from 'vue';
import { adminHref } from '../dashboard-parts/links.js';
import { announce } from './events.js';

/*
 * What the package pages (Plugins, Add Plugins, and the theme pages) do alike around their queue:
 * open an admin path through the router, hold the information dialog's state, read the classic
 * error page a fatal answer leads to, and announce the jobs a cancelled credentials dialog drops,
 * once each, as updates.js does (package-parts/events.js). What a job means on a page (its rows or
 * cards, its texts) stays the page's; so does reading the information (`plugins/information`),
 * which themes do not have.
 */

/** The admin API namespace the package pages post to. */
export const ROUTE = 'wp-admin/v1/';

// The error a write answers when the code it ran fatally failed, by package type, with the classic
// error page in `data.redirect` (plugins.php?error=true…, themes.php?error=resuming…).
const FATAL_CODES = Object.freeze( { plugin: 'plugin_activation_fatal', theme: 'theme_resume_fatal' } );

/**
 * Where a fatal answer leads: its classic error page as a router target, or null for any other
 * error. Pure.
 *
 * @param {object} error The API error.
 * @param {string} type  The package type: `plugin` or `theme`.
 * @return {{redirect: string, location: string|null}|null} The target.
 */
export function fatalTarget( error, type ) {
	const code = FATAL_CODES[ type ];
	return code && error?.code === code && typeof error.data?.redirect === 'string' ? { redirect: error.data.redirect, location: error.data.location ?? null } : null;
}

/**
 * The shared actions of a package page. Call it in the page's `setup()`.
 *
 * @param {object} options
 * @param {object|null} options.router The router the page is given (useListPage()).
 * @param {() => object} [options.where] The location of the page shown (useListPage()'s `where`).
 *        Default the document's.
 * @param {string} [options.type] The package type: `plugin` (default) or `theme`.
 * @return {{navigate: Function, openDetails: Function, details: import('vue').Ref<object|null>, fatalTarget: Function, announceDropped: Function}}
 *         `navigate( path, options )` opens an admin path (relative to `wp-admin/`) on the site
 *         shown through the router, with the router's options, or loads it without a router;
 *         `openDetails( slug, section )` opens the information dialog (`details`: `{ slug,
 *         section, key }`, a new key each time) on a section, Description by default;
 *         `fatalTarget( error )` is fatalTarget() for the type; `announceDropped( jobs, slugOf )`
 *         announces `credential-modal-cancel` once per dropped job, its body given the slug
 *         `slugOf( job )` names (default the job's key).
 */
export function usePackagePage( { router, where = () => globalThis.location, type = 'plugin' } ) {
	const details = ref( null );
	let detailsKey = 0;

	function navigate( path, options ) {
		const url = adminHref( path, where() ?? undefined );
		if ( router?.navigate ) {
			return options ? router.navigate( url, options ) : router.navigate( url );
		}
		globalThis.location?.assign?.( url );
		return Promise.resolve();
	}

	function openDetails( slug, section = 'description' ) {
		if ( typeof slug === 'string' && slug !== '' ) {
			details.value = { slug, section: typeof section === 'string' && section !== '' ? section : 'description', key: ++detailsKey };
		}
	}

	function announceDropped( jobs, slugOf = ( job ) => job.key ) {
		for ( const job of jobs ) {
			// As updates.js queued it: `{ action, data }` (classicJob()), once per job.
			announce( 'credential-modal-cancel', { ...job, body: { ...job.body, slug: slugOf( job ) } }, type );
		}
	}

	return { navigate, openDetails, details, fatalTarget: ( error ) => fatalTarget( error, type ), announceDropped };
}
