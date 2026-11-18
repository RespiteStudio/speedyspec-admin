import { ref, computed, onMounted, nextTick } from 'vue';
import i18n from '@wp-admin/i18n';
import { __ } from '../runtime/text.js';
import { browserLocales, localeName, setLanguage } from '../runtime/locale.js';
import { sitePrefix } from '../runtime/router.js';

const UNREACHABLE = [ 'admin_upstream_unreachable', 'admin_upstream_timeout' ];

export default {
	name: 'Login',
	props: { router: { type: Object, required: true } },
	setup( props ) {
		const username = ref( '' );
		const password = ref( '' );
		const remember = ref( false );
		const busy = ref( false );
		const error = ref( '' );
		const usernameInput = ref( null );
		const errorBox = ref( null );
		const code = ref( i18n.getLocale().code );
		const languages = computed( () => browserLocales().map( ( value ) => ( { value, label: localeName( value ) } ) ) );

		const lostPasswordUrl = computed( () => sitePrefix( props.router.currentUrl?.() ?? '' ) + '/wp-login.php?action=lostpassword' );

		onMounted( () => usernameInput.value?.focus() );

		function describe( failure ) {
			if ( failure?.status === 403 && failure.code === 'rest_forbidden' ) {
				return __( 'The sign-in request was rejected. Reload the page and try again.', 'wp-admin-site' );
			}
			if ( UNREACHABLE.includes( failure?.code ) ) {
				return __( 'WordPress cannot be reached right now. Please try again in a moment.', 'wp-admin-site' );
			}
			return failure?.message || __( 'Sign-in failed. Please try again.', 'wp-admin-site' );
		}

		async function submit() {
			if ( busy.value ) {
				return;
			}
			busy.value = true;
			error.value = '';
			const credentials = { username: username.value, password: password.value, remember: remember.value };
			try {
				await props.router.login( credentials );
			} catch ( failure ) {
				error.value = describe( failure );
				await nextTick();
				errorBox.value?.focus();
			} finally {
				password.value = '';
				busy.value = false;
			}
		}

		async function changeLanguage() {
			await setLanguage( code.value );
		}

		return { username, password, remember, busy, error, usernameInput, errorBox, code, languages, submit, changeLanguage, lostPasswordUrl };
	},
	template: `
		<main class="wp-admin-login">
			<h1 class="wp-admin-login__title">{{ $__( 'Sign in', 'wp-admin-site' ) }}</h1>
			<div v-if="error" ref="errorBox" class="wp-admin-login__error" role="alert" tabindex="-1">{{ error }}</div>
			<form class="wp-admin-login__form" @submit.prevent="submit" :aria-busy="busy ? 'true' : 'false'">
				<label for="wp-admin-user">{{ $__( 'Username or Email Address', 'wp-admin-site' ) }}</label>
				<input id="wp-admin-user" ref="usernameInput" v-model="username" type="text" name="username" autocomplete="username" required>
				<label for="wp-admin-pass">{{ $__( 'Password', 'wp-admin-site' ) }}</label>
				<input id="wp-admin-pass" v-model="password" type="password" name="password" autocomplete="current-password" required>
				<label class="wp-admin-login__remember">
					<input v-model="remember" type="checkbox" name="remember">
					<span>{{ $__( 'Remember Me', 'wp-admin-site' ) }}</span>
				</label>
				<button type="submit" class="wp-admin-button wp-admin-button--primary" :disabled="busy" :aria-busy="busy ? 'true' : 'false'">{{ $__( 'Log In', 'wp-admin-site' ) }}</button>
			</form>
			<p class="wp-admin-login__links"><a :href="lostPasswordUrl">{{ $__( 'Lost your password?', 'wp-admin-site' ) }}</a></p>
			<div class="wp-admin-login__language">
				<label for="wp-admin-language">{{ $__( 'Language', 'wp-admin-site' ) }}</label>
				<select id="wp-admin-language" v-model="code" @change="changeLanguage">
					<option v-for="language in languages" :key="language.value" :value="language.value">{{ language.label }}</option>
				</select>
			</div>
		</main>
	`,
};
