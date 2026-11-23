import { ref, watch } from 'vue';

/*
 * The Favorites form of Add Plugins (install_plugins_favorites_form()): the text, then
 * `p.favorites-username` with the WordPress.org username field `#user` (the stored one, from
 * WordPress's data) and Get Favorites. Submitting emits `save( user )`: the page stores the
 * username (`POST plugins/favorites-user`, as wp_ajax_save_wporg_username()) and opens the tab for
 * it, so no `_wpnonce` ever goes in the address.
 */

/** The address of the Favorites tab for a username. Pure. */
export const favoritesPath = ( user ) => 'plugin-install.php?' + new URLSearchParams( { tab: 'favorites', user } ).toString();

export default {
	name: 'PluginFavorites',
	props: {
		favorites: { type: Object, required: true },
		busy: { type: Boolean, default: false },
	},
	emits: [ 'save' ],
	setup( props, { emit } ) {
		const user = ref( '' );
		watch( () => props.favorites?.user, ( value ) => {
			user.value = typeof value === 'string' ? value : '';
		}, { immediate: true } );

		function onSubmit( event ) {
			event?.preventDefault?.();
			if ( ! props.busy ) {
				emit( 'save', user.value.trim() );
			}
		}

		return { user, onSubmit };
	},
	template: `
		<p>{{ favorites.help }}</p>
		<form method="get" @submit="onSubmit">
			<input type="hidden" name="tab" value="favorites" />
			<p class="favorites-username">
				<label for="user">{{ favorites.label }}</label>
				<input type="search" id="user" name="user" v-model="user" />
				{{ ' ' }}<input type="submit" class="button" :value="favorites.submitLabel" :disabled="busy" />
			</p>
		</form>
	`,
};
