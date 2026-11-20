import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import api from '@wp-admin/api';
import { ANSWER_TIMEOUT, orderedAnswers } from '../list-table-parts/ordered-answers.js';

/*
 * The Find Posts dialog of the Media list, find_posts_div()'s markup with media.js's findPosts
 * behaviour: it opens with the focus in its search field and lists the latest content at once;
 * Search, or Enter in the field, asks `GET wp-admin/v1/posts/find` (`ps`) again, the answers
 * applied in the order they were asked (list-table-parts/ordered-answers.js); a click on a row
 * checks its radio; Select gives the page the checked post (nothing without one); Escape, the
 * close button and the overlay close it. The rows WordPress found (wp_admin_find_posts(), raw
 * text) show as text, in the table wp_ajax_find_posts() prints; none says "No items found.".
 */

export const FIND_ROUTE = 'wp-admin/v1/posts/find';

const list = ( value ) => ( Array.isArray( value ) ? value : [] );

/** The rows of an answer of `posts/find`, those with an id, as text. Pure. */
export function foundRows( answer ) {
	return list( answer?.rows ).filter( ( row ) => row && Number.isInteger( row.id ) ).map( ( row ) => ( {
		id: row.id,
		title: String( row.title ?? '' ),
		type: String( row.type ?? '' ),
		date: String( row.date ?? '' ),
		status: String( row.status ?? '' ),
	} ) );
}

/**
 * Props: `open` (the dialog shows), `saving` (Select's request is on its way). Emits `select(
 * postId )` with the checked post, and `close`.
 */
export default {
	name: 'UploadFindPosts',
	props: {
		open: { type: Boolean, default: false },
		saving: { type: Boolean, default: false },
	},
	emits: [ 'select', 'close' ],
	setup( props, { emit } ) {
		const term = ref( '' );
		const rows = ref( null );
		const failed = ref( false );
		const searching = ref( false );
		const checked = ref( null );
		const input = ref( null );
		const answers = orderedAnswers( { timeout: ANSWER_TIMEOUT } );

		/** findPosts.send(): the rows for the field's term replace the shown ones. */
		function send() {
			searching.value = true;
			return answers.ordered( api.get( FIND_ROUTE, { ps: term.value } ), ( answer ) => {
				searching.value = false;
				failed.value = false;
				checked.value = null;
				rows.value = foundRows( answer );
			}, ( error ) => {
				console.warn( 'Could not find posts:', error );
				searching.value = false;
				failed.value = true;
				checked.value = null;
				rows.value = null;
			} );
		}

		/** findPosts.close(): the rows are emptied; the field keeps its term, as classic. */
		function reset() {
			answers.reset();
			rows.value = null;
			failed.value = false;
			searching.value = false;
			checked.value = null;
		}

		watch( () => props.open, ( open ) => {
			reset();
			if ( open ) {
				nextTick( () => input.value?.focus?.() );
				send();
			}
		}, { immediate: true } );
		onBeforeUnmount( () => answers.reset() );

		return {
			term, rows, failed, searching, checked, input, send,
			alternate: ( index ) => ( index % 2 === 0 ? 'alternate' : null ),
			onInput: ( event ) => {
				term.value = String( event?.target?.value ?? '' );
			},
			onInputKey: ( event ) => {
				if ( event?.key === 'Enter' ) {
					event.preventDefault?.();
					send();
				}
			},
			onKey: ( event ) => {
				if ( event?.key === 'Escape' ) {
					event.preventDefault?.();
					event.stopPropagation?.();
					emit( 'close' );
				}
			},
			check: ( id ) => {
				checked.value = id;
			},
			select: () => {
				if ( checked.value === null || props.saving ) {
					return;
				}
				emit( 'select', checked.value );
			},
			close: () => emit( 'close' ),
		};
	},
	template: `
		<div v-if="open" class="ui-find-overlay" @click="close"></div>
		<div id="find-posts" class="find-box" role="dialog" aria-labelledby="find-posts-head" :style="open ? null : 'display: none;'" @keydown="onKey">
			<div id="find-posts-head" class="find-box-head">
				{{ $__( 'Attach to existing content', 'default' ) }}
				<button type="button" id="find-posts-close" @click="close"><!-- translators: Hidden accessibility text. --><span class="screen-reader-text">{{ $__( 'Close media attachment panel', 'default' ) }}</span></button>
			</div>
			<div class="find-box-inside">
				<div class="find-box-search">
					<!-- translators: Hidden accessibility text. -->
					<label class="screen-reader-text" for="find-posts-input">{{ $__( 'Search', 'default' ) }}</label>
					<input ref="input" type="text" id="find-posts-input" name="ps" :value="term" @input="onInput" @keydown="onInputKey" />
					<span :class="[ 'spinner', { 'is-active': searching } ]"></span>
					<input type="button" id="find-posts-search" :value="$__( 'Search', 'default' )" class="button" @click="send" />
					<div class="clear"></div>
				</div>
				<div id="find-posts-response">
					<template v-if="failed">{{ $__( 'An error has occurred. Please reload the page and try again.', 'default' ) }}</template>
					<template v-else-if="rows ? rows.length === 0 : false">{{ $__( 'No items found.', 'default' ) }}</template>
					<table v-else-if="rows" class="widefat">
						<thead><tr><th class="found-radio"><br /></th><th>{{ $__( 'Title', 'default' ) }}</th><th class="no-break">{{ $__( 'Type', 'default' ) }}</th><th class="no-break">{{ $__( 'Date', 'default' ) }}</th><th class="no-break">{{ $__( 'Status', 'default' ) }}</th></tr></thead>
						<tbody>
							<tr v-for="( row, index ) in rows" :key="row.id" :class="[ 'found-posts', alternate( index ) ]" @click="check( row.id )"><td class="found-radio"><input type="radio" :id="'found-' + row.id" name="found_post_id" :value="String( row.id )" :checked="checked === row.id" @change="check( row.id )" /></td><td><label :for="'found-' + row.id">{{ row.title }}</label></td><td class="no-break">{{ row.type }}</td><td class="no-break">{{ row.date }}</td><td class="no-break">{{ row.status }}</td></tr>
						</tbody>
					</table>
				</div>
			</div>
			<div class="find-box-buttons">
				<input type="submit" name="find-posts-submit" id="find-posts-submit" class="button button-primary alignright" :value="$__( 'Select', 'default' )" :disabled="saving" @click.prevent="select" />
				<div class="clear"></div>
			</div>
		</div>
	`,
};
