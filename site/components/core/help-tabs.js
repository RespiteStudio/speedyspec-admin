import { computed, nextTick, ref } from 'vue';
import { SlotOutlet } from '../../runtime/slots.js';
import LegacyHtml from '../../kit/LegacyHtml.js';

const DEFAULT_PRIORITY = 10;

const isComponent = ( value ) => value !== null && ( typeof value === 'object' || typeof value === 'function' );
const validId = ( id ) => typeof id === 'string' && id !== '';
const priorityOf = ( priority ) => ( Number.isInteger( priority ) ? priority : DEFAULT_PRIORITY );

/**
 * The tabs and sidebar of a page's Help panel, from the help its module exports and the
 * help the router sends for it.
 *
 * - `moduleHelp` is a page module's `help` export: `{ tabs: [ { id, title, component,
 *   priority?, when? } ], sidebar? }`, where `title` is translated text or a function returning it
 *   (called here, so that a computed caller follows a change of language) and `component`
 *   and `sidebar` are components. `when`, a function of the router page (`page`, with its
 *   `data`), leaves the tab out when it returns false, as a classic screen adds some tabs
 *   only under a condition. Core screens export the classic screen's help this way.
 * - `routerHelp` is the router page's `help`: `{ tabs: [ { id, title, content, priority } ],
 *   sidebar }`, registered from PHP with register_admin_help_tab(), with HTML content.
 *
 * Tabs are ordered by priority (default 10), then the module's tabs before the router's,
 * each in its own order. A router tab with the id of a module tab takes its place, as
 * add_help_tab() with an existing id does on a classic screen. The router's sidebar, when
 * it has one, replaces the module's. Entries of the wrong shape are left out. Pure.
 *
 * @param {object|null} moduleHelp  The page module's help.
 * @param {object|null} routerHelp  The router page's help.
 * @param {object|null} [page=null] The router page, passed to the module tabs' `when`.
 * @return {{tabs: Array<{id: string, title: string, priority: number, component?: object, content?: string}>, sidebar: object|string|null}} Help.
 */
export function mergeHelp( moduleHelp, routerHelp, page = null ) {
	const fromRouter = [];
	for ( const tab of Array.isArray( routerHelp?.tabs ) ? routerHelp.tabs : [] ) {
		if ( ! tab || typeof tab !== 'object' || ! validId( tab.id ) || typeof tab.title !== 'string' || tab.title === '' || typeof tab.content !== 'string' ) {
			continue;
		}
		if ( ! fromRouter.some( ( entry ) => entry.id === tab.id ) ) {
			fromRouter.push( { id: tab.id, title: tab.title, content: tab.content, priority: priorityOf( tab.priority ) } );
		}
	}

	const taken = new Set( fromRouter.map( ( entry ) => entry.id ) );
	const fromModule = [];
	for ( const tab of Array.isArray( moduleHelp?.tabs ) ? moduleHelp.tabs : [] ) {
		if ( ! tab || typeof tab !== 'object' || ! validId( tab.id ) || taken.has( tab.id ) || ! isComponent( tab.component ) ) {
			continue;
		}
		if ( typeof tab.when === 'function' && tab.when( page ) === false ) {
			continue;
		}
		const title = typeof tab.title === 'function' ? tab.title() : tab.title;
		if ( typeof title !== 'string' || title === '' ) {
			continue;
		}
		taken.add( tab.id );
		fromModule.push( { id: tab.id, title, component: tab.component, priority: priorityOf( tab.priority ) } );
	}

	const tabs = [ ...fromModule, ...fromRouter ]
		.map( ( entry, index ) => ( { entry, index } ) )
		.sort( ( a, b ) => ( a.entry.priority - b.entry.priority ) || a.index - b.index )
		.map( ( { entry } ) => entry );

	let sidebar = null;
	if ( typeof routerHelp?.sidebar === 'string' && routerHelp.sidebar !== '' ) {
		sidebar = routerHelp.sidebar;
	} else if ( isComponent( moduleHelp?.sidebar ) ) {
		sidebar = moduleHelp.sidebar;
	}

	return { tabs, sidebar };
}

/**
 * Default implementation of core/help-tabs: the classic screen's Help panel
 * (`#screen-meta`, `#contextual-help-wrap`, `.contextual-help-tabs`, `.help-tab-content`,
 * `.contextual-help-sidebar`) and its "Help" toggle in `#screen-meta-links`, so that
 * WordPress's admin styles apply, in both directions.
 *
 * The toggle is a button with `aria-expanded` that opens the panel and moves focus to it, as
 * the classic screen does. The tab list is a vertical ARIA tab list: the selected tab alone
 * is in the tab order, arrow up and down move through the tabs (wrapping), Home and End go to
 * the first and last, and the selection follows focus. Only the selected tab's panel is shown.
 *
 * A tab with a `component` renders it; one with `content` (and a string `sidebar`) is HTML a
 * plugin registered in PHP, which WordPress filtered with wp_kses_post(), shown through the
 * kit's LegacyHtml, like the other markup plugins print on a classic screen.
 */
export default {
	name: 'HelpTabs',
	components: { SlotOutlet, LegacyHtml },
	props: {
		tabs: { type: Array, required: true },
		sidebar: { type: [ Object, Function, String ], default: null },
	},
	emits: [ 'toggle' ],
	setup( props, { emit } ) {
		const open = ref( false );
		const chosen = ref( null );
		const wrap = ref( null );
		const links = new Map();

		// The tab chosen last, while it is still there, else the first.
		const current = computed( () => ( props.tabs.some( ( tab ) => tab.id === chosen.value ) ? chosen.value : props.tabs[ 0 ]?.id ?? null ) );
		const sidebarHtml = computed( () => ( typeof props.sidebar === 'string' ? props.sidebar : null ) );

		function setLink( id, element ) {
			if ( element ) {
				links.set( id, element );
			} else {
				links.delete( id );
			}
		}

		function select( id, focus = false ) {
			chosen.value = id;
			if ( focus ) {
				nextTick( () => links.get( id )?.focus?.() );
			}
		}

		function onClick( event, id ) {
			event?.preventDefault?.();
			select( id );
		}

		function onKeydown( event, index ) {
			const count = props.tabs.length;
			const moves = {
				ArrowDown: ( index + 1 ) % count,
				ArrowUp: ( index - 1 + count ) % count,
				Home: 0,
				End: count - 1,
			};
			if ( count === 0 || ! Object.hasOwn( moves, event?.key ) ) {
				return;
			}
			event.preventDefault?.();
			select( props.tabs[ moves[ event.key ] ].id, true );
		}

		function toggle() {
			open.value = ! open.value;
			emit( 'toggle', open.value );
			if ( open.value ) {
				nextTick( () => wrap.value?.focus?.() );
			}
		}

		return { open, current, wrap, sidebarHtml, setLink, onClick, onKeydown, toggle };
	},
	template: `
		<div class="wp-admin-help">
			<div id="screen-meta" class="metabox-prefs" :hidden="! open">
				<div id="contextual-help-wrap" ref="wrap" role="region" :class="{ 'no-sidebar': ! sidebar }" tabindex="-1" :aria-label="$__( 'Contextual Help Tab', 'wp-admin-site' )">
					<div id="contextual-help-back"></div>
					<div id="contextual-help-columns">
						<div class="contextual-help-tabs">
							<SlotOutlet name="before-tabs" :context="{ tabs }" />
							<ul role="tablist" aria-orientation="vertical">
								<li v-for="( tab, index ) in tabs" :key="tab.id" role="presentation" :class="{ active: tab.id === current }">
									<a
										:ref="( element ) => setLink( tab.id, element )"
										:id="'tab-link-' + tab.id"
										role="tab"
										:href="'#tab-panel-' + tab.id"
										:aria-controls="'tab-panel-' + tab.id"
										:aria-selected="tab.id === current ? 'true' : 'false'"
										:tabindex="tab.id === current ? '0' : '-1'"
										@click="onClick( $event, tab.id )"
										@keydown="onKeydown( $event, index )"
									>{{ tab.title }}</a>
								</li>
							</ul>
							<SlotOutlet name="after-tabs" :context="{ tabs }" />
						</div>
						<div v-if="sidebar" class="contextual-help-sidebar">
							<LegacyHtml v-if="sidebarHtml !== null" :html="sidebarHtml" />
							<component v-else :is="sidebar" />
						</div>
						<div class="contextual-help-tabs-wrap">
							<div
								v-for="tab in tabs"
								:key="tab.id"
								:id="'tab-panel-' + tab.id"
								role="tabpanel"
								:aria-labelledby="'tab-link-' + tab.id"
								:class="[ 'help-tab-content', { active: tab.id === current } ]"
								:hidden="tab.id !== current"
								tabindex="0"
							>
								<component v-if="tab.component" :is="tab.component" />
								<LegacyHtml v-else :html="tab.content ?? ''" />
							</div>
						</div>
					</div>
				</div>
			</div>
			<div id="screen-meta-links">
				<div id="contextual-help-link-wrap" class="screen-meta-toggle">
					<button type="button" id="contextual-help-link" :class="[ 'button', 'show-settings', { 'screen-meta-active': open } ]" aria-controls="contextual-help-wrap" :aria-expanded="open ? 'true' : 'false'" @click="toggle">{{ $__( 'Help', 'wp-admin-site' ) }}</button>
				</div>
			</div>
		</div>
	`,
};
