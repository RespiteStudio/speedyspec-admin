import { computed, inject, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import api from '@wp-admin/api';
import { __ } from '../../runtime/text.js';
import Contracted from '../../runtime/Contracted.js';
import { SlotOutlet } from '../../runtime/slots.js';
import LegacyHtml from '../../kit/LegacyHtml.js';
import { preferencesRoute } from './meta-box-holder.js';
import PluginWidget from './dashboard/plugin-widget.js';
import { adminHref, widgetContract } from './dashboard-parts/links.js';

// The classic screen's help, shown by the frame's Help panel.
export { help } from './dashboard/help.js';

/** WordPress admin stylesheets the page needs (core handles, see runtime/stylesheets.js). */
export const stylesheets = [ 'dashboard', 'site-health' ];

// The Welcome checkbox of the Dashboard's Screen Options (WP_Screen::render_meta_boxes_preferences()).
const WELCOME_OPTION = 'wp_welcome_panel';
// The classic screen's body class (admin-header.php, from the hook suffix `index.php`), which
// WordPress's dashboard styles key some rules on (`.index-php .columns-prefs`).
const BODY_CLASS = 'index-php';

/**
 * The Screen Options sections of the data, with the Welcome checkbox saying whether the panel
 * shows now. Pure.
 */
export function screenSections( sections, welcomeVisible ) {
	return ( Array.isArray( sections ) ? sections : [] ).map( ( section ) => ( {
		...section,
		items: ( Array.isArray( section?.items ) ? section.items : [] ).map( ( item ) => ( item?.id === WELCOME_OPTION ? { ...item, checked: welcomeVisible } : item ) ),
	} ) );
}

/**
 * The widgets' data with At a Glance's comment counts as a moderation left them (`glance`,
 * undefined for none yet: the data's own). Only At a Glance's data changes. Pure.
 */
export function glanceWidgets( widgets, glance ) {
	if ( glance === undefined || ! Object.hasOwn( widgets, 'dashboard_right_now' ) ) {
		return widgets;
	}
	return { ...widgets, dashboard_right_now: { ...widgets.dashboard_right_now, comments: glance } };
}

/**
 * Default implementation of core/dashboard: the Dashboard of the site, network or user admin
 * (`data.context`), in the classic screen's markup (wp-admin/_index.php): the Welcome panel, then
 * `#dashboard-widgets-wrap` with the boxes (core/meta-box-holder, `#dashboard-widgets`).
 *
 * Each box shows its widget: a core widget through its own contract (core/dashboard-…, see
 * dashboard/links.js), a plugin's through its captured HTML (dashboard/plugin-widget.js). What
 * the boxes are, their order, state and titles (with a plugin widget's "Configure" link, which
 * opens the classic screen's form) come as data; the holder saves what the user changes. The
 * classic Dashboard's scripts plugins' Dashboard scripts assume, and the screen's globals
 * (`pagenow`…), come with the page's screen assets (runtime/screen-assets.js), before them.
 *
 * The Welcome panel shows WordPress's decision (`welcome.visible`); its Dismiss link and the
 * Screen Options checkbox hide or show it and save `welcome` with the screen preferences, then
 * announce "Screen Options updated." as dashboard.js does (a failed save puts the panel back and
 * says so in a notice of the page). When a plugin hooks `welcome_panel`, the
 * panel's content is the captured HTML of that action. The admin email reminder (`remindLater`)
 * is a dismissible notice of the page. After a comment moderation in Recent Comments
 * (`moderated`), At a Glance shows the comment counts of the answer, as edit-comments.js updates them.
 *
 * The page's stylesheets (`stylesheets`: dashboard, site-health) load before it shows, and the
 * document's body carries the classic `index-php` class while it is shown.
 */
export default {
	name: 'Dashboard',
	components: { Contracted, SlotOutlet, LegacyHtml, PluginWidget },
	props: {
		data: { type: Object, required: true },
		page: { type: Object, required: true },
	},
	emits: [ 'saved' ],
	setup( props, { emit } ) {
		const notices = inject( 'notices', null );
		const speak = inject( 'speak', null ) ?? ( ( message ) => globalThis.wp?.a11y?.speak?.( message ) );

		const context = computed( () => props.data.context ?? 'site' );
		const welcome = computed( () => props.data.welcome ?? null );
		const welcomeVisible = ref( Boolean( props.data.welcome?.visible ) );
		watch( () => props.data.welcome, ( value ) => {
			welcomeVisible.value = Boolean( value?.visible );
		} );

		// The holder rebuilds its state when these change: they follow the data only.
		const layout = computed( () => props.data.layout ?? { contexts: {} } );
		const boxes = computed( () => props.data.boxes ?? {} );
		const boxIds = computed( () => Object.keys( boxes.value ) );
		const sections = computed( () => screenSections( props.data.screenOptions?.sections, welcomeVisible.value ) );
		const assets = computed( () => props.data.assets ?? {} );

		// At a Glance's comment counts after a moderation (the answer's `glance`), until new data.
		const glance = shallowRef( undefined );
		watch( () => props.data, () => {
			glance.value = undefined;
		} );
		const widgets = computed( () => glanceWidgets( props.data.widgets ?? {}, glance.value ) );
		const pluginWidgets = computed( () => props.data.pluginWidgets ?? {} );
		const contractOf = ( id ) => ( Object.hasOwn( widgets.value, id ) ? widgetContract( id ) : null );
		const pluginWidget = ( id ) => ( Object.hasOwn( pluginWidgets.value, id ) ? pluginWidgets.value[ id ] : null );

		async function setWelcome( visible ) {
			if ( welcomeVisible.value === visible ) {
				return;
			}
			welcomeVisible.value = visible;
			try {
				await api.post( preferencesRoute( props.data.screen ), { welcome: visible } );
				speak( __( 'Screen Options updated.', 'default' ) );
			} catch ( error ) {
				// Not saved: the panel shows what is stored, and the user is told.
				console.warn( 'Could not save the Welcome panel preference:', error );
				welcomeVisible.value = ! visible;
				notices?.add?.( { type: 'error', message: __( 'Your changes could not be saved. Please try again.', 'wp-admin-site' ), dismissible: true, scope: 'page' } );
			}
		}
		const onOption = ( id, value ) => {
			if ( id === WELCOME_OPTION ) {
				setWelcome( Boolean( value ) );
			}
		};
		const dismissWelcome = () => setWelcome( false );

		onMounted( () => {
			globalThis.document?.body?.classList?.add?.( BODY_CLASS );
			if ( props.data.remindLater?.message ) {
				notices?.add?.( { type: 'success', message: props.data.remindLater.message, dismissible: true, scope: 'page' } );
			}
		} );
		onBeforeUnmount( () => {
			globalThis.document?.body?.classList?.remove?.( BODY_CLASS );
		} );

		const slotContext = computed( () => ( { context: context.value } ) );
		return {
			context, welcome, welcomeVisible, layout, boxes, boxIds, sections, assets, widgets, contractOf, pluginWidget,
			onOption, dismissWelcome, slotContext, welcomeCloseHref: computed( () => adminHref( '?welcome=0' ) ),
			onSaved: ( answer ) => emit( 'saved', answer ),
			onModerated: ( answer ) => {
				if ( answer && Object.hasOwn( answer, 'glance' ) ) {
					glance.value = answer.glance ?? null;
				}
			},
		};
	},
	template: `
		<div :class="[ 'wp-admin-dashboard', 'index-php', 'wp-admin-dashboard--' + context ]">
			<div v-if="welcome" id="welcome-panel" :class="[ 'welcome-panel', { hidden: ! welcomeVisible } ]">
				<a class="welcome-panel-close" :href="welcomeCloseHref" :aria-label="$__( 'Dismiss the welcome panel', 'default' )" @click.prevent="dismissWelcome">{{ $__( 'Dismiss', 'default' ) }}</a>
				<LegacyHtml v-if="typeof welcome.html === 'string'" :html="welcome.html" :assets="assets" />
				<Contracted v-else id="core/dashboard-welcome" :data="welcome" :context="context" />
			</div>

			<SlotOutlet name="before-widgets" :context="slotContext" />

			<div id="dashboard-widgets-wrap">
				<Contracted
					contract="core/meta-box-holder"
					id="dashboard-widgets"
					:screen="data.screen"
					:layout="layout"
					:boxes="boxes"
					:reordering="data.reordering !== false"
					:columns="data.columns ?? 0"
					:sections="sections"
					:column-choices="data.columnChoices ?? []"
					@option="onOption"
				>
					<template v-for="id in boxIds" #[id]>
						<Contracted v-if="contractOf( id )" :id="contractOf( id )" :data="widgets[ id ]" :box="boxes[ id ]" :context="context" :assets="assets" @saved="onSaved" @moderated="onModerated" />
						<PluginWidget v-else-if="pluginWidget( id )" :widget="pluginWidget( id )" :assets="assets" />
					</template>
				</Contracted>
			</div>

			<SlotOutlet name="after-widgets" :context="slotContext" />
		</div>
	`,
};
