import { computed, inject, nextTick, onBeforeUnmount, provide, readonly, ref, shallowRef, toRef, watch } from 'vue';
import api from '@wp-admin/api';
import Contracted from '../../runtime/Contracted.js';
import { toPagePath } from '../../runtime/router.js';
import { loadPageNotices } from '../../runtime/page-notices.js';
import PageHost from '../../runtime/PageHost.js';
import { SlotOutlet } from '../../runtime/slots.js';
import { mergeHelp } from './help-tabs.js';

/**
 * Default implementation of core/frame: the admin bar, menu and notices, each
 * through its own contract so that a plugin can replace one of them alone,
 * and the page host. `wp-admin wp-core-ui` are the classes WordPress's admin
 * styles (buttons, notices, forms) expect on an ancestor.
 *
 * Provides `frameLayout` ({ set( 'default' | 'full' ) }) to the page: a page that
 * is a full-window application (a classic editor in core/legacy) asks for the full
 * layout, which adds `wp-admin-frame--full` and collapses the menu (`folded`, as in
 * the classic admin). The page sets it back to 'default' when it goes.
 *
 * Above the page, the Help panel (core/help-tabs) shows the page's help when it has any:
 * the tabs its module exports as `help` (which the page host passes on through `pageHelp`)
 * merged with the tabs plugins registered in PHP, which the router sends as `page.help`
 * (see mergeHelp() in help-tabs.js). Each page starts with the panel closed, as a classic
 * screen does. Provides `framePage` (a ref of the current page) so
 * that a help component can read the page's data.
 *
 * Next to the Help toggle, the Screen Options panel (core/screen-options) shows the page's
 * screen options when it has any. A page gives them with `screenOptions.set( { sections,
 * reordering, columns, onChange } )` (provided here), which returns a function that withdraws
 * them (core/meta-box-holder does both); `onChange( id, value )` receives the panel's changes.
 * A list page gives its table's options the same way (`tableColumns`, `pagination`, `viewMode`,
 * `settingsHtml`, and `tableColumnsLegend`) with `onApply( { perPage, mode } )` for the Apply button.
 * They are dropped when the path changes. While one of the two panels is open, the other's toggle
 * is hidden, as on a classic screen.
 *
 * Provides `speak( message )`, which announces a message to screen reader users through a
 * polite live region the frame holds (as wp.a11y.speak() does on a classic screen), without
 * showing it. The same message twice is announced twice.
 *
 * Each time the router answers a native page, the frame asks WordPress for the page's classic
 * admin notices (runtime/page-notices.js: what its `admin_notices` callbacks print) and adds them
 * to the notices service as page notices with `capturedNotices` (the service's addCaptured(),
 * which pages are not given), so that the page host withdraws them when the user
 * leaves the page; the same page answered again keeps those still printed and drops the others.
 * A hosted classic screen (core/legacy) prints its own. An answer for a page the user has left is
 * dropped. Nothing is added when there are none. Provides `pageNotices` ({ ready(), baseline() }):
 * ready() settles once the current page's notices are in the document, which the page host waits
 * for before it loads the page's screen assets, so that a screen script finds the notices, as on
 * a classic screen. core/notices is itself a contract, resolved asynchronously: ready() waits
 * until its implementation has been resolved and rendered (or has failed), not only until the
 * notices were added to the service. Whatever the notices request and core/notices do, ready()
 * settles no later than 5 seconds after the navigation started: a slow or hung request does not
 * hold the page's scripts. The request itself is given up after 30 seconds, or when the user
 * leaves the page; an answer that comes after ready() settled, but before then, is still shown.
 * baseline() gives the classic baseline scripts of the current page's notices answer (jQuery…,
 * see runtime/page-notices.js), or null, which the page host loads when the page's screen assets
 * cannot be had.
 *
 * Provides `frameChannel` ({ setMenuCounts( counts ), setTitle( title ) }, see the contract): the
 * menu counts a page's answers give override the manifest's for the menu items with those paths
 * that have a count bubble (see withMenuCounts()) until the next manifest; the title a page's answers give is the document title (the page host
 * reads it as `frameTitle`) until the page path changes.
 */

/**
 * The menu items with the counts of `counts` (`{ path: number }`) in place of theirs, for top-level
 * and submenu items alike. Only an item that has a count bubble (an integer `count`, as the classic
 * menu prints one, `count-0` included) takes its path's count: one without (the Comments submenu's
 * "All Comments", `edit-comments.php` too) never gets a bubble. Other items are returned as they
 * are. Pure.
 */
export function withMenuCounts( items, counts ) {
	const list = Array.isArray( items ) ? items : [];
	if ( ! counts || Object.keys( counts ).length === 0 ) {
		return list;
	}
	const counted = ( item ) => ( item && Number.isInteger( item.count ) && Object.hasOwn( counts, item.path ) ? { ...item, count: counts[ item.path ] } : item );
	return list.map( ( item ) => {
		const top = counted( item );
		return Array.isArray( top?.children ) ? { ...top, children: top.children.map( counted ) } : top;
	} );
}
export default {
	name: 'Frame',
	components: { Contracted, PageHost, SlotOutlet },
	props: {
		manifest: { type: Object, required: true },
		page: { type: Object, required: true },
		current: { type: String, required: true },
		base: { type: String, required: true },
		siteName: { type: String, default: '' },
		busy: { type: Boolean, default: false },
	},
	emits: [ 'sign-out' ],
	setup( props ) {
		const notices = inject( 'notices', null );
		const addCaptured = inject( 'capturedNotices', null );
		const dismiss = ( id ) => notices?.dismiss( id );
		const layout = ref( 'default' );
		provide( 'frameLayout', { set: ( value ) => {
			layout.value = value === 'full' ? 'full' : 'default';
		} } );
		const moduleHelp = shallowRef( null );
		const helpHidden = ref( false );
		provide( 'pageHelp', {
			set: ( help ) => {
				moduleHelp.value = help ?? null;
			},
			hide: ( hidden ) => {
				helpHidden.value = Boolean( hidden );
			},
		} );
		provide( 'framePage', toRef( props, 'page' ) );

		// Screen Options: what the page gave, until it withdraws them or the path changes.
		const screenOptions = shallowRef( null );
		const metaOpen = ref( '' ); // '' | 'help' | 'screen-options'
		provide( 'screenOptions', {
			set: ( options ) => {
				const mine = options && typeof options === 'object' ? { ...options } : null;
				screenOptions.value = mine;
				return () => {
					if ( screenOptions.value === mine ) {
						screenOptions.value = null;
					}
				};
			},
		} );
		// What the page's answers tell the frame: menu counts (until the next manifest) and the
		// document title (until the path changes).
		const menuCounts = shallowRef( {} );
		const title = ref( null );
		provide( 'frameTitle', readonly( title ) );
		provide( 'frameChannel', {
			setMenuCounts: ( counts ) => {
				if ( ! counts || typeof counts !== 'object' || Array.isArray( counts ) ) {
					return;
				}
				const valid = Object.entries( counts ).filter( ( [ path, count ] ) => path !== '' && Number.isInteger( count ) && count >= 0 );
				if ( valid.length > 0 ) {
					menuCounts.value = { ...menuCounts.value, ...Object.fromEntries( valid ) };
				}
			},
			setTitle: ( value ) => {
				title.value = typeof value === 'string' && value !== '' ? value : null;
			},
		} );
		watch( () => props.manifest, () => {
			menuCounts.value = {};
		} );
		const menuItems = computed( () => withMenuCounts( props.manifest.menu ?? [], menuCounts.value ) );

		watch( () => props.page.path, () => {
			screenOptions.value = null;
			metaOpen.value = '';
			title.value = null;
		} );
		const screenOptionsShown = computed( () => {
			const options = screenOptions.value;
			return Boolean( options ) && props.page.component !== 'core/legacy' && (
				( Array.isArray( options.sections ) && options.sections.length > 0 ) || typeof options.reordering === 'boolean' || Boolean( options.columns ) ||
				( Array.isArray( options.tableColumns ) && options.tableColumns.length > 0 ) || Boolean( options.pagination ) || Boolean( options.viewMode ) || Boolean( options.settingsHtml )
			);
		} );
		const onScreenOption = ( id, value ) => screenOptions.value?.onChange?.( id, value );
		const onScreenOptionsApply = ( value ) => screenOptions.value?.onApply?.( value );
		const onMetaToggle = ( which, open ) => {
			metaOpen.value = open ? which : '';
		};

		// The live region speak() writes to: emptied first, so that the same message is read again.
		const spoken = ref( '' );
		let lastSpoken = '';
		provide( 'speak', ( message ) => {
			let text = String( message ?? '' );
			if ( text === '' ) {
				return;
			}
			if ( text === lastSpoken ) {
				text += '\u00A0';
			}
			lastSpoken = text;
			spoken.value = '';
			nextTick( () => {
				spoken.value = text;
			} );
		} );

		// Settles once core/notices' implementation is resolved (then rendered on the next tick) or failed.
		let noticesShownOnce;
		const noticesMounted = new Promise( ( resolve ) => {
			noticesShownOnce = resolve;
		} );
		const onNoticesSettled = () => noticesShownOnce();
		// How long ready() waits at most, from the start of the navigation (ms); `noticesReadyTimeout` may be provided (tests).
		const noticesTimeout = inject( 'noticesReadyTimeout', 5000 );
		// How long the notices request may take before it is given up (ms): an answer that comes
		// after ready() settled, but before then, is still shown. `noticesRequestTimeout` may be provided (tests).
		const requestTimeout = inject( 'noticesRequestTimeout', 30000 );

		let ticket = 0;
		let captured = [];
		let request = null; // The AbortController of the current page's notices request.
		let baseline = null; // The classic baseline scripts of the current page's notices answer.
		async function addNotices( page, mine ) {
			const where = toPagePath( globalThis.location ?? { pathname: '/wp-admin/', search: '' } );
			const answer = notices && addCaptured ? await loadPageNotices( api, page, where.context, { timeout: requestTimeout, signal: request?.signal } ) : { notices: [], baseline: null };
			if ( mine !== ticket || ! notices || ! addCaptured ) {
				return;
			}
			baseline = answer.baseline;
			const ids = answer.notices.map( ( notice ) => addCaptured( { html: notice.html, assets: notice.assets } ) ).filter( Boolean );
			for ( const id of captured ) {
				if ( ! ids.includes( id ) ) {
					notices.dismiss( id );
				}
			}
			captured = ids;
			// Rendered: their markup is in the document, once core/notices itself is there.
			await noticesMounted;
			await nextTick();
		}
		function showNotices( page ) {
			const mine = ++ticket;
			request?.abort();
			request = globalThis.AbortController ? new globalThis.AbortController() : null;
			baseline = null;
			const shown = addNotices( page, mine ).catch( () => {} );
			// Waited for only so long from the start of the navigation, whatever the request or
			// core/notices do: a slow, hung or failed request must not hold the screen assets. A later
			// answer is still added when it comes.
			return Promise.race( [ shown, new Promise( ( resolve ) => {
				globalThis.setTimeout( resolve, noticesTimeout )?.unref?.();
			} ) ] );
		}
		// Settles once the current page's notices are in the document (or none came), or when the
		// wait is over: the page host loads the page's screen assets after them.
		let noticesShown = Promise.resolve();
		provide( 'pageNotices', { ready: () => noticesShown, baseline: () => baseline } );
		watch( () => props.page, ( page ) => {
			noticesShown = showNotices( page );
		}, { immediate: true } );
		onBeforeUnmount( () => {
			ticket++;
			request?.abort();
		} );
		const help = computed( () => ( helpHidden.value || props.page.component === 'core/legacy' ? { tabs: [], sidebar: null } : mergeHelp( moduleHelp.value, props.page.help, props.page ) ) );

		return { notices, dismiss, layout, help, menuItems, onNoticesSettled, screenOptions, screenOptionsShown, onScreenOption, onScreenOptionsApply, metaOpen, onMetaToggle, spoken };
	},
	template: `
		<div id="wpwrap" :class="[ 'wp-admin-frame', 'wp-admin', 'wp-core-ui', { 'wp-admin-frame--full': layout === 'full', folded: layout === 'full' } ]">
			<div id="wp-admin-speak" class="screen-reader-text" aria-live="polite" aria-relevant="additions text" aria-atomic="true">{{ spoken }}</div>
			<a class="screen-reader-shortcut" href="#wp-admin-page">{{ $__( 'Skip to main content', 'wp-admin-site' ) }}</a>
			<Contracted id="core/admin-bar" :user="manifest.user" :base="base" :site-name="siteName" @sign-out="$emit( 'sign-out' )" />
			<Contracted id="core/menu" :items="menuItems" :current="current" :base="base" />
			<div id="wpcontent">
				<div id="wpbody">
					<div id="wpbody-content">
						<div v-if="help.tabs.length > 0 || screenOptionsShown" :class="[ 'wp-admin-screen-meta', metaOpen ? 'wp-admin-screen-meta--' + metaOpen + '-open' : '' ]">
							<Contracted v-if="screenOptionsShown" :key="page.path" id="core/screen-options" :sections="Array.isArray( screenOptions.sections ) ? screenOptions.sections : []" :reordering="typeof screenOptions.reordering === 'boolean' ? screenOptions.reordering : null" :columns="screenOptions.columns ?? null" :table-columns="Array.isArray( screenOptions.tableColumns ) ? screenOptions.tableColumns : []" :pagination="screenOptions.pagination ?? null" :view-mode="screenOptions.viewMode ?? null" :settings-html="typeof screenOptions.settingsHtml === 'string' ? screenOptions.settingsHtml : null" :table-columns-legend="typeof screenOptions.tableColumnsLegend === 'string' ? screenOptions.tableColumnsLegend : null" @change="onScreenOption" @apply="onScreenOptionsApply" @toggle="onMetaToggle( 'screen-options', $event )" />
							<Contracted v-if="help.tabs.length > 0" :key="page.path" id="core/help-tabs" :tabs="help.tabs" :sidebar="help.sidebar" @toggle="onMetaToggle( 'help', $event )" />
						</div>
						<SlotOutlet name="before-content" :context="{ page }" />
						<Contracted id="core/notices" :notices="notices ? notices.items : []" @dismiss="dismiss" @resolved="onNoticesSettled" @failed="onNoticesSettled" />
						<PageHost :page="page" :site-name="siteName" :busy="busy" />
						<SlotOutlet name="after-content" :context="{ page }" />
					</div>
				</div>
			</div>
		</div>
	`,
};
