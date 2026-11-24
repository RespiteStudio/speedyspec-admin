import { ref, watch } from 'vue';

/*
 * The Favorites form of Add Themes, as theme-install.php prints `.favorites-form`: the text, then
 * `p.favorites-username` with the WordPress.org username field `#wporg-username-input` (the stored
 * one, from WordPress's data) and Get Favorites. As theme.js's saveUsername(), Get Favorites, or
 * Enter in the field, emits `save( user )`: the page stores the username (`POST
 * themes/favorites-user`) and reads the favorites of it. Whether the form shows is the body's
 * `show-favorites-form` (the page's), as core's CSS reads it.
 *
 * Props: `favorites` (the data's: `{ user, help, label, button }`) and `busy`.
 */
export default {
	name: 'ThemeInstallFavorites',
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

		function save( event ) {
			event?.preventDefault?.();
			// The field saves on Enter only.
			if ( event?.type === 'keyup' && event.key !== 'Enter' ) {
				return;
			}
			if ( ! props.busy ) {
				emit( 'save', user.value );
			}
		}

		return { user, save };
	},
	template: `
		<div class="favorites-form">
			<p class="install-help">{{ favorites.help }}</p>
			<p class="favorites-username">
				<label for="wporg-username-input">{{ favorites.label }}</label>
				<input type="search" id="wporg-username-input" v-model="user" @keyup="save" />
				{{ ' ' }}<input type="button" class="button favorites-form-submit" :value="favorites.button" :disabled="busy" @click="save" />
			</p>
		</div>
	`,
};
