import { computed, inject, nextTick, onMounted, reactive, ref, shallowRef, watch } from 'vue';
import api from '@wp-admin/api';
import { __, sprintf } from '../../runtime/text.js';
import Contracted from '../../runtime/Contracted.js';
import { SlotOutlet } from '../../runtime/slots.js';
import { noticeElementId } from '../../runtime/notices.js';
import { toPagePath } from '../../runtime/router.js';
import { adminBase } from '../../runtime/menu.js';
import Button from '../../kit/Button.js';
import Interpolate from '../../kit/Interpolate.js';
import Notice from '../../kit/Notice.js';
import Spinner from '../../kit/Spinner.js';
import { collectLegacy, loadAssets } from '../../kit/LegacyHtml.js';
import FormatChoices from './options-general/format-choices.js';
import TimezoneChoice from './options-general/timezone.js';
import SiteLanguage from './options-general/site-language.js';
import AdminEmail from './options-general/admin-email.js';
import SiteIcon from './options-general/site-icon.js';
import { LegacyRows, LegacySections } from './options-general/legacy-fields.js';
import { valuesOf, changedFields, errorsOf, valuesAfterPartialSave, firstInvalid, controlId, describedBy, emailUpdated } from './options-general/state.js';

const ROUTE = 'wp-admin/v1/settings/general';

/**
 * Default implementation of core/options-general: the General Settings screen.
 *
 * The markup is the classic screen's (`form-table`, `regular-text`, `description`,
 * `submit`), in its field order and with its labels, descriptions, ids and
 * `aria-describedby` wiring, as a table (core/form-table) of rows (core/settings-field),
 * so that a plugin can replace the page, the table or the row component, or add
 * modules to the page's slots. Only the variable parts come from the router data,
 * which is what `wp-admin/v1/settings/general` returns.
 *
 * Saving posts the changed fields, and the values of the controls plugins added (see
 * kit/LegacyHtml.js), to that endpoint, then shows the settings it returns. Errors are
 * shown beside their field and as notices; as on the classic screen, the valid fields of
 * a save with an invalid one are saved. Unsaved changes are reported to the page host.
 */
export default {
	name: 'OptionsGeneral',
	components: { Contracted, SlotOutlet, Button, Interpolate, Notice, Spinner, FormatChoices, TimezoneChoice, SiteLanguage, AdminEmail, SiteIcon, LegacyRows, LegacySections },
	props: {
		data: { type: Object, required: true },
		page: { type: Object, required: true },
	},
	emits: [ 'saved' ],
	setup( props, { emit } ) {
		const notices = inject( 'notices', null );
		const pageState = inject( 'pageState', null );
		const router = inject( 'router', null );

		const settings = shallowRef( props.data ); // What the server last said.
		const saved = shallowRef( valuesOf( props.data ) );
		const values = reactive( { ...saved.value } );
		const errors = ref( {} );
		const saving = ref( false );
		const cancelling = ref( false );
		const legacyDirty = ref( false );
		const generation = ref( 0 ); // Remounts the format choices when the saved settings change.
		const form = ref( null );

		const has = ( field ) => Object.hasOwn( settings.value, field );
		const locked = computed( () => settings.value.locked ?? [] );
		const isLocked = ( field ) => locked.value.includes( field );
		const choices = computed( () => settings.value.choices ?? {} );
		const legacy = computed( () => settings.value.legacySections ?? { sections: [], scripts: [], styles: [] } );
		const tableFields = computed( () => legacy.value.sections.filter( ( section ) => section.position === 'form-table' ).flatMap( ( section ) => section.fields ) );
		const sections = computed( () => legacy.value.sections.filter( ( section ) => section.position === 'section' ) );
		const hasLegacy = computed( () => legacy.value.sections.length > 0 );
		const base = computed( () => adminBase( toPagePath( globalThis.location ?? { pathname: '/wp-admin/', search: '' } ).siteId ) );
		const showLanguage = computed( () => ( choices.value.languages ?? [] ).length > 1 );
		const installing = computed( () => saving.value && ( choices.value.languages ?? [] ).some( ( language ) => language.value === values.WPLANG && ! language.installed ) );

		const dirty = computed( () => legacyDirty.value || Object.keys( changedFields( values, saved.value, locked.value ) ).length > 0 );
		watch( dirty, ( value ) => pageState?.setDirty( value ), { immediate: true } );

		// Strings with markup are kept out of the template, whose attribute values cannot hold their quotes.
		const text = {
			tagline: computed( () => sprintf(
				/* translators: %s: Site tagline example. */
				__( 'In a few words, explain what this site is about. Example: &#8220;%s.&#8221;', 'default' ),
				settings.value.multisite
					/* translators: %s: Network title. */
					? sprintf( __( 'Just another %s site', 'default' ), settings.value.networkName ?? '' )
					/* translators: Site tagline. */
					: __( 'Just another WordPress site', 'default' )
			) ),
			home: computed( () => __( 'Enter the same address here unless you <a href="%s">want your site home page to be different from your WordPress installation directory</a>.', 'default' ) ),
			pending: computed( () => __( 'The administration email address has not been updated yet. Please check the inbox at %s for a confirmation email.', 'default' ) ),
			documentationUrl: computed( () => __( 'https://developer.wordpress.org/advanced-administration/server/wordpress-in-directory/', 'default' ) ),
		};

		function show( next ) {
			settings.value = next;
			saved.value = valuesOf( next );
			for ( const key of Object.keys( values ) ) {
				delete values[ key ];
			}
			Object.assign( values, saved.value );
			legacyDirty.value = false;
			generation.value++;
		}

		// A new page entry (the router's answer again, e.g. after the language changed).
		watch( () => props.data, ( next ) => {
			if ( next && next !== settings.value ) {
				errors.value = {};
				show( next );
			}
		} );

		function setValue( name, value ) {
			if ( Object.hasOwn( saved.value, name ) ) {
				values[ name ] = value;
			}
		}

		const slotContext = computed( () => ( { values, setValue, errors: errors.value } ) );

		function addNotice( notice ) {
			return notices?.add( { type: notice.type, message: notice.message, dismissible: true } ) ?? null;
		}

		async function focusNotice( id ) {
			if ( ! id ) {
				return;
			}
			await nextTick();
			globalThis.document?.getElementById( noticeElementId( id ) )?.focus();
		}

		async function focusField( field ) {
			if ( ! field ) {
				return;
			}
			await nextTick();
			globalThis.document?.getElementById( controlId( field ) )?.focus();
		}

		function onFormEdit( event ) {
			if ( event?.target?.closest?.( '.wp-admin-legacy-html' ) ) {
				legacyDirty.value = true;
			}
		}

		async function save() {
			if ( saving.value ) {
				return;
			}
			saving.value = true;
			errors.value = {};
			const body = changedFields( values, saved.value, locked.value );
			if ( hasLegacy.value && form.value ) {
				body.legacy = collectLegacy( form.value );
			}
			const languageChanged = Object.hasOwn( body, 'WPLANG' );

			try {
				const answer = await api.post( ROUTE, body );
				const { notices: raised = [], ...next } = answer ?? {};
				show( next );
				const ids = raised.map( addNotice );
				emit( 'saved', next );
				if ( languageChanged ) {
					// The admin follows the site language: the frame and this page show the new one.
					await router?.refresh?.();
				}
				await focusNotice( ids[ 0 ] );
			} catch ( error ) {
				if ( error?.code === 'admin_upstream_unreachable' || error?.status === 0 ) {
					focusNotice( addNotice( { type: 'error', message: __( 'WordPress cannot be reached right now. Please try again in a moment.', 'wp-admin-site' ) } ) );
					return;
				}
				const result = errorsOf( error );
				if ( result.settings ) {
					// The other fields were saved, as on the classic screen.
					const input = { ...values };
					show( result.settings );
					Object.assign( values, valuesAfterPartialSave( input, saved.value, result.fields ) );
				}
				errors.value = result.fields;
				const ids = result.notices.map( addNotice );
				const field = firstInvalid( result.fields );
				if ( field ) {
					await focusField( field );
				} else {
					await focusNotice( ids[ 0 ] );
				}
			} finally {
				saving.value = false;
			}
		}

		async function cancelPending() {
			cancelling.value = true;
			try {
				const next = await api.del( ROUTE + '/pending-admin-email' );
				const input = { ...values };
				show( next );
				Object.assign( values, input );
			} catch {
				addNotice( { type: 'error', message: __( 'WordPress cannot be reached right now. Please try again in a moment.', 'wp-admin-site' ) } );
			} finally {
				cancelling.value = false;
			}
		}

		onMounted( () => {
			if ( emailUpdated( props.page?.path ) ) {
				addNotice( { type: 'success', message: __( 'Administration email updated.', 'default' ) } );
			}
			if ( hasLegacy.value ) {
				loadAssets( { scripts: legacy.value.scripts, styles: legacy.value.styles } );
			}
		} );

		const aria = ( field, description = null ) => ( {
			'aria-describedby': describedBy( field, description, errors.value ),
			'aria-invalid': errors.value[ field ] ? 'true' : null,
		} );

		return {
			settings, values, errors, saving, cancelling, generation, form, choices, sections, tableFields, base, showLanguage, installing, text, slotContext,
			has, isLocked, aria, save, cancelPending, onFormEdit, setValue,
		};
	},
	template: `
		<div class="wp-admin-options-general">
			<Notice v-if="settings.pending_admin_email" type="info">
				<p><Interpolate :text="text.pending.value" :args="[ { tag: 'code', text: settings.pending_admin_email } ]" /> <button type="button" class="button-link" :disabled="cancelling" @click="cancelPending">{{ $_x( 'Cancel request', 'admin email change', 'default' ) }}</button></p>
			</Notice>

			<form ref="form" method="post" novalidate="novalidate" @submit.prevent="save" @input="onFormEdit" @change="onFormEdit">
				<SlotOutlet name="before-fields" :context="slotContext" />

				<Contracted id="core/form-table">
					<Contracted contract="core/settings-field" id="blogname" :label="$__( 'Site Title', 'default' )" :error="errors.blogname">
						<input name="blogname" type="text" id="blogname" :value="values.blogname" @input="values.blogname = $event.target.value" class="regular-text" v-bind="aria( 'blogname' )">
					</Contracted>

					<Contracted contract="core/settings-field" id="blogdescription" :label="$__( 'Tagline', 'default' )" :error="errors.blogdescription">
						<input name="blogdescription" type="text" id="blogdescription" :value="values.blogdescription" @input="values.blogdescription = $event.target.value" class="regular-text" v-bind="aria( 'blogdescription', 'tagline-description' )">
						<p class="description" id="tagline-description"><Interpolate :text="text.tagline.value" /></p>
					</Contracted>

					<Contracted v-if="has( 'site_icon' )" contract="core/settings-field" id="site_icon" class="site-icon-section" :label="$__( 'Site Icon', 'default' )" group>
						<SiteIcon :icon="settings.site_icon" :base="base" />
					</Contracted>

					<Contracted v-if="has( 'siteurl' )" contract="core/settings-field" id="siteurl" :label="$__( 'WordPress Address (URL)', 'default' )" :locked="isLocked( 'siteurl' )" :error="errors.siteurl">
						<input name="siteurl" type="url" id="siteurl" :value="values.siteurl" @input="values.siteurl = $event.target.value" :disabled="isLocked( 'siteurl' )" :class="[ 'regular-text', 'code', { disabled: isLocked( 'siteurl' ) } ]" v-bind="aria( 'siteurl' )">
					</Contracted>

					<Contracted v-if="has( 'home' )" contract="core/settings-field" id="home" :label="$__( 'Site Address (URL)', 'default' )" :locked="isLocked( 'home' )" :error="errors.home">
						<input name="home" type="url" id="home" :value="values.home" @input="values.home = $event.target.value" :disabled="isLocked( 'home' )" :class="[ 'regular-text', 'code', { disabled: isLocked( 'home' ) } ]" v-bind="aria( 'home', 'home-description' )">
						<p v-if="! isLocked( 'home' )" class="description" id="home-description"><Interpolate :text="text.home.value" :tags="{ a: { href: text.documentationUrl.value } }" /></p>
					</Contracted>

					<Contracted contract="core/settings-field" id="new_admin_email" :label="$__( 'Administration Email Address', 'default' )" :error="errors.new_admin_email">
						<AdminEmail v-model="values.new_admin_email" :pending="settings.pending_admin_email" :described-by="aria( 'new_admin_email', 'new-admin-email-description' )[ 'aria-describedby' ]" :error="errors.new_admin_email" :cancelling="cancelling" @cancel="cancelPending" />
					</Contracted>

					<Contracted v-if="has( 'users_can_register' )" contract="core/settings-field" id="users_can_register" :label="$__( 'Membership', 'default' )" :error="errors.users_can_register" group>
						<fieldset><legend class="screen-reader-text"><span>{{ $__( 'Membership', 'default' ) }}</span></legend><label for="users_can_register">
							<input name="users_can_register" type="checkbox" id="users_can_register" value="1" :checked="values.users_can_register" @change="values.users_can_register = $event.target.checked" v-bind="aria( 'users_can_register' )">
							{{ $__( 'Anyone can register', 'default' ) }}</label>
						</fieldset>
					</Contracted>

					<Contracted v-if="has( 'default_role' )" contract="core/settings-field" id="default_role" :label="$__( 'New User Default Role', 'default' )" :error="errors.default_role">
						<select name="default_role" id="default_role" v-bind="aria( 'default_role' )" @change="values.default_role = $event.target.value">
							<option v-for="role in choices.roles ?? []" :key="role.value" :value="role.value" :selected="role.value === values.default_role">{{ role.label }}</option>
						</select>
					</Contracted>

					<Contracted v-if="showLanguage" contract="core/settings-field" id="WPLANG" :label="$__( 'Site Language', 'default' )" icon="dashicons-translation" :error="errors.WPLANG">
						<SiteLanguage v-model="values.WPLANG" :languages="choices.languages" :error="errors.WPLANG" />
					</Contracted>

					<Contracted contract="core/settings-field" id="timezone_string" :label="$__( 'Timezone', 'default' )" :error="errors.timezone_string">
						<TimezoneChoice v-model="values.timezone_string" :groups="choices.timezones ?? []" :preview="settings.preview" :described-by="aria( 'timezone_string', 'timezone-description' )[ 'aria-describedby' ]" :error="errors.timezone_string" />
					</Contracted>

					<Contracted contract="core/settings-field" id="date_format" :label="$__( 'Date Format', 'default' )" :error="errors.date_format" group>
						<FormatChoices :key="'date-' + generation" kind="date" v-model="values.date_format" :choices="choices.dateFormats ?? []" :preview="settings.preview.dateFormat" :error="errors.date_format" />
					</Contracted>

					<Contracted contract="core/settings-field" id="time_format" :label="$__( 'Time Format', 'default' )" :error="errors.time_format" group>
						<FormatChoices :key="'time-' + generation" kind="time" v-model="values.time_format" :choices="choices.timeFormats ?? []" :preview="settings.preview.timeFormat" :error="errors.time_format" />
					</Contracted>

					<Contracted contract="core/settings-field" id="start_of_week" :label="$__( 'Week Starts On', 'default' )" :error="errors.start_of_week">
						<select name="start_of_week" id="start_of_week" v-bind="aria( 'start_of_week' )" @change="values.start_of_week = Number( $event.target.value )">
							<option v-for="day in choices.weekdays ?? []" :key="day.value" :value="String( day.value )" :selected="day.value === values.start_of_week">{{ day.label }}</option>
						</select>
					</Contracted>

					<LegacyRows :fields="tableFields" />
				</Contracted>

				<SlotOutlet name="after-fields" :context="slotContext" />

				<LegacySections :sections="sections" />

				<p class="submit">
					<Button variant="primary" type="submit" id="submit" name="submit" :disabled="saving" :busy="saving">{{ $__( 'Save Changes', 'default' ) }}</Button>
					<Spinner v-if="installing" class="language-install-spinner" />
				</p>

				<SlotOutlet name="after-submit" :context="slotContext" />
			</form>
		</div>
	`,
};
