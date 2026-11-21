/**
 * Mounting helpers for the Dashboard's component tests (test/components/dashboard/).
 *
 * mountWidget( name, data, options ) mounts one core widget through its contract
 * (`core/dashboard-<name>`), the way the page's holder does. mountDashboard( data, options )
 * mounts the page (`core/dashboard`) with the holder, so that what the box chrome does (Dismiss,
 * the Screen Options checkboxes) is tested with the widget inside it.
 *
 * Both give `{ wrapper, spoken, added, screenOptions }`: what the page announced, the notices it
 * added to the frame, and what the page gave Screen Options (`sections`, `onChange`).
 */
import { h } from 'vue';
import { mountPart } from './mount.mjs';
import { settle } from './settle.mjs';
import { fillContracts } from './contracts-table.mjs';
import { contracts } from './contracts-instance-stub.mjs';
import * as api from './api-stub.mjs';
import Contracted from '../../site/runtime/Contracted.js';

export { settle };

export const BOX = ( id, title, extra = {} ) => ( { id, title, basename: title, classes: [], closed: false, hidden: false, pinned: false, warning: false, ...extra } );

/** Lets the asynchronous mount of the contracts and the data they ask for settle. */
function recorder( extra = {} ) {
	const record = { spoken: [], added: [], screenOptions: null };
	const provide = {
		speak: ( message ) => record.spoken.push( message ),
		notices: { add: ( notice ) => record.added.push( notice ) },
		screenOptions: { set: ( options ) => {
			record.screenOptions = options;
			return () => {};
		} },
		pageState: { setDirty: () => {}, isDirty: () => false },
		...extra,
	};
	return { record, provide };
}

/** Resets the doubles every Dashboard test starts from. */
export function resetDoubles() {
	api.reset();
	contracts.configure( { replacements: {}, slots: {} } );
}

export async function mountWidget( name, data, { context = 'site', box = BOX( 'box', 'Box' ), provide: extra = {}, listeners = {} } = {} ) {
	await fillContracts( [ 'dashboard-' + name ] );
	const { record, provide } = recorder( extra );
	const wrapper = mountPart( { render: () => h( Contracted, { id: 'core/dashboard-' + name, data, box, context, assets: {}, ...listeners } ) }, { provide } );
	await settle();
	return { wrapper, ...record };
}

/** The data of the site Dashboard with the boxes and widgets given (`layout` lists the box ids, in the `normal` column). */
export function dashboardData( { boxes = [], widgets = {}, pluginWidgets = {}, welcome = null, ...extra } = {} ) {
	return {
		context: 'site',
		screen: 'dashboard',
		layout: { contexts: { normal: boxes.map( ( box ) => box.id ), side: [], column3: [], column4: [] } },
		boxes: Object.fromEntries( boxes.map( ( box ) => [ box.id, box ] ) ),
		reordering: true,
		columns: 0,
		columnChoices: [],
		screenOptions: { sections: [], reordering: true, columns: null },
		widgets,
		pluginWidgets,
		assets: { scripts: [], styles: [], ajaxurl: '/wp-admin/admin-ajax.php' },
		welcome,
		help: {},
		remindLater: null,
		...extra,
	};
}

export async function mountDashboard( data, { names = [], provide: extra = {} } = {} ) {
	await fillContracts( [ 'dashboard', 'meta-box-holder', 'meta-box', ...names.map( ( name ) => 'dashboard-' + name ) ] );
	const { record, provide } = recorder( extra );
	const wrapper = mountPart( { render: () => h( Contracted, { id: 'core/dashboard', data, page: { path: 'index.php', title: 'Dashboard' } } ) }, { provide } );
	await settle();
	return { wrapper, ...record };
}
