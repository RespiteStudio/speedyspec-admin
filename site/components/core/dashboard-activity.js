import { computed } from 'vue';
import { SlotOutlet } from '../../runtime/slots.js';
import { adminHref } from './dashboard-parts/links.js';

const list = ( value ) => ( Array.isArray( value ) ? value : [] );

/**
 * Default implementation of core/dashboard-activity: the Activity widget, in the markup
 * wp_dashboard_site_activity() prints: Publishing Soon (`#future-posts`), Recently Published
 * (`#published-posts`) and Published On This Day (`#on-this-day-posts`), each shown when it has
 * posts, or "No activity yet!".
 *
 * Which posts, their date labels ("Today", "Tomorrow", a date), links (the edit screen or the
 * post), accessible names, untitled posts' excerpts and "by …" come as data.
 */
export default {
	name: 'DashboardActivity',
	components: { SlotOutlet },
	props: {
		data: { type: Object, required: true },
		box: { type: Object, required: true },
		context: { type: String, default: 'site' },
		assets: { type: Object, default: () => ( {} ) },
	},
	setup( props ) {
		const future = computed( () => list( props.data.future ) );
		const published = computed( () => list( props.data.published ) );
		const onThisDay = computed( () => list( props.data.onThisDay ) );
		const slotContext = computed( () => ( { data: props.data, context: props.context } ) );
		return { future, published, onThisDay, slotContext, href: ( path ) => adminHref( path ) };
	},
	template: `
		<SlotOutlet name="before-content" :context="slotContext" />
		<div id="activity-widget">
			<div v-if="future.length" id="future-posts" class="activity-block">
				<h3>{{ $__( 'Publishing Soon', 'default' ) }}</h3>
				<ul>
					<li v-for="post in future" :key="post.id"><span>{{ post.date }}</span> <a :href="href( post.url )" :aria-label="post.ariaLabel">{{ post.title }}</a></li>
				</ul>
			</div>
			<div v-if="published.length" id="published-posts" class="activity-block">
				<h3>{{ $__( 'Recently Published', 'default' ) }}</h3>
				<ul>
					<li v-for="post in published" :key="post.id"><span>{{ post.date }}</span> <a :href="href( post.url )" :aria-label="post.ariaLabel">{{ post.title }}</a></li>
				</ul>
			</div>
			<div v-if="onThisDay.length" id="on-this-day-posts" class="activity-block">
				<h3>{{ $__( 'Published On This Day', 'default' ) }}</h3>
				<ul>
					<li v-for="post in onThisDay" :key="post.id"><span>{{ post.date }}</span><span><a :href="href( post.url )" :aria-label="post.ariaLabel">{{ post.title }}</a><template v-if="post.author"> <span class="wp-on-this-day-post-author">{{ post.author }}</span></template></span></li>
				</ul>
			</div>
			<div v-if="data.empty" class="no-activity">
				<p>{{ $__( 'No activity yet!', 'default' ) }}</p>
			</div>
		</div>
		<SlotOutlet name="after-content" :context="slotContext" />
	`,
};
