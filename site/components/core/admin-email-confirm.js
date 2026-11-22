import { computed, nextTick, ref } from 'vue';
import LegacyHtml from '../../kit/LegacyHtml.js';
import InlineMarkup from '../../kit/InlineMarkup.js';
import { safeUrl } from '../../kit/url.js';
import { redirectTarget } from '../../runtime/router.js';
import { failureText } from './list-table-parts/page-chrome.js';

const text = ( value ) => ( typeof value === 'string' ? value : '' );
// The texts WordPress gives the screen (wp_admin_admin_email_verification()).
const TEXTS = [ 'heading', 'details', 'why', 'newTab', 'current', 'different', 'update', 'correct', 'remind' ];
const markup = ( value ) => ( typeof value === 'string' && value !== '' ? value : null );

/**
 * Default implementation of core/admin-email-confirm: wp-login.php's `confirm_admin_email`
 * screen, its classic markup (`form.admin-email-confirm-form`, `h1.admin-email__heading`, the
 * `admin-email__details` lines, the `admin-email__actions`).
 *
 * - What plugins print on {@see 'admin_email_confirm'} shows before the form, and on
 *   {@see 'admin_email_confirm_form'} inside it before the heading, through kit/LegacyHtml with
 *   their scripts.
 * - The texts come from WordPress; `details` and `current` go through kit/InlineMarkup, the
 *   others are text. The help link is shown only for an http(s) URL.
 * - Update links to `changePath` in the admin of the site shown, which the router opens.
 * - "The email is correct" (the form's submit) and Remind me later call `answer` with `confirm`
 *   and `remind`, one at a time. A failed answer shows WordPress's message in the classic
 *   `#login_error` box, focused, and the buttons work again.
 */
export default {
	name: 'AdminEmailConfirm',
	components: { LegacyHtml, InlineMarkup },
	props: {
		data: { type: Object, required: true },
		answer: { type: Function, required: true },
	},
	setup( props ) {
		const busy = ref( false );
		const error = ref( '' );
		const errorBox = ref( null );

		const texts = computed( () => ( props.data?.texts && typeof props.data.texts === 'object' ? props.data.texts : {} ) );
		const hooks = computed( () => ( props.data?.hooks && typeof props.data.hooks === 'object' ? props.data.hooks : {} ) );
		const where = () => globalThis.location ?? { origin: 'http://localhost', pathname: '/wp-admin/', search: '' };

		async function send( action ) {
			if ( busy.value ) {
				return;
			}
			busy.value = true;
			error.value = '';
			try {
				await props.answer( action );
			} catch ( failure ) {
				console.warn( 'Could not answer the administration email verification:', failure );
				error.value = failureText( failure );
				await nextTick();
				errorBox.value?.focus?.();
			} finally {
				busy.value = false;
			}
		}

		return {
			busy,
			error,
			errorBox,
			labels: computed( () => Object.fromEntries( TEXTS.map( ( key ) => [ key, text( texts.value[ key ] ) ] ) ) ),
			confirmHtml: computed( () => markup( hooks.value.confirm ) ),
			formHtml: computed( () => markup( hooks.value.form ) ),
			helpUrl: computed( () => safeUrl( props.data?.helpUrl ?? '', { protocols: [ 'http:', 'https:' ] } ) ),
			changeUrl: computed( () => {
				const target = redirectTarget( { redirect: text( props.data?.changePath ) }, where() );
				return target === null ? null : target.url;
			} ),
			remindLater: computed( () => props.data?.remindLater === true ),
			confirm: () => send( 'confirm' ),
			remind: () => send( 'remind' ),
		};
	},
	template: `
		<div class="wp-admin-login wp-admin-email-confirm">
			<LegacyHtml v-if="confirmHtml" :html="confirmHtml" />
			<div v-if="error" id="login_error" ref="errorBox" class="notice notice-error wp-admin-login__error" role="alert" tabindex="-1">{{ error }}</div>
			<form class="admin-email-confirm-form" name="admin-email-confirm-form" method="post" :aria-busy="busy ? 'true' : 'false'" @submit.prevent="confirm">
				<LegacyHtml v-if="formHtml" :html="formHtml" />
				<h1 class="admin-email__heading">{{ labels.heading }}</h1>
				<p class="admin-email__details">
					<InlineMarkup :html="labels.details" />
					{{ ' ' }}<a :href="helpUrl ?? undefined" target="_blank">{{ labels.why }}<span class="screen-reader-text">{{ ' ' + labels.newTab }}</span></a>
				</p>
				<p class="admin-email__details"><InlineMarkup :html="labels.current" /></p>
				<p class="admin-email__details">{{ labels.different }}</p>
				<div class="admin-email__actions">
					<div class="admin-email__actions-primary">
						<a class="button button-large" :href="changeUrl ?? undefined">{{ labels.update }}</a>
						<input type="submit" name="correct-admin-email" id="correct-admin-email" class="button button-primary button-large" :value="labels.correct" :disabled="busy" />
					</div>
					<div v-if="remindLater" class="admin-email__actions-secondary">
						<a href="#" @click.prevent="remind">{{ labels.remind }}</a>
					</div>
				</div>
			</form>
		</div>
	`,
};
