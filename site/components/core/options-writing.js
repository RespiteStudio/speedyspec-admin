import { computed, ref, watch } from 'vue';
import { __ } from '../../runtime/text.js';
import Contracted from '../../runtime/Contracted.js';
import { SlotOutlet } from '../../runtime/slots.js';
import { toPagePath } from '../../runtime/router.js';
import { adminBase } from '../../runtime/menu.js';
import Button from '../../kit/Button.js';
import Interpolate from '../../kit/Interpolate.js';
import InlineMarkup from '../../kit/InlineMarkup.js';
import { LegacyRows, LegacySections } from './settings-form/legacy-fields.js';
import { useSettingsForm } from './settings-form/use-settings-form.js';
import { FIELDS, KEEP_INPUT, categoryLabel, classicFields, randomString } from './options-writing/state.js';

const ROUTE = 'wp-admin/v1/settings/writing';

// The classic screen's help, shown by the frame's Help panel.
export { help } from './options-writing/help.js';

/**
 * Default implementation of core/options-writing: the Writing Settings screen.
 *
 * The markup is the classic screen's: the first table (the Formatting checkboxes on sites
 * installed before WordPress 4.3, the default post category and format, the default link
 * category while the Link Manager is enabled), the "Post via email" section with its mail
 * table when post by email is enabled, and the "Update Services" section when the update
 * services are, with its field on a public site or a sentence linking to Reading Settings
 * otherwise; in its field order and with its headings, labels, ids and classes. Which parts
 * there are comes from the page data (`flags`, and the fields it has), as each follows a
 * classic condition. The rows are core/settings-field instances inside core/form-table, so
 * that a plugin can replace the page, a table or the row component, or add modules to the
 * page's slots. The root carries the classic body class `options-writing-php`.
 *
 * The three random strings the classic screen suggests for the secret mail address are drawn
 * in the browser (crypto.getRandomValues), so the template stays static; the mail password
 * starts masked with a toggle to show it, as user-profile.js does on the classic screen. The
 * fields plugins add with add_settings_field() are rendered at the end of the table whose
 * section they name (`default` and `remote_publishing` in the first table, `post_via_email`
 * in the mail table), and their sections after the screen's own parts. Saving is the shared
 * settings form's (settings-form/use-settings-form.js). A category or post format select
 * whose stored value is not a choice sends its first choice at every save, as the browser
 * posts the classic select (ruling P7, see classicFields() in options-writing/state.js).
 */
export default {
	name: 'OptionsWriting',
	components: { Contracted, SlotOutlet, Button, Interpolate, LegacyRows, LegacySections, InlineMarkup },
	props: {
		data: { type: Object, required: true },
		page: { type: Object, required: true },
	},
	emits: [ 'saved' ],
	setup( props, { emit } ) {
		const form = useSettingsForm( {
			data: () => props.data,
			route: ROUTE,
			fields: FIELDS,
			keepInput: KEEP_INPUT,
			classicFields,
			onSaved( next ) {
				emit( 'saved', next );
			},
		} );
		const { settings, errors, errorMarkup, generation } = form;

		const choices = computed( () => settings.value.choices ?? {} );
		const flags = computed( () => settings.value.flags ?? {} );

		const rows = {
			default: computed( () => form.legacyRows( 'default' ) ),
			remotePublishing: computed( () => form.legacyRows( 'remote_publishing' ) ),
			postViaEmail: computed( () => form.legacyRows( 'post_via_email' ) ),
		};

		// The password starts masked, and is masked again once the form is saved (user-profile.js masks it on submit).
		const passwordShown = ref( false );
		watch( generation, () => {
			passwordShown.value = false;
		} );

		// Three suggestions for the secret address, drawn once per visit as the classic screen draws them per load.
		const suggestions = [ randomString(), randomString(), randomString() ].map( ( text ) => ( { tag: 'kbd', text } ) );

		const base = computed( () => adminBase( toPagePath( globalThis.location ?? { pathname: '/wp-admin/', search: '' } ).siteId ) );

		/** Errors of the controls of a grouped row, each in an element its control references. */
		const errorsOf = ( ...fields ) => fields.filter( ( field ) => errors.value[ field ] ).map( ( field ) => ( { field, message: errors.value[ field ], markup: errorMarkup.value[ field ] ?? '' } ) );

		// Strings with markup are kept out of the template, whose attribute values cannot hold their quotes.
		const text = {
			smilies: computed( () => __( 'Convert emoticons like <code>:-)</code> and <code>:-P</code> to graphics on display', 'default' ) ),
			/* translators: 1, 2, 3: Examples of random email addresses. */
			postByEmail: computed( () => __( 'To post to WordPress by email, you must set up a secret email account with POP3 access. Any mail received at this address will be posted, so it&#8217;s a good idea to keep this address very secret. Here are three random strings you could use: %1$s, %2$s, %3$s.', 'default' ) ),
			/* translators: %s: Documentation URL. */
			pingSites: computed( () => __( 'When you publish a new post, WordPress automatically notifies the following site update services. For more about this, see the <a href="%s">Update Services</a> documentation article. Separate multiple service URLs with line breaks.', 'default' ) ),
			/* translators: 1: Documentation URL, 2: URL to Reading Settings screen. */
			notNotifying: computed( () => __( 'WordPress is not notifying any <a href="%1$s">Update Services</a> because of your site&#8217;s <a href="%2$s">visibility settings</a>.', 'default' ) ),
			updateServicesUrl: computed( () => __( 'https://developer.wordpress.org/advanced-administration/wordpress/update-services/', 'default' ) ),
		};
		// Each link of a sentence goes where the placeholder in its own tag says (see kit/Interpolate.js).
		const linkTags = { a: ( [ url ] ) => ( { href: url } ) };
		const readingUrl = computed( () => base.value + 'options-reading.php' );

		return { ...form, choices, flags, rows, passwordShown, suggestions, errorsOf, text, linkTags, readingUrl, categoryLabel };
	},
	template: `
		<div class="wp-admin-options-writing options-writing-php">
			<form ref="form" method="post" @submit.prevent="save" @input="onFormEdit" @change="onFormEdit">
				<SlotOutlet name="before-fields" :context="slotContext" />

				<Contracted id="core/form-table">
					<Contracted v-if="has( 'use_smilies' ) || has( 'use_balanceTags' )" contract="core/settings-field" id="formatting" :label="$__( 'Formatting', 'default' )" group>
						<fieldset><legend class="screen-reader-text"><span>{{ $__( 'Formatting', 'default' ) }}</span></legend>
							<label v-if="has( 'use_smilies' )" for="use_smilies">
								<input name="use_smilies" type="checkbox" id="use_smilies" value="1" :checked="values.use_smilies" @change="values.use_smilies = $event.target.checked" v-bind="aria( 'use_smilies' )">
								<Interpolate :text="text.smilies.value" :tags="{ code: {} }" /></label><br>
							<label v-if="has( 'use_balanceTags' )" for="use_balanceTags"><input name="use_balanceTags" type="checkbox" id="use_balanceTags" value="1" :checked="values.use_balanceTags" @change="values.use_balanceTags = $event.target.checked" v-bind="aria( 'use_balanceTags' )"> {{ $__( 'WordPress should correct invalidly nested XHTML automatically', 'default' ) }}</label>
						</fieldset>
						<p v-for="item in errorsOf( 'use_smilies', 'use_balanceTags' )" :key="item.field" :id="item.field + '-error'" class="wp-admin-field-error"><InlineMarkup v-if="item.markup" :html="item.markup" /><template v-else>{{ item.message }}</template></p>
					</Contracted>

					<Contracted v-if="has( 'default_category' )" contract="core/settings-field" id="default_category" :label="$__( 'Default Post Category', 'default' )" :error="errors.default_category" :error-markup="errorMarkup.default_category">
						<select name="default_category" id="default_category" class="postform" v-bind="aria( 'default_category' )" @change="values.default_category = Number( $event.target.value )">
							<option v-for="category in choices.categories ?? []" :key="category.value" :class="'level-' + category.depth" :value="String( category.value )" :selected="category.value === values.default_category">{{ categoryLabel( category ) }}</option>
						</select>
					</Contracted>

					<Contracted v-if="has( 'default_post_format' )" contract="core/settings-field" id="default_post_format" :label="$__( 'Default Post Format', 'default' )" :error="errors.default_post_format" :error-markup="errorMarkup.default_post_format">
						<select name="default_post_format" id="default_post_format" v-bind="aria( 'default_post_format' )" @change="values.default_post_format = $event.target.value">
							<option v-for="format in choices.postFormats ?? []" :key="format.value" :value="format.value" :selected="format.value === values.default_post_format">{{ format.label }}</option>
						</select>
					</Contracted>

					<Contracted v-if="has( 'default_link_category' )" contract="core/settings-field" id="default_link_category" :label="$__( 'Default Link Category', 'default' )" :error="errors.default_link_category" :error-markup="errorMarkup.default_link_category">
						<select name="default_link_category" id="default_link_category" class="postform" v-bind="aria( 'default_link_category' )" @change="values.default_link_category = Number( $event.target.value )">
							<option v-for="category in choices.linkCategories ?? []" :key="category.value" :class="'level-' + category.depth" :value="String( category.value )" :selected="category.value === values.default_link_category">{{ categoryLabel( category ) }}</option>
						</select>
					</Contracted>

					<LegacyRows :fields="rows.default.value" :assets="legacy" />
					<LegacyRows :fields="rows.remotePublishing.value" :assets="legacy" />
				</Contracted>

				<template v-if="flags.postByEmail">
					<h2 id="wp-settings-section-post-via-email" class="title">{{ $__( 'Post via email', 'default' ) }}</h2>
					<p><Interpolate :text="text.postByEmail.value" :args="suggestions" /></p>

					<Contracted id="core/form-table">
						<Contracted v-if="has( 'mailserver_url' )" contract="core/settings-field" id="mailserver_url" :label="$__( 'Mail Server', 'default' )">
							<input name="mailserver_url" type="text" id="mailserver_url" :value="values.mailserver_url" @input="values.mailserver_url = $event.target.value" class="regular-text code" v-bind="aria( 'mailserver_url' )">
							<label for="mailserver_port">{{ $__( 'Port', 'default' ) }}</label>
							<input name="mailserver_port" type="text" id="mailserver_port" :value="values.mailserver_port" @input="values.mailserver_port = $event.target.value" class="small-text" v-bind="aria( 'mailserver_port' )">
							<p v-for="item in errorsOf( 'mailserver_url', 'mailserver_port' )" :key="item.field" :id="item.field + '-error'" class="wp-admin-field-error"><InlineMarkup v-if="item.markup" :html="item.markup" /><template v-else>{{ item.message }}</template></p>
						</Contracted>

						<Contracted v-if="has( 'mailserver_login' )" contract="core/settings-field" id="mailserver_login" :label="$__( 'Login Name', 'default' )" :error="errors.mailserver_login" :error-markup="errorMarkup.mailserver_login">
							<input name="mailserver_login" type="text" id="mailserver_login" :value="values.mailserver_login" @input="values.mailserver_login = $event.target.value" class="regular-text ltr" v-bind="aria( 'mailserver_login' )">
						</Contracted>

						<Contracted v-if="has( 'mailserver_pass' )" contract="core/settings-field" id="mailserver_pass" class="mailserver-pass-wrap" :label="$__( 'Password', 'default' )" :error="errors.mailserver_pass" :error-markup="errorMarkup.mailserver_pass">
							<input type="hidden" value=" ">
							<span class="wp-pwd">
								<input :type="passwordShown ? 'text' : 'password'" name="mailserver_pass" id="mailserver_pass" class="regular-text ltr" autocomplete="off" :value="values.mailserver_pass" @input="values.mailserver_pass = $event.target.value" v-bind="aria( 'mailserver_pass' )">
								<button type="button" class="button wp-hide-pw hide-if-no-js" :data-toggle="passwordShown ? '1' : '0'" :aria-label="passwordShown ? $__( 'Hide password', 'default' ) : $__( 'Show password', 'default' )" @click="passwordShown = ! passwordShown">
									<span :class="[ 'dashicons', passwordShown ? 'dashicons-hidden' : 'dashicons-visibility' ]" aria-hidden="true"></span>
								</button>
							</span>
						</Contracted>

						<Contracted v-if="has( 'default_email_category' )" contract="core/settings-field" id="default_email_category" :label="$__( 'Default Mail Category', 'default' )" :error="errors.default_email_category" :error-markup="errorMarkup.default_email_category">
							<select name="default_email_category" id="default_email_category" class="postform" v-bind="aria( 'default_email_category' )" @change="values.default_email_category = Number( $event.target.value )">
								<option v-for="category in choices.categories ?? []" :key="category.value" :class="'level-' + category.depth" :value="String( category.value )" :selected="category.value === values.default_email_category">{{ categoryLabel( category ) }}</option>
							</select>
						</Contracted>

						<LegacyRows :fields="rows.postViaEmail.value" :assets="legacy" />
					</Contracted>
				</template>

				<template v-if="flags.updateServices">
					<h2 id="wp-settings-section-update-services" class="title">{{ $__( 'Update Services', 'default' ) }}</h2>

					<template v-if="has( 'ping_sites' )">
						<p><label for="ping_sites"><Interpolate :text="text.pingSites.value" :args="[ text.updateServicesUrl.value ]" :tags="linkTags" /></label></p>
						<textarea name="ping_sites" id="ping_sites" class="large-text code" rows="3" :value="values.ping_sites" @input="values.ping_sites = $event.target.value" v-bind="aria( 'ping_sites' )"></textarea>
						<p v-if="errors.ping_sites" id="ping_sites-error" class="wp-admin-field-error"><InlineMarkup v-if="errorMarkup.ping_sites" :html="errorMarkup.ping_sites" /><template v-else>{{ errors.ping_sites }}</template></p>
					</template>

					<p v-else-if="! flags.blogPublic"><Interpolate :text="text.notNotifying.value" :args="[ text.updateServicesUrl.value, readingUrl ]" :tags="linkTags" /></p>
				</template>

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
