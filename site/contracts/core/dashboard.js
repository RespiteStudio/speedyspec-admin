/**
 * Contract of the Dashboard page (`index.php`, `network/index.php` and `user/index.php`: one
 * contract for the three areas, with `context` in the data).
 *
 * `data` is what `wp-admin/v1/dashboard` returns (the page's router data): the area
 * (`context`), the screen, the meta box layout and boxes, Screen Options, the core widgets'
 * data (`widgets`), the plugin widgets' captured HTML (`pluginWidgets`), the captured `assets`,
 * the classic screen globals plugin widgets read (`classic`), the Welcome panel (`welcome`),
 * what the help depends on (`help`) and `remindLater`. `page` is the router's page. The page
 * host renders the page title as the top-level heading; an implementation renders none of its
 * own.
 *
 * The boxes are shown by core/meta-box-holder; each core widget by its own contract
 * (core/dashboard-at-a-glance, core/dashboard-activity, core/dashboard-recent-comments,
 * core/dashboard-quick-draft, core/dashboard-events-news, core/dashboard-site-health,
 * core/dashboard-php-nag, core/dashboard-browser-nag), the Welcome panel's content by
 * core/dashboard-welcome.
 *
 * Slots `before-widgets` and `after-widgets` (before and after the boxes) get `{ context }`.
 * `saved` carries what a Quick Draft save returned.
 */
const areaSlot = {
	props: {
		context: { type: 'String', required: true },
	},
};

export default {
	id: 'core/dashboard',
	version: '1.0.0',
	// A page's contract: the proxy serves its files only to users who may open the page.
	page: true,
	props: {
		data: { type: 'Object', required: true },
		page: { type: 'Object', required: true },
	},
	slots: {
		'before-widgets': areaSlot,
		'after-widgets': areaSlot,
	},
	emits: [ 'saved' ],
};
