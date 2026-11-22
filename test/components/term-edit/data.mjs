// What wp_admin_get_term_edit() gives (wp-includes/admin/term-page.php), built for the term edit
// page's component tests, and the page mounted the way the router mounts it, with a host that
// records the notices, what is spoken and where the router is sent (with its options). A test
// passes what differs.
import { h } from 'vue';
import { mountPart } from '../../helpers/mount.mjs';
import { settle } from '../../helpers/settle.mjs';
import { fillContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { noticeElementId } from '../../../site/runtime/notices.js';
import Contracted from '../../../site/runtime/Contracted.js';

export { settle };

export const PATH = 'term.php?taxonomy=category&tag_ID=5&post_type=post&wp_http_referer=%2Fwp-admin%2Fedit-tags.php%3Ftaxonomy%3Dcategory%26s%3Djazz';

/** The parent dropdown (wp_admin_terms_parent_dropdown()): None, then each term, padded as printed. */
export const parentOf = ( terms, selected = null ) => ( {
	options: [ { value: '-1', label: 'None', level: null }, ...terms.map( ( [ id, label, level = 0 ] ) => ( { value: String( id ), label: ' '.repeat( 3 * level ) + label, level } ) ) ],
	html: null,
	selected,
} );

export const LABELS = {
	nameDescription: 'The name is how it appears on your site.',
	slugDescription: 'The &#8220;slug&#8221; is the URL-friendly version of the name. It is usually all lowercase and contains only letters, numbers, and hyphens.',
	parentDescription: 'Categories, unlike tags, can have a hierarchy. You might have a Jazz category, and under that have children categories for Bebop and Big Band. Totally optional.',
	descDescription: 'The description is not prominent by default; however, some themes may show it.',
};

/** The page's data. `over` replaces any of its keys. */
export const termData = ( over = {} ) => ( {
	taxonomy: { name: 'category', hierarchical: true, labels: { name: 'Categories', editItem: 'Edit Category', parentItem: 'Parent Category', backToItems: '← Go to Categories' } },
	error: null,
	title: 'Edit Category',
	postType: 'post',
	term: { id: 5, name: 'Jazz & Blues', slug: 'jazz', description: 'All that "jazz" & more', parent: 3 },
	fields: { parent: parentOf( [ [ 3, 'Music' ], [ 4, 'Rock', 1 ], [ 9, 'Other' ] ], '3' ) },
	labels: LABELS,
	referer: '/wp-admin/edit-tags.php?taxonomy=category&s=jazz',
	message: null,
	delete: { request: { method: 'DELETE', path: 'terms/5' } },
	hooks: { pre: null, top: null, rows: null, after: null },
	menuCurrent: 'edit-tags.php?taxonomy=category',
	bodyClasses: [ 'term-php', 'taxonomy-category' ],
	focusName: true,
	...over,
} );

/** The data of a classic refusal (`{ query, taxonomy: null, error }`). */
export const dieData = ( status, message, heading = null ) => ( {
	query: { taxonomy: 'category', tag_ID: '99' },
	taxonomy: null,
	error: { kind: 'die', status, heading, message },
} );

export const loadContracts = async () => {
	contracts.configure( { replacements: {}, slots: {} } );
	await fillContracts( [ 'term-edit' ] );
};

/** A host that records what the page gives it: notices, speech and the router's targets with their options. */
export function host() {
	const record = { added: [], spoken: [], followed: [] };
	record.provide = {
		router: {
			follow: async ( target, options ) => {
				record.followed.push( [ target, options ?? null ] );
				return true;
			},
			previousUrl: () => null,
		},
		speak: ( message ) => record.spoken.push( message ),
		notices: {
			add: ( notice ) => {
				record.added.push( notice );
				const id = 'notice-' + record.added.length;
				const element = document.createElement( 'div' );
				element.id = noticeElementId( id );
				element.tabIndex = -1;
				element.textContent = notice.message;
				document.body.appendChild( element );
				return id;
			},
		},
		frameChannel: null,
		pageLocation: { origin: 'http://localhost', pathname: '/wp-admin/term.php', search: '?' + PATH.split( '?' )[ 1 ] },
	};
	return record;
}

/** Mounts the term edit page (`core/term-edit`) with `data`; `provide` adds to what it injects. */
export async function mountTerm( data = termData(), record = host(), provide = {} ) {
	const wrapper = mountPart( { render: () => h( Contracted, { id: 'core/term-edit', data, page: { path: PATH, title: 'Edit Category' } } ) }, {
		provide: { ...record.provide, ...provide },
	} );
	await settle();
	wrapper.record = record;
	return wrapper;
}
