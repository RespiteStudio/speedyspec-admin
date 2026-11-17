import { inject, provide, ref } from 'vue';
import Contracted from '../../runtime/Contracted.js';
import PageHost from '../../runtime/PageHost.js';
import { SlotOutlet } from '../../runtime/slots.js';

/**
 * Default implementation of core/frame: the admin bar, menu and notices, each
 * through its own contract so that a plugin can replace one of them alone,
 * and the page host. `wp-admin wp-core-ui` are the classes WordPress's admin
 * styles (buttons, notices, forms) expect on an ancestor.
 *
 * Provides `frameLayout` ({ set( 'default' | 'full' ) }) to the page: a page that
 * is a full-window application (a classic editor in core/legacy) asks for the full
 * layout, which adds `wp-admin-frame--full` and collapses the menu (`folded`, as in
 * the classic admin). The page sets it back to 'default' when it goes.
 */
export default {
	name: 'Frame',
	components: { Contracted, PageHost, SlotOutlet },
	props: {
		manifest: { type: Object, required: true },
		page: { type: Object, required: true },
		current: { type: String, required: true },
		base: { type: String, required: true },
		siteName: { type: String, default: '' },
		busy: { type: Boolean, default: false },
	},
	emits: [ 'sign-out' ],
	setup() {
		const notices = inject( 'notices', null );
		const dismiss = ( id ) => notices?.dismiss( id );
		const layout = ref( 'default' );
		provide( 'frameLayout', { set: ( value ) => {
			layout.value = value === 'full' ? 'full' : 'default';
		} } );
		return { notices, dismiss, layout };
	},
	template: `
		<div id="wpwrap" :class="[ 'wp-admin-frame', 'wp-admin', 'wp-core-ui', { 'wp-admin-frame--full': layout === 'full', folded: layout === 'full' } ]">
			<a class="screen-reader-shortcut" href="#wp-admin-page">{{ $__( 'Skip to main content', 'wp-admin-site' ) }}</a>
			<Contracted id="core/admin-bar" :user="manifest.user" :base="base" :site-name="siteName" @sign-out="$emit( 'sign-out' )" />
			<Contracted id="core/menu" :items="manifest.menu ?? []" :current="current" :base="base" />
			<div id="wpcontent">
				<div id="wpbody">
					<div id="wpbody-content">
						<SlotOutlet name="before-content" :context="{ page }" />
						<Contracted id="core/notices" :notices="notices ? notices.items : []" @dismiss="dismiss" />
						<PageHost :page="page" :site-name="siteName" :busy="busy" />
						<SlotOutlet name="after-content" :context="{ page }" />
					</div>
				</div>
			</div>
		</div>
	`,
};
