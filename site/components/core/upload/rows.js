import InertHtml from '../../../kit/InertHtml.js';
import LegacyHtml from '../../../kit/LegacyHtml.js';
import Bubble from '../list-table-parts/comments-bubble.js';
import { adminHref } from '../dashboard-parts/links.js';
import { actionHref, actionLinkClass, isRequest, shownActions } from '../list-table-parts/row-actions.js';

/*
 * The cells of a Media list row, in the markup WP_Media_List_Table prints them (column_title()
 * with the thumbnail, the media states and the file name, handle_row_actions() with Copy URL,
 * column_author(), column_default() for the taxonomies, column_parent() with Detach and Attach,
 * column_comments(), column_date()), from the row's data (wp_admin_media_list_row()). The title,
 * the parent's title, the states and the thumbnail are content and show through kit/InertHtml,
 * which runs nothing; the file name and the labels are text; HTML that plugins filter (the row
 * actions, the date, plugin columns) shows through kit/LegacyHtml, as classic prints it. The links
 * classic marks `aria-button-if-js` are buttons to assistive technology, as common.js makes them.
 */

const list = ( value ) => ( Array.isArray( value ) ? value : [] );

/** The row actions the page runs itself, without a route or an address. */
export const LOCAL_ACTIONS = [ 'copy', 'attach' ];

/** The row actions to show. Pure. */
export const mediaActions = ( item ) => shownActions( item?.actions, LOCAL_ACTIONS ).filter( ( action ) => action.action !== 'copy' || typeof item.copyUrl === 'string' );

/** The File cell (column_title()) with its row actions. */
const Title = {
	name: 'UploadTitle',
	components: { InertHtml, LegacyHtml },
	props: {
		item: { type: Object, required: true },
		copied: { type: Boolean, default: false },
	},
	emits: [ 'act', 'actions-html' ],
	setup( props, { emit } ) {
		const title = () => props.item.title ?? {};
		return {
			title, actionLinkClass, actionHref, isRequest,
			actions: () => mediaActions( props.item ),
			states: () => list( props.item.states ).filter( ( state ) => typeof state?.html === 'string' ),
			thumb: () => ( typeof title().thumbHtml === 'string' && title().thumbHtml !== '' ? title().thumbHtml : null ),
			onAction: ( action, event ) => {
				if ( isRequest( action.request ) || action.action === 'copy' || action.action === 'attach' ) {
					event?.preventDefault?.();
					emit( 'act', props.item, action, event );
				}
			},
			onActionsHtml: ( event ) => emit( 'actions-html', props.item, event ),
		};
	},
	template: `
		<strong :class="{ 'has-media-icon': thumb() !== null }"><a v-if="title().editUrl" :href="actionHref( { url: title().editUrl } )"><span v-if="thumb()" :class="[ 'media-icon', title().iconClass ]"><InertHtml tag="span" :html="thumb()" /></span><InertHtml tag="span" :html="title().html ?? ''" /></a><template v-else><span v-if="thumb()" :class="[ 'media-icon', title().iconClass ]"><InertHtml tag="span" :html="thumb()" /></span><InertHtml tag="span" :html="title().html ?? ''" /></template><template v-if="states().length">{{ ' — ' }}<span v-for="( state, index ) in states()" :key="state.key" class="post-state"><InertHtml tag="span" :html="state.html" />{{ index < states().length - 1 ? $__( ', ', 'default' ) : '' }}</span></template></strong>
		<p class="filename"><!-- translators: Hidden accessibility text. --><span class="screen-reader-text">{{ $__( 'File name:', 'default' ) }}</span>{{ ' ' + String( title().filename ?? '' ) }}</p>
		<LegacyHtml v-if="typeof item.actionsHtml === 'string'" :class="[ 'row-actions', { visible: item.actionsVisible === true } ]" :html="item.actionsHtml" @click="onActionsHtml" />
		<div v-else-if="actions().length" :class="[ 'row-actions', { visible: item.actionsVisible === true } ]"><span v-for="( action, index ) in actions()" :key="action.action" :class="action.classes"><span v-if="action.action === 'copy'" class="copy-to-clipboard-container"><button type="button" class="button-link copy-attachment-url media-library" :data-clipboard-text="item.copyUrl" :aria-label="action.ariaLabel" @click="onAction( action, $event )">{{ action.text }}</button><span :class="[ 'success', { hidden: ! copied } ]" aria-hidden="true">{{ $__( 'Copied!', 'default' ) }}</span></span><a v-else-if="action.action === 'attach'" href="#the-list" class="hide-if-no-js aria-button-if-js" role="button" :aria-label="action.ariaLabel" @click="onAction( action, $event )">{{ action.text }}</a><a v-else-if="action.action === 'download'" :href="actionHref( action )" :aria-label="action.ariaLabel" download>{{ action.text }}</a><a v-else-if="action.newTab" :href="actionHref( action )" rel="bookmark" target="_blank" :aria-label="action.ariaLabel">{{ action.text }}</a><a v-else :href="actionHref( action )" :class="[ actionLinkClass( action ), { 'aria-button-if-js': isRequest( action.request ) } ]" :role="isRequest( action.request ) ? 'button' : null" :aria-label="action.ariaLabel" @click="onAction( action, $event )">{{ action.text }}</a>{{ index < actions().length - 1 ? ' | ' : '' }}</span></div>
	`,
};

/** A taxonomy cell (column_default() for `categories`, `tags`, `taxonomy-{name}`). */
const Terms = {
	name: 'UploadTerms',
	props: {
		terms: { type: Object, required: true },
	},
	setup: () => ( { href: ( path ) => adminHref( path ), list } ),
	template: `
		<template v-if="list( terms.links ).length"><template v-for="( link, index ) in list( terms.links )" :key="index"><a :href="href( link.url )">{{ link.name }}</a>{{ index < list( terms.links ).length - 1 ? $__( ', ', 'default' ) : '' }}</template></template>
		<template v-else-if="terms.noTerms"><span aria-hidden="true">{{ '—' }}</span><span class="screen-reader-text">{{ terms.noTerms }}</span></template>
	`,
};

/** The Uploaded To cell (column_parent()): the parent and Detach, or "(Unattached)" and Attach. */
const Parent = {
	name: 'UploadParent',
	components: { InertHtml },
	props: {
		item: { type: Object, required: true },
	},
	emits: [ 'detach', 'attach' ],
	setup( props, { emit } ) {
		const parent = () => props.item.parent ?? {};
		return {
			parent, isRequest,
			href: ( path ) => adminHref( path ),
			onDetach: ( event ) => {
				event?.preventDefault?.();
				emit( 'detach', props.item, event );
			},
			onAttach: ( event ) => {
				event?.preventDefault?.();
				emit( 'attach', props.item, event );
			},
		};
	},
	template: `
		<template v-if="parent().unattached === true">{{ $__( '(Unattached)', 'default' ) }}{{ ' ' }}<template v-if="parent().attach === true"><br /><a href="#the-list" class="hide-if-no-js aria-button-if-js" role="button" :aria-label="parent().attachAriaLabel" @click="onAttach">{{ $__( 'Attach', 'default' ) }}</a></template></template>
		<template v-else><strong v-if="parent().url"><a :href="href( parent().url )"><InertHtml tag="span" :html="parent().title ?? ''" /></a></strong><strong v-else-if="! parent().private"><InertHtml tag="span" :html="parent().title ?? ''" /></strong><template v-else>{{ $__( '(Private post)', 'default' ) }}</template><template v-if="isRequest( parent().detach )"><br /><a href="#" class="hide-if-no-js detach-from-parent" :aria-label="parent().detachAriaLabel" @click="onDetach">{{ $__( 'Detach', 'default' ) }}</a></template></template>
	`,
};

/**
 * One cell of a row (the `cell` slot of core/list-table).
 *
 * Emits `act( item, action, event )` for a row action the page runs (a route, Copy URL, Attach),
 * `actions-html( item, event )` for a click in the row actions plugins filtered, and `detach(
 * item, event )` and `attach( item, event )` for the Uploaded To cell's links. `copied` says
 * whether the row shows Copy URL's "Copied!".
 */
export default {
	name: 'UploadCell',
	components: { Title, Terms, Parent, Bubble, LegacyHtml, InertHtml },
	props: {
		item: { type: Object, required: true },
		column: { type: Object, required: true },
		copied: { type: Boolean, default: false },
	},
	emits: [ 'act', 'actions-html', 'detach', 'attach' ],
	setup( props, { emit } ) {
		const cellHtml = () => {
			const cell = props.item?.cells?.[ props.column.key ];
			return typeof cell?.html === 'string' ? cell.html : '';
		};
		const terms = () => {
			const value = props.item?.terms?.[ props.column.key ];
			return value && typeof value === 'object' && ! Array.isArray( value ) ? value : null;
		};
		return {
			cellHtml, terms,
			href: ( path ) => adminHref( path ),
			onAct: ( ...args ) => emit( 'act', ...args ),
			onActionsHtml: ( ...args ) => emit( 'actions-html', ...args ),
			onDetach: ( ...args ) => emit( 'detach', ...args ),
			onAttach: ( ...args ) => emit( 'attach', ...args ),
		};
	},
	template: `
		<Title v-if="column.key === 'title'" :item="item" :copied="copied" @act="onAct" @actions-html="onActionsHtml" />
		<template v-else-if="column.key === 'author'"><a v-if="item.author" :href="href( item.author.url )">{{ item.author.name }}</a><template v-else><span aria-hidden="true">{{ '—' }}</span><span class="screen-reader-text">{{ $__( '(no author)', 'default' ) }}</span></template></template>
		<Terms v-else-if="terms()" :terms="terms()" />
		<Parent v-else-if="column.key === 'parent' ? Boolean( item.parent ) : false" :item="item" @detach="onDetach" @attach="onAttach" />
		<div v-else-if="column.key === 'comments'" class="post-com-count-wrapper"><Bubble v-if="item.bubble" :bubble="item.bubble" /></div>
		<template v-else-if="column.key === 'date'"><template v-if="item.date"><LegacyHtml v-if="typeof item.date.timeHtml === 'string'" tag="span" :html="item.date.timeHtml" /><template v-else>{{ item.date.text }}</template></template></template>
		<template v-else-if="cellHtml()"><LegacyHtml v-if="column.core === false" :html="cellHtml()" /><InertHtml v-else :html="cellHtml()" /></template>
	`,
};
