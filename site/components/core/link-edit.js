import { computed, inject, nextTick, reactive, ref, shallowRef, watch } from 'vue';
import api from '@wp-admin/api';
import { __ } from '../../runtime/text.js';
import Contracted from '../../runtime/Contracted.js';
import { noticeElementId } from '../../runtime/notices.js';
import InlineMarkup from '../../kit/InlineMarkup.js';
import LegacyHtml from '../../kit/LegacyHtml.js';
import { adminHref } from './dashboard-parts/links.js';
import { DieError, failureText, followAnswer, usePageChrome } from './list-table-parts/page-chrome.js';
import SaveBox from './link-edit/save-box.js';
import CategoriesBox, { initialChecked } from './link-edit/categories-box.js';
import TargetBox from './link-edit/target-box.js';
import XfnBox from './link-edit/xfn-box.js';
import AdvancedBox from './link-edit/advanced-box.js';

const ROUTE = 'wp-admin/v1/links';
const SCREEN = 'link';
// The core boxes, which the page renders itself (edit-link-form.php adds them).
export const CORE_BOXES = [ 'linksubmitdiv', 'linkcategorydiv', 'linktargetdiv', 'linkxfndiv', 'linkadvanceddiv' ];
// The classic containers: the side boxes in the first, the normal and advanced ones after it.
const CONTAINER_IDS = { side: 'postbox-container-1', normal: 'postbox-container-2', advanced: 'postbox-container-3' };

const list = ( value ) => ( Array.isArray( value ) ? value : [] );
const text = ( value ) => ( value === null || value === undefined ? '' : String( value ) );

/** The form's values, as the classic fields hold them when the form opens. Pure. */
export function fieldsOf( data ) {
	const link = data?.link ?? {};
	const ratings = list( data?.advanced?.ratings );
	const rating = Number.isInteger( link.rating ) ? String( link.rating ) : text( ratings[ 0 ] ?? '0' );
	return {
		name: text( link.name ),
		url: text( link.url ),
		description: text( link.description ),
		private: data?.save?.private === true,
		categories: initialChecked( data?.categories ),
		target: typeof link.target === 'string' ? link.target : null,
		rel: text( data?.xfn?.rel ?? link.rel ),
		advanced: { image: text( link.image ), rss: text( link.rss ), notes: text( link.notes ), rating },
	};
}

/**
 * The fields the classic form posts, by name: an unchecked checkbox or radio is not sent
 * (`link_visible` only when private, `link_category` only with a checked category,
 * `link_target` only when one is checked). Pure.
 *
 * @param {object} fields The form's values (fieldsOf()).
 * @return {object} The fields of `POST links`.
 */
export function postedFields( fields ) {
	const posted = { link_name: fields.name, link_url: fields.url, link_description: fields.description };
	if ( fields.private ) {
		posted.link_visible = 'N';
	}
	if ( fields.categories.length > 0 ) {
		posted.link_category = [ ...fields.categories ];
	}
	if ( typeof fields.target === 'string' ) {
		posted.link_target = fields.target;
	}
	posted.link_rel = fields.rel;
	posted.link_image = fields.advanced.image;
	posted.link_rss = fields.advanced.rss;
	posted.link_notes = fields.advanced.notes;
	posted.link_rating = fields.advanced.rating;
	return posted;
}

/**
 * The contexts of the boxes' layout in the classic containers' order: `side`, then `normal`,
 * then the others (`advanced`), each present. Pure.
 */
export function orderedLayout( layout ) {
	const given = layout?.contexts && typeof layout.contexts === 'object' ? layout.contexts : {};
	const names = [ 'side', 'normal', ...Object.keys( given ).filter( ( name ) => name !== 'side' && name !== 'normal' ) ];
	return { contexts: Object.fromEntries( names.map( ( name ) => [ name, list( given[ name ] ) ] ) ) };
}

/** A plugin's box: its captured HTML, or a message when its callback failed. */
const BoxContent = {
	name: 'LinkEditBox',
	components: { LegacyHtml },
	props: {
		box: { type: Object, required: true },
	},
	template: `
		<p v-if="box.error" class="wp-admin-legacy-failure" role="alert">{{ $__( 'This box could not be displayed.', 'wp-admin-site' ) }}</p>
		<LegacyHtml v-else :html="box.html ?? ''" />
	`,
};

/**
 * Default implementation of core/link-edit: Add Link (wp-admin/link-add.php) and Edit Link
 * (wp-admin/link.php?action=edit) in the classic markup of edit-link-form.php: the Add Link
 * action, the notice (`#message`), then `form#addlink` (or `#editlink` for a link that exists)
 * with `#poststuff`, `#post-body` (`columns-1` or `columns-2`, the Layout the user chose), the
 * fixed boxes Name (`#namediv`), Web Address (`#addressdiv`) and Description
 * (`#descriptiondiv`), and the meta boxes (core/meta-box-holder, saved for screen `link`): the
 * Save box (`#linksubmitdiv`) in `#postbox-container-1`, then Categories (`#linkcategorydiv`),
 * Target (`#linktargetdiv`), Link Relationship (`#linkxfndiv`), Advanced (`#linkadvanceddiv`)
 * and the plugins' boxes. The body has the classes WordPress names while it is shown; the Name
 * field gets focus, as link.js gives it.
 *
 * Everything WordPress decides comes as data: the values, which target, categories and
 * relationships are checked, the boxes and their state, the Delete link and its question, where
 * the save leads. The page reproduces link.js, xfn.js and postbox.js (link-edit/*.js):
 *
 * - Save (`Add Link` or `Update Link`, or Return) posts `links` with the fields as the classic
 *   form posts them (postedFields()) and the page's path as the `referer`, or `links/{id}` for a
 *   link that exists, then follows the answer: Add Link opens again with "Link added." and an
 *   empty form, Update Link opens the Links list. A refused save shows WordPress's message in a
 *   focused notice and says it; the values stay.
 * - Delete asks WordPress's question (`confirm`, as the classic link's `onclick`), calls its route
 *   and follows the answer, which leads to the Links list.
 * - The plugins' boxes and the Save box's hooks are their HTML (kit/LegacyHtml), with their
 *   scripts; their fields are not sent with the save (the recorded gap), which a note says.
 *
 * `data.error` shows the classic screen's message instead of the form. The values are values of
 * the fields: nothing in them runs.
 */
export default {
	name: 'LinkEdit',
	components: { Contracted, InlineMarkup, LegacyHtml, SaveBox, CategoriesBox, TargetBox, XfnBox, AdvancedBox, BoxContent, DieError },
	props: {
		data: { type: Object, required: true },
		page: { type: Object, required: true },
	},
	emits: [ 'saved' ],
	setup( props, { emit } ) {
		const router = inject( 'router', null );
		const notices = inject( 'notices', null );
		const speak = inject( 'speak', null ) ?? ( ( message ) => globalThis.wp?.a11y?.speak?.( message ) );
		const ask = inject( 'confirm', ( message ) => globalThis.confirm?.( message ) === true );
		// The location shown (`pageLocation` may be provided: tests).
		const givenLocation = inject( 'pageLocation', null );
		const where = () => givenLocation ?? globalThis.location ?? { origin: 'http://localhost', pathname: '/wp-admin/link-add.php', search: '' };

		const nameField = shallowRef( null );
		// link.js: `$( '#link_name' ).trigger( 'focus' )`, when the form shows and again on new data.
		const focusName = () => nextTick( () => nameField.value?.focus?.() );
		const { pageFailed, dieError, blocked } = usePageChrome( props, { onShown: focusName } );
		const link = computed( () => props.data?.link ?? {} );
		const exists = computed( () => Number.isInteger( link.value.id ) && link.value.id > 0 );
		const save = computed( () => props.data?.save ?? { label: '', visitUrl: null, private: false, delete: null, submitHtml: {} } );
		const screenOptions = computed( () => ( props.data?.screenOptions && typeof props.data.screenOptions === 'object' ? props.data.screenOptions : null ) );
		const pluginBoxes = computed( () => list( props.data?.metaBoxes ).filter( ( box ) => typeof box?.id === 'string' && box.id !== '' && ! CORE_BOXES.includes( box.id ) ) );
		const boxIds = computed( () => [ ...CORE_BOXES, ...pluginBoxes.value.map( ( box ) => box.id ) ] );
		const boxes = computed( () => {
			const given = props.data?.layout?.boxes && typeof props.data.layout.boxes === 'object' ? props.data.layout.boxes : {};
			return Object.fromEntries( boxIds.value.filter( ( id ) => given[ id ] ).map( ( id ) => [ id, given[ id ] ] ) );
		} );
		const layout = computed( () => orderedLayout( props.data?.layout ) );
		const columns = ref( Number( screenOptions.value?.columns?.value ?? 0 ) || 0 );
		// The plugins print in the form here what the save does not send.
		const pluginOutput = computed( () => pluginBoxes.value.length > 0 || [ 'before', 'start', 'inside' ].some( ( where ) => Boolean( save.value.submitHtml?.[ where ] ) ) );

		const fields = reactive( fieldsOf( props.data ) );
		const sending = ref( false );
		const noticeShown = ref( true );

		/**
		 * A failed request is said in a page notice, spoken, and the notice is focused: that
		 * WordPress cannot be reached, WordPress's message, or the generic one.
		 */
		async function failed( reason, what ) {
			console.warn( what, reason );
			const shown = failureText( reason );
			const id = notices?.add?.( { type: 'error', message: shown, dismissible: true, scope: 'page' } );
			speak( shown );
			if ( id ) {
				await nextTick();
				globalThis.document?.getElementById?.( noticeElementId( id ) )?.focus?.();
			}
		}

		/** Opens where an answer leads; the form is read again when it is the address shown. */
		const follow = ( answer ) => followAnswer( { router, where: where() }, answer );

		async function submit( event ) {
			event?.preventDefault?.();
			if ( sending.value || blocked.value ) {
				return;
			}
			const body = { fields: postedFields( fields ) };
			if ( ! exists.value ) {
				// As the classic form's `_wp_http_referer`: an added link comes back here with `added`.
				body.referer = text( props.page?.path );
			}
			sending.value = true;
			try {
				const answer = await api.post( exists.value ? ROUTE + '/' + link.value.id : ROUTE, body );
				emit( 'saved', answer );
				await follow( answer );
			} catch ( reason ) {
				await failed( reason, 'Could not save the link:' );
			} finally {
				sending.value = false;
			}
		}

		async function remove() {
			const request = save.value.delete?.request;
			if ( sending.value || ! request || request.method !== 'DELETE' || typeof request.path !== 'string' ) {
				return;
			}
			// The classic link's `onclick="return confirm( '…' );"`, with WordPress's text.
			if ( ! ask( text( save.value.delete.confirm ) ) ) {
				return;
			}
			sending.value = true;
			try {
				await follow( await api.del( 'wp-admin/v1/' + request.path.replace( /^\/+/, '' ) ) );
			} catch ( reason ) {
				await failed( reason, 'Could not delete the link:' );
			} finally {
				sending.value = false;
			}
		}

		watch( () => props.data, ( data ) => {
			Object.assign( fields, fieldsOf( data ) );
			columns.value = Number( data?.screenOptions?.columns?.value ?? 0 ) || 0;
			noticeShown.value = true;
		} );

		const catId = computed( () => {
			const search = text( props.page?.path ).split( '?' )[ 1 ] ?? '';
			return String( Number.parseInt( new URLSearchParams( search ).get( 'cat_id' ) ?? '0', 10 ) || 0 );
		} );

		return {
			pageFailed, dieError, link, exists, save, screenOptions, pluginBoxes, boxes, layout, columns, pluginOutput,
			fields, sending, nameField, noticeShown, catId, submit, remove, failed,
			containerIds: CONTAINER_IDS,
			screen: SCREEN,
			formName: computed( () => ( exists.value ? 'editlink' : 'addlink' ) ),
			addressExample: computed( () => __( 'Example: <code>https://wordpress.org/</code> &#8212; do not forget the <code>https://</code>', 'default' ) ),
			href: ( path ) => adminHref( path ),
			setField: ( name ) => ( event ) => {
				fields[ name ] = text( event?.target?.value );
			},
			onColumns: ( count ) => {
				columns.value = count;
			},
		};
	},
	template: `
		<p v-if="pageFailed" class="wp-admin-link-edit-failed">{{ $__( 'The link form could not be loaded.', 'wp-admin-site' ) }}</p>
		<DieError v-else-if="dieError" :error="dieError" classes="wp-admin-link-edit-error" />
		<div v-else class="wp-admin-link-edit">
			<a :href="href( 'link-add.php' )" class="page-title-action">{{ $__( 'Add Link', 'default' ) }}</a>
			<hr class="wp-header-end">

			<div v-if="data.notice?.markup ? noticeShown : false" id="message" class="updated notice is-dismissible"><p><InlineMarkup :html="data.notice.markup" /></p><button type="button" class="notice-dismiss" @click="noticeShown = false"><span class="screen-reader-text">{{ $__( 'Dismiss this notice.', 'default' ) }}</span></button></div>

			<form :name="formName" :id="formName" method="post" @submit.prevent="submit">
				<div id="poststuff">
					<div id="post-body" :class="[ 'metabox-holder', columns === 1 ? 'columns-1' : 'columns-2' ]">
						<div id="post-body-content">
							<div id="namediv" class="postbox">
								<h2 class="postbox-header"><label for="link_name">{{ $_x( 'Name', 'link name', 'default' ) }}</label></h2>
								<div class="inside">
									<input ref="nameField" type="text" name="link_name" size="30" maxlength="255" :value="fields.name" id="link_name" @input="setField( 'name' )( $event )" />
									<p>{{ $__( 'Example: Nifty blogging software', 'default' ) }}</p>
								</div>
							</div>

							<div id="addressdiv" class="postbox">
								<h2 class="postbox-header"><label for="link_url">{{ $__( 'Web Address', 'default' ) }}</label></h2>
								<div class="inside">
									<input type="text" name="link_url" size="30" maxlength="255" class="code" :value="fields.url" id="link_url" @input="setField( 'url' )( $event )" />
									<p><InlineMarkup :html="addressExample" /></p>
								</div>
							</div>

							<div id="descriptiondiv" class="postbox">
								<h2 class="postbox-header"><label for="link_description">{{ $__( 'Description', 'default' ) }}</label></h2>
								<div class="inside">
									<input type="text" name="link_description" size="30" maxlength="255" :value="fields.description" id="link_description" @input="setField( 'description' )( $event )" />
									<p>{{ $__( 'This will be shown when someone hovers over the link in the blogroll, or optionally below the link.', 'default' ) }}</p>
								</div>
							</div>
						</div>

						<LegacyHtml v-if="save.submitHtml?.before" class="wp-admin-link-submitlink-before" :html="save.submitHtml.before" />

						<Contracted
							contract="core/meta-box-holder"
							:screen="screen"
							:layout="layout"
							:boxes="boxes"
							:reordering="screenOptions ? screenOptions.reordering !== false : true"
							:columns="columns"
							:sections="screenOptions?.sections ?? []"
							:column-choices="screenOptions?.columns?.choices ?? []"
							:container-ids="containerIds"
							:offer-screen-options="screenOptions !== null"
							@columns="onColumns"
						>
							<template #linksubmitdiv><SaveBox :save="save" v-model:private="fields.private" :sending="sending" @remove="remove" /></template>
							<template #linkcategorydiv><CategoriesBox :categories="data.categories ?? { all: [], popular: [], tab: 'all', canAdd: false }" v-model="fields.categories" @failed="failed" /></template>
							<template #linktargetdiv><TargetBox v-model="fields.target" /></template>
							<template #linkxfndiv><XfnBox :xfn="data.xfn ?? { rel: '', me: false, groups: [] }" v-model="fields.rel" /></template>
							<template #linkadvanceddiv><AdvancedBox v-model="fields.advanced" :ratings="data.advanced?.ratings ?? []" /></template>
							<template v-for="box in pluginBoxes" #[box.id]><BoxContent :box="box" /></template>
						</Contracted>

						<p v-if="pluginOutput" class="description wp-admin-link-edit-plugin-note">{{ $__( 'This screen does not save the fields plugins add to this form.', 'wp-admin-site' ) }}</p>

						<template v-if="exists">
							<input type="hidden" name="action" value="save" />
							<input type="hidden" name="link_id" :value="String( link.id )" />
							<input type="hidden" name="cat_id" :value="catId" />
						</template>
						<input v-else type="hidden" name="action" value="add" />
					</div>
				</div>
			</form>
		</div>
	`,
};
