import { computed, h, inject, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, Teleport, watch, watchEffect } from 'vue';
import api from '@wp-admin/api';
import Contracted from '../../runtime/Contracted.js';
import { SlotOutlet } from '../../runtime/slots.js';
import { __ } from '../../runtime/text.js';

/** Where a screen's layout preferences are saved (the classic Ajax handlers' user meta keys). */
export const PREFERENCES_ROUTE = 'wp-admin/v1/screen-preferences/';
export const preferencesRoute = ( screen ) => PREFERENCES_ROUTE + encodeURIComponent( screen );

const own = ( object, key ) => Boolean( object ) && Object.hasOwn( object, key );

/**
 * The contexts of a layout and their box ids, keeping only boxes that `boxes` describes, each
 * once (in the first context that lists it). Pure.
 *
 * @param {object} layout `{ contexts: { <context>: string[] } }`.
 * @param {object} boxes  Boxes by id.
 * @return {{names: string[], contexts: Object<string, string[]>}} Contexts in order.
 */
export function normaliseLayout( layout, boxes ) {
	const names = [];
	const contexts = {};
	const seen = new Set();
	const given = layout?.contexts && typeof layout.contexts === 'object' ? layout.contexts : {};
	for ( const [ name, ids ] of Object.entries( given ) ) {
		if ( typeof name !== 'string' || name === '' || names.includes( name ) ) {
			continue;
		}
		names.push( name );
		contexts[ name ] = [];
		for ( const id of Array.isArray( ids ) ? ids : [] ) {
			if ( typeof id === 'string' && own( boxes, id ) && ! seen.has( id ) ) {
				seen.add( id );
				contexts[ name ].push( id );
			}
		}
	}
	return { names, contexts };
}

const copy = ( contexts ) => Object.fromEntries( Object.entries( contexts ).map( ( [ name, ids ] ) => [ name, [ ...ids ] ] ) );
const contextOf = ( contexts, id ) => Object.keys( contexts ).find( ( name ) => contexts[ name ].includes( id ) ) ?? null;

/**
 * The contexts with box `id` moved into `context`, before box `beforeId` (null: at the end).
 * Pure.
 */
export function placeBox( contexts, id, context, beforeId = null ) {
	const next = copy( contexts );
	for ( const ids of Object.values( next ) ) {
		const at = ids.indexOf( id );
		if ( at !== -1 ) {
			ids.splice( at, 1 );
		}
	}
	if ( ! own( next, context ) ) {
		return copy( contexts );
	}
	const list = next[ context ];
	const at = beforeId === null ? -1 : list.indexOf( beforeId );
	list.splice( at === -1 ? list.length : at, 0, id );
	return next;
}

/**
 * Moves box `id` one position up (`delta` -1) or down (1), as postbox.js's move buttons do:
 * past the previous (or next) shown box of its container, or, from the first (or last) shown
 * box of a container, to the end of the previous (or the start of the next) shown container.
 * Hidden boxes keep their places. Pure.
 *
 * @param {string[]} names     Contexts in order.
 * @param {object}   contexts  Box ids by context.
 * @param {string}   id        The box.
 * @param {number}   delta     -1 or 1.
 * @param {object}   options
 * @param {Function} options.shown          Whether a box is shown.
 * @param {Function} options.containerShown Whether a context's container is shown.
 * @return {{contexts: object}|{edge: 'first'|'last'}|null} The new contexts, the edge it is on, or null for an unknown box.
 */
export function stepBox( names, contexts, id, delta, { shown = () => true, containerShown = () => true } = {} ) {
	const context = contextOf( contexts, id );
	if ( context === null || ( delta !== -1 && delta !== 1 ) ) {
		return null;
	}
	const visible = contexts[ context ].filter( ( other ) => other === id || shown( other ) );
	const at = visible.indexOf( id );
	const neighbour = visible[ at + delta ];
	if ( neighbour !== undefined ) {
		const list = contexts[ context ].filter( ( other ) => other !== id );
		const index = list.indexOf( neighbour ) + ( delta > 0 ? 1 : 0 );
		return { contexts: { ...copy( contexts ), [ context ]: [ ...list.slice( 0, index ), id, ...list.slice( index ) ] } };
	}
	const containers = names.filter( ( name ) => name === context || containerShown( name ) );
	const target = containers[ containers.indexOf( context ) + delta ];
	if ( target === undefined ) {
		return { edge: delta < 0 ? 'first' : 'last' };
	}
	return { contexts: placeBox( contexts, id, target, delta < 0 ? null : contexts[ target ][ 0 ] ?? null ) };
}

/**
 * The position of each shown box among the positions a shown box can take, in reading order,
 * and their count: an empty first (or last) shown container is one more position, which a box
 * can still move to. `index === 0` is the first position and `count - 1` the last, as
 * postbox.js marks its move buttons `aria-disabled`. Hidden boxes get -1. Pure.
 *
 * @return {Map<string, {index: number, count: number}>} Positions by box id.
 */
export function positions( names, contexts, { shown = () => true, containerShown = () => true } = {} ) {
	const containers = names.filter( containerShown );
	const visibleIn = ( name ) => contexts[ name ].filter( shown );
	const lead = containers.length > 0 && visibleIn( containers[ 0 ] ).length === 0 ? 1 : 0;
	const trail = containers.length > 1 && visibleIn( containers[ containers.length - 1 ] ).length === 0 ? 1 : 0;
	const order = containers.flatMap( visibleIn );
	const count = order.length + lead + trail;
	const result = new Map();
	for ( const name of names ) {
		for ( const id of contexts[ name ] ) {
			const index = order.indexOf( id );
			result.set( id, { index: index === -1 ? -1 : index + lead, count } );
		}
	}
	return result;
}

/**
 * Which containers are empty, as postbox.js's _mark_area() marks them (`empty-container`):
 * every container with no shown box, whatever its measured visibility, since WordPress's styles
 * hide some empty containers by that class (dashboard.css hides empty third and fourth columns
 * at some widths) and the mark must not depend on what it hides. Only when exactly one box is
 * shown in the shown containers are those containers left unmarked. `allEmpty` says whether no
 * shown container holds a shown box. Pure.
 *
 * @return {{empty: Set<string>, allEmpty: boolean}} Empty containers.
 */
export function emptyContainers( names, contexts, { shown = () => true, containerShown = () => true } = {} ) {
	const visible = names.filter( containerShown );
	const total = visible.reduce( ( sum, name ) => sum + contexts[ name ].filter( shown ).length, 0 );
	const empty = new Set();
	let allEmpty = true;
	for ( const name of names ) {
		const hasBox = contexts[ name ].some( shown );
		if ( visible.includes( name ) && ( total === 1 || hasBox ) ) {
			allEmpty = false;
		} else if ( ! hasBox ) {
			empty.add( name );
		}
	}
	return { empty, allEmpty };
}

/** The index before which a dragged box lands among boxes with these rects, for a pointer at `y`. Pure. */
export function dropIndex( rects, y ) {
	const at = rects.findIndex( ( rect ) => rect && y < rect.top + rect.height / 2 );
	return at === -1 ? rects.length : at;
}

const sameContexts = ( a, b ) => JSON.stringify( a ) === JSON.stringify( b );

/**
 * Default implementation of core/meta-box-holder: the classic `.metabox-holder` with one
 * `.postbox-container` (`#postbox-container-N`) and `.meta-box-sortables` (`#{context}-sortables`)
 * per context, each box shown through core/meta-box. The root carries `js` (as a classic
 * screen's body does, for `.js .closed .inside` and the like), `meta-box-reordering-disabled`
 * while reordering is off and `is-dragging-metaboxes` during a drag, so that WordPress's styles
 * apply.
 *
 * Each box is rendered into an element of its own (`.wp-admin-meta-box-host`, `display:
 * contents`) that the holder moves between containers, so that a box moved to another column
 * keeps its content as it is (a classic sortable moves the same element), its scripts and
 * typed text included.
 *
 * What the user does, as postbox.js handles it:
 * - Toggle (the heading or the toggle button) closes or opens a box and saves `closed` and
 *   `hidden` together, the complete lists; "Screen Options updated." is announced once saved.
 * - Screen Options (given to the frame, see core/screen-options, unless `offerScreenOptions` is
 *   false): a box's checkbox hides or shows
 *   it and saves likewise; the reordering checkbox saves `reordering` and announces "Rearranging
 *   screen elements enabled." or "… disabled."; the layout saves `order` with `columns`.
 * - Move up and down move a box by one position (stepBox()), then save `order` (every context's
 *   complete list) with `columns` and announce "The boxes order has been saved."; on the first
 *   or last position they announce "The box is on the first position" (or last) and move
 *   nothing. Focus stays on the button.
 * - Drag: the heading of a box is a drag handle (HTML5 drag and drop) while reordering is on;
 *   a placeholder (`.sortable-placeholder`) shows where it lands; dropping saves the order. A
 *   pinned box cannot be moved, and nothing lands before a shown pinned box in its container.
 * - Empty containers get `empty-container` and the classic text, "Drag boxes here", or "Add boxes
 *   from the Screen Options menu" when every container is empty (`data-emptystring`).
 *
 * - A box's Dismiss link (`a.dismiss`, the browser nag's) hides the box as its Screen Options
 *   checkbox does.
 *
 * After a box is toggled, hidden or shown, a `postbox-toggled` CustomEvent (not bubbling, with
 * `detail: { id, closed, hidden }`) is dispatched on its element, and when jQuery is loaded
 * `jQuery( document ).trigger( 'postbox-toggled', jQuery( element ) )` runs as postbox.js does,
 * for plugin scripts; after a drag into another container, `postbox-moved` likewise (`detail:
 * { id, from, to }`). Saves are sent one after the other; a failed save is not announced.
 * Announcements go through the frame's speak(), else wp.a11y.speak() when loaded.
 */
export default {
	name: 'MetaBoxHolder',
	props: {
		id: { type: String, default: '' },
		screen: { type: String, required: true },
		layout: { type: Object, required: true },
		boxes: { type: Object, required: true },
		reordering: { type: Boolean, default: true },
		columns: { type: Number, default: 0 },
		sections: { type: Array, default: () => [] },
		columnChoices: { type: Array, default: () => [] },
		containerIds: { type: Object, default: () => ( {} ) },
		offerScreenOptions: { type: Boolean, default: true },
	},
	emits: [ 'order', 'toggle', 'hide', 'reordering', 'columns', 'option' ],
	setup( props, { emit, slots } ) {
		const doc = globalThis.document ?? null;
		// The frame's speak(); outside the frame, wp.a11y.speak() when a classic script loaded it.
		const speak = inject( 'speak', null ) ?? ( ( message ) => globalThis.wp?.a11y?.speak?.( message ) );
		const frameOptions = inject( 'screenOptions', null );

		const names = shallowRef( [] );
		const contexts = ref( {} );
		const flags = reactive( {} ); // id -> { closed, hidden }
		const reorderingOn = ref( props.reordering );
		const columnsNow = ref( props.columns );
		const hiddenContainers = shallowRef( new Set() );
		const dragging = ref( false );

		function rebuild() {
			const next = normaliseLayout( props.layout, props.boxes );
			names.value = next.names;
			contexts.value = next.contexts;
			for ( const key of Object.keys( flags ) ) {
				delete flags[ key ];
			}
			for ( const ids of Object.values( next.contexts ) ) {
				for ( const id of ids ) {
					flags[ id ] = { closed: Boolean( props.boxes[ id ]?.closed ), hidden: Boolean( props.boxes[ id ]?.hidden ) };
				}
			}
		}
		watch( () => [ props.layout, props.boxes ], rebuild, { immediate: true } );
		watch( () => props.reordering, ( value ) => {
			reorderingOn.value = value;
		} );
		watch( () => props.columns, ( value ) => {
			columnsNow.value = value;
		} );

		const isPinned = ( id ) => Boolean( props.boxes[ id ]?.pinned );
		const shown = ( id ) => ! flags[ id ]?.hidden;
		const containerShown = ( name ) => ! hiddenContainers.value.has( name );
		const where = computed( () => positions( names.value, contexts.value, { shown, containerShown } ) );
		const empty = computed( () => emptyContainers( names.value, contexts.value, { shown, containerShown } ) );
		const allIds = computed( () => names.value.flatMap( ( name ) => contexts.value[ name ] ) );

		// Saving: one request after the other, each with the complete lists.
		let queue = Promise.resolve();
		function save( body, announce ) {
			queue = queue.then( () => api.post( preferencesRoute( props.screen ), body ) ).then(
				() => announce && speak( announce() ),
				( error ) => console.warn( 'Could not save the screen preferences of ' + props.screen + ':', error )
			);
			return queue;
		}
		const stateBody = () => ( {
			closed: allIds.value.filter( ( id ) => flags[ id ].closed ),
			hidden: allIds.value.filter( ( id ) => flags[ id ].hidden ),
		} );
		const orderBody = () => ( { order: copy( contexts.value ), columns: columnsNow.value } );
		const stateSaved = () => __( 'Screen Options updated.', 'default' );
		const orderSaved = () => __( 'The boxes order has been saved.', 'default' );

		// A postbox event for plugin scripts: a non-bubbling CustomEvent on the box element (with
		// `detail`), and jQuery( document ).trigger( type, jQuery( element ) ) when jQuery is loaded.
		async function announceBox( type, id, detail ) {
			await nextTick();
			const element = doc?.getElementById?.( id );
			if ( ! element ) {
				return;
			}
			if ( typeof globalThis.CustomEvent === 'function' ) {
				element.dispatchEvent?.( new globalThis.CustomEvent( type, { detail } ) );
			}
			const jQuery = globalThis.jQuery;
			if ( typeof jQuery === 'function' ) {
				jQuery( doc ).trigger( type, jQuery( element ) );
			}
		}
		const announceToggled = ( id ) => announceBox( 'postbox-toggled', id, { id, closed: flags[ id ]?.closed ?? false, hidden: flags[ id ]?.hidden ?? false } );

		function onToggle( id ) {
			if ( ! flags[ id ] || isPinned( id ) ) {
				return;
			}
			flags[ id ].closed = ! flags[ id ].closed;
			emit( 'toggle', id, flags[ id ].closed );
			save( stateBody(), stateSaved );
			announceToggled( id );
		}

		function setHidden( id, hidden ) {
			if ( flags[ id ].hidden === hidden ) {
				return;
			}
			flags[ id ].hidden = hidden;
			emit( 'hide', id, hidden );
			save( stateBody(), stateSaved );
			announceToggled( id );
			nextTick( refreshContainers );
		}

		function setOrder( next ) {
			if ( sameContexts( next, contexts.value ) ) {
				return false;
			}
			contexts.value = next;
			emit( 'order', copy( next ) );
			save( orderBody(), orderSaved );
			nextTick( refreshContainers );
			return true;
		}

		// The containers' visibility (a column the width hides), as jQuery's :visible tells it.
		const containers = new Map(); // context -> element
		function refreshContainers() {
			const hidden = new Set();
			for ( const [ name, element ] of containers ) {
				if ( typeof element?.getClientRects === 'function' && ! ( element.offsetWidth || element.offsetHeight || element.getClientRects().length ) ) {
					hidden.add( name );
				}
			}
			if ( [ ...hidden ].join( '\n' ) !== [ ...hiddenContainers.value ].join( '\n' ) ) {
				hiddenContainers.value = hidden;
			}
		}

		async function onMove( id, delta ) {
			if ( ! reorderingOn.value || isPinned( id ) ) {
				return;
			}
			refreshContainers();
			const result = stepBox( names.value, contexts.value, id, delta, { shown, containerShown } );
			if ( result?.edge ) {
				speak( result.edge === 'first' ? __( 'The box is on the first position', 'default' ) : __( 'The box is on the last position', 'default' ) );
				return;
			}
			if ( result && setOrder( result.contexts ) ) {
				await nextTick();
				doc?.getElementById?.( id )?.querySelector?.( delta < 0 ? '.handle-order-higher' : '.handle-order-lower' )?.focus?.();
			}
		}

		function onScreenOption( id, value ) {
			if ( id === 'meta-box-reordering' ) {
				const enabled = Boolean( value );
				reorderingOn.value = enabled;
				emit( 'reordering', enabled );
				nextTick( refreshContainers );
				save( { reordering: enabled }, () => ( enabled ? __( 'Rearranging screen elements enabled.', 'default' ) : __( 'Rearranging screen elements disabled.', 'default' ) ) );
			} else if ( id === 'screen_columns' ) {
				const count = Number.parseInt( value, 10 );
				if ( Number.isInteger( count ) && count > 0 ) {
					columnsNow.value = count;
					emit( 'columns', count );
					save( orderBody(), orderSaved );
				}
			} else if ( flags[ id ] ) {
				setHidden( id, ! value );
			} else {
				emit( 'option', id, value );
			}
		}

		// The Screen Options panel in the frame: the page's sections, with each box's current state.
		let release = null;
		watchEffect( () => {
			if ( ! props.offerScreenOptions ) {
				release?.();
				release = null;
				return;
			}
			const sections = ( Array.isArray( props.sections ) ? props.sections : [] ).map( ( section ) => ( {
				...section,
				items: ( Array.isArray( section?.items ) ? section.items : [] ).map( ( item ) => ( flags[ item?.id ] ? { ...item, checked: ! flags[ item.id ].hidden } : item ) ),
			} ) );
			const options = { sections, reordering: reorderingOn.value, columns: props.columnChoices.length > 0 ? { value: columnsNow.value, choices: props.columnChoices } : null, onChange: onScreenOption };
			// Each set replaces the last; the release of the newest withdraws them when the holder goes.
			release = frameOptions?.set?.( options ) ?? null;
		} );

		// Each box renders into a host element of its own, which the holder places in its container.
		const teleporting = typeof doc?.createElement === 'function';
		const hosts = new Map(); // id -> element
		function hostFor( id ) {
			if ( ! hosts.has( id ) ) {
				const host = doc.createElement( 'div' );
				host.setAttribute( 'class', 'wp-admin-meta-box-host' );
				host.setAttribute( 'data-box', id );
				hosts.set( id, host );
			}
			return hosts.get( id );
		}

		// The drop placeholder and where it is: { context, beforeId }.
		let placeholder = null;
		let landing = null;
		let dragged = null; // { id, height }

		function placeIn( name ) {
			const container = containers.get( name );
			if ( ! container || ! teleporting ) {
				return;
			}
			placeholder?.remove?.();
			const ids = ( contexts.value[ name ] ?? [] ).filter( ( id ) => hosts.has( id ) );
			ids.forEach( ( id, index ) => {
				const host = hosts.get( id );
				const at = container.childNodes[ index ] ?? null;
				if ( at !== host ) {
					container.insertBefore( host, at );
				}
			} );
			for ( const node of [ ...container.childNodes ].slice( ids.length ) ) {
				node.remove?.();
			}
			if ( placeholder && landing?.context === name ) {
				container.insertBefore( placeholder, landing.beforeId ? hosts.get( landing.beforeId ) ?? null : null );
			}
		}
		function placeAll() {
			for ( const id of [ ...hosts.keys() ] ) {
				if ( ! allIds.value.includes( id ) ) {
					hosts.delete( id );
				}
			}
			names.value.forEach( placeIn );
		}
		function setContainer( name, element ) {
			if ( element ) {
				containers.set( name, element );
				placeIn( name );
			} else {
				containers.delete( name );
			}
		}
		watch( () => names.value.map( ( name ) => name + ':' + contexts.value[ name ].join( ',' ) ).join( '|' ), placeAll, { flush: 'post' } );

		// Drag and drop (HTML5), from a box's heading to a place in a container.
		function finishDrag() {
			placeholder?.remove?.();
			placeholder = null;
			landing = null;
			dragged = null;
			dragging.value = false;
		}
		function landingIn( name, y ) {
			const visible = contexts.value[ name ].filter( ( id ) => id !== dragged.id && shown( id ) );
			const rects = visible.map( ( id ) => doc?.getElementById?.( id )?.getBoundingClientRect?.() ?? null );
			const index = dropIndex( rects, y );
			const pinned = visible.findIndex( isPinned );
			if ( pinned !== -1 && index <= pinned ) {
				return null; // Nothing lands before a pinned box, as postbox.js cancels such a sort.
			}
			return { context: name, beforeId: visible[ index ] ?? null };
		}
		function onDragstart( event ) {
			if ( ! reorderingOn.value ) {
				return;
			}
			const element = event?.target?.closest?.( '.hndle' )?.closest?.( '.postbox' );
			const id = element?.id;
			if ( ! id || ! flags[ id ] || isPinned( id ) ) {
				return;
			}
			const rect = element.getBoundingClientRect?.();
			dragged = { id, height: rect?.height ?? 0 };
			dragging.value = true;
			if ( event.dataTransfer ) {
				event.dataTransfer.effectAllowed = 'move';
				event.dataTransfer.setData?.( 'text/plain', id );
				if ( rect ) {
					event.dataTransfer.setDragImage?.( element, event.clientX - rect.left, event.clientY - rect.top );
				}
			}
		}
		function onDragover( event, name ) {
			if ( ! dragged || ! reorderingOn.value ) {
				return;
			}
			event.preventDefault?.();
			if ( event.dataTransfer ) {
				event.dataTransfer.dropEffect = 'move';
			}
			const next = landingIn( name, event.clientY );
			if ( next?.context === landing?.context && next?.beforeId === landing?.beforeId ) {
				return;
			}
			landing = next;
			if ( ! landing ) {
				placeholder?.remove?.();
				return;
			}
			if ( ! placeholder && teleporting ) {
				placeholder = doc.createElement( 'div' );
				placeholder.setAttribute( 'class', 'sortable-placeholder' );
				placeholder.setAttribute( 'style', 'height: ' + Math.max( 0, Math.round( dragged.height ) ) + 'px' );
			}
			if ( placeholder ) {
				containers.get( name )?.insertBefore( placeholder, landing.beforeId ? hosts.get( landing.beforeId ) ?? null : null );
			}
		}
		function onDrop( event, name ) {
			if ( ! dragged ) {
				return;
			}
			event.preventDefault?.();
			const target = landing ?? landingIn( name, event.clientY );
			const id = dragged.id;
			finishDrag();
			const from = contextOf( contexts.value, id );
			if ( target && setOrder( placeBox( contexts.value, id, target.context, target.beforeId ) ) && from !== target.context ) {
				// As a classic sortable's `receive` does: the box arrived in another container.
				announceBox( 'postbox-moved', id, { id, from, to: target.context } );
			}
		}

		// A box's Dismiss link (the browser nag's) hides the box, as its Screen Options checkbox would.
		function onClick( event ) {
			const link = event?.target?.closest?.( 'a.dismiss' );
			const id = link?.closest?.( '.postbox' )?.id;
			if ( ! id || ! flags[ id ] ) {
				return;
			}
			event.preventDefault?.();
			setHidden( id, true );
		}

		const onResize = () => refreshContainers();
		onMounted( () => {
			refreshContainers();
			globalThis.window?.addEventListener?.( 'resize', onResize );
		} );
		onBeforeUnmount( () => {
			release?.();
			globalThis.window?.removeEventListener?.( 'resize', onResize );
			finishDrag();
		} );

		function boxVNode( id ) {
			const box = { ...props.boxes[ id ], id, closed: flags[ id ].closed, hidden: flags[ id ].hidden };
			const at = where.value.get( id ) ?? { index: -1, count: 0 };
			return h( Contracted, {
				id: 'core/meta-box',
				box,
				index: at.index,
				count: at.count,
				reordering: reorderingOn.value,
				onMove: ( delta ) => onMove( id, delta ),
				onToggle: () => onToggle( id ),
			}, {
				default: () => slots[ id ]?.() ?? null,
				'header-actions': ( scope ) => slots[ 'header-actions' ]?.( scope ) ?? null,
			} );
		}

		// Render parts, each built on its own.
		const slotNode = ( name ) => h( SlotOutlet, { name, context: { screen: props.screen } } );
		const inlineHost = ( id ) => h( 'div', { key: id, class: 'wp-admin-meta-box-host', 'data-box': id }, [ boxVNode( id ) ] );
		const teleportNode = ( id ) => h( Teleport, { key: id, to: hostFor( id ) }, [ boxVNode( id ) ] );
		function sortablesNode( name, emptyText ) {
			const isEmpty = empty.value.empty.has( name );
			const children = teleporting ? undefined : contexts.value[ name ].map( inlineHost );
			return h( 'div', {
				id: name + '-sortables',
				ref: ( element ) => setContainer( name, element ),
				class: [ 'meta-box-sortables', { 'empty-container': isEmpty } ],
				'data-emptystring': isEmpty ? emptyText : null,
				onDragover: ( event ) => onDragover( event, name ),
				onDrop: ( event ) => onDrop( event, name ),
			}, children );
		}
		function containerNode( name, index, emptyText ) {
			const sortables = sortablesNode( name, emptyText );
			const given = props.containerIds?.[ name ];
			const id = typeof given === 'string' && given !== '' ? given : 'postbox-container-' + ( index + 1 );
			return h( 'div', { key: name, id, class: 'postbox-container' }, [ sortables ] );
		}
		function holderNode() {
			const emptyText = empty.value.allEmpty ? __( 'Add boxes from the Screen Options menu', 'default' ) : __( 'Drag boxes here', 'default' );
			const children = names.value.map( ( name, index ) => containerNode( name, index, emptyText ) );
			return h( 'div', { id: props.id || null, class: [ 'metabox-holder', columnsNow.value > 0 ? 'columns-' + columnsNow.value : '' ] }, children );
		}

		return () => {
			const teleports = teleporting ? allIds.value.map( teleportNode ) : [];
			const children = [ slotNode( 'before-containers' ), holderNode(), ...teleports, slotNode( 'after-containers' ) ];
			return h( 'div', {
				class: [ 'wp-admin-meta-boxes', 'js', { 'meta-box-reordering-disabled': ! reorderingOn.value, 'is-dragging-metaboxes': dragging.value } ],
				onDragstart,
				onDragend: finishDrag,
				onClick,
			}, children );
		};
	},
};
