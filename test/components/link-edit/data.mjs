// What wp_admin_get_link_edit() gives (wp-includes/admin/link-page.php), built for the link
// form's component tests, and the page mounted the way the router mounts it, with a host that
// records the notices, what is spoken and where the router is sent. A test passes what differs.
import { h } from 'vue';
import { mountPart } from '../../helpers/mount.mjs';
import { settle } from '../../helpers/settle.mjs';
import { fillContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import { noticeElementId } from '../../../site/runtime/notices.js';
import Contracted from '../../../site/runtime/Contracted.js';

export { settle };

const none = 'none';
const choice = ( value, label = value, checked = false ) => ( { value, label: label === '' ? none : label, checked } );

/** The XFN groups, as _wp_admin_link_xfn_groups() gives them; `checked` lists the values checked. */
export const xfnGroups = ( checked = [] ) => {
	const is = ( value ) => checked.includes( value );
	const radio = ( name, values ) => {
		const any = values.some( is );
		return { name, label: name, type: 'radio', choices: [ ...values.map( ( value ) => choice( value, value, is( value ) ) ), choice( '', '', ! any ) ] };
	};
	const box = ( name, values ) => ( { name, label: name, type: 'checkbox', choices: values.map( ( value ) => choice( value, value, is( value ) ) ) } );
	return [
		radio( 'friendship', [ 'contact', 'acquaintance', 'friend' ] ),
		box( 'physical', [ 'met' ] ),
		box( 'professional', [ 'co-worker', 'colleague' ] ),
		radio( 'geographical', [ 'co-resident', 'neighbor' ] ),
		radio( 'family', [ 'child', 'kin', 'parent', 'sibling', 'spouse' ] ),
		box( 'romantic', [ 'muse', 'crush', 'date', 'sweetheart' ] ),
	];
};

const BOX = ( id, title, extra = {} ) => ( { id, title, basename: title, classes: [], closed: false, hidden: false, pinned: false, warning: false, ...extra } );

/** The boxes' layout, as wp_admin_get_meta_box_layout( 'link' ) gives it; `plugin` adds normal boxes. */
export const layoutOf = ( plugin = [] ) => ( {
	contexts: { side: [ 'linksubmitdiv' ], normal: [ 'linkcategorydiv', 'linktargetdiv', 'linkxfndiv', 'linkadvanceddiv', ...plugin.map( ( box ) => box.id ) ] },
	boxes: {
		linksubmitdiv: BOX( 'linksubmitdiv', 'Save' ),
		linkcategorydiv: BOX( 'linkcategorydiv', 'Categories' ),
		linktargetdiv: BOX( 'linktargetdiv', 'Target' ),
		linkxfndiv: BOX( 'linkxfndiv', 'Link Relationship (XFN)' ),
		linkadvanceddiv: BOX( 'linkadvanceddiv', 'Advanced' ),
		...Object.fromEntries( plugin.map( ( box ) => [ box.id, BOX( box.id, box.title ) ] ) ),
	},
} );

export const CONFIRM = 'You are about to delete this link \'Tom & Jerry\'\n  \'Cancel\' to stop, \'OK\' to delete.';

/** The Edit Link data. `over` replaces any of its keys. */
export const editData = ( over = {} ) => ( {
	error: null,
	title: 'Edit Link',
	mode: 'edit',
	link: { id: 12, name: 'Tom & Jerry', url: 'https://example.org/?a=1&b=2', description: 'A "cartoon" & more', target: '_blank', visible: 'Y', rel: 'friend met', image: 'https://example.org/i.png', rss: 'https://example.org/feed', notes: 'Notes & <b>bold</b>', rating: 7 },
	notice: null,
	save: { label: 'Update Link', visitUrl: 'https://example.org/?a=1&b=2', private: false, delete: { request: { method: 'DELETE', path: 'links/12' }, confirm: CONFIRM }, submitHtml: { before: null, start: null, inside: null } },
	categories: {
		all: [ { id: 2, name: 'Blogroll', checked: true }, { id: 3, name: 'Friends &amp; Co', checked: false }, { id: 4, name: 'Work', checked: false } ],
		popular: [ { id: 2, name: 'Blogroll', checked: false, disabled: false }, { id: 3, name: 'Friends &amp; Co', checked: false, disabled: false } ],
		tab: 'all',
		canAdd: true,
	},
	xfn: { rel: 'friend met', me: false, groups: xfnGroups( [ 'friend', 'met' ] ) },
	advanced: { ratings: [ 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 ] },
	metaBoxes: [],
	layout: layoutOf(),
	screenOptions: { sections: [], reordering: true, columns: { value: 2, choices: [ { value: 1, label: '1 column' }, { value: 2, label: '2 columns' } ] } },
	bodyClasses: [ 'link-php' ],
	...over,
} );

/** The Add Link data (get_default_link_to_edit()). `over` replaces any of its keys. */
export const addData = ( over = {} ) => editData( {
	title: 'Add Link',
	mode: 'add',
	link: { id: 0, name: '', url: '', description: '', target: null, visible: 'Y', rel: '', image: '', rss: '', notes: '', rating: null },
	save: { label: 'Add Link', visitUrl: null, private: false, delete: null, submitHtml: { before: null, start: null, inside: null } },
	categories: { ...editData().categories, all: editData().categories.all.map( ( term ) => ( { ...term, checked: false } ) ) },
	xfn: { rel: '', me: false, groups: xfnGroups() },
	bodyClasses: [ 'link-add-php' ],
	...over,
} );

export const ADD_PATH = 'link-add.php';
export const EDIT_PATH = 'link.php?action=edit&link_id=12';

export const loadContracts = async () => {
	contracts.configure( { replacements: {}, slots: {} } );
	await fillContracts( [ 'link-edit', 'meta-box-holder', 'meta-box' ] );
};

/** A host that records what the page gives it: notices, speech and the router's targets. */
export function host( search = '?action=edit&link_id=12', pathname = '/wp-admin/link.php' ) {
	const record = { added: [], spoken: [], followed: [], refreshed: 0, offered: null };
	record.provide = {
		router: {
			follow: async ( target, options ) => {
				record.followed.push( [ target, options ?? null ] );
				return true;
			},
			refresh: async () => {
				record.refreshed++;
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
				document.body.appendChild( element );
				return id;
			},
		},
		screenOptions: { set: ( options ) => {
			record.offered = options;
			return () => {};
		} },
		frameChannel: null,
		pageLocation: { origin: 'http://localhost', pathname, search },
	};
	return record;
}

/** Mounts the link form (`core/link-edit`) with `data`; `provide` adds to what it injects. */
export async function mountLink( data = editData(), record = host(), provide = {}, path = EDIT_PATH ) {
	const wrapper = mountPart( { render: () => h( Contracted, { id: 'core/link-edit', data, page: { path, title: data.title ?? '' } } ) }, {
		provide: { ...record.provide, ...provide },
	} );
	await settle();
	wrapper.record = record;
	return wrapper;
}

/** Mounts Add Link. */
export const mountAdd = ( data = addData(), record = host( '', '/wp-admin/link-add.php' ), provide = {} ) => mountLink( data, record, provide, ADD_PATH );
