import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
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
import { FIELDS, KEEP_INPUT, aroundPlaceholder, checkboxValuesFor, controlIdsFor, pageLabel, unpostedPages } from './options-reading/state.js';

const ROUTE = 'wp-admin/v1/settings/reading';

// The classic screen's help, shown by the frame's Help panel.
export { help } from './options-reading/help.js';

/** How long the page looks for the element a URL fragment names while its rows resolve. */
const FRAGMENT_TRIES = 40;
const FRAGMENT_DELAY = 50;

/**
 * Default implementation of core/options-reading: the Reading Settings screen.
 *
 * The markup is the classic screen's table: the homepage choice when the site has pages
 * (the two page selectors sit inside core's translated sentences "Homepage: %s" and "Posts
 * page: %s", split around the placeholder, and are disabled unless "A static page" is
 * chosen, as options_reading_add_js() does; the warnings come from the page data), the
 * numbers of posts and feed items, the feed content, the site visibility, and the encoding
 * field on a site that does not use UTF-8; in its field order and with its labels, ids and
 * classes. The rows are core/settings-field instances inside core/form-table, so that a
 * plugin can replace the page, the table or the row component, or add modules to the
 * page's slots.
 *
 * Site visibility is the "Discourage search engines" checkbox (`#blog_public`, posting `0`
 * when checked), or, when the `blog_privacy_selector` action has callbacks, the classic
 * radio buttons followed by the action's output (plugin markup, see kit/LegacyHtml.js).
 * The radio buttons plugins add there share the name `blog_public` with the core ones, so
 * the browser keeps one of them chosen, and the value of a chosen plugin radio button is
 * the field's value. The fields plugins add with add_settings_field() to the `default`
 * section are rendered at the end of the table, and their sections after it. As the
 * classic form, a disabled or missing page selector posts nothing: its field is saved as 0.
 * A URL fragment naming a control of the page (Site Health links `#blog_public`) scrolls to
 * it and focuses it once it is rendered. Saving is the shared settings form's
 * (settings-form/use-settings-form.js).
 */
export default {
	name: 'OptionsReading',
	components: { Contracted, SlotOutlet, Button, Interpolate, LegacyHtml, LegacyRows, LegacySections },
	props: {
		data: { type: Object, required: true },
		page: { type: Object, required: true },
	},
	emits: [ 'saved' ],
	setup( props, { emit } ) {
		// Whether the visibility radio buttons are shown: the action's callbacks, which a save does not change.
		const privacySelector = props.data?.flags?.privacySelector === true;

		const form = useSettingsForm( {
			data: () => props.data,
			route: ROUTE,
			fields: FIELDS,
			keepInput: KEEP_INPUT,
			controlIds: controlIdsFor( privacySelector ),
			checkboxValues: checkboxValuesFor( privacySelector ),
			onSaved( next ) {
				emit( 'saved', next );
			},
		} );
		const { settings, values, errors } = form;

		const choices = computed( () => settings.value.choices ?? {} );
		const flags = computed( () => settings.value.flags ?? {} );
		const warnings = computed( () => settings.value.warnings ?? {} );
		const privacyAction = computed( () => settings.value.legacySections?.actions?.blog_privacy_selector ?? { hooked: false, html: '', error: false } );
		const rows = computed( () => form.legacyRows( 'default' ) );
		const staticPage = computed( () => values.show_on_front === 'page' );
		const showHomepage = computed( () => flags.value.pages === true && form.has( 'show_on_front' ) );

		const base = computed( () => adminBase( toPagePath( globalThis.location ?? { pathname: '/wp-admin/', search: '' } ).siteId ) );
		const pagesUrl = computed( () => base.value + 'edit.php?post_type=page' );

		/** Errors of the controls of a grouped row, each in an element its control references. */
		const errorsOf = ( ...fields ) => fields.filter( ( field ) => errors.value[ field ] ).map( ( field ) => ( { field, message: errors.value[ field ] } ) );

		// Strings with markup or character references are kept out of the template, which would decode them.
		const text = {
			/* translators: %s: URL to Pages screen. */
			staticPage: computed( () => __( 'A <a href="%s">static page</a> (select below)', 'default' ) ),
			/* translators: %s: Select field to choose the front page. */
			homepage: computed( () => aroundPlaceholder( __( 'Homepage: %s', 'default' ) ) ),
			/* translators: %s: Select field to choose the page for posts. */
			postsPage: computed( () => aroundPlaceholder( __( 'Posts page: %s', 'default' ) ) ),
			select: computed( () => decodeEntities( __( '&mdash; Select &mdash;', 'default' ) ) ),
			samePages: computed( () => __( '<strong>Warning:</strong> these pages should not be the same!', 'default' ) ),
			privacyPage: computed( () => __( '<strong>Warning:</strong> these pages should not be the same as your Privacy Policy page!', 'default' ) ),
			/* translators: %s: Documentation URL. */
			theme: computed( () => __( 'Your theme determines how content is displayed in browsers. <a href="%s">Learn more about feeds</a>.', 'default' ) ),
			feedsUrl: computed( () => __( 'https://developer.wordpress.org/advanced-administration/wordpress/feeds/', 'default' ) ),
			neither: computed( () => decodeEntities( __( 'Note: Neither of these options blocks access to your site &mdash; it is up to search engines to honor your request.', 'default' ) ) ),
			charset: computed( () => __( 'The <a href="https://wordpress.org/documentation/article/wordpress-glossary/#character-set">character encoding</a> of your site (UTF-8 is recommended)', 'default' ) ),
		};
		const visibilityTitle = computed( () => ( privacySelector ? __( 'Site visibility', 'default' ) : __( 'Search engine visibility', 'default' ) ) );
		const linkTags = { a: ( [ url ] ) => ( { href: url } ) };
		const charsetTags = computed( () => {
			const match = /<a\s[^>]*href="([^"]*)"/i.exec( text.charset.value );
			return { a: { href: match ? match[ 1 ] : 'https://wordpress.org/documentation/article/wordpress-glossary/#character-set' } };
		} );

		/** A number input's value as the field's number (an empty input is 0, which WordPress saves as 1). */
		const toNumber = ( value ) => ( value === '' ? 0 : Number( value ) );

		/** A plugin radio button of the privacy selector was chosen: its value is the field's. */
		function onPrivacyChange( event ) {
			const target = event?.target;
			if ( target?.closest?.( '.wp-admin-legacy-html' ) && target.name === 'blog_public' && target.checked ) {
				form.setValue( 'blog_public', String( target.value ) );
			}
		}

		/** Saves as the classic form posts: a disabled or missing page selector saves 0. */
		async function submit() {
			if ( form.saving.value ) {
				return;
			}
			const before = settings.value;
			const cleared = unpostedPages( values, choices.value );
			const kept = {};
			for ( const field of Object.keys( cleared ) ) {
				kept[ field ] = values[ field ];
				values[ field ] = 0;
			}
			await form.save();
			if ( settings.value === before ) {
				// Nothing was saved: the selectors keep what the user chose.
				Object.assign( values, kept );
			}
		}

		// The control a URL fragment names (e.g. Site Health's options-reading.php#blog_public), once rendered.
		const root = ref( null );
		let timer = null;
		onMounted( () => {
			const hash = String( globalThis.location?.hash ?? '' );
			const doc = globalThis.document;
			if ( hash.length < 2 || ! doc?.getElementById ) {
				return;
			}
			let id;
			try {
				id = decodeURIComponent( hash.slice( 1 ) );
			} catch {
				return;
			}
			let tries = 0;
			const land = () => {
				timer = null;
				const target = doc.getElementById( id );
				if ( target && root.value?.contains?.( target ) ) {
					target.scrollIntoView?.( { block: 'center' } );
					target.focus?.( { preventScroll: true } );
					return;
				}
				if ( ++tries < FRAGMENT_TRIES ) {
					timer = setTimeout( land, FRAGMENT_DELAY );
				}
			};
			land();
		} );
		onBeforeUnmount( () => {
			if ( timer !== null ) {
				clearTimeout( timer );
			}
		} );

		return {
			...form, save: submit, root, choices, flags, warnings, privacySelector, privacyAction, rows, staticPage, showHomepage,
			pagesUrl, errorsOf, text, visibilityTitle, linkTags, charsetTags, toNumber, onPrivacyChange, pageLabel,
		};
	},
	template: `
		<div ref="root" class="wp-admin-options-reading">
			<form ref="form" method="post" @submit.prevent="save" @input="onFormEdit" @change="onFormEdit">
				<SlotOutlet name="before-fields" :context="slotContext" />

				<Contracted id="core/form-table">
					<Contracted v-if="showHomepage" contract="core/settings-field" id="show_on_front" :label="$__( 'Your homepage displays', 'default' )" group>
						<fieldset id="front-static-pages">
							<legend class="screen-reader-text"><span>{{ $__( 'Your homepage displays', 'default' ) }}</span></legend>
							<p><label>
								<input id="show-on-front-posts" name="show_on_front" type="radio" value="posts" :checked="values.show_on_front === 'posts'" @change="values.show_on_front = 'posts'" v-bind="aria( 'show_on_front' )">
								{{ $__( 'Your latest posts', 'default' ) }}
							</label></p>
							<p><label>
								<input name="show_on_front" type="radio" value="page" :checked="values.show_on_front === 'page'" @change="values.show_on_front = 'page'">
								<Interpolate :text="text.staticPage.value" :args="[ pagesUrl ]" :tags="linkTags" />
							</label></p>
							<ul>
								<li><label for="page_on_front">{{ text.homepage.value.before }}<select v-if="( choices.pageOnFront ?? [] ).length" name="page_on_front" id="page_on_front" :disabled="! staticPage" v-bind="aria( 'page_on_front' )" @change="values.page_on_front = Number( $event.target.value )">
									<option value="0" :selected="! values.page_on_front">{{ text.select.value }}</option>
									<option v-for="choice in choices.pageOnFront" :key="choice.value" :class="'level-' + choice.depth" :value="String( choice.value )" :selected="choice.value === values.page_on_front">{{ pageLabel( choice ) }}</option>
								</select>{{ text.homepage.value.after }}</label></li>
								<li><label for="page_for_posts">{{ text.postsPage.value.before }}<select v-if="( choices.pageForPosts ?? [] ).length" name="page_for_posts" id="page_for_posts" :disabled="! staticPage" v-bind="aria( 'page_for_posts' )" @change="values.page_for_posts = Number( $event.target.value )">
									<option value="0" :selected="! values.page_for_posts">{{ text.select.value }}</option>
									<option v-for="choice in choices.pageForPosts" :key="choice.value" :class="'level-' + choice.depth" :value="String( choice.value )" :selected="choice.value === values.page_for_posts">{{ pageLabel( choice ) }}</option>
								</select>{{ text.postsPage.value.after }}</label></li>
							</ul>
							<div v-if="warnings.frontPage" id="front-page-warning" class="notice notice-warning inline"><p><Interpolate :text="text.samePages.value" :tags="{ strong: {} }" /></p></div>
							<div v-if="warnings.privacyPolicy" id="privacy-policy-page-warning" class="notice notice-warning inline"><p><Interpolate :text="text.privacyPage.value" :tags="{ strong: {} }" /></p></div>
						</fieldset>
						<p v-for="item in errorsOf( 'show_on_front', 'page_on_front', 'page_for_posts' )" :key="item.field" :id="item.field + '-error'" class="wp-admin-field-error">{{ item.message }}</p>
					</Contracted>

					<Contracted v-if="has( 'posts_per_page' )" contract="core/settings-field" id="posts_per_page" :label="$__( 'Number of recent posts shown on archive pages', 'default' )" :error="errors.posts_per_page">
						<input name="posts_per_page" type="number" step="1" min="1" id="posts_per_page" :value="values.posts_per_page" @input="values.posts_per_page = toNumber( $event.target.value )" class="small-text" v-bind="aria( 'posts_per_page' )">
					</Contracted>

					<Contracted v-if="has( 'posts_per_rss' )" contract="core/settings-field" id="posts_per_rss" :label="$__( 'Number of recent items shown in syndication feeds', 'default' )" :error="errors.posts_per_rss">
						<input name="posts_per_rss" type="number" step="1" min="1" id="posts_per_rss" :value="values.posts_per_rss" @input="values.posts_per_rss = toNumber( $event.target.value )" class="small-text" v-bind="aria( 'posts_per_rss' )">
					</Contracted>

					<Contracted v-if="has( 'rss_use_excerpt' )" contract="core/settings-field" id="rss_use_excerpt" :label="$__( 'For each post in a feed, include', 'default' )" group>
						<fieldset aria-describedby="rss-use-excerpt-description">
							<legend class="screen-reader-text">{{ $__( 'For each post in a feed, include', 'default' ) }}</legend>
							<input id="rss-use-full-text" name="rss_use_excerpt" type="radio" value="0" :checked="values.rss_use_excerpt === '0'" @change="values.rss_use_excerpt = '0'" v-bind="aria( 'rss_use_excerpt' )">
							<label for="rss-use-full-text">{{ $__( 'Full text', 'default' ) }}</label><br>
							<input id="rss-use-excerpt" name="rss_use_excerpt" type="radio" value="1" :checked="values.rss_use_excerpt === '1'" @change="values.rss_use_excerpt = '1'">
							<label for="rss-use-excerpt">{{ $__( 'Excerpt', 'default' ) }}</label>
							<p class="description" id="rss-use-excerpt-description"><Interpolate :text="text.theme.value" :args="[ text.feedsUrl.value ]" :tags="linkTags" /></p>
						</fieldset>
						<p v-for="item in errorsOf( 'rss_use_excerpt' )" :key="item.field" :id="item.field + '-error'" class="wp-admin-field-error">{{ item.message }}</p>
					</Contracted>

					<Contracted v-if="has( 'blog_public' )" contract="core/settings-field" id="blog_public" class="option-site-visibility" :label="visibilityTitle" group>
						<fieldset v-if="privacySelector" aria-describedby="option-site-visibility-description" @change="onPrivacyChange">
							<legend class="screen-reader-text"><span>{{ visibilityTitle }}</span></legend>
							<input id="blog-public" type="radio" name="blog_public" value="1" :checked="values.blog_public === '1'" @change="values.blog_public = '1'" v-bind="aria( 'blog_public' )">
							<label for="blog-public">{{ $__( 'Allow search engines to index this site', 'default' ) }}</label><br>
							<input id="blog-norobots" type="radio" name="blog_public" value="0" :checked="values.blog_public === '0'" @change="values.blog_public = '0'">
							<label for="blog-norobots">{{ $__( 'Discourage search engines from indexing this site', 'default' ) }}</label>
							<p id="option-site-visibility-description" class="description">{{ text.neither.value }}</p>
							<p v-if="privacyAction.error" class="wp-admin-field-error wp-admin-legacy-failure" role="alert">{{ $__( 'This setting could not be displayed.', 'wp-admin-site' ) }}</p>
							<LegacyHtml v-else :html="privacyAction.html" :assets="legacy" />
						</fieldset>
						<fieldset v-else>
							<legend class="screen-reader-text"><span>{{ visibilityTitle }}</span></legend>
							<input name="blog_public" type="checkbox" id="blog_public" v-bind="aria( 'blog_public', 'option-site-visibility-description' )" value="0" :checked="values.blog_public" @change="values.blog_public = $event.target.checked">
							<label for="blog_public">{{ $__( 'Discourage search engines from indexing this site', 'default' ) }}</label>
							<p id="option-site-visibility-description" class="description">{{ $__( 'It is up to search engines to honor this request.', 'default' ) }}</p>
						</fieldset>
						<p v-for="item in errorsOf( 'blog_public' )" :key="item.field" :id="item.field + '-error'" class="wp-admin-field-error">{{ item.message }}</p>
					</Contracted>

					<LegacyRows :fields="rows" :assets="legacy" />

					<Contracted v-if="has( 'blog_charset' )" contract="core/settings-field" id="blog_charset" :label="$__( 'Encoding for pages and feeds', 'default' )" :error="errors.blog_charset">
						<input name="blog_charset" type="text" id="blog_charset" :value="values.blog_charset" @input="values.blog_charset = $event.target.value" class="regular-text" v-bind="aria( 'blog_charset', 'blog_charset-description' )">
						<p class="description" id="blog_charset-description"><Interpolate :text="text.charset.value" :tags="charsetTags" /></p>
					</Contracted>
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
