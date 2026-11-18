import { computed, inject, nextTick, ref, shallowRef, watch } from 'vue';
import api from '@wp-admin/api';
import { __ } from '../../runtime/text.js';
import { SlotOutlet } from '../../runtime/slots.js';
import { toPagePath } from '../../runtime/router.js';
import { adminBase } from '../../runtime/menu.js';
import { noticeElementId } from '../../runtime/notices.js';
import Button from '../../kit/Button.js';
import Interpolate from '../../kit/Interpolate.js';

const ROUTE = 'wp-admin/v1/settings/privacy';
const CREATE_ROUTE = 'wp-admin/v1/settings/privacy/page';

// The classic screen's help, shown by the frame's Help panel.
export { help } from './options-privacy/help.js';

/**
 * Default implementation of core/options-privacy: the Privacy Settings screen.
 *
 * The markup is the classic screen's (wp-admin/options-privacy.php): the tab strip
 * (Settings, and the Policy Guide, which stays the classic screen), the introduction, the
 * links to edit and view the Privacy Policy page when it exists, the link to the guide, and
 * the table with the two actions, each a form of its own as on the classic screen: "Create"
 * a new page, and, when there are pages, the page select with "Use This Page". Its root
 * carries the classic body class `privacy-settings`, for core's edit.css.
 *
 * The notices of the page data (the selected page is missing or in the Trash) are shown when
 * the page opens, and with the notice of the change after "Use This Page", as on the classic
 * screen. "Create" goes to the new page's editor (the hosted classic editor), as the classic
 * screen's redirect does. A select changed but not used is an unsaved change.
 */
export default {
	name: 'OptionsPrivacy',
	components: { SlotOutlet, Button, Interpolate },
	props: {
		data: { type: Object, required: true },
		page: { type: Object, required: true },
	},
	emits: [ 'saved', 'created' ],
	setup( props, { emit } ) {
		const router = inject( 'router', null );
		const notices = inject( 'notices', null );
		const pageState = inject( 'pageState', null );

		const settings = shallowRef( props.data ); // What the server last said.
		const choice = ref( String( props.data.selected ?? '' ) ); // The select's value.
		const busy = ref( null ); // 'set' or 'create' while a request runs.

		const base = computed( () => adminBase( toPagePath( globalThis.location ?? { pathname: '/wp-admin/', search: '' } ).siteId ) );
		const pages = computed( () => settings.value.choices?.pages ?? [] );
		const hasPages = computed( () => settings.value.hasPages === true );
		const pageExists = computed( () => settings.value.pageExists === true );
		const published = computed( () => settings.value.pageStatus === 'publish' );
		const editHref = computed( () => ( typeof settings.value.editPath === 'string' ? base.value + settings.value.editPath : '' ) );
		const viewHref = computed( () => ( typeof settings.value.viewUrl === 'string' ? settings.value.viewUrl : '' ) );
		const guideHref = computed( () => base.value + 'options-privacy.php?tab=policyguide' );
		const slotContext = computed( () => ( { settings: settings.value } ) );

		const dirty = computed( () => choice.value !== String( settings.value.selected ?? '' ) );
		watch( dirty, ( value ) => pageState?.setDirty( value ), { immediate: true } );

		/** Shows notices; returns the id of the first one shown. */
		function addNotices( list ) {
			const ids = ( Array.isArray( list ) ? list : [] ).map( ( notice ) => {
				const markup = typeof notice?.markup === 'string' && notice.markup !== '' ? { markup: notice.markup } : {};
				return notices?.add( { type: notice?.type, message: notice?.message, ...markup, dismissible: true } ) ?? null;
			} );
			return ids.find( ( id ) => id ) ?? null;
		}

		async function focusNotice( id ) {
			if ( ! id ) {
				return;
			}
			await nextTick();
			globalThis.document?.getElementById( noticeElementId( id ) )?.focus();
		}

		function show( next ) {
			settings.value = next;
			choice.value = String( next.selected ?? '' );
		}

		// The notices the classic screen shows on load.
		addNotices( props.data.notices );

		// A new page entry (the router's answer again, e.g. after the language changed).
		watch( () => props.data, ( next ) => {
			if ( next && next !== settings.value ) {
				show( next );
				addNotices( next.notices );
			}
		} );

		/** The notice of a failed request. */
		function failure( error ) {
			if ( error?.code === 'admin_upstream_unreachable' || error?.status === 0 ) {
				return { type: 'error', message: __( 'WordPress cannot be reached right now. Please try again in a moment.', 'wp-admin-site' ) };
			}
			return { type: 'error', message: String( error?.message || __( 'Your changes could not be saved. Please try again.', 'wp-admin-site' ) ) };
		}

		/** "Use This Page": sets the selected page. */
		async function setPage() {
			if ( busy.value ) {
				return;
			}
			busy.value = 'set';
			try {
				const answer = await api.post( ROUTE, { page: Number( choice.value ) || 0 } );
				const { notices: raised = [], ...next } = answer ?? {};
				show( { ...next, notices: [] } );
				const id = addNotices( raised );
				emit( 'saved', settings.value );
				await focusNotice( id );
			} catch ( error ) {
				await focusNotice( addNotices( [ failure( error ) ] ) );
			} finally {
				busy.value = null;
			}
		}

		/** "Create": creates a draft Privacy Policy page and goes to its editor. */
		async function create() {
			if ( busy.value ) {
				return;
			}
			busy.value = 'create';
			let target = null;
			try {
				const answer = await api.post( CREATE_ROUTE, {} );
				if ( typeof answer?.editPath !== 'string' || answer.editPath === '' ) {
					throw new Error( __( 'Your changes could not be saved. Please try again.', 'wp-admin-site' ) );
				}
				emit( 'created', { page: answer.page, editPath: answer.editPath } );
				target = base.value + answer.editPath;
			} catch ( error ) {
				await focusNotice( addNotices( [ failure( error ) ] ) );
			} finally {
				busy.value = null;
			}
			if ( target !== null ) {
				// The option is set: nothing here is unsaved any more.
				pageState?.setDirty( false );
				if ( typeof router?.navigate === 'function' ) {
					await router.navigate( target );
				} else {
					globalThis.location?.assign?.( target );
				}
			}
		}

		// Strings with markup or placeholders are kept out of the template, which would decode them.
		const text = {
			editView: computed( () => __( '<a href="%1$s">Edit</a> or <a href="%2$s">view</a> your Privacy Policy page content.', 'default' ) ),
			editPreview: computed( () => __( '<a href="%1$s">Edit</a> or <a href="%2$s">preview</a> your Privacy Policy page content.', 'default' ) ),
			guide: computed( () => __( 'Need help putting together your new Privacy Policy page? <a href="%1$s" %2$s>Check out the privacy policy guide%3$s</a> for recommendations on what content to include, along with policies suggested by your plugins and theme.', 'default' ) ),
		};
		// Each link of a sentence takes the URL its placeholder names, whatever order a translation puts them in.
		const linkTags = { a: ( taken ) => ( { href: taken[ 0 ] } ) };

		return {
			settings, choice, busy, pages, hasPages, pageExists, published, editHref, viewHref, guideHref, base,
			slotContext, text, linkTags, setPage, create,
		};
	},
	template: `
		<div class="wp-admin-options-privacy privacy-settings">
			<div class="privacy-settings-header">
				<nav class="privacy-settings-tabs-wrapper hide-if-no-js" :aria-label="$__( 'Secondary menu', 'default' )">
					<a :href="base + 'options-privacy.php'" class="privacy-settings-tab active" aria-current="true">
						{{ $_x( 'Settings', 'Privacy Settings', 'default' ) }}
					</a>

					<a :href="guideHref" class="privacy-settings-tab">
						{{ $_x( 'Policy Guide', 'Privacy Settings', 'default' ) }}
					</a>
				</nav>
			</div>

			<hr class="wp-header-end">

			<div class="privacy-settings-body hide-if-no-js">
				<h2>{{ $__( 'Privacy Settings', 'default' ) }}</h2>
				<p>
					{{ $__( 'As a website owner, you may need to follow national or international privacy laws. For example, you may need to create and display a privacy policy.', 'default' ) }}
					{{ $__( 'If you already have a Privacy Policy page, please select it below. If not, please create one.', 'default' ) }}
				</p>
				<p>
					{{ $__( 'The new page will include help and suggestions for your privacy policy.', 'default' ) }}
					{{ $__( 'However, it is your responsibility to use those resources correctly, to provide the information that your privacy policy requires, and to keep that information current and accurate.', 'default' ) }}
				</p>
				<p>
					{{ $__( 'After your Privacy Policy page is set, you should edit it.', 'default' ) }}
					{{ $__( 'You should also review your privacy policy from time to time, especially after installing or updating any themes or plugins. There may be changes or new suggested information for you to consider adding to your policy.', 'default' ) }}
				</p>
				<p>
					<template v-if="pageExists"><strong class="wp-admin-privacy-page-links"><Interpolate :text="published ? text.editView.value : text.editPreview.value" :args="[ editHref, viewHref ]" :tags="linkTags" /></strong>{{ ' ' }}</template>
					<Interpolate :text="text.guide.value" :args="[ guideHref, '', '' ]" :tags="linkTags" />
				</p>
				<hr>

				<SlotOutlet name="before-fields" :context="slotContext" />

				<table class="form-table tools-privacy-policy-page" role="presentation">
					<tr>
						<th scope="row">
							<label for="create-page">{{ hasPages ? $__( 'Create a new Privacy Policy page', 'default' ) : $__( 'There are no pages.', 'default' ) }}</label>
						</th>
						<td>
							<form class="wp-create-privacy-page" method="post" @submit.prevent="create">
								<Button type="submit" id="create-page" name="submit" :disabled="busy !== null" :busy="busy === 'create'">{{ $__( 'Create', 'default' ) }}</Button>
							</form>
						</td>
					</tr>
					<tr v-if="hasPages">
						<th scope="row">
							<label for="page_for_privacy_policy">{{ pageExists ? $__( 'Change your Privacy Policy page', 'default' ) : $__( 'Select a Privacy Policy page', 'default' ) }}</label>
						</th>
						<td>
							<form method="post" @submit.prevent="setPage">
								<select name="page_for_privacy_policy" id="page_for_privacy_policy" :value="choice" @change="choice = $event.target.value">
									<option v-for="option in pages" :key="option.value" :value="option.value" :selected="option.value === choice">{{ option.label }}</option>
								</select>
								{{ ' ' }}<Button variant="primary" type="submit" id="set-page" name="submit" :disabled="busy !== null" :busy="busy === 'set'">{{ $__( 'Use This Page', 'default' ) }}</Button>
							</form>
						</td>
					</tr>
				</table>

				<SlotOutlet name="after-fields" :context="slotContext" />
			</div>
		</div>
	`,
};
