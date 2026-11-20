import { computed, nextTick, reactive, ref, watch } from 'vue';
import { __, _x } from '../../../runtime/text.js';
import Contracted from '../../../runtime/Contracted.js';
import LegacyHtml from '../../../kit/LegacyHtml.js';
import { decodeEntities } from '../../../kit/Interpolate.js';
import Format from '../dashboard-parts/format.js';

/*
 * Quick Edit of a Posts list row (inline-edit-post.js edit()): core/inline-edit with the fields
 * WordPress says the form has (`inlineEdit.fields`, each with its `quick` flag), in the markup
 * WP_Posts_List_Table::inline_edit() prints, filled from the row's Quick Edit values
 * (`row.inline`, get_inline_data()). What inline-edit-post.js does when it fills the form is done
 * here, and nothing else:
 *
 * - the author of the post is added to the authors when it is not one of them (it lost the
 *   capability), and the author field is hidden when there is one author only;
 * - Scheduled is offered for a future date and for a scheduled post, Published otherwise;
 * - Private empties and disables the password, and the other way round;
 * - the post itself and the pages below it are left out of the parent choices;
 * - the tags are shown with the tag delimiter of the language.
 */

const list = ( value ) => ( Array.isArray( value ) ? value : [] );
const text = ( value ) => ( value === null || value === undefined ? '' : String( value ) );

/** The values the form starts with, from the row's Quick Edit values (get_inline_data()). Pure. */
export function quickEditValues( row ) {
	const inline = row?.inline && typeof row.inline === 'object' ? row.inline : {};
	const terms = inline.terms && typeof inline.terms === 'object' ? inline.terms : {};
	const tags = inline.tags && typeof inline.tags === 'object' ? inline.tags : {};
	const status = text( inline._status );
	return {
		post_title: text( inline.post_title ),
		post_name: text( inline.post_name ),
		post_author: text( inline.post_author ),
		jj: text( inline.jj ),
		mm: text( inline.mm ),
		aa: text( inline.aa ),
		hh: text( inline.hh ),
		mn: text( inline.mn ),
		ss: text( inline.ss ),
		// As inline-edit-post.js: a private post has Private checked and no password.
		post_password: status === 'private' ? '' : text( inline.post_password ),
		keep_private: status === 'private',
		_status: status,
		comment_status: inline.comment_status === 'open',
		ping_status: inline.ping_status === 'open',
		sticky: inline.sticky === true,
		post_parent: text( inline.post_parent ?? '0' ),
		menu_order: text( inline.menu_order ),
		page_template: text( inline.page_template ),
		post_format: text( inline.post_format ),
		terms: Object.fromEntries( Object.entries( terms ).map( ( [ taxonomy, ids ] ) => [ taxonomy, list( ids ).map( Number ).filter( Number.isInteger ) ] ) ),
		tags: Object.fromEntries( Object.entries( tags ).map( ( [ taxonomy, names ] ) => [ taxonomy, text( names ) ] ) ),
	};
}

/**
 * The statuses offered for a post, as inline-edit-post.js removes one: Scheduled is left out for
 * a post that is not scheduled and whose date has passed, Published otherwise. Pure.
 *
 * @param {object[]} statuses The statuses WordPress offers (`statuses.quick`).
 * @param {object}   values   The form's values (`_status` and the date parts).
 * @param {number}   now      The time now (milliseconds).
 * @return {object[]} The statuses shown.
 */
export function quickStatuses( statuses, values, now = Date.now() ) {
	const date = new Date( Number( values.aa ), Number( values.mm ) - 1, Number( values.jj ), Number( values.hh ), Number( values.mn ), Number( values.ss ) ).getTime();
	const removed = values._status !== 'future' && now > date ? 'future' : 'publish';
	return list( statuses ).filter( ( status ) => status?.value !== removed );
}

/**
 * The authors offered: WordPress's, with the post's author first when it is not one of them, as
 * inline-edit-post.js adds it (named as the row's author column shows it). Pure.
 */
export function authorChoices( choices, author, name ) {
	const shown = list( choices );
	if ( author === '' || shown.some( ( choice ) => String( choice?.value ) === author ) ) {
		return shown;
	}
	return [ { value: author, label: text( name ) }, ...shown ];
}

/**
 * The parent choices without the post itself and the pages below it (the options after it with
 * a deeper level), as inline-edit-post.js removes them. Pure.
 *
 * @param {object[]} choices The choices (`{ value, label, level }`).
 * @param {number}   id      The post's id.
 * @return {object[]} The choices shown.
 */
export function withoutPost( choices, id ) {
	const all = list( choices );
	const index = all.findIndex( ( choice ) => String( choice?.value ) === String( id ) );
	if ( index < 0 ) {
		return all;
	}
	const level = Number( all[ index ].level ?? 0 );
	let end = index + 1;
	while ( end < all.length && Number( all[ end ].level ?? 0 ) > level ) {
		end++;
	}
	return [ ...all.slice( 0, index ), ...all.slice( end ) ];
}

/** A tags text with the tag delimiter of the language in place of commas, as inline-edit-post.js shows it. Pure. */
export function tagsText( names, delimiter ) {
	const comma = String( delimiter ?? ',' ).trim() || ',';
	return comma === ',' ? text( names ) : text( names ).replace( /,/g, comma );
}

/** The text of a page option, as wp_dropdown_pages() pads it: three no-break spaces a level. Pure. */
export const pageOption = ( choice ) => ' '.repeat( 3 * Math.max( 0, Number( choice?.level ?? 0 ) || 0 ) ) + text( choice?.label );

/** The class of a page option (`level-N`), none for the options before the pages. Pure. */
export const pageOptionClass = ( choice ) => ( Number.isInteger( choice?.level ) ? 'level-' + choice.level : null );

/**
 * The fields of a Posts Quick Edit or Bulk Edit form (`inlineEdit.fields`) that the form of
 * `kind` has: each field's `quick` or `bulk` flag. Pure.
 */
export function formParts( fields, kind ) {
	const has = ( field ) => Boolean( field && field[ kind ] === true );
	const f = fields && typeof fields === 'object' ? fields : {};
	return {
		title: has( f.title ),
		slug: has( f.slug ),
		date: has( f.date ) ? f.date : null,
		author: has( f.author ) ? f.author : null,
		password: has( f.password ),
		private: has( f.private ),
		taxonomies: list( f.taxonomies ).filter( has ),
		parent: has( f.parent ) ? f.parent : null,
		order: has( f.order ),
		template: has( f.template ) ? f.template : null,
		flatTaxonomies: list( f.flatTaxonomies ).filter( has ),
		comments: has( f.comments ),
		pings: has( f.pings ),
		statuses: list( f.statuses?.[ kind ] ),
		sticky: has( f.sticky ),
		format: has( f.format ) ? f.format : null,
	};
}

/**
 * Quick Edit of one row. Props: `row` (the row's data), `inlineEdit` (the page data's form),
 * `colspan`, `saving`, `error`, `searchTags` (whether the tags fields search, as WordPress says
 * per taxonomy). Emits `save( fields )` and `cancel`; the title field takes the focus when it
 * opens, as inline-edit-post.js focuses `.ptitle`.
 */
export default {
	name: 'EditPostsQuickEdit',
	components: { Contracted, LegacyHtml, Format },
	props: {
		row: { type: Object, required: true },
		inlineEdit: { type: Object, required: true },
		colspan: { type: Number, default: 1 },
		saving: { type: Boolean, default: false },
		error: { type: String, default: '' },
	},
	emits: [ 'save', 'cancel' ],
	setup( props, { emit } ) {
		const v = reactive( quickEditValues( props.row ) );
		const parts = computed( () => formParts( props.inlineEdit?.fields, 'quick' ) );
		const delimiter = _x( ',', 'tag delimiter', 'default' );
		for ( const tax of parts.value.flatTaxonomies ) {
			v.tags[ tax.name ] = tagsText( v.tags[ tax.name ], delimiter );
		}
		for ( const tax of parts.value.taxonomies ) {
			v.terms[ tax.name ] = list( v.terms[ tax.name ] );
		}
		const title = ref( null );
		const authors = computed( () => authorChoices( parts.value.author?.choices?.quick, v.post_author, props.row?.author?.name ) );
		const statuses = computed( () => quickStatuses( parts.value.statuses, v ) );
		const parents = computed( () => withoutPost( parts.value.parent?.choices?.quick, props.row.id ) );
		const set = ( name ) => ( event ) => {
			v[ name ] = event?.target?.value ?? '';
		};
		const check = ( name ) => ( event ) => {
			v[ name ] = Boolean( event?.target?.checked );
		};
		function togglePrivate( event ) {
			v.keep_private = Boolean( event?.target?.checked );
			if ( v.keep_private ) {
				v.post_password = '';
			}
		}
		// The form shows once its part is ready: the title takes the focus then, once.
		const stop = watch( title, ( element ) => {
			if ( element ) {
				stop();
				nextTick( () => element.focus?.() );
			}
		}, { immediate: true, flush: 'post' } );
		return {
			v, parts, title, authors, statuses, parents, set, check, togglePrivate, pageOption, pageOptionClass,
			dateFormat: __( '%1$s %2$s, %3$s at %4$s:%5$s', 'default' ),
			// translators: Between password field and private checkbox on post quick edit interface.
			or: decodeEntities( __( '&ndash;OR&ndash;', 'default' ) ),
			onSave: ( fields ) => emit( 'save', fields ),
			onCancel: () => emit( 'cancel' ),
		};
	},
	template: `
		<Contracted id="core/inline-edit" kind="quick" :row-id="'edit-' + row.id" :classes="inlineEdit.classes?.quick ?? []" :colspan="colspan" :saving="saving" :error="error" :custom-boxes="inlineEdit.customBoxes?.quick ?? []" @save="onSave" @cancel="onCancel">
			<template #left>
				<template v-if="parts.title">
					<label><span class="title">{{ $__( 'Title', 'default' ) }}</span><span class="input-text-wrap"><input ref="title" type="text" name="post_title" class="ptitle" :value="v.post_title" @input="set( 'post_title' )( $event )" /></span></label>
					<label v-if="parts.slug"><span class="title">{{ $__( 'Slug', 'default' ) }}</span><span class="input-text-wrap"><input type="text" name="post_name" :value="v.post_name" autocomplete="off" spellcheck="false" @input="set( 'post_name' )( $event )" /></span></label>
				</template>
				<template v-if="parts.date">
					<fieldset class="inline-edit-date">
						<legend><span class="title">{{ $__( 'Date', 'default' ) }}</span></legend>
						<div class="timestamp-wrap"><Format :text="dateFormat">
							<!-- translators: Hidden accessibility text. -->
							<template #arg1><label><span class="screen-reader-text">{{ $__( 'Month', 'default' ) }}</span><select class="form-required" name="mm" @change="set( 'mm' )( $event )"><option v-for="month in parts.date.months ?? []" :key="month.value" :value="month.value" :data-text="month.text" :selected="month.value === v.mm">{{ month.label }}</option></select></label></template>
							<template #arg2><label><span class="screen-reader-text">{{ $__( 'Day', 'default' ) }}</span><input type="text" name="jj" :value="v.jj" size="2" maxlength="2" autocomplete="off" class="form-required" inputmode="numeric" @input="set( 'jj' )( $event )" /></label></template>
							<template #arg3><label><span class="screen-reader-text">{{ $__( 'Year', 'default' ) }}</span><input type="text" name="aa" :value="v.aa" size="4" maxlength="4" autocomplete="off" class="form-required" inputmode="numeric" @input="set( 'aa' )( $event )" /></label></template>
							<template #arg4><label><span class="screen-reader-text">{{ $__( 'Hour', 'default' ) }}</span><input type="text" name="hh" :value="v.hh" size="2" maxlength="2" autocomplete="off" class="form-required" inputmode="numeric" @input="set( 'hh' )( $event )" /></label></template>
							<template #arg5><label><span class="screen-reader-text">{{ $__( 'Minute', 'default' ) }}</span><input type="text" name="mn" :value="v.mn" size="2" maxlength="2" autocomplete="off" class="form-required" inputmode="numeric" @input="set( 'mn' )( $event )" /></label></template>
						</Format></div><input type="hidden" name="ss" :value="v.ss" />
					</fieldset>
					<br class="clear" />
				</template>
				<template v-if="parts.author">
					<LegacyHtml v-if="typeof parts.author.html?.quick === 'string'" :html="parts.author.html.quick" />
					<select v-else-if="parts.author.largeUserCount" name="post_author" class="authors hidden"></select>
					<label v-else class="inline-edit-author" :style="authors.length > 1 ? null : 'display: none'"><span class="title">{{ $__( 'Author', 'default' ) }}</span><select name="post_author" class="authors" @change="set( 'post_author' )( $event )"><option v-for="author in authors" :key="author.value" :value="author.value" :selected="String( author.value ) === v.post_author">{{ author.label }}</option></select></label>
				</template>
				<div v-if="parts.password" class="inline-edit-group wp-clearfix">
					<label class="alignleft"><span class="title">{{ $__( 'Password', 'default' ) }}</span><span class="input-text-wrap"><input type="text" name="post_password" class="inline-edit-password-input ltr" :value="v.post_password" :disabled="v.keep_private" @input="set( 'post_password' )( $event )" /></span></label>
					<span class="alignleft inline-edit-or">{{ or }}</span>
					<label v-if="parts.private" class="alignleft inline-edit-private"><input type="checkbox" name="keep_private" value="private" :checked="v.keep_private" @change="togglePrivate" /><span class="checkbox-title">{{ $__( 'Private', 'default' ) }}</span></label>
				</div>
			</template>
			<template v-if="parts.taxonomies.length" #center>
				<template v-for="tax in parts.taxonomies" :key="tax.name">
					<span class="title inline-edit-categories-label">{{ tax.label }}</span>
					<input type="hidden" :name="tax.field" value="0" />
					<Contracted id="core/terms-checklist" :taxonomy="tax.name" :tree="tax.tree ?? []" :name="tax.field" :html="typeof tax.html === 'string' ? tax.html : null" :disabled="tax.disabled === true" :model-value="v.terms[ tax.name ]" @update:model-value="( ids ) => { v.terms[ tax.name ] = ids; }" />
				</template>
			</template>
			<template #right>
				<label v-if="parts.parent"><span class="title">{{ $__( 'Parent', 'default' ) }}</span>
					<LegacyHtml v-if="typeof parts.parent.html?.quick === 'string'" tag="span" :html="parts.parent.html.quick" />
					<select v-else name="post_parent" id="post_parent" @change="set( 'post_parent' )( $event )"><option v-for="choice in parents" :key="choice.value" :class="pageOptionClass( choice )" :value="choice.value" :selected="String( choice.value ) === v.post_parent">{{ pageOption( choice ) }}</option></select>
				</label>
				<label v-if="parts.order"><span class="title">{{ $__( 'Order', 'default' ) }}</span><span class="input-text-wrap"><input type="text" name="menu_order" class="inline-edit-menu-order-input" :value="v.menu_order" @input="set( 'menu_order' )( $event )" /></span></label>
				<label v-if="parts.template"><span class="title">{{ $__( 'Template', 'default' ) }}</span><select name="page_template" @change="set( 'page_template' )( $event )"><option value="default" :selected="v.page_template === 'default' || v.page_template === ''">{{ parts.template.defaultTitle }}</option><option v-for="choice in parts.template.choices ?? []" :key="choice.value" :value="choice.value" :selected="choice.value === v.page_template">{{ choice.label }}</option></select></label>
				<div v-for="tax in parts.flatTaxonomies" :key="tax.name" class="inline-edit-tags-wrap">
					<Contracted id="core/tags-suggest" :taxonomy="tax.name" :name="tax.field" :label="tax.label" :min-chars="tax.minChars" :search-enabled="tax.searchEnabled !== false" :aria-describedby="'inline-edit-' + tax.name + '-desc'" :model-value="v.tags[ tax.name ] ?? ''" @update:model-value="( names ) => { v.tags[ tax.name ] = names; }" />
					<p class="howto" :id="'inline-edit-' + tax.name + '-desc'">{{ tax.separate }}</p>
				</div>
				<div v-if="parts.comments || parts.pings" class="inline-edit-group wp-clearfix">
					<label v-if="parts.comments" class="alignleft"><input type="checkbox" name="comment_status" value="open" :checked="v.comment_status" @change="check( 'comment_status' )( $event )" /><span class="checkbox-title">{{ $__( 'Allow Comments', 'default' ) }}</span></label>
					<label v-if="parts.pings" class="alignleft"><input type="checkbox" name="ping_status" value="open" :checked="v.ping_status" @change="check( 'ping_status' )( $event )" /><span class="checkbox-title">{{ $__( 'Allow Pings', 'default' ) }}</span></label>
				</div>
				<div class="inline-edit-group wp-clearfix">
					<label class="inline-edit-status alignleft"><span class="title">{{ $__( 'Status', 'default' ) }}</span><select name="_status" @change="set( '_status' )( $event )"><option v-for="status in statuses" :key="status.value" :value="status.value" :selected="status.value === v._status">{{ status.label }}</option></select></label>
					<label v-if="parts.sticky" class="alignleft"><input type="checkbox" name="sticky" value="sticky" :checked="v.sticky" @change="check( 'sticky' )( $event )" /><span class="checkbox-title">{{ $__( 'Make this post sticky', 'default' ) }}</span></label>
				</div>
			</template>
		</Contracted>
	`,
};
