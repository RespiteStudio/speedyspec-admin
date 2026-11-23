import { computed, ref } from 'vue';
import api from '@wp-admin/api';
import { __ } from '../../../runtime/text.js';
import InlineMarkup from '../../../kit/InlineMarkup.js';
import LegacyHtml from '../../../kit/LegacyHtml.js';
import PluginNote from '../list-table-parts/plugin-note.js';

export const SCHEME_ROUTE = 'wp-admin/v1/users/me/color-scheme';

const list = ( value ) => ( Array.isArray( value ) ? value : [] );
const html = ( value ) => ( typeof value === 'string' && value !== '' ? value : null );

/**
 * The Personal Options section of Profile and Edit User, in user-edit.php's markup: the rows the
 * data shows (`personal`, each null when classic hides it) — Visual Editor, Syntax Highlighting,
 * the Administration Color Scheme picker (admin_color_scheme_picker()'s `fieldset#color-picker`),
 * Keyboard Shortcuts, Toolbar, Infinite Scrolling and Language — then what plugins print on
 * {@see 'personal_options'} as rows of the same table (kit/LegacyHtml as a `tbody`) and on
 * {@see 'profile_personal_options'} after it, with the note that this screen does not save their
 * fields.
 *
 * A click on a scheme selects it; on one's own profile (`own`) it is also stored at once through
 * `users/me/color-scheme`, as user-profile.js does through save-user-color-scheme. The native
 * frame does not load the scheme's stylesheet (a recorded gap). A failure emits `failed`.
 *
 * `values` is the page's reactive form values (form-state.js), which the section edits.
 */
export default {
	name: 'UserEditPersonal',
	components: { InlineMarkup, LegacyHtml, PluginNote },
	props: {
		personal: { type: Object, required: true },
		values: { type: Object, required: true },
		own: { type: Boolean, default: false },
	},
	emits: [ 'failed' ],
	setup( props, { emit } ) {
		const scheme = computed( () => ( props.personal.colorScheme && typeof props.personal.colorScheme === 'object' ? props.personal.colorScheme : null ) );
		const schemes = computed( () => list( scheme.value?.schemes ).filter( ( item ) => typeof item?.id === 'string' ) );
		const languageOptions = computed( () => list( props.personal.language?.options ).filter( ( option ) => typeof option?.value === 'string' ) );
		const saving = ref( 0 );

		async function pick( id ) {
			if ( props.values.admin_color === id ) {
				return;
			}
			props.values.admin_color = id;
			if ( ! props.own ) {
				return;
			}
			const mine = ++saving.value;
			try {
				await api.post( SCHEME_ROUTE, { scheme: id } );
			} catch ( reason ) {
				if ( mine === saving.value ) {
					emit( 'failed', reason, 'Could not save the color scheme:' );
				}
			}
		}

		const shown = ( value ) => value !== null && value !== undefined;
		return {
			scheme, schemes, languageOptions, pick, shown,
			shortcutsDocumentation: computed( () => __( '<a href="https://wordpress.org/documentation/article/keyboard-shortcuts-classic-editor/#keyboard-shortcuts-for-comments">Documentation on Keyboard Shortcuts</a>', 'default' ) ),
			pickerHtml: computed( () => html( scheme.value?.html ) ),
			personalHtml: computed( () => html( props.personal.hooksHtml?.personal ) ),
			profileHtml: computed( () => html( props.personal.hooksHtml?.profile ) ),
		};
	},
	template: `
		<h2>{{ $__( 'Personal Options', 'default' ) }}</h2>
		<table class="form-table" role="presentation">
			<tr v-if="shown( personal.richEditing )" class="user-rich-editing-wrap">
				<th scope="row">{{ $__( 'Visual Editor', 'default' ) }}</th>
				<td><label for="rich_editing"><input name="rich_editing" type="checkbox" id="rich_editing" value="false" :checked="values.rich_editing" @change="values.rich_editing = $event.target.checked" /> {{ $__( 'Disable the visual editor when writing', 'default' ) }}</label></td>
			</tr>
			<tr v-if="shown( personal.syntaxHighlighting )" class="user-syntax-highlighting-wrap">
				<th scope="row">{{ $__( 'Syntax Highlighting', 'default' ) }}</th>
				<td><label for="syntax_highlighting"><input name="syntax_highlighting" type="checkbox" id="syntax_highlighting" value="false" :checked="values.syntax_highlighting" @change="values.syntax_highlighting = $event.target.checked" /> {{ $__( 'Disable syntax highlighting when editing code', 'default' ) }}</label></td>
			</tr>
			<tr v-if="scheme" class="user-admin-color-wrap">
				<th scope="row">{{ $__( 'Administration Color Scheme', 'default' ) }}</th>
				<td>
					<fieldset id="color-picker" class="scheme-list">
						<legend class="screen-reader-text"><span>{{ $__( 'Administration Color Scheme', 'default' ) }}</span></legend>
						<div v-for="item in schemes" :key="item.id" class="color-option" :class="{ selected: values.admin_color === item.id }" @click="pick( item.id )">
							<input name="admin_color" :id="'admin_color_' + item.id" type="radio" :value="item.id" :checked="values.admin_color === item.id" />
							<label :for="'admin_color_' + item.id">{{ item.name }}</label>
							<div class="color-palette">
								<div v-for="( color, index ) in item.colors" :key="index" class="color-palette-shade" :style="{ backgroundColor: color }">&nbsp;</div>
							</div>
						</div>
					</fieldset>
					<template v-if="pickerHtml"><LegacyHtml :html="pickerHtml" /><PluginNote /></template>
				</td>
			</tr>
			<tr v-if="shown( personal.commentShortcuts )" class="user-comment-shortcuts-wrap">
				<th scope="row">{{ $__( 'Keyboard Shortcuts', 'default' ) }}</th>
				<td>
					<label for="comment_shortcuts"><input type="checkbox" name="comment_shortcuts" id="comment_shortcuts" value="true" :checked="values.comment_shortcuts" @change="values.comment_shortcuts = $event.target.checked" /> {{ $__( 'Enable keyboard shortcuts for comment moderation.', 'default' ) }}</label>
					{{ ' ' }}<InlineMarkup :html="shortcutsDocumentation" />
				</td>
			</tr>
			<tr v-if="shown( personal.toolbar )" class="show-admin-bar user-admin-bar-front-wrap">
				<th scope="row">{{ $__( 'Toolbar', 'default' ) }}</th>
				<td><label for="admin_bar_front"><input name="admin_bar_front" type="checkbox" id="admin_bar_front" value="1" :checked="values.admin_bar_front" @change="values.admin_bar_front = $event.target.checked" /> {{ $__( 'Show Toolbar when viewing site', 'default' ) }}</label><br /></td>
			</tr>
			<tr v-if="shown( personal.infiniteScrolling )" class="user-infinite-scrolling-wrap">
				<th scope="row">{{ $__( 'Infinite Scrolling', 'default' ) }}</th>
				<td><label for="infinite_scrolling"><input name="infinite_scrolling" type="checkbox" id="infinite_scrolling" value="false" :checked="values.infinite_scrolling" @change="values.infinite_scrolling = $event.target.checked" /> {{ $__( 'Disable infinite scrolling in the Media Library grid view', 'default' ) }}</label></td>
			</tr>
			<tr v-if="personal.language" class="user-language-wrap">
				<th scope="row"><label for="locale">{{ $__( 'Language', 'default' ) }}<span class="dashicons dashicons-translation" aria-hidden="true"></span></label></th>
				<td>
					<select name="locale" id="locale" :value="values.locale" @change="values.locale = $event.target.value">
						<option v-for="option in languageOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
					</select>
				</td>
			</tr>
			<LegacyHtml v-if="personalHtml" tag="tbody" :html="personalHtml" />
		</table>
		<LegacyHtml v-if="profileHtml" :html="profileHtml" />
		<PluginNote v-if="personalHtml || profileHtml" />
	`,
};
