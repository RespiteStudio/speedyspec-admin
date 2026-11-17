import { ref, computed, nextTick } from 'vue';
import { menuHref, menuIcon } from '../../runtime/menu.js';
import MenuCount from './menu-count.js';

/**
 * One top-level menu item with its submenu, in the classic markup.
 * Presentational part of core/menu.
 *
 * The submenu of the current item is shown in place and can be collapsed; any
 * other submenu opens as a flyout on hover or with its toggle button (Enter or
 * Space), and Escape closes it. Closed submenus are `hidden`, so their links
 * are not in the tab order.
 */
export default {
	name: 'MenuItem',
	components: { MenuCount },
	props: {
		item: { type: Object, required: true },
		base: { type: String, required: true },
		submenuId: { type: String, required: true },
		isCurrent: { type: Boolean, default: false },
		currentChild: { type: String, default: null },
	},
	setup( props ) {
		const opened = ref( false ); // A flyout opened with the toggle.
		const hovered = ref( false );
		const collapsed = ref( false ); // The current item's submenu, collapsed with the toggle.
		const toggleButton = ref( null );

		const children = computed( () => ( Array.isArray( props.item.children ) ? props.item.children : [] ) );
		const hasChildren = computed( () => children.value.length > 0 );
		const expanded = computed( () => ( props.isCurrent ? ! collapsed.value : opened.value || hovered.value ) );
		const icon = computed( () => menuIcon( props.item.icon ) );
		const href = ( path ) => menuHref( path, props.base );

		const itemClasses = computed( () => ( {
			'menu-top': true,
			'wp-has-submenu': hasChildren.value,
			'wp-has-current-submenu': hasChildren.value && props.isCurrent,
			'wp-menu-open': hasChildren.value && props.isCurrent && expanded.value,
			'wp-not-current-submenu': hasChildren.value && ! props.isCurrent,
			current: props.isCurrent && ! hasChildren.value,
			opensub: hasChildren.value && ! props.isCurrent && expanded.value,
			'is-collapsed': hasChildren.value && props.isCurrent && collapsed.value,
		} ) );
		const linkClasses = computed( () => ( {
			'menu-top': true,
			'wp-has-submenu': hasChildren.value,
			'wp-has-current-submenu': hasChildren.value && props.isCurrent,
			'wp-not-current-submenu': hasChildren.value && ! props.isCurrent,
			current: props.isCurrent && ! hasChildren.value,
		} ) );

		function toggle() {
			if ( props.isCurrent ) {
				collapsed.value = ! collapsed.value;
			} else {
				opened.value = ! expanded.value;
				hovered.value = false;
			}
		}

		async function close() {
			if ( props.isCurrent || ! expanded.value ) {
				return;
			}
			opened.value = false;
			hovered.value = false;
			await nextTick();
			toggleButton.value?.focus();
		}

		function closeAfterChoosing() {
			opened.value = false;
			hovered.value = false;
		}

		return { opened, hovered, toggleButton, children, hasChildren, expanded, icon, href, itemClasses, linkClasses, toggle, close, closeAfterChoosing };
	},
	template: `
		<li :class="itemClasses" @mouseenter="hovered = true" @mouseleave="hovered = false" @keydown.esc="close">
			<a :href="href( item.path )" :class="linkClasses" :aria-current="isCurrent ? 'page' : null">
				<div class="wp-menu-arrow"><div></div></div>
				<div v-if="icon.kind === 'dashicons'" :class="[ 'wp-menu-image', 'dashicons-before', icon.className ]" aria-hidden="true"><br></div>
				<div v-else-if="icon.kind === 'image'" class="wp-menu-image" aria-hidden="true"><img :src="icon.src" alt=""></div>
				<div v-else class="wp-menu-image dashicons-before" aria-hidden="true"><br></div>
				<div class="wp-menu-name">{{ item.label }}<MenuCount :count="item.count" /></div>
			</a>
			<button
				v-if="hasChildren"
				ref="toggleButton"
				type="button"
				class="wp-admin-menu-toggle"
				:aria-expanded="expanded ? 'true' : 'false'"
				:aria-controls="submenuId"
				:aria-label="$sprintf( $__( 'Submenu: %s', 'wp-admin-site' ), item.label )"
				@click="toggle"
			><span class="dashicons-before dashicons-arrow-down-alt2" aria-hidden="true"></span></button>
			<ul v-if="hasChildren" :id="submenuId" class="wp-submenu wp-submenu-wrap" :hidden="! expanded" @click="closeAfterChoosing">
				<li class="wp-submenu-head" aria-hidden="true">{{ item.label }}</li>
				<li v-for="( child, index ) in children" :key="index + ':' + child.path" :class="{ 'wp-first-item': index === 0, current: child.path === currentChild }">
					<a :href="href( child.path )" :class="{ 'wp-first-item': index === 0, current: child.path === currentChild }" :aria-current="child.path === currentChild ? 'page' : null">{{ child.label }}<MenuCount :count="child.count" /></a>
				</li>
			</ul>
		</li>
	`,
};
