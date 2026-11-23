/**
 * The plugin information WordPress answers on `GET wp-admin/v1/plugins/information`
 * (wp_admin_get_plugin_information()), as the core/plugin-information dialog reads it.
 *
 * information( over ): object — `over` replaces any top-level key.
 */
export const information = ( over = {} ) => ( {
	slug: 'e2e-test-plugin',
	name: 'E2E Test Plugin',
	banners: { low: 'https://ps.w.org/e2e-test-plugin/assets/banner-772x250.png', high: 'https://ps.w.org/e2e-test-plugin/assets/banner-1544x500.png' },
	sections: [
		{ name: 'description', title: 'Description', html: '<p>A plugin <strong>for tests</strong>.</p>' },
		{ name: 'installation', title: 'Installation', html: '<ol><li>Upload it.</li></ol>' },
		{ name: 'changelog', title: 'Changelog', html: '<h4>2.0</h4><ul><li>Second.</li></ul>' },
	],
	facts: {
		version: '2.0',
		author: '<a href="https://example.org/author">Test Author</a>',
		lastUpdated: '3 days ago',
		requires: '5.0 or higher',
		requiresPhp: '7.4 or higher',
		activeInstalls: '10,000+',
	},
	rating: { full: 4, half: 1, empty: 0, label: '4.5 rating based on 12 ratings', based: '(based on 12 ratings)' },
	notices: [],
	button: { action: 'install', label: 'Install Now', disabled: false },
	...over,
} );
