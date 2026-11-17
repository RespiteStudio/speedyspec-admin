// A minimal fake DOM for Vue's custom renderer: just enough to mount components
// and read back the rendered text.
export function createNodeOps() {
	const text = ( node ) => ( node.type === 'text' ? node.text : node.type === 'comment' ? '' : node.children.map( text ).join( '' ) );
	const detach = ( child ) => {
		if ( child.parent ) {
			child.parent.children.splice( child.parent.children.indexOf( child ), 1 );
			child.parent = null;
		}
	};
	return {
		text,
		ops: {
			insert( child, parent, anchor ) {
				detach( child );
				child.parent = parent;
				const i = anchor ? parent.children.indexOf( anchor ) : -1;
				parent.children.splice( i < 0 ? parent.children.length : i, 0, child );
			},
			remove: detach,
			createElement: ( tag ) => ( { type: 'element', tag, props: {}, children: [], parent: null } ),
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
