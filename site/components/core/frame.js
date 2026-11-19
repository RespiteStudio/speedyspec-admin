import { computed, inject, onBeforeUnmount, provide, ref, shallowRef, toRef, watch } from 'vue';
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
 * Each time the router answers a native page, the frame asks WordPress for the page's classic
 * admin notices (runtime/page-notices.js: what its `admin_notices` callbacks print) and adds them
 * to the notices service as page notices with `capturedNotices` (the service's addCaptured(),
 * which pages are not given), so that the page host withdraws them when the user
 * leaves the page; the same page answered again keeps those still printed and drops the others.
 * A hosted classic screen (core/legacy) prints its own. An answer for a page the user has left is
 * dropped. Nothing is added when there are none.
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

		let ticket = 0;
		let captured = [];
		watch( () => props.page, async ( page ) => {
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
		}, { immediate: true } );
		onBeforeUnmount( () => {
			ticket++;
		} );
		const help = computed( () => ( helpHidden.value || props.page.component === 'core/legacy' ? { tabs: [], sidebar: null } : mergeHelp( moduleHelp.value, props.page.help, props.page ) ) );

		return { notices, dismiss, layout, help };
	},
	template: `
		<div id="wpwrap" :class="[ 'wp-admin-frame', 'wp-admin', 'wp-core-ui', { 'wp-admin-frame--full': layout === 'full', folded: layout === 'full' } ]">
			<a class="screen-reader-shortcut" href="#wp-admin-page">{{ $__( 'Skip to main content', 'wp-admin-site' ) }}</a>
			<Contracted id="core/admin-bar" :user="manifest.user" :base="base" :site-name="siteName" @sign-out="$emit( 'sign-out' )" />
			<Contracted id="core/menu" :items="manifest.menu ?? []" :current="current" :base="base" />
			<div id="wpcontent">
				<div id="wpbody">
					<div id="wpbody-content">
						<Contracted v-if="help.tabs.length > 0" :key="page.path" id="core/help-tabs" :tabs="help.tabs" :sidebar="help.sidebar" />
						<SlotOutlet name="before-content" :context="{ page }" />
						<Contracted id="core/notices" :notices="notices ? notices.items : []" @dismiss="dismiss" />
						<PageHost :page="page" :site-name="siteName" :busy="busy" />
						<SlotOutlet name="after-content" :context="{ page }" />
					</div>
				</div>
			</div>
		</div>
	`,
};
