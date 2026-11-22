import { computed, inject, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue';
import api from '@wp-admin/api';
import { __ } from '../../runtime/text.js';
import { redirectTarget } from '../../runtime/router.js';
import { noticeElementId } from '../../runtime/notices.js';
import InlineMarkup from '../../kit/InlineMarkup.js';
import LegacyHtml from '../../kit/LegacyHtml.js';
import { adminHref } from './dashboard-parts/links.js';
import { showNoticeShim, useClassicGlobals, warnText } from './list-table-parts/list-page.js';

const ROUTE = 'wp-admin/v1/terms/';
// The screen whose answer the term routes give (wp_admin_term_answer_builders()).
const ANSWER_SCREEN = 'term';

const list = ( value ) => ( Array.isArray( value ) ? value : [] );
const text = ( value ) => ( value === null || value === undefined ? '' : String( value ) );

/** The class of a parent option (`level-N`), none for None. Pure. */
export const optionClass = ( option ) => ( Number.isInteger( option?.level ) ? 'level-' + option.level : null );

/**
 * The DELETE route of a term from its edit screen: the route WordPress described, with the
 * taxonomy, the screen and the referer in the query string (a DELETE has no body). Pure.
 *
 * @param {string} path     The request's path (`terms/{id}`).
 * @param {string} taxonomy The taxonomy.
 * @param {string} referer  The page's path, as the classic link's referer.
 * @return {string} The route with its query.
 */
export function deleteRoute( path, taxonomy, referer ) {
	const route = 'wp-admin/v1/' + text( path ).replace( /^\/+/, '' );
	const params = new URLSearchParams();
	params.append( 'taxonomy', taxonomy );
	params.append( 'screen', ANSWER_SCREEN );
	params.append( 'referer', referer );
	return route + ( route.includes( '?' ) ? '&' : '?' ) + params.toString();
}

/** The value the parent select starts with: the option WordPress printed `selected`, else the first (as a browser shows it). Pure. */
const startParent = ( parent ) => {
	const selected = text( parent?.selected );
	if ( selected !== '' ) {
		return selected;
	}
	return text( list( parent?.options )[ 0 ]?.value ?? '-1' ) || '-1';
};

const fieldsOf = ( data ) => ( {
	name: text( data?.term?.name ),
	slug: text( data?.term?.slug ),
	description: text( data?.term?.description ),
	parent: startParent( data?.fields?.parent ),
} );

/**
 * Default implementation of core/term-edit: a term's edit screen (wp-admin/term.php) in the
 * classic markup of edit-tag-form.php: the plugins' `pre` output, the message (`#message`, with
 * its link back to the list), `#ajax-response`, then `form#edittag` with the plugins' `top`
 * output, the form table (`.term-name-wrap`, `.term-slug-wrap`, `.term-parent-wrap` for a
 * hierarchical taxonomy, `.term-description-wrap`, and the plugins' rows in a `tbody` of their
 * own), the plugins' `after` output, and `.edit-tag-actions` with Update and, when WordPress
 * gives it, Delete. The body has the classes WordPress names while it is shown; the Name field
 * gets focus unless WordPress says the device is mobile.
 *
 * Everything WordPress decides comes as data: the values, the parent dropdown (its options padded
 * as printed, without the term and its descendants, or the HTML a plugin filtered it to), the
 * field descriptions, the message and where its link leads, and whether Delete shows. The page
 * reproduces the classic JavaScript of the form:
 *
 * - Update (ajax-response.js's validateForm(): an empty name marks its row and sends nothing)
 *   posts `terms/{id}` with the core fields and the page's path as the referer (the classic
 *   form's `_wp_http_referer`), then follows the answer's redirect in place of the history entry:
 *   the page reloads its data and shows the message. A refused save shows WordPress's message in
 *   a notice and says it.
 * - Delete asks common.js's showNotice.warn() question, as tags.js does on `#edittag .delete`,
 *   then calls `DELETE terms/{id}` with `screen: 'term'` and the page's path as the referer, and
 *   follows the answer, which leads to the list.
 * - The plugins' hooks are their HTML (kit/LegacyHtml), with their scripts; their fields are not
 *   sent with the save (the recorded gap), which a note beside them says.
 *
 * `data.error` shows the classic screen's refusal instead of the form. Names and descriptions are
 * values of the fields and option text: nothing in them runs.
 */
export default {
	name: 'TermEdit',
	components: { InlineMarkup, LegacyHtml },
	props: {
		data: { type: Object, required: true },
		page: { type: Object, required: true },
	},
	emits: [ 'saved' ],
	setup( props, { emit } ) {
		const router = inject( 'router', null );
		const notices = inject( 'notices', null );
		const speak = inject( 'speak', null ) ?? ( ( message ) => globalThis.wp?.a11y?.speak?.( message ) );
		const frameChannel = inject( 'frameChannel', null );
		const readForm = inject( 'formEntries', ( form ) => ( form && globalThis.FormData ? [ ...new globalThis.FormData( form ) ] : [] ) );
		const ask = inject( 'confirm', ( message ) => globalThis.confirm?.( message ) === true );

		const pageFailed = computed( () => props.data?.failed === true );
		const dieError = computed( () => ( props.data?.error && typeof props.data.error === 'object' ? props.data.error : null ) );
		const blocked = computed( () => pageFailed.value || Boolean( dieError.value ) );
		const taxonomy = computed( () => text( props.data?.taxonomy?.name ) );
		const labels = computed( () => props.data?.labels ?? {} );
		const hooks = computed( () => props.data?.hooks ?? {} );
		const parent = computed( () => ( props.data?.fields?.parent && typeof props.data.fields.parent === 'object' ? props.data.fields.parent : null ) );
		const options = computed( () => list( parent.value?.options ).filter( ( option ) => option && typeof option.value === 'string' ) );
		const parentHtml = computed( () => ( typeof parent.value?.html === 'string' && parent.value.html !== '' ? parent.value.html : null ) );
		const message = computed( () => ( props.data?.message && typeof props.data.message === 'object' ? props.data.message : null ) );
		// The plugins print fields in the form here that the save does not send.
		const pluginFields = computed( () => Boolean( hooks.value.top ) || Boolean( hooks.value.rows ) || Boolean( hooks.value.after ) );

		const fields = reactive( fieldsOf( props.data ) );
		const nameInvalid = ref( false );
		const sending = ref( false );
		const formEl = shallowRef( null );
		const nameField = shallowRef( null );

		const broken = () => __( 'An error occurred while processing your request. Please try again later.', 'default' );
		/**
		 * A failed request is said in a page notice, spoken, and the notice is focused: WordPress's
		 * message, that WordPress cannot be reached, or the generic one.
		 */
		async function failed( reason, what ) {
			console.warn( what, reason );
			const unreachable = reason?.code === 'admin_upstream_unreachable' || reason?.status === 0;
			let shown = typeof reason?.message === 'string' && reason.message !== '' ? reason.message : broken();
			if ( unreachable ) {
				shown = __( 'WordPress cannot be reached right now. Please try again in a moment.', 'wp-admin-site' );
			}
			const id = notices?.add?.( { type: 'error', message: shown, dismissible: true, scope: 'page' } );
			speak( shown );
			if ( id ) {
				await nextTick();
				globalThis.document?.getElementById?.( noticeElementId( id ) )?.focus?.();
			}
		}

		/** Opens where an answer leads: a redirect through the router, a location as a full-page load. */
		async function follow( answer, options = undefined ) {
			if ( router?.follow ) {
				return options === undefined ? router.follow( answer ?? {} ) : router.follow( answer ?? {}, options );
			}
			const target = redirectTarget( answer ?? {}, globalThis.location );
			if ( target ) {
				globalThis.location?.assign?.( target.url );
			}
			return Boolean( target );
		}

		const referer = () => text( props.page?.path );

		async function save( event ) {
			event?.preventDefault?.();
			const term = props.data?.term;
			if ( sending.value || ! term || blocked.value ) {
				return;
			}
			// ajax-response.js: a required field left empty stops the submit and marks its row.
			if ( fields.name === '' ) {
				nameInvalid.value = true;
				return;
			}
			const body = { taxonomy: taxonomy.value, name: fields.name, slug: fields.slug };
			if ( parent.value ) {
				let value = fields.parent;
				if ( parentHtml.value ) {
					const entries = new Map( list( readForm( formEl.value ) ).map( ( [ key, entry ] ) => [ key, entry ] ) );
					value = text( entries.get( 'parent' ) ?? '-1' );
				}
				body.parent = Number.parseInt( value, 10 );
				if ( ! Number.isInteger( body.parent ) ) {
					body.parent = -1;
				}
			}
			body.description = fields.description;
			body.referer = referer();
			sending.value = true;
			try {
				const answer = await api.post( ROUTE + term.id, body );
				emit( 'saved', answer );
				// As the classic form's POST and redirect: the page reloads with the message.
				await follow( answer, { replace: true } );
			} catch ( reason ) {
				await failed( reason, 'Could not save the term:' );
			} finally {
				sending.value = false;
			}
		}

		async function remove() {
			const request = props.data?.delete?.request;
			if ( sending.value || ! request || typeof request.path !== 'string' ) {
				return;
			}
			// common.js's showNotice.warn(), which tags.js asks on `#edittag .delete`.
			if ( ! ask( warnText() ) ) {
				return;
			}
			sending.value = true;
			try {
				await follow( await api.del( deleteRoute( request.path, taxonomy.value, referer() ) ) );
			} catch ( reason ) {
				await failed( reason, 'Could not delete the term:' );
			} finally {
				sending.value = false;
			}
		}

		// common.js's showNotice, which plugin scripts in the form call, while the page is shown.
		useClassicGlobals( { showNotice: showNoticeShim( ask ) } );

		// The body classes WordPress names, while the page is shown.
		let bodyClasses = [];
		function setBodyClasses( data ) {
			const body = globalThis.document?.body;
			for ( const name of bodyClasses ) {
				body?.classList?.remove?.( name );
			}
			bodyClasses = list( data?.bodyClasses ).filter( ( name ) => typeof name === 'string' && /^[A-Za-z0-9_-]+$/.test( name ) );
			for ( const name of bodyClasses ) {
				body?.classList?.add?.( name );
			}
		}

		function shown( data ) {
			setBodyClasses( data );
			frameChannel?.setTitle?.( typeof data?.title === 'string' && data.title !== '' ? data.title : null );
			if ( data?.focusName === true && ! blocked.value ) {
				nextTick( () => nameField.value?.focus?.() );
			}
		}

		watch( () => props.data, ( data ) => {
			Object.assign( fields, fieldsOf( data ) );
			nameInvalid.value = false;
			shown( data );
		} );
		onMounted( () => shown( props.data ) );
		onBeforeUnmount( () => setBodyClasses( null ) );

		return {
			pageFailed, dieError, taxonomy, labels, hooks, parent, options, parentHtml, message, pluginFields,
			fields, nameInvalid, sending, formEl, nameField, optionClass, save, remove,
			backHref: computed( () => {
				const back = message.value?.back;
				if ( ! back ) {
					return '';
				}
				return typeof back.path === 'string' && back.path !== '' ? adminHref( back.path ) : adminHref( text( back.url ) );
			} ),
			set: ( key ) => ( event ) => {
				fields[ key ] = text( event?.target?.value );
			},
			nameChanged: () => {
				nameInvalid.value = false;
			},
		};
	},
	template: `
		<p v-if="pageFailed" class="wp-admin-term-edit-failed">{{ $__( 'The term could not be loaded.', 'wp-admin-site' ) }}</p>
		<div v-else-if="dieError" class="wp-admin-term-edit-error">
			<h2 v-if="dieError.heading">{{ dieError.heading }}</h2>
			<p>{{ dieError.message }}</p>
		</div>
		<div v-else class="wp-admin-term-edit">
			<LegacyHtml v-if="hooks.pre" :html="hooks.pre" />

			<div v-if="message" id="message" :class="[ 'notice', message.type === 'error' ? 'notice-error' : 'notice-success' ]">
				<p><strong><InlineMarkup :html="message.markup ?? ''" /></strong></p>
				<p v-if="backHref"><a :href="backHref">{{ message.back.label }}</a></p>
			</div>

			<div id="ajax-response"></div>

			<form ref="formEl" name="edittag" id="edittag" method="post" action="edit-tags.php" class="validate" @submit="save">
				<input type="hidden" name="action" value="editedtag" />
				<input type="hidden" name="tag_ID" :value="String( data.term?.id ?? '' )" />
				<input type="hidden" name="taxonomy" :value="taxonomy" />
				<LegacyHtml v-if="hooks.top" :html="hooks.top" />
				<table class="form-table" role="presentation">
					<tbody>
						<tr :class="[ 'form-field', 'form-required', 'term-name-wrap', { 'form-invalid': nameInvalid } ]">
							<th scope="row"><label for="name">{{ $_x( 'Name', 'term name', 'default' ) }}</label></th>
							<td><input ref="nameField" name="name" id="name" type="text" :value="fields.name" size="40" aria-required="true" aria-describedby="name-description" @input="set( 'name' )( $event )" @change="nameChanged" />
							<p class="description" id="name-description"><InlineMarkup :html="labels.nameDescription ?? ''" /></p></td>
						</tr>
						<tr class="form-field term-slug-wrap">
							<th scope="row"><label for="slug">{{ $__( 'Slug', 'default' ) }}</label></th>
							<td><input name="slug" id="slug" type="text" :value="fields.slug" size="40" aria-describedby="slug-description" @input="set( 'slug' )( $event )" />
							<p class="description" id="slug-description"><InlineMarkup :html="labels.slugDescription ?? ''" /></p></td>
						</tr>
						<tr v-if="parent" class="form-field term-parent-wrap">
							<th scope="row"><label for="parent">{{ data.taxonomy?.labels?.parentItem ?? '' }}</label></th>
							<td>
								<LegacyHtml v-if="parentHtml" :html="parentHtml" />
								<select v-else name="parent" id="parent" class="postform" aria-describedby="parent-description" :value="fields.parent" @change="set( 'parent' )( $event )"><option v-for="option in options" :key="option.value" :class="optionClass( option )" :value="option.value" :selected="option.value === fields.parent">{{ option.label }}</option></select>
								<p class="description" id="parent-description"><InlineMarkup :html="labels.parentDescription ?? ''" /></p>
							</td>
						</tr>
						<tr class="form-field term-description-wrap">
							<th scope="row"><label for="description">{{ $__( 'Description', 'default' ) }}</label></th>
							<td><textarea name="description" id="description" rows="5" cols="50" class="large-text" aria-describedby="description-description" :value="fields.description" @input="set( 'description' )( $event )"></textarea>
							<p class="description" id="description-description"><InlineMarkup :html="labels.descDescription ?? ''" /></p></td>
						</tr>
					</tbody>
					<LegacyHtml v-if="hooks.rows" tag="tbody" :html="hooks.rows" />
				</table>
				<LegacyHtml v-if="hooks.after" :html="hooks.after" />
				<p v-if="pluginFields" class="description wp-admin-term-edit-plugin-note">{{ $__( 'This screen does not save the fields plugins add to this form.', 'wp-admin-site' ) }}</p>

				<div class="edit-tag-actions">
					<input type="submit" class="button button-primary" :value="$__( 'Update', 'default' )" :disabled="sending" />
					<span v-if="data.delete" id="delete-link">
						<a class="delete" href="#" @click.prevent="remove">{{ $__( 'Delete', 'default' ) }}</a>
					</span>
				</div>
			</form>
		</div>
	`,
};
