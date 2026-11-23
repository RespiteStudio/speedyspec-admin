import { computed, inject, nextTick, reactive, ref, watch } from 'vue';
import { __ } from '../../../runtime/text.js';
import Contracted from '../../../runtime/Contracted.js';
import LegacyHtml from '../../../kit/LegacyHtml.js';
import InertHtml from '../../../kit/InertHtml.js';
import { decodeEntities } from '../../../kit/Interpolate.js';
import Format from '../dashboard-parts/format.js';
import { formParts, pageOption, pageOptionClass } from './quick-edit.js';

/*
 * Bulk Edit of the Posts list (inline-edit-post.js setBulk()): core/inline-edit with the fields
 * WordPress says Bulk Edit has (`inlineEdit.fields`, each with its `bulk` flag), in the markup
 * WP_Posts_List_Table::inline_edit() prints and inline-edit-post.js completes (the checklists
 * and tags fields of Quick Edit, cloned in), above the rows of the table.
 *
 * The selected posts are listed with a Remove button each (`#bulk-titles`); removing the last one
 * closes Bulk Edit. Each category that some of the selected posts have, but not all, starts
 * indeterminate (and posts `indeterminate_post_category[]`); one they all have starts checked.
 */

const list = ( value ) => ( Array.isArray( value ) ? value : [] );

/**
 * The categories Bulk Edit starts with, as setBulk() counts them over the selected posts' Quick
 * Edit values (`row.inline.terms.category`): checked where every selected post has the category,
 * indeterminate where some have it. Pure.
 *
 * @param {object[]} rows The selected rows.
 * @return {{checked: number[], indeterminate: number[]}}
 */
export function bulkCategories( rows ) {
	const counts = new Map();
	for ( const row of list( rows ) ) {
		for ( const id of new Set( list( row?.inline?.terms?.category ).map( Number ) ) ) {
			counts.set( id, ( counts.get( id ) ?? 0 ) + 1 );
		}
	}
	const checked = [];
	const indeterminate = [];
	for ( const [ id, count ] of counts ) {
		if ( count === list( rows ).length ) {
			checked.push( id );
		} else if ( count > 0 ) {
			indeterminate.push( id );
		}
	}
	return { checked, indeterminate };
}

/**
 * The body of `POST posts/bulk` for Bulk Edit: the posts listed, and the form's fields as the
 * classic form posts them (bulk_edit_posts() reads `indeterminate_post_category[]`). Pure.
 */
export function bulkEditPayload( { postType, ids, fields, query } ) {
	return { postType, action: 'edit', ids: [ ...ids ], fields: fields && typeof fields === 'object' ? fields : {}, list: query ?? {} };
}

/**
 * Bulk Edit. Props: `rows` (the selected rows, in the table's order), `inlineEdit` (the page
 * data's form), `colspan`, `saving`, `error`, `searchTags` (false on a tree, where
 * inline-edit-post.js gives Bulk Edit no tag suggestions). Emits `save( fields )`, `cancel` and
 * `remove( id )` (a Remove button: the page unchecks the row).
 */
export default {
	name: 'EditPostsBulkEdit',
	components: { Contracted, LegacyHtml, InertHtml, Format },
	props: {
		rows: { type: Array, required: true },
		inlineEdit: { type: Object, required: true },
		colspan: { type: Number, default: 1 },
		saving: { type: Boolean, default: false },
		error: { type: String, default: '' },
		searchTags: { type: Boolean, default: true },
	},
	emits: [ 'save', 'cancel', 'remove' ],
	setup( props, { emit } ) {
		const speak = inject( 'speak', null ) ?? ( ( message, politeness ) => globalThis.wp?.a11y?.speak?.( message, politeness ) );
		const parts = computed( () => formParts( props.inlineEdit?.fields, 'bulk' ) );
		const start = bulkCategories( props.rows );
		const terms = reactive( Object.fromEntries( parts.value.taxonomies.map( ( tax ) => [ tax.name, tax.field === 'post_category[]' ? [ ...start.checked ] : [] ] ) ) );
		const mixed = reactive( Object.fromEntries( parts.value.taxonomies.map( ( tax ) => [ tax.name, tax.field === 'post_category[]' ? [ ...start.indeterminate ] : [] ] ) ) );
		const tags = reactive( Object.fromEntries( parts.value.flatTaxonomies.map( ( tax ) => [ tax.name, '' ] ) ) );
		const removers = {};
		const noChange = decodeEntities( __( '&mdash; No Change &mdash;', 'default' ) );

		// Once the form shows, its region takes the focus, as setBulk() focuses the wrapper.
		const status = ref( null );
		const stop = watch( status, ( element ) => {
			const wrapper = element?.closest?.( '.inline-edit-wrapper' );
			if ( wrapper ) {
				stop();
				nextTick( () => {
					wrapper.setAttribute?.( 'tabindex', '-1' );
					wrapper.focus?.();
					globalThis.scrollTo?.( 0, 0 );
				} );
			}
		}, { immediate: true, flush: 'post' } );

		function remove( index ) {
			const id = props.rows[ index ]?.id;
			if ( id === undefined ) {
				return;
			}
			const next = props.rows[ index + 1 ]?.id;
			const prev = props.rows[ index - 1 ]?.id;
			emit( 'remove', id );
			speak( __( 'Item removed.', 'default' ), 'assertive' );
			// The focus goes to the next Remove button, else the one before; with none, Bulk Edit closes.
			if ( next !== undefined || prev !== undefined ) {
				nextTick( () => removers[ next ?? prev ]?.focus?.() );
			} else {
				emit( 'cancel' );
				speak( __( 'All selected items have been removed. Select new items to use Bulk Actions.', 'default' ) );
			}
		}

		return {
			parts, terms, mixed, tags, noChange, remove, status, pageOption, pageOptionClass,
			removeText: __( 'Remove &#8220;%s&#8221; from Bulk Edit', 'default' ),
			noTitle: __( '(no title)', 'default' ),
			removerRef: ( id ) => ( element ) => {
				removers[ id ] = element;
			},
			onSave: ( fields ) => emit( 'save', fields ),
			onCancel: () => emit( 'cancel' ),
		};
	},
	template: `
		<Contracted id="core/inline-edit" kind="bulk" row-id="bulk-edit" :classes="inlineEdit.classes?.bulk ?? []" :colspan="colspan" :saving="saving" :error="error" :custom-boxes="inlineEdit.customBoxes?.bulk ?? []" @save="onSave" @cancel="onCancel">
			<template #left>
				<div v-if="parts.title" id="bulk-title-div">
					<div id="bulk-titles"><ul id="bulk-titles-list" role="list"><li v-for="( row, index ) in rows" :key="row.id" class="ntdelitem"><button :ref="removerRef( row.id )" type="button" :id="'_' + row.id" class="button-link ntdelbutton" @click="remove( index )"><span class="screen-reader-text"><Format :text="removeText"><template #arg1><InertHtml tag="span" :html="row.title?.html || noTitle" /></template></Format></span></button><InertHtml tag="span" class="ntdeltitle" aria-hidden="true" :html="row.title?.html || noTitle" /></li></ul></div>
				</div>
			</template>
			<template v-if="parts.taxonomies.length" #center>
				<template v-for="tax in parts.taxonomies" :key="tax.name">
					<span class="title inline-edit-categories-label">{{ tax.label }}</span>
					<input type="hidden" :name="tax.field" value="0" />
					<Contracted id="core/terms-checklist" :taxonomy="tax.name" :tree="tax.tree ?? []" :name="tax.field" id-prefix="bulk-edit-" :html="typeof tax.html === 'string' ? tax.html : null" :disabled="tax.disabled === true" :model-value="terms[ tax.name ]" :indeterminate="mixed[ tax.name ]" @update:model-value="( ids ) => { terms[ tax.name ] = ids; }" @update:indeterminate="( ids ) => { mixed[ tax.name ] = ids; }" />
				</template>
			</template>
			<template #right>
				<div v-for="tax in parts.flatTaxonomies" :key="tax.name" class="inline-edit-tags-wrap">
					<Contracted id="core/tags-suggest" :taxonomy="tax.name" :name="tax.field" :label="tax.label" :min-chars="tax.minChars" :search-enabled="searchTags ? tax.searchEnabled !== false : false" :aria-describedby="'inline-edit-' + tax.name + '-desc'" :model-value="tags[ tax.name ]" @update:model-value="( names ) => { tags[ tax.name ] = names; }" />
					<p class="howto" :id="'inline-edit-' + tax.name + '-desc'">{{ tax.separate }}</p>
				</div>
				<template v-if="parts.author">
					<LegacyHtml v-if="typeof parts.author.html?.bulk === 'string'" :html="parts.author.html.bulk" />
					<select v-else-if="parts.author.largeUserCount" name="post_author" class="authors hidden"></select>
					<label v-else class="inline-edit-author"><span class="title">{{ $__( 'Author', 'default' ) }}</span><select name="post_author" class="authors"><option v-for="( author, index ) in parts.author.choices?.bulk ?? []" :key="author.value" :value="author.value" :selected="index === 0">{{ author.label }}</option></select></label>
				</template>
				<label v-if="parts.parent"><span class="title">{{ $__( 'Parent', 'default' ) }}</span>
					<LegacyHtml v-if="typeof parts.parent.html?.bulk === 'string'" tag="span" :html="parts.parent.html.bulk" />
					<select v-else name="post_parent" id="bulk_edit_post_parent"><option v-for="( choice, index ) in parts.parent.choices?.bulk ?? []" :key="choice.value" :class="pageOptionClass( choice )" :value="choice.value" :selected="index === 0">{{ pageOption( choice ) }}</option></select>
				</label>
				<label v-if="parts.template"><span class="title">{{ $__( 'Template', 'default' ) }}</span><select name="page_template"><option value="-1" selected>{{ noChange }}</option><option value="default">{{ parts.template.defaultTitle }}</option><option v-for="choice in parts.template.choices ?? []" :key="choice.value" :value="choice.value">{{ choice.label }}</option></select></label>
				<div v-if="parts.comments || parts.pings" class="inline-edit-group wp-clearfix">
					<label v-if="parts.comments" class="alignleft"><span class="title">{{ $__( 'Comments', 'default' ) }}</span><select name="comment_status"><option value="" selected>{{ noChange }}</option><option value="open">{{ $__( 'Allow', 'default' ) }}</option><option value="closed">{{ $__( 'Do not allow', 'default' ) }}</option></select></label>
					<label v-if="parts.pings" class="alignright"><span class="title">{{ $__( 'Pings', 'default' ) }}</span><select name="ping_status"><option value="" selected>{{ noChange }}</option><option value="open">{{ $__( 'Allow', 'default' ) }}</option><option value="closed">{{ $__( 'Do not allow', 'default' ) }}</option></select></label>
				</div>
				<div class="inline-edit-group wp-clearfix">
					<label ref="status" class="inline-edit-status alignleft"><span class="title">{{ $__( 'Status', 'default' ) }}</span><select name="_status"><option v-for="( choice, index ) in parts.statuses" :key="choice.value" :value="choice.value" :selected="index === 0">{{ choice.label }}</option></select></label>
					<label v-if="parts.sticky" class="alignright"><span class="title">{{ $__( 'Sticky', 'default' ) }}</span><select name="sticky"><option value="-1" selected>{{ noChange }}</option><option value="sticky">{{ $__( 'Sticky', 'default' ) }}</option><option value="unsticky">{{ $__( 'Not Sticky', 'default' ) }}</option></select></label>
				</div>
				<label v-if="parts.format" class="alignleft"><span class="title">{{ $_x( 'Format', 'post format', 'default' ) }}</span><select name="post_format"><option value="-1" selected>{{ noChange }}</option><option v-for="choice in parts.format.choices ?? []" :key="choice.value" :value="choice.value">{{ choice.label }}</option></select></label>
			</template>
		</Contracted>
	`,
};
