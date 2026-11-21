// Shared fixtures of the Edit Comment component tests: the data wp_admin_get_comment_edit() gives
// (wp-includes/admin/comment-edit-page.php), and a page mounted through the contract table with
// real jsdom, as the admin app runs it.
import { expect } from '@jest/globals';
import { h } from 'vue';
import { mountPart, flushPromises } from '../../helpers/mount.mjs';
import { fillContracts } from '../../helpers/contracts-table.mjs';
import { contracts } from '../../helpers/contracts-instance-stub.mjs';
import * as api from '../../helpers/api-stub.mjs';
import Contracted from '../../../site/runtime/Contracted.js';
import { hostRecorder } from '../../helpers/host.mjs';

export { api, flushPromises };

export const MONTHS = [ 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec' ].map( ( text, index ) => {
	const value = String( index + 1 ).padStart( 2, '0' );
	return { value, label: value + '-' + text, text };
} );

export const DATE = () => ( {
	parts: { aa: '2024', mm: '03', jj: '07', hh: '09', mn: '05', ss: '30' },
	hidden: { aa: '2024', mm: '03', jj: '07', hh: '09', mn: '05' },
	months: MONTHS,
	submitted: 'Mar 7, 2024 at 09:05',
	text: 'Submitted on: Mar 7, 2024 at 09:05',
} );

export const CHOICES = () => ( {
	current: null,
	choices: [ { id: 12, label: 'Bea: First words', author: 'Bea' }, { id: 13, label: 'Cy: Other words', author: '' } ],
} );

export const BOX = ( id, title ) => ( { id, title, basename: title, classes: [], closed: false, hidden: false, pinned: false, warning: false, html: '<p class="' + id + '-body">' + title + ' body</p>', error: false } );

export const DATA = ( extra = {} ) => ( {
	screen: 'comment',
	error: null,
	comment: { id: 5, postId: 40, author: 'Pat', email: 'pat@example.org', url: 'https://pat.example', content: 'Hello', parentId: 0 },
	permalink: 'https://example.org/p/#comment-5',
	status: '1',
	date: DATE(),
	response: { title: 'The post', editUrl: 'post.php?post=40&action=edit', viewUrl: 'https://example.org/p/' },
	parent: null,
	parentChoices: CHOICES(),
	miscActionsHtml: '<div class="misc-pub-section acme-misc">Acme misc</div>',
	deleteAction: { action: 'trash', label: 'Move to Trash', request: { method: 'POST', route: 'wp-admin/v1/comments/5/status', body: { status: 'trash', screen: 'comment' } } },
	layout: { contexts: { normal: [ 'acme-one', 'acme-two' ] } },
	boxes: [ BOX( 'acme-one', 'Acme one' ), BOX( 'acme-two', 'Acme two' ) ],
	screenOptions: { sections: [], reordering: true, columns: null },
	quicktags: { id: 'content', buttons: 'strong,em' },
	isMobile: false,
	referredby: null,
	...extra,
} );

export const ANSWER = ( extra = {} ) => ( { id: 5, postId: 40, status: 'approved', changed: true, redirect: 'edit-comments.php?comment_status=all#comment-5', location: null, ...extra } );

/** What the page gave its host while a test ran. */
export function recorder() {
	const record = hostRecorder( { previous: '/wp-admin/edit-comments.php?comment_status=all' } );
	record.provide = ( extra = {} ) => ( {
		...record.host(),
		screenOptions: { set: () => () => {} },
		quicktagsEditor: () => ( { started: Promise.resolve(), setValue: () => {}, focus: () => {}, destroy: () => {} } ),
		historyBack: () => {},
		pageLocation: { origin: 'http://localhost', pathname: '/wp-admin/comment.php', search: '?action=editcomment&c=5' },
		...extra,
	} );
	return record;
}

/** Fills the contract table the page needs. */
export const useContracts = ( names = [ 'comment-edit', 'meta-box-holder', 'meta-box' ] ) => async () => {
	contracts.configure( { replacements: {}, slots: {} } );
	await fillContracts( names );
};

/** Mounts the Edit Comment page of `data` and lets it settle. */
export async function openPage( data, record, provided = {} ) {
	const wrapper = mountPart( { render: () => h( Contracted, { id: 'core/comment-edit', data, page: { path: 'comment.php?action=editcomment&c=5', title: 'Edit Comment' } } ) }, { provide: record.provide( provided ) } );
	for ( let i = 0; i < 6; i++ ) {
		await flushPromises();
	}
	expect( wrapper.find( 'form#post' ).exists() ).toBe( true );
	return wrapper;
}
