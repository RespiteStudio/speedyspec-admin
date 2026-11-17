import { computed } from 'vue';
import { findCurrent } from '../../runtime/menu.js';
import { SlotOutlet } from '../../runtime/slots.js';
import MenuItem from './menu-item.js';

/**
 * Default implementation of core/menu: the classic admin menu markup
 * (`#adminmenu`, `menu-top`, `wp-submenu`, `wp-menu-name`, Dashicons) as a
 * labelled navigation landmark of real links.
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
		return { isCurrent, currentChild };
	},
	template: `
		<nav id="adminmenumain" class="wp-admin-menu" :aria-label="$__( 'Main menu', 'wp-admin-site' )">
			<div id="adminmenuback"></div>
			<div id="adminmenuwrap">
				<ul id="adminmenu">
					<SlotOutlet name="before-items" :context="{ items }" />
					<MenuItem
						v-for="( item, index ) in items"
						:key="index + ':' + item.path"
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
