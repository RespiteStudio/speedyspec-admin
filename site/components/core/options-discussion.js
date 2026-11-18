import { computed, ref, watch } from 'vue';
import { __ } from '../../runtime/text.js';
import Contracted from '../../runtime/Contracted.js';
import { SlotOutlet } from '../../runtime/slots.js';
import { toPagePath } from '../../runtime/router.js';
import { adminBase } from '../../runtime/menu.js';
import Button from '../../kit/Button.js';
import Interpolate, { decodeEntities } from '../../kit/Interpolate.js';
import LegacyHtml from '../../kit/LegacyHtml.js';
import { LegacyRows, LegacySections } from './settings-form/legacy-fields.js';
import { useSettingsForm } from './settings-form/use-settings-form.js';
import { AVATAR_ACTION, FIELDS, KEEP_INPUT, RATINGS, avatarListFailed, checkedAvatarIn, classicFields, controlIdsFor, numberValue } from './options-discussion/state.js';

const ROUTE = 'wp-admin/v1/settings/discussion';

// The classic screen's help, shown by the frame's Help panel.
export { help } from './options-discussion/help.js';

/**
 * Default implementation of core/options-discussion: the Discussion Settings screen.
 *
 * The markup is the classic screen's two tables: the comment settings (default post
 * settings, other comment settings, pagination, email, moderation and disallowed keys,
 * with the number inputs and selects under their checkboxes, `ul` lists as on the classic
 * screen) and, after the "Avatars" heading, the avatar settings, whose rating and default
 * avatar rows are shown only while "Show Avatars" is checked (as options_discussion_add_js()
 * does). The rows are core/settings-field instances inside core/form-table, so that a plugin
 * can replace the page, a table or the row component, or add modules to the page's slots.
 *
 * The default avatars are radio buttons with the current user's avatar for each (page
 * data); when a plugin filters the choices or the list's markup, the list is the classic
 * markup (kit/LegacyHtml.js) and its checked radio button gives the field its value. The
 * fields plugins add with add_settings_field() to the `default` and `avatars` sections are
 * rendered at the end of their tables, and their sections after the tables. Each save also
 * sends the fields whose stored value the controls cannot show, as they show it, which is
 * what the classic form posts (see options-discussion/state.js, classicFields()). Saving is
 * the shared settings form's (settings-form/use-settings-form.js).
 */
export default {
	name: 'OptionsDiscussion',
	components: { Contracted, SlotOutlet, Button, Interpolate, LegacyHtml, LegacyRows, LegacySections },
	props: {
		data: { type: Object, required: true },
		page: { type: Object, required: true },
	},
	emits: [ 'saved' ],
	setup( props, { emit } ) {
		// The default avatar the user chose in the classic avatar list, until the next answer.
		const listChoice = ref( null );

		const form = useSettingsForm( {
			data: () => props.data,
			route: ROUTE,
			fields: FIELDS,
			keepInput: KEEP_INPUT,
			controlIds: controlIdsFor( props.data ),
			// What the classic form posts where its controls cannot show the stored value (see state.js).
			classicFields: ( current, stored ) => classicFields( current, stored, { avatarFromList: avatarFromList( stored ) } ),
			onSaved( next ) {
				emit( 'saved', next );
			},
		} );
		const { settings, values, errors } = form;

		watch( settings, () => {
			listChoice.value = null;
		} );

		const choices = computed( () => settings.value.choices ?? {} );
		const flags = computed( () => settings.value.flags ?? {} );
		const avatarList = computed( () => settings.value.legacySections?.actions?.[ AVATAR_ACTION ] ?? { hooked: false, html: '', error: false } );
		const legacyAvatars = computed( () => typeof settings.value.avatarHtml === 'string' );
		const depths = computed( () => {
			const max = Number( choices.value.threadCommentsDepthMax ?? 10 );
			const list = [];
			for ( let depth = 2; depth <= max; depth++ ) {
				list.push( depth );
			}
			return list;
		} );
		const rows = {
			default: computed( () => form.legacyRows( 'default' ) ),
			avatars: computed( () => form.legacyRows( 'avatars' ) ),
		};

		/**
		 * The default avatar the classic avatar list posts: its checked radio button in the
		 * document, else the user's choice in it, else the one its markup checks; null without
		 * it, and when it could not be displayed (nothing is sent: the stored value is kept).
		 */
		function avatarFromList( stored ) {
			if ( typeof stored?.avatarHtml !== 'string' || avatarListFailed( stored ) ) {
				return null;
			}
			const root = form.form.value;
			if ( typeof root?.querySelector === 'function' ) {
				return root.querySelector( '.wp-admin-legacy-html input[type="radio"][name="avatar_default"]:checked' )?.value ?? '';
			}
			return listChoice.value ?? checkedAvatarIn( stored.avatarHtml );
		}

		/** A radio button of the classic avatar list was chosen: its value is the field's. */
		function onAvatarListChange( event ) {
			const target = event?.target;
			if ( target?.closest?.( '.wp-admin-legacy-html' ) && target.name === 'avatar_default' && target.checked ) {
				listChoice.value = String( target.value );
				form.setValue( 'avatar_default', String( target.value ) );
			}
		}

		const base = computed( () => adminBase( toPagePath( globalThis.location ?? { pathname: '/wp-admin/', search: '' } ).siteId ) );

		/** Errors of the controls of a grouped row, each in an element its control references. */
		const errorsOf = ( ...fields ) => fields.filter( ( field ) => errors.value[ field ] ).map( ( field ) => ( { field, message: errors.value[ field ] } ) );

		// Strings with markup or character references are kept out of the template, which would decode them.
		const text = {
			moderationKeys: computed( () => __( 'When a comment contains any of these words in its content, author name, URL, email, IP address, or browser&#8217;s user agent string, it will be held in the <a href="edit-comments.php?comment_status=moderated">moderation queue</a>. One word or IP address per line. It will match inside words, so &#8220;press&#8221; will match &#8220;WordPress&#8221;.', 'default' ) ),
			disallowedKeys: computed( () => decodeEntities( __( 'When a comment contains any of these words in its content, author name, URL, email, IP address, or browser&#8217;s user agent string, it will be put in the Trash. One word or IP address per line. It will match inside words, so &#8220;press&#8221; will match &#8220;WordPress&#8221;.', 'default' ) ) ),
		};
		const ratings = computed( () => ( {
			/* translators: Content suitability rating: https://en.wikipedia.org/wiki/Motion_Picture_Association_of_America_film_rating_system */
			G: decodeEntities( __( 'G &#8212; Suitable for all audiences', 'default' ) ),
			/* translators: Content suitability rating: https://en.wikipedia.org/wiki/Motion_Picture_Association_of_America_film_rating_system */
			PG: decodeEntities( __( 'PG &#8212; Possibly offensive, usually for audiences 13 and above', 'default' ) ),
			/* translators: Content suitability rating: https://en.wikipedia.org/wiki/Motion_Picture_Association_of_America_film_rating_system */
			R: decodeEntities( __( 'R &#8212; Intended for adult audiences above 17', 'default' ) ),
			/* translators: Content suitability rating: https://en.wikipedia.org/wiki/Motion_Picture_Association_of_America_film_rating_system */
			X: decodeEntities( __( 'X &#8212; Even more mature than above', 'default' ) ),
		} ) );
		// The moderation queue link, relative to the admin as on the classic screen (translations may change it).
		const moderationTags = computed( () => {
			const match = /<a\s[^>]*href="([^"]*)"/i.exec( text.moderationKeys.value );
			const target = match ? match[ 1 ] : 'edit-comments.php?comment_status=moderated';
			return { a: { href: /^[a-z][a-z0-9+.-]*:|^\//i.test( target ) ? target : base.value + target } };
		} );

		// The rating and default avatar rows follow "Show Avatars", as options_discussion_add_js() toggles them.
		const avatarRowStyle = computed( () => ( values.show_avatars ? null : { display: 'none' } ) );

		/** A checkbox's change handler. */
		const check = ( field ) => ( event ) => {
			values[ field ] = event.target.checked;
		};

		return {
			...form, choices, flags, avatarList, legacyAvatars, depths, rows, errorsOf, text, ratings, RATINGS,
			moderationTags, avatarRowStyle, check, numberValue, onAvatarListChange,
		};
	},
	template: `
		<div class="wp-admin-options-discussion options-discussion-php">
			<form ref="form" method="post" @submit.prevent="save" @input="onFormEdit" @change="onFormEdit">
				<SlotOutlet name="before-fields" :context="slotContext" />

				<Contracted id="core/form-table" class="indent-children">
					<Contracted contract="core/settings-field" id="default_post_settings" :label="$__( 'Default post settings', 'default' )" group>
						<fieldset><legend class="screen-reader-text"><span>{{ $__( 'Default post settings', 'default' ) }}</span></legend>
							<label for="default_pingback_flag">
								<input name="default_pingback_flag" type="checkbox" id="default_pingback_flag" value="1" :checked="values.default_pingback_flag" @change="check( 'default_pingback_flag' )( $event )" v-bind="aria( 'default_pingback_flag' )">
								{{ $__( 'Attempt to notify any blogs linked to from the post', 'default' ) }}</label>
							<br>
							<label for="default_ping_status">
								<input name="default_ping_status" type="checkbox" id="default_ping_status" value="open" :checked="values.default_ping_status" @change="check( 'default_ping_status' )( $event )" v-bind="aria( 'default_ping_status' )">
								{{ $__( 'Allow link notifications from other blogs (pingbacks and trackbacks) on new posts', 'default' ) }}</label>
							<br>
							<label for="default_comment_status">
								<input name="default_comment_status" type="checkbox" id="default_comment_status" value="open" :checked="values.default_comment_status" @change="check( 'default_comment_status' )( $event )" v-bind="aria( 'default_comment_status' )">
								{{ $__( 'Allow people to submit comments on new posts', 'default' ) }}</label>
							<br>
							<p class="description">{{ $__( 'Individual posts may override these settings. Changes here will only be applied to new posts.', 'default' ) }}</p>
						</fieldset>
						<p v-for="item in errorsOf( 'default_pingback_flag', 'default_ping_status', 'default_comment_status' )" :key="item.field" :id="item.field + '-error'" class="wp-admin-field-error">{{ item.message }}</p>
					</Contracted>

					<Contracted contract="core/settings-field" id="other_comment_settings" :label="$__( 'Other comment settings', 'default' )" group>
						<fieldset><legend class="screen-reader-text"><span>{{ $__( 'Other comment settings', 'default' ) }}</span></legend>
							<label for="require_name_email"><input type="checkbox" name="require_name_email" id="require_name_email" value="1" :checked="values.require_name_email" @change="check( 'require_name_email' )( $event )" v-bind="aria( 'require_name_email' )"> {{ $__( 'Comment author must fill out name and email', 'default' ) }}</label>
							<br>
							<label for="comment_registration">
								<input name="comment_registration" type="checkbox" id="comment_registration" value="1" :checked="values.comment_registration" @change="check( 'comment_registration' )( $event )" v-bind="aria( 'comment_registration' )">
								{{ $__( 'Users must be registered and logged in to comment', 'default' ) }}
								<template v-if="flags.signupDisabled">{{ ' ' + $__( '(Signup has been disabled. Only members of this site can comment.)', 'default' ) }}</template>
							</label>
							<br>
							<input name="close_comments_for_old_posts" type="checkbox" id="close_comments_for_old_posts" value="1" :checked="values.close_comments_for_old_posts" @change="check( 'close_comments_for_old_posts' )( $event )" v-bind="aria( 'close_comments_for_old_posts' )"> <label for="close_comments_for_old_posts">{{ $__( 'Automatically close comments on old posts', 'default' ) }}</label>
							<ul>
								<li>
									<label for="close_comments_days_old">{{ $__( 'Close comments when post is how many days old', 'default' ) }}</label>
									<input name="close_comments_days_old" type="number" step="1" min="0" id="close_comments_days_old" :value="values.close_comments_days_old" @input="values.close_comments_days_old = numberValue( $event.target.value )" class="small-text" v-bind="aria( 'close_comments_days_old' )">
								</li>
							</ul>

							<input name="show_comments_cookies_opt_in" type="checkbox" id="show_comments_cookies_opt_in" value="1" :checked="values.show_comments_cookies_opt_in" @change="check( 'show_comments_cookies_opt_in' )( $event )" v-bind="aria( 'show_comments_cookies_opt_in' )">
							<label for="show_comments_cookies_opt_in">{{ $__( 'Show comments cookies opt-in checkbox, allowing comment author cookies to be set', 'default' ) }}</label>
							<br>
							<input name="thread_comments" type="checkbox" id="thread_comments" value="1" :checked="values.thread_comments" @change="check( 'thread_comments' )( $event )" v-bind="aria( 'thread_comments' )">
							<label for="thread_comments">{{ $__( 'Enable threaded (nested) comments', 'default' ) }}</label>

							<ul>
								<li>
									<label for="thread_comments_depth">{{ $__( 'Number of levels for threaded (nested) comments', 'default' ) }}</label>
									<select name="thread_comments_depth" id="thread_comments_depth" @change="values.thread_comments_depth = Number( $event.target.value )" v-bind="aria( 'thread_comments_depth' )">
										<option v-for="depth in depths" :key="depth" :value="String( depth )" :selected="depth === values.thread_comments_depth">{{ depth }}</option>
									</select>
								</li>
							</ul>
						</fieldset>
						<p v-for="item in errorsOf( 'require_name_email', 'comment_registration', 'close_comments_for_old_posts', 'close_comments_days_old', 'show_comments_cookies_opt_in', 'thread_comments', 'thread_comments_depth' )" :key="item.field" :id="item.field + '-error'" class="wp-admin-field-error">{{ item.message }}</p>
					</Contracted>

					<Contracted contract="core/settings-field" id="comment_pagination" :label="$__( 'Comment Pagination', 'default' )" group>
						<fieldset><legend class="screen-reader-text"><span>{{ $__( 'Comment Pagination', 'default' ) }}</span></legend>
							<input name="page_comments" type="checkbox" id="page_comments" value="1" :checked="values.page_comments" @change="check( 'page_comments' )( $event )" v-bind="aria( 'page_comments' )">
							<label for="page_comments">{{ $__( 'Break comments into pages', 'default' ) }}</label>
							<ul>
								<li>
									<label for="comments_per_page">{{ $__( 'Top level comments per page', 'default' ) }}</label>
									<input name="comments_per_page" type="number" step="1" min="0" id="comments_per_page" :value="values.comments_per_page" @input="values.comments_per_page = numberValue( $event.target.value )" class="small-text" v-bind="aria( 'comments_per_page' )">
								</li>
								<li>
									<label for="default_comments_page">{{ $__( 'Comments page to display by default', 'default' ) }}</label>
									<select name="default_comments_page" id="default_comments_page" @change="values.default_comments_page = $event.target.value" v-bind="aria( 'default_comments_page' )">
										<option value="newest" :selected="values.default_comments_page === 'newest'">{{ $__( 'last page', 'default' ) }}</option>
										<option value="oldest" :selected="values.default_comments_page === 'oldest'">{{ $__( 'first page', 'default' ) }}</option>
									</select>
								</li>
								<li>
									<label for="comment_order">{{ $__( 'Comments to display at the top of each page', 'default' ) }}</label>
									<select name="comment_order" id="comment_order" @change="values.comment_order = $event.target.value" v-bind="aria( 'comment_order' )">
										<option value="asc" :selected="values.comment_order === 'asc'">{{ $__( 'older', 'default' ) }}</option>
										<option value="desc" :selected="values.comment_order === 'desc'">{{ $__( 'newer', 'default' ) }}</option>
									</select>
								</li>
							</ul>
						</fieldset>
						<p v-for="item in errorsOf( 'page_comments', 'comments_per_page', 'default_comments_page', 'comment_order' )" :key="item.field" :id="item.field + '-error'" class="wp-admin-field-error">{{ item.message }}</p>
					</Contracted>

					<Contracted contract="core/settings-field" id="email_me_whenever" :label="$__( 'Email me whenever', 'default' )" group>
						<fieldset><legend class="screen-reader-text"><span>{{ $__( 'Email me whenever', 'default' ) }}</span></legend>
							<label for="comments_notify">
								<input name="comments_notify" type="checkbox" id="comments_notify" value="1" :checked="values.comments_notify" @change="check( 'comments_notify' )( $event )" v-bind="aria( 'comments_notify' )">
								{{ $__( 'Anyone posts a comment', 'default' ) }} </label>
							<br>
							<label for="moderation_notify">
								<input name="moderation_notify" type="checkbox" id="moderation_notify" value="1" :checked="values.moderation_notify" @change="check( 'moderation_notify' )( $event )" v-bind="aria( 'moderation_notify' )">
								{{ $__( 'A comment is held for moderation', 'default' ) }} </label>
							<br>
							<label for="wp_notes_notify">
								<input name="wp_notes_notify" type="checkbox" id="wp_notes_notify" value="1" :checked="values.wp_notes_notify" @change="check( 'wp_notes_notify' )( $event )" v-bind="aria( 'wp_notes_notify' )">
								{{ $__( 'Anyone posts a note', 'default' ) }} </label>
						</fieldset>
						<p v-for="item in errorsOf( 'comments_notify', 'moderation_notify', 'wp_notes_notify' )" :key="item.field" :id="item.field + '-error'" class="wp-admin-field-error">{{ item.message }}</p>
					</Contracted>

					<Contracted contract="core/settings-field" id="before_comment_appears" :label="$__( 'Before a comment appears', 'default' )" group>
						<fieldset><legend class="screen-reader-text"><span>{{ $__( 'Before a comment appears', 'default' ) }}</span></legend>
							<label for="comment_moderation">
								<input name="comment_moderation" type="checkbox" id="comment_moderation" value="1" :checked="values.comment_moderation" @change="check( 'comment_moderation' )( $event )" v-bind="aria( 'comment_moderation' )">
								{{ $__( 'Comment must be manually approved', 'default' ) }} </label>
							<br>
							<label for="comment_previously_approved"><input type="checkbox" name="comment_previously_approved" id="comment_previously_approved" value="1" :checked="values.comment_previously_approved" @change="check( 'comment_previously_approved' )( $event )" v-bind="aria( 'comment_previously_approved' )"> {{ $__( 'Comment author must have a previously approved comment', 'default' ) }}</label>
						</fieldset>
						<p v-for="item in errorsOf( 'comment_moderation', 'comment_previously_approved' )" :key="item.field" :id="item.field + '-error'" class="wp-admin-field-error">{{ item.message }}</p>
					</Contracted>

					<Contracted contract="core/settings-field" id="comment_moderation_keys" :label="$__( 'Comment Moderation', 'default' )" group>
						<fieldset><legend class="screen-reader-text"><span>{{ $__( 'Comment Moderation', 'default' ) }}</span></legend>
							<p><label for="comment_max_links">{{ $__( 'Number of links to allow in a comment before holding for moderation:', 'default' ) }}</label>
								<input name="comment_max_links" type="number" step="1" min="0" id="comment_max_links" :value="values.comment_max_links" @input="values.comment_max_links = numberValue( $event.target.value )" class="small-text" v-bind="aria( 'comment_max_links', 'comment_links_moderation_desc' )">
								<span id="comment_links_moderation_desc">{{ $__( '(A common characteristic of comment spam is a large number of hyperlinks.)', 'default' ) }}</span>
							</p>

							<p><label for="moderation_keys"><Interpolate :text="text.moderationKeys.value" :tags="moderationTags" /></label></p>
							<p>
								<textarea name="moderation_keys" rows="10" cols="50" id="moderation_keys" class="large-text code" :value="values.moderation_keys" @input="values.moderation_keys = $event.target.value" v-bind="aria( 'moderation_keys' )"></textarea>
							</p>
						</fieldset>
						<p v-for="item in errorsOf( 'comment_max_links', 'moderation_keys' )" :key="item.field" :id="item.field + '-error'" class="wp-admin-field-error">{{ item.message }}</p>
					</Contracted>

					<Contracted contract="core/settings-field" id="disallowed_comment_keys" :label="$__( 'Disallowed Comment Keys', 'default' )" group>
						<fieldset><legend class="screen-reader-text"><span>{{ $__( 'Disallowed Comment Keys', 'default' ) }}</span></legend>
							<p><label for="disallowed_keys">{{ text.disallowedKeys.value }}</label></p>
							<p>
								<textarea name="disallowed_keys" rows="10" cols="50" id="disallowed_keys" class="large-text code" :value="values.disallowed_keys" @input="values.disallowed_keys = $event.target.value" v-bind="aria( 'disallowed_keys' )"></textarea>
							</p>
						</fieldset>
						<p v-for="item in errorsOf( 'disallowed_keys' )" :key="item.field" :id="item.field + '-error'" class="wp-admin-field-error">{{ item.message }}</p>
					</Contracted>

					<LegacyRows :fields="rows.default.value" :assets="legacy" />
				</Contracted>

				<h2 id="wp-settings-section-avatars" class="title">{{ $__( 'Avatars', 'default' ) }}</h2>

				<p>{{ $__( 'An avatar is an image that can be associated with a user across multiple websites. In this area, you can choose to display avatars of users who interact with the site.', 'default' ) }}</p>

				<Contracted id="core/form-table">
					<Contracted contract="core/settings-field" id="avatar_display" :label="$__( 'Avatar Display', 'default' )" group>
						<label for="show_avatars">
							<input type="checkbox" id="show_avatars" name="show_avatars" value="1" :checked="values.show_avatars" @change="check( 'show_avatars' )( $event )" v-bind="aria( 'show_avatars' )">
							{{ $__( 'Show Avatars', 'default' ) }}
						</label>
						<p v-for="item in errorsOf( 'show_avatars' )" :key="item.field" :id="item.field + '-error'" class="wp-admin-field-error">{{ item.message }}</p>
					</Contracted>

					<Contracted :style="avatarRowStyle" contract="core/settings-field" id="avatar_rating" class="avatar-settings" :label="$__( 'Maximum Rating', 'default' )" group>
						<fieldset><legend class="screen-reader-text"><span>{{ $__( 'Maximum Rating', 'default' ) }}</span></legend>
							<template v-for="( rating, index ) in RATINGS" :key="rating">
								<label><input type="radio" name="avatar_rating" :id="index === 0 ? 'avatar_rating_G' : null" :value="rating" :checked="values.avatar_rating === rating" @change="values.avatar_rating = rating" v-bind="index === 0 ? aria( 'avatar_rating' ) : {}"> {{ ratings[ rating ] }}</label><br>
							</template>
						</fieldset>
						<p v-for="item in errorsOf( 'avatar_rating' )" :key="item.field" :id="item.field + '-error'" class="wp-admin-field-error">{{ item.message }}</p>
					</Contracted>

					<Contracted :style="avatarRowStyle" contract="core/settings-field" id="avatar_default" class="avatar-settings" :label="$__( 'Default Avatar', 'default' )" group>
						<fieldset class="defaultavatarpicker" @change="onAvatarListChange"><legend class="screen-reader-text"><span>{{ $__( 'Default Avatar', 'default' ) }}</span></legend>
							<p>
								{{ $__( 'For users without a custom avatar of their own, you can either display a generic logo or a generated one based on their email address.', 'default' ) }}<br>
							</p>
							<template v-if="legacyAvatars">
								<p v-if="avatarList.error" class="wp-admin-field-error wp-admin-legacy-failure" role="alert">{{ $__( 'This setting could not be displayed.', 'wp-admin-site' ) }}</p>
								<LegacyHtml v-else :html="settings.avatarHtml" :assets="legacy" />
							</template>
							<template v-else>
								<template v-for="( choice, index ) in choices.avatarDefault ?? []" :key="choice.value">
									<label><input type="radio" name="avatar_default" :id="'avatar_' + choice.value" :value="choice.value" :checked="values.avatar_default === choice.value" @change="values.avatar_default = choice.value" v-bind="index === 0 ? aria( 'avatar_default' ) : {}"> <img alt="" :src="choice.url" class="avatar avatar-32 photo avatar-default" height="32" width="32" loading="lazy" decoding="async"> {{ choice.label }}</label><br>
								</template>
							</template>
						</fieldset>
						<p v-for="item in errorsOf( 'avatar_default' )" :key="item.field" :id="item.field + '-error'" class="wp-admin-field-error">{{ item.message }}</p>
					</Contracted>

					<LegacyRows :fields="rows.avatars.value" :assets="legacy" />
				</Contracted>

				<SlotOutlet name="after-fields" :context="slotContext" />

				<LegacySections :sections="sections" :assets="legacy" />

				<p class="submit">
					<Button variant="primary" type="submit" id="submit" name="submit" :disabled="saving" :busy="saving">{{ $__( 'Save Changes', 'default' ) }}</Button>
				</p>

				<SlotOutlet name="after-submit" :context="slotContext" />
			</form>
		</div>
	`,
};
