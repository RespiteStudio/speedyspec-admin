import { computed, inject, nextTick, onBeforeUnmount, provide, ref, shallowRef, toRef, watch } from 'vue';
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
 * dropped. Nothing is added when there are none. Provides `pageNotices` ({ ready() }, settled once
 * the current page's notices are in the document), which the page host waits for before it loads
 * the page's screen assets, so that a screen script finds the notices, as on a classic screen.
 * core/notices is itself a contract, resolved asynchronously: ready() waits until its
 * implementation has been resolved and rendered (or has failed), not only until the notices
 * were added to the service, but no longer than 5 seconds.
 */
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
		watch( () => props.page.path, () => {
			screenOptions.value = null;
			metaOpen.value = '';
		} );
		const screenOptionsShown = computed( () => {
			const options = screenOptions.value;
			return Boolean( options ) && props.page.component !== 'core/legacy' && ( ( Array.isArray( options.sections ) && options.sections.length > 0 ) || typeof options.reordering === 'boolean' || Boolean( options.columns ) );
		} );
		const onScreenOption = ( id, value ) => screenOptions.value?.onChange?.( id, value );
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
		// How long ready() waits for core/notices at most (ms); `noticesReadyTimeout` may be provided (tests).
		const noticesTimeout = inject( 'noticesReadyTimeout', 5000 );

		let ticket = 0;
		let captured = [];
		async function showNotices( page ) {
			const mine = ++ticket;
			const where = toPagePath( globalThis.location ?? { pathname: '/wp-admin/', search: '' } );
			const list = notices && addCaptured ? await loadPageNotices( api, page, where.context ) : [];
			if ( mine !== ticket || ! notices || ! addCaptured ) {
				return;
			}
			const ids = list.map( ( notice ) => addCaptured( { html: notice.html, assets: notice.assets } ) ).filter( Boolean );
			for ( const id of captured ) {
				if ( ! ids.includes( id ) ) {
					notices.dismiss( id );
				}
			}
			captured = ids;
			// Rendered: their markup is in the document, once core/notices itself is there (waited
			// for only so long: a core/notices that never loads must not hold the screen assets).
			await Promise.race( [ noticesMounted, new Promise( ( resolve ) => {
				globalThis.setTimeout( resolve, noticesTimeout )?.unref?.();
			} ) ] );
			await nextTick();
		}
		// Settles once the current page's notices are in the document (or none came): the page host
		// loads the page's screen assets after them.
		let noticesShown = Promise.resolve();
		provide( 'pageNotices', { ready: () => noticesShown } );
		watch( () => props.page, ( page ) => {
			noticesShown = showNotices( page ).catch( () => {} );
		}, { immediate: true } );
		onBeforeUnmount( () => {
			ticket++;
		} );
		const help = computed( () => ( helpHidden.value || props.page.component === 'core/legacy' ? { tabs: [], sidebar: null } : mergeHelp( moduleHelp.value, props.page.help, props.page ) ) );

		return { notices, dismiss, layout, help, onNoticesSettled, screenOptions, screenOptionsShown, onScreenOption, metaOpen, onMetaToggle, spoken };
	},
	template: `
		<div id="wpwrap" :class="[ 'wp-admin-frame', 'wp-admin', 'wp-core-ui', { 'wp-admin-frame--full': layout === 'full', folded: layout === 'full' } ]">
			<div id="wp-admin-speak" class="screen-reader-text" aria-live="polite" aria-relevant="additions text" aria-atomic="true">{{ spoken }}</div>
			<a class="screen-reader-shortcut" href="#wp-admin-page">{{ $__( 'Skip to main content', 'wp-admin-site' ) }}</a>
			<Contracted id="core/admin-bar" :user="manifest.user" :base="base" :site-name="siteName" @sign-out="$emit( 'sign-out' )" />
			<Contracted id="core/menu" :items="manifest.menu ?? []" :current="current" :base="base" />
			<div id="wpcontent">
				<div id="wpbody">
					<div id="wpbody-content">
						<div v-if="help.tabs.length > 0 || screenOptionsShown" :class="[ 'wp-admin-screen-meta', metaOpen ? 'wp-admin-screen-meta--' + metaOpen + '-open' : '' ]">
							<Contracted v-if="screenOptionsShown" :key="page.path" id="core/screen-options" :sections="Array.isArray( screenOptions.sections ) ? screenOptions.sections : []" :reordering="typeof screenOptions.reordering === 'boolean' ? screenOptions.reordering : null" :columns="screenOptions.columns ?? null" @change="onScreenOption" @toggle="onMetaToggle( 'screen-options', $event )" />
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
