import { computed, inject, nextTick, provide, reactive, ref, watch } from 'vue';

/*
 * The file list of a file editor (`#templateside`), as wp_print_theme_file_tree() and
 * wp_print_plugin_file_tree() print it and theme-plugin-editor.js's TreeLinks drives it: the
 * folders collapsed except those that hold the open file, the open file marked current (and the
 * list's tab stop), a click on a folder's label opens or closes it, and the keys move and open:
 * Up and Down between the shown items, Home and End to the first and the last, Right opens a
 * folder or moves into it, Left closes it or moves to its folder, Enter and Space open a folder
 * or close it, or open a file. A file opens through `open( path )`, as does a child theme's
 * parent in the note above the list. WordPress gives the items, their labels and paths; nothing
 * here is markup.
 */

const list = ( value ) => ( Array.isArray( value ) ? value : [] );
// What the rows of the list call back into (FileEditorTree's state and handlers).
const TREE = Symbol( 'fileEditorTree' );
const isFolder = ( item ) => item.path === null || item.path === undefined;

/** Whether an item is, or holds, the open file. */
const holdsCurrent = ( item ) => item.current === true || list( item.children ).some( holdsCurrent );

/** The note's text around its `%s` (the parent's name). Pure. */
export function noteParts( text ) {
	const value = typeof text === 'string' ? text : '';
	const at = value.indexOf( '%s' );
	return at === -1 ? [ value, '' ] : [ value.slice( 0, at ), value.slice( at + 2 ) ];
}

/**
 * The items of a tree with their keys, levels, positions and folders, in document order. Pure.
 *
 * @param {Array}  tree  The tree of the data.
 * @param {number} level The level of its items (the list's root item is level 1).
 * @param {string} [parent] The key of the folder holding them.
 * @return {Array<object>} The rows.
 */
export function rows( tree, level = 2, parent = null ) {
	const items = list( tree ).filter( ( item ) => item && typeof item === 'object' );
	return items.flatMap( ( item, index ) => {
		const key = ( parent === null ? '' : parent + '/' ) + index;
		const row = { key, item, level, position: index + 1, size: items.length, parent, folder: isFolder( item ) };
		return [ row, ...( row.folder ? rows( item.children, level + 1, key ) : [] ) ];
	} );
}

export default {
	name: 'FileEditorTree',
	props: {
		// `theme` or `plugin`: the label's id is classic's (`theme-files-label`, `plugin-files-label`).
		kind: { type: String, required: true },
		label: { type: String, default: '' },
		note: { type: Object, default: null },
		tree: { type: Array, required: true },
		// The address of an admin path (the page's adminHref()).
		href: { type: Function, required: true },
	},
	emits: [ 'open' ],
	setup( props, { emit } ) {
		const labelId = computed( () => ( props.kind === 'plugin' ? 'plugin-files-label' : 'theme-files-label' ) );
		const all = computed( () => rows( props.tree ) );
		const expanded = ref( new Set() );
		const focusKey = ref( null );
		const elements = new Map();

		// TreeLinks: every folder collapsed, then the folders that hold the open file expanded.
		watch( all, ( value ) => {
			expanded.value = new Set( value.filter( ( row ) => row.folder && holdsCurrent( row.item ) ).map( ( row ) => row.key ) );
			focusKey.value = ( value.find( ( row ) => row.item.current === true ) ?? value[ 0 ] )?.key ?? null;
		}, { immediate: true } );

		const isExpanded = ( row ) => expanded.value.has( row.key );
		const shown = computed( () => all.value.filter( ( row ) => {
			for ( let parent = row.parent; parent !== null; parent = all.value.find( ( other ) => other.key === parent )?.parent ?? null ) {
				if ( ! expanded.value.has( parent ) ) {
					return false;
				}
			}
			return true;
		} ) );

		function setExpanded( row, open ) {
			const next = new Set( expanded.value );
			if ( open ) {
				next.add( row.key );
			} else {
				next.delete( row.key );
			}
			expanded.value = next;
		}

		async function focus( row ) {
			if ( ! row ) {
				return;
			}
			focusKey.value = row.key;
			await nextTick();
			elements.get( row.key )?.focus?.();
		}

		const remember = ( key ) => ( element ) => {
			if ( element ) {
				elements.set( key, element );
			} else {
				elements.delete( key );
			}
		};

		const open = ( row ) => emit( 'open', row.item.path );

		function toggle( row ) {
			setExpanded( row, ! isExpanded( row ) );
		}

		function onKeydown( event, row ) {
			if ( event.altKey || event.ctrlKey || event.metaKey ) {
				return;
			}
			const visible = shown.value;
			const index = visible.findIndex( ( other ) => other.key === row.key );
			let handled = true;
			switch ( event.key ) {
				case 'ArrowDown':
					focus( visible[ index + 1 ] );
					break;
				case 'ArrowUp':
					focus( visible[ index - 1 ] );
					break;
				case 'Home':
					focus( visible[ 0 ] );
					break;
				case 'End':
					focus( visible[ visible.length - 1 ] );
					break;
				case 'ArrowRight':
					if ( row.folder ) {
						if ( isExpanded( row ) ) {
							focus( visible[ index + 1 ] );
						} else {
							setExpanded( row, true );
						}
					}
					break;
				case 'ArrowLeft':
					if ( row.folder && isExpanded( row ) ) {
						setExpanded( row, false );
					} else if ( row.parent !== null ) {
						focus( all.value.find( ( other ) => other.key === row.parent ) );
					}
					break;
				case 'Enter':
				case ' ':
					if ( row.folder ) {
						toggle( row );
					} else {
						open( row );
					}
					break;
				default:
					handled = false;
			}
			if ( handled ) {
				event.preventDefault();
				event.stopPropagation();
			}
		}

		const noteText = computed( () => noteParts( props.note?.text ) );
		const top = computed( () => all.value.filter( ( row ) => row.parent === null ) );

		provide( TREE, reactive( { all, focusKey, isExpanded, remember, open, toggle, onKeydown, href: ( path ) => props.href( path ) } ) );

		return { labelId, top, noteText };
	},
	// The rows are rendered by a recursive part: a folder holds its items' list.
	components: {
		TreeItems: {
			name: 'FileEditorTreeItems',
			props: {
				items: { type: Array, required: true },
			},
			setup() {
				return { tree: inject( TREE ) };
			},
			template: `
				<template v-for="row in items" :key="row.key">
					<li
						v-if="row.folder"
						:ref="tree.remember( row.key )"
						role="treeitem"
						:aria-expanded="tree.isExpanded( row ) ? 'true' : 'false'"
						:tabindex="tree.focusKey === row.key ? 0 : -1"
						:aria-level="row.level"
						:aria-setsize="row.size"
						:aria-posinset="row.position"
						@keydown.self="( event ) => tree.onKeydown( event, row )"
					>
						<span class="folder-label" @click.stop="tree.toggle( row )">{{ row.item.label }} <span class="screen-reader-text">{{ $__( 'folder', 'default' ) }}</span><span aria-hidden="true" class="icon"></span></span>
						<ul role="group" class="tree-folder">
							<FileEditorTreeItems :items="tree.all.filter( ( other ) => other.parent === row.key )" />
						</ul>
					</li>
					<li v-else role="none" :class="row.item.current ? 'current-file' : ''">
						<a
							:ref="tree.remember( row.key )"
							role="treeitem"
							:tabindex="tree.focusKey === row.key ? 0 : -1"
							:href="tree.href( row.item.path )"
							:aria-level="row.level"
							:aria-setsize="row.size"
							:aria-posinset="row.position"
							:aria-current="row.item.current ? 'page' : null"
							@click.prevent="tree.open( row )"
							@keydown="( event ) => tree.onKeydown( event, row )"
						>
							<span v-if="row.item.current" class="notice notice-info">{{ row.item.label }}<template v-if="row.item.detail"><br><span class="nonessential">({{ row.item.detail }})</span></template></span>
							<template v-else>{{ row.item.label }}<template v-if="row.item.detail"><br><span class="nonessential">({{ row.item.detail }})</span></template></template>
						</a>
					</li>
				</template>
			`,
		},
	},
	template: `
		<div id="templateside">
			<h2 :id="labelId">{{ label }}</h2>
			<ul role="tree" :aria-labelledby="labelId">
				<li v-if="note" class="howto">{{ noteText[ 0 ] }}<a :href="href( note.parent?.path )" @click.prevent="$emit( 'open', note.parent?.path )">{{ note.parent?.label }}</a>{{ noteText[ 1 ] }}</li>
				<li role="treeitem" tabindex="-1" aria-expanded="true" aria-level="1" aria-posinset="1" aria-setsize="1">
					<ul role="group">
						<TreeItems :items="top" />
					</ul>
				</li>
			</ul>
		</div>
	`,
};
