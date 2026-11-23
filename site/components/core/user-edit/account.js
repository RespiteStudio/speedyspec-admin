import { computed, ref, watch } from 'vue';
import api from '@wp-admin/api';
import Contracted from '../../../runtime/Contracted.js';
import { failureText } from '../list-table-parts/page-chrome.js';

export const GENERATE_ROUTE = 'wp-admin/v1/users/generate-password';
export const sessionsRoute = ( id ) => 'wp-admin/v1/users/' + id + '/sessions';
export const resetRoute = ( id ) => 'wp-admin/v1/users/' + id + '/password-reset';

const text = ( value ) => ( value === null || value === undefined ? '' : String( value ) );

/** The text an answer of the session or reset routes says (`{ message }`), as text. Pure. */
const said = ( answer ) => text( answer?.message );

/**
 * The Account Management section of Profile and Edit User, in user-edit.php's markup, from
 * `account` (null rows are hidden, as classic):
 *
 * - the password rows (`account.password`), core/user-password in `change` mode: Set New Password
 *   opens the field with `initialPassword` and asks `users/generate-password` for the next one;
 *   the password goes into `values.password` (empty while closed) and whether the form may be
 *   sent is emitted as `can-submit`;
 * - Send Reset Link (`account.resetLink`), which posts `users/{id}/password-reset`;
 * - the session button (`account.sessions`: `only`, disabled; `others`, Log Out Everywhere Else;
 *   `user`, Log Out Everywhere), which deletes `users/{id}/sessions`.
 *
 * As user-profile.js, the answer of the reset and session buttons shows as an inline notice
 * before the button (`role="alert"`), success or error, as text, and the button is disabled after
 * a success. `passwordRun` restarts the password rows (closed) when the page changes it.
 */
export default {
	name: 'UserEditAccount',
	components: { Contracted },
	props: {
		account: { type: Object, required: true },
		userId: { type: Number, required: true },
		values: { type: Object, required: true },
		disallowed: { type: Array, default: () => [] },
		passwordRun: { type: Number, default: 0 },
	},
	emits: [ 'can-submit' ],
	setup( props ) {
		const sessions = computed( () => ( props.account.sessions && typeof props.account.sessions === 'object' ? props.account.sessions : null ) );
		const reset = computed( () => ( props.account.resetLink && typeof props.account.resetLink === 'object' ? props.account.resetLink : null ) );
		// Each button's notice (`{ success, message }`) and whether it is disabled after a success.
		const sessionNotice = ref( null );
		const sessionsDone = ref( false );
		const resetNotice = ref( null );
		const resetDone = ref( false );
		const busy = ref( { sessions: false, reset: false } );

		watch( () => props.account, () => {
			sessionNotice.value = null;
			sessionsDone.value = false;
			resetNotice.value = null;
			resetDone.value = false;
		} );

		async function run( key, request, notice, done ) {
			if ( busy.value[ key ] ) {
				return;
			}
			busy.value[ key ] = true;
			try {
				notice.value = { success: true, message: said( await request() ) };
				done.value = true;
			} catch ( reason ) {
				console.warn( 'The request failed:', reason );
				notice.value = { success: false, message: failureText( reason ) };
			} finally {
				busy.value[ key ] = false;
			}
		}

		return {
			sessions, reset, sessionNotice, sessionsDone, resetNotice, resetDone,
			generate: () => api.get( GENERATE_ROUTE ).then( ( answer ) => answer?.password ),
			destroySessions: () => run( 'sessions', () => api.del( sessionsRoute( props.userId ) ), sessionNotice, sessionsDone ),
			sendReset: () => run( 'reset', () => api.post( resetRoute( props.userId ), {} ), resetNotice, resetDone ),
			noticeClass: ( notice ) => [ 'notice', 'inline', notice.success ? 'notice-success' : 'notice-error' ],
			setPassword: ( value ) => {
				props.values.password = text( value );
			},
		};
	},
	template: `
		<h2>{{ $__( 'Account Management', 'default' ) }}</h2>
		<table class="form-table" role="presentation">
			<Contracted
				v-if="account.password === true"
				:key="passwordRun"
				id="core/user-password"
				mode="change"
				:initial-password="account.initialPassword ?? ''"
				:disallowed="disallowed"
				:labels="account.passwordLabels ?? {}"
				:generate="generate"
				@update:password="setPassword"
				@update:canSubmit="$emit( 'can-submit', $event )"
			/>
			<tr v-if="reset" class="user-generate-reset-link-wrap hide-if-no-js">
				<th>{{ $__( 'Password Reset', 'default' ) }}</th>
				<td>
					<div class="generate-reset-link">
						<div v-if="resetNotice" :class="noticeClass( resetNotice )" role="alert"><p>{{ resetNotice.message }}</p></div>
						<button type="button" class="button button-secondary" id="generate-reset-link" aria-describedby="generate-reset-link-description" :disabled="resetDone" @click="sendReset">{{ reset.label }}</button>
					</div>
					<p class="description" id="generate-reset-link-description">{{ reset.description }}</p>
				</td>
			</tr>
			<tr v-if="sessions" class="user-sessions-wrap hide-if-no-js">
				<th>{{ $__( 'Sessions', 'default' ) }}</th>
				<td :aria-live="sessions.kind === 'user' ? null : 'assertive'">
					<component :is="sessions.kind === 'user' ? 'p' : 'div'" :class="{ 'destroy-sessions': sessions.kind !== 'user' }">
						<div v-if="sessionNotice" :class="noticeClass( sessionNotice )" role="alert"><p>{{ sessionNotice.message }}</p></div>
						<button type="button" class="button" :id="sessions.kind === 'only' ? null : 'destroy-sessions'" aria-describedby="sessions-description" :disabled="sessions.disabled === true || sessionsDone" @click="destroySessions">{{ sessions.label }}</button>
					</component>
					<p class="description" id="sessions-description">{{ sessions.description }}</p>
				</td>
			</tr>
		</table>
	`,
};

/**
 * The Additional Capabilities section, as user-edit.php prints it when WordPress gives the list
 * (`capabilities`, text: the capabilities that are not roles, a refused one as "Denied: …").
 */
export const Capabilities = {
	name: 'UserEditCapabilities',
	props: {
		capabilities: { type: String, required: true },
	},
	template: `
		<h2>{{ $__( 'Additional Capabilities', 'default' ) }}</h2>
		<table class="form-table" role="presentation">
			<tr class="user-capabilities-wrap">
				<th scope="row">{{ $__( 'Capabilities', 'default' ) }}</th>
				<td>{{ capabilities }}</td>
			</tr>
		</table>
	`,
};
