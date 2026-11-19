// A minimal fake DOM for Vue's custom renderer: just enough to mount components
// and read back the rendered text.
const detach = ( child ) => {
	if ( child.parent ) {
		child.parent.children.splice( child.parent.children.indexOf( child ), 1 );
		child.parent = null;
	}
};

const insert = ( child, parent, anchor ) => {
	detach( child );
	child.parent = parent;
	const i = anchor ? parent.children.indexOf( anchor ) : -1;
	parent.children.splice( i < 0 ? parent.children.length : i, 0, child );
};

const classesOf = ( node ) => String( node.props?.class ?? '' ).split( /\s+/ ).filter( Boolean );

/** Whether a fake element matches a simple selector: `.class`, `#id`, a tag name or `tag.class`. */
const matches = ( node, selector ) => {
	if ( node?.type !== 'element' ) {
		return false;
	}
	if ( selector.startsWith( '.' ) ) {
		return classesOf( node ).includes( selector.slice( 1 ) );
	}
	if ( selector.startsWith( '#' ) ) {
		return node.props.id === selector.slice( 1 );
	}
	const compound = /^([a-z0-9]+)\.(.+)$/.exec( selector );
	if ( compound ) {
		return node.tag === compound[ 1 ] && classesOf( node ).includes( compound[ 2 ] );
	}
	return node.tag === selector;
};

/**
 * What fake elements share: the few DOM methods code under test calls on the elements it
 * renders (moving them, reading attributes). Simple queries are added by enableQueries().
 */
const elementMethods = {
	get childNodes() {
		return this.children;
	},
	get parentNode() {
		return this.parent;
	},
	get id() {
		return this.props.id;
	},
	insertBefore( child, ref ) {
		insert( child, this, ref ?? null );
		return child;
	},
	appendChild( child ) {
		insert( child, this, null );
		return child;
	},
	remove() {
		detach( this );
	},
	setAttribute( key, value ) {
		this.props[ key ] = String( value );
	},
	getAttribute( key ) {
		return this.props[ key ] ?? null;
	},
};

/**
 * Gives fake elements `querySelector()` and `closest()` for simple selectors (`.class`, `#id`, a
 * tag, `tag.class`), in this test process only: code that feature-detects a real DOM by them would otherwise
 * take the fake one for it.
 */
export function enableQueries() {
	Object.assign( elementMethods, {
		querySelector( selector ) {
			const walk = ( node ) => {
				for ( const child of node.children ?? [] ) {
					if ( matches( child, selector ) ) {
						return child;
					}
					const found = walk( child );
					if ( found ) {
						return found;
					}
				}
				return null;
			};
			return walk( this );
		},
		closest( selector ) {
			let node = this;
			while ( node && ! matches( node, selector ) ) {
				node = node.parent;
			}
			return node ?? null;
		},
	} );
}

/** A fake element, as the fake DOM's createElement() makes it. */
export const createFakeElement = ( tag ) => Object.assign( Object.create( elementMethods ), { type: 'element', tag, props: {}, children: [], parent: null } );

export function createNodeOps() {
	const text = ( node ) => ( node.type === 'text' ? node.text : node.type === 'comment' ? '' : node.children.map( text ).join( '' ) );
	return {
		text,
		ops: {
			insert,
			remove: detach,
			createElement: createFakeElement,
			createText: ( t ) => ( { type: 'text', text: t, parent: null } ),
			createComment: () => ( { type: 'comment', parent: null } ),
			setText( node, t ) {
				node.text = t;
			},
			setElementText( node, t ) {
				node.children = t === '' ? [] : [ { type: 'text', text: t, parent: node } ];
			},
			parentNode: ( node ) => node.parent,
			nextSibling: ( node ) => node.parent?.children[ node.parent.children.indexOf( node ) + 1 ] ?? null,
			patchProp( el, key, prev, next ) {
				el.props[ key ] = next;
			},
		},
	};
}

export const flush = async () => {
	for ( let i = 0; i < 10; i++ ) {
		await new Promise( ( r ) => setTimeout( r, 0 ) );
	}
};
