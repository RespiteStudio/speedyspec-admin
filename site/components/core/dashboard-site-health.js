import { computed } from 'vue';
import { __ } from '../../runtime/text.js';
import { SlotOutlet } from '../../runtime/slots.js';
import Interpolate, { decodeEntities } from '../../kit/Interpolate.js';
import InlineMarkup from '../../kit/InlineMarkup.js';
import { adminHref } from './dashboard-parts/links.js';

/**
 * Default implementation of core/dashboard-site-health: the Site Health Status widget, in the
 * markup wp_dashboard_site_health() prints, as site-health.js leaves it on the Dashboard once it
 * has scored the stored results (the ring's offset, `green` or `orange`, the label).
 *
 * WordPress decides everything: which message shows (`message`), the "Take a look at…" line
 * (`issuesText`, HTML with its link and count), the label (`no-information`, `loading`, `good`,
 * `improvable`) and the score (`progress`, null when there is none: the ring is then hidden and
 * the widget keeps its loading look, as site-health.js leaves it).
 */
export default {
	name: 'DashboardSiteHealth',
	components: { SlotOutlet, Interpolate, InlineMarkup },
	props: {
		data: { type: Object, required: true },
		box: { type: Object, required: true },
		context: { type: String, default: 'site' },
		assets: { type: Object, default: () => ( {} ) },
	},
	setup( props ) {
		const progress = computed( () => props.data.progress ?? null );
		const wrapperClass = computed( () => {
			if ( ! progress.value ) {
				return 'loading';
			}
			return progress.value.status === 'good' ? 'green' : 'orange';
		} );
		const label = computed( () => {
			switch ( props.data.label ) {
				case 'good':
					return __( 'Good', 'default' );
				case 'improvable':
					return __( 'Should be improved', 'default' );
				case 'loading':
					return decodeEntities( __( 'Results are still loading&hellip;', 'default' ) );
				default:
					return decodeEntities( __( 'No information yet&hellip;', 'default' ) );
			}
		} );
		// Strings with markup or character references are kept out of the template.
		const message = computed( () => {
			switch ( props.data.message ) {
				case 'all-clear':
					return __( 'Great job! Your site currently passes all site health checks.', 'default' );
				case 'critical-one':
					return __( 'Your site has a critical issue that should be addressed as soon as possible to improve its performance and security.', 'default' );
				case 'critical-many':
					return __( 'Your site has critical issues that should be addressed as soon as possible to improve its performance and security.', 'default' );
				case 'recommended-one':
					return __( 'Your site&#8217;s health is looking good, but there is still one thing you can do to improve its performance and security.', 'default' );
				case 'recommended-many':
					return __( 'Your site&#8217;s health is looking good, but there are still some things you can do to improve its performance and security.', 'default' );
				default:
					return null;
			}
		} );
		/* translators: %s: URL to Site Health screen. */
		const noResults = computed( () => __( 'Site health checks will automatically run periodically to gather information about your site. You can also <a href="%s">visit the Site Health screen</a> to gather information about your site now.', 'default' ) );
		const url = computed( () => adminHref( props.data.url ?? 'site-health.php' ) );
		const barStyle = computed( () => ( progress.value ? { strokeDashoffset: progress.value.dashOffset + 'px' } : null ) );
		const slotContext = computed( () => ( { data: props.data, context: props.context } ) );
		return { progress, wrapperClass, label, message, noResults, url, barStyle, slotContext, link: ( [ href ] ) => ( { href } ) };
	},
	template: `
		<SlotOutlet name="before-content" :context="slotContext" />
		<div class="health-check-widget">
			<div :class="[ 'health-check-widget-title-section', 'site-health-progress-wrapper', wrapperClass ]">
				<div :class="[ 'site-health-progress', { hidden: ! progress } ]">
					<svg aria-hidden="true" focusable="false" width="100%" height="100%" viewBox="0 0 200 200" version="1.1" xmlns="http://www.w3.org/2000/svg">
						<circle r="90" cx="100" cy="100" fill="transparent" stroke-dasharray="565.48" stroke-dashoffset="0"></circle>
						<circle id="bar" r="90" cx="100" cy="100" fill="transparent" stroke-dasharray="565.48" stroke-dashoffset="0" :style="barStyle"></circle>
					</svg>
				</div>
				<div class="site-health-progress-label">{{ label }}</div>
			</div>

			<div class="site-health-details">
				<p v-if="data.message === 'no-results'"><Interpolate :text="noResults" :args="[ url ]" :tags="{ a: link }" /></p>
				<p v-else-if="message"><Interpolate :text="message" /></p>
				<p v-if="data.issuesText"><InlineMarkup :html="data.issuesText" /></p>
			</div>
		</div>
		<SlotOutlet name="after-content" :context="slotContext" />
	`,
};
