import { computed, inject, reactive } from 'vue';
import { SlotOutlet } from '../../runtime/slots.js';
import LegacyHtml from '../../kit/LegacyHtml.js';
import { adminHref } from './dashboard-parts/links.js';

/**
 * Default implementation of core/dashboard-network-right-now: the network Dashboard's Right Now
 * widget, in the markup wp_network_dashboard_right_now() prints (the `subsubsub` links, the
 * `youhave` sentence, the user and site search forms).
 *
 * Everything that depends on the network and the user comes as data: which links the user may
 * use, with their text and screen, the sentence with the counts, the screens the searches open.
 * What plugins print on `wpmuadminresult` (before the forms) and on `mu_rightnow_end` and
 * `mu_activity_box_end` (at the end) comes as HTML (kit/LegacyHtml). A search opens its screen
 * with the `s` argument, as the classic GET form does, through the router when there is one.
 */
export default {
	name: 'DashboardNetworkRightNow',
	components: { SlotOutlet, LegacyHtml },
	props: {
		data: { type: Object, required: true },
		box: { type: Object, required: true },
		context: { type: String, default: 'network' },
		assets: { type: Object, default: () => ( {} ) },
	},
	setup( props ) {
		const router = inject( 'router', null );
		const actions = computed( () => ( Array.isArray( props.data.actions ) ? props.data.actions : [] ) );
		const search = computed( () => props.data.search ?? {} );
		const slotContext = computed( () => ( { data: props.data, context: props.context } ) );

		// What the user typed in each search box.
		const terms = reactive( { users: '', sites: '' } );

		/** Opens the search's screen as the classic GET form would (`?s=`), inside the admin. */
		function onSearch( event, which ) {
			const action = adminHref( search.value[ which ] );
			if ( ! router || typeof router.navigate !== 'function' || action === '' ) {
				return; // The form submits itself.
			}
			event?.preventDefault?.();
			router.navigate( action + '?' + new URLSearchParams( { s: terms[ which ] } ).toString() );
		}

		return { actions, search, terms, slotContext, onSearch, href: ( path ) => adminHref( path ) };
	},
	template: `
		<SlotOutlet name="before-content" :context="slotContext" />
		<ul v-if="actions.length > 0" class="subsubsub">
			<li v-for="( action, index ) in actions" :key="action.key" :class="action.key"><a :href="href( action.url )">{{ action.text }}</a>{{ index < actions.length - 1 ? ' |' : '' }}</li>
		</ul>
		<br class="clear" />
		<p class="youhave">{{ data.text }}</p>
		<LegacyHtml v-if="data.resultHtml" :html="data.resultHtml" :assets="assets" />
		<form :action="href( search.users )" method="get" @submit="onSearch( $event, 'users' )">
			<p>
				<label class="screen-reader-text" for="search-users">{{ $__( 'Search Users', 'default' ) }}</label>
				<input type="search" name="s" :value="terms.users" size="30" autocomplete="off" id="search-users" @input="terms.users = $event.target.value" />{{ ' ' }}<input type="submit" id="submit_users" class="button" :value="$__( 'Search Users', 'default' )" />
			</p>
		</form>
		<form :action="href( search.sites )" method="get" @submit="onSearch( $event, 'sites' )">
			<p>
				<label class="screen-reader-text" for="search-sites">{{ $__( 'Search Sites', 'default' ) }}</label>
				<input type="search" name="s" :value="terms.sites" size="30" autocomplete="off" id="search-sites" @input="terms.sites = $event.target.value" />{{ ' ' }}<input type="submit" id="submit_sites" class="button" :value="$__( 'Search Sites', 'default' )" />
			</p>
		</form>
		<LegacyHtml v-if="data.endHtml" :html="data.endHtml" :assets="assets" />
		<SlotOutlet name="after-content" :context="slotContext" />
	`,
};
