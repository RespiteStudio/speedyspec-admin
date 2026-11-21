/**
 * Contract of the admin bar: site link, current user and signing out.
 *
 * 1.1.0: the optional `homeUrl` prop, the address of the site's front end as WordPress sends it (`homeUrl` of the router manifest), which the site link goes to (the
 * classic toolbar's site name links to `home_url( '/' )` in the admin). Without it the link goes to `base`.
 */
export default {
	id: 'core/admin-bar',
	version: '1.1.0',
	props: {
		user: { type: 'Object', required: true },
		base: { type: 'String', required: true },
		siteName: { type: 'String', required: false },
		homeUrl: { type: 'String', required: false },
	},
	slots: {
		start: { props: { user: { type: 'Object', required: true } } },
		end: { props: { user: { type: 'Object', required: true } } },
	},
	emits: [ 'sign-out' ],
};
