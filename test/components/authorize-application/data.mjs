// What wp_admin_get_authorize_application() gives (wp-includes/admin/authorize-application-page.php),
// built for the Authorize Application component tests, and the page mounted the way the router
// mounts it, with a host that records the notices, what is spoken, where the router is sent and
// what the page loads itself. A test passes what differs.
import { h, isRef } from 'vue';
import { mountPart } from '../../helpers/mount.mjs';
import { settle } from '../../helpers/settle.mjs';
import { fillContracts } from '../../helpers/contracts-table.mjs';
import Contracted from '../../../site/runtime/Contracted.js';

export { settle };

export const APP_ID = '6c3f1d0e-1b2a-4c5d-8e9f-0a1b2c3d4e5f';
export const ROUTE = 'wp-admin/v1/application-passwords/authorize';
export const PASSWORD = 'abcdABCD1234efghEFGH5678';
export const CHUNKED = 'abcd ABCD 1234 efgh EFGH 5678';
// A name a third party sends (Review Focus 4): text, never markup.
export const HOSTILE = 'O\'Brien & <img src=x onerror="window.__ran=1">';

/** The page's data for a valid request. `over` replaces any of its keys. */
export const authorizeData = ( over = {} ) => ( {
	error: null,
	title: 'Authorize Application',
	request: {
		appName: 'Acme App',
		appId: APP_ID,
		successUrl: 'https://app.example.org/done',
		rejectUrl: 'https://app.example.org/done?success=false',
	},
	texts: {
		intro: 'Would you like to give the application identifying itself as <strong>Acme App</strong> access to your account? You should only do this if you trust the application in question.',
		approveDescription: 'You will be sent to <strong><code>https://app.example.org/done?site_url=http%3A%2F%2Flocalhost&amp;user_login=pat&amp;password=[------]</code></strong>',
		rejectDescription: 'You will be sent to <strong><code>https://app.example.org/done?success=false</code></strong>',
	},
	sitesNotice: null,
	formHtml: null,
	bodyClasses: [ 'authorize-application-php' ],
	...over,
} );

/** The data of a request the classic screen dies on. */
export const refusalData = ( error = {} ) => ( {
	error: {
		status: 501,
		title: 'Cannot Authorize Application',
		heading: null,
		message: 'Application passwords are not available for your account. Please contact the site administrator for assistance.',
		link: { text: 'Go Back', url: 'https://app.example.org/done?success=false&error=disabled' },
		...error,
	},
	title: 'Cannot Authorize Application',
	bodyClasses: [ 'authorize-application-php' ],
} );

/** The route's answer. `over` replaces any of its keys. */
export const answer = ( over = {} ) => ( { location: null, redirect: null, password: null, chunked: null, ...over } );

export const loadContracts = () => fillContracts( [ 'authorize-application' ] );

/** A host that records what the page gives it: notices, speech, the router's targets and the URLs it loads. */
export function host() {
	const record = { notices: [], spoken: [], followed: [], assigned: [], refreshed: 0 };
	record.provide = {
		notices: { add: ( notice ) => record.notices.push( notice ) },
		speak: ( message ) => record.spoken.push( message ),
		router: {
			navigate: async () => {},
			follow: async ( target ) => record.followed.push( target ),
			refresh: async () => {
				record.refreshed++;
			},
		},
		frameChannel: null,
		pageLocation: { origin: 'http://localhost', pathname: '/wp-admin/authorize-application.php', search: '?app_name=Acme+App' },
		assignLocation: ( url ) => record.assigned.push( url ),
	};
	return record;
}

/** Mounts the page (`core/authorize-application`) with `data` (a ref, for a test that gives new data). */
export async function mountAuthorize( data = authorizeData(), { record = host(), path = 'authorize-application.php?app_name=Acme+App' } = {} ) {
	const wrapper = mountPart( { render: () => h( Contracted, { id: 'core/authorize-application', data: isRef( data ) ? data.value : data, page: { path, title: 'Authorize Application' } } ) }, {
		provide: record.provide,
		attachTo: document.body,
	} );
	await settle();
	wrapper.record = record;
	return wrapper;
}

/** An API error, as runtime/api.js throws it. */
export const apiError = ( message, status = 500, code = 'fixture_failure' ) => Object.assign( new Error( message ), { status, code } );
