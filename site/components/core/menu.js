import { computed, nextTick, ref, watch } from 'vue';
import { findCurrent, uniqueKeys } from '../../runtime/menu.js';
import { SlotOutlet } from '../../runtime/slots.js';
import MenuItem from './menu-item.js';

/**
 * Default implementation of core/menu: the classic admin menu markup
 * (`#adminmenu`, `menu-top`, `wp-submenu`, `wp-menu-name`, Dashicons) as a
 * labelled navigation landmark of real links.
 *
 * Items are keyed by their path, so that when the menu changes in place (a live update
 * after a plugin was activated or removed) the items that remain keep their component:
 * an open submenu stays open and focus stays where it is. When the item that had focus
 * is gone, focus moves to the first item.
 */
export default {
	name: 'AdminMenu',
	components: { MenuItem, SlotOutlet },
	props: {
		items: { type: Array, required: true },
		current: { type: String, required: true },
		base: { type: String, required: true },
	},
	setup( props ) {
		const match = computed( () => findCurrent( props.items, props.current ) );
		const isCurrent = ( item ) => match.value?.top === item;
		const currentChild = ( item ) => ( isCurrent( item ) ? match.value.child?.path ?? null : null );
		const keys = computed( () => uniqueKeys( props.items.map( ( item ) => item.path ) ) );
		const nav = ref( null );

		// Elements that can hold focus carry data-menu-key (see MenuItem): "top" or "top|child".
		const focusKeys = () => {
			const all = new Set();
			props.items.forEach( ( item, index ) => {
				all.add( keys.value[ index ] );
				uniqueKeys( ( item.children ?? [] ).map( ( child ) => child.path ) ).forEach( ( key ) => all.add( keys.value[ index ] + '|' + key ) );
			} );
			return all;
		};
		watch( () => props.items, () => {
			const active = globalThis.document?.activeElement;
			const key = active?.getAttribute?.( 'data-menu-key' ) ?? null;
			if ( key === null ) {
				return;
			}
			nextTick( () => {
				if ( ! focusKeys().has( key ) ) {
					nav.value?.querySelector?.( 'a.menu-top' )?.focus();
				}
			} );
		}, { flush: 'pre' } );

		return { isCurrent, currentChild, keys, nav };
	},
	template: `
		<nav id="adminmenumain" ref="nav" class="wp-admin-menu" :aria-label="$__( 'Main menu', 'wp-admin-site' )">
			<div id="adminmenuback"></div>
			<div id="adminmenuwrap">
				<ul id="adminmenu">
					<SlotOutlet name="before-items" :context="{ items }" />
					<MenuItem
						v-for="( item, index ) in items"
						:key="keys[ index ]"
						:menu-key="keys[ index ]"
						:item="item"
						:base="base"
						:submenu-id="'wp-admin-submenu-' + index"
						:is-current="isCurrent( item )"
						:current-child="currentChild( item )"
					/>
					<SlotOutlet name="after-items" :context="{ items }" />
				</ul>
			</div>
		</nav>
	`,
};
