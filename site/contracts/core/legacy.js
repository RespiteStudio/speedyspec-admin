/**
 * Contract of a classic admin screen that is not converted yet, shown in a
 * frame. `page` is the router's page, whose `legacy.src` is the screen's URL on
 * the admin origin; `navigated` carries `{ url, path, title }` each time the
 * frame has loaded an admin screen (the page host takes the document title
 * from it). The page host keeps one instance while consecutive pages are legacy.
 */
export default {
	id: 'core/legacy',
	version: '1.0.0',
	props: {
		page: { type: 'object', required: true },
		data: { type: 'object', required: false },
	},
	slots: {
		'before-frame': { props: {} },
		'after-frame': { props: {} },
	},
	emits: [ 'navigated' ],
};
