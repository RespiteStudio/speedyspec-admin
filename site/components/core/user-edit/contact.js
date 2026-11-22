import { computed } from 'vue';
import { __ } from '../../../runtime/text.js';
import InlineMarkup from '../../../kit/InlineMarkup.js';
import LegacyHtml from '../../../kit/LegacyHtml.js';
import { contactMethods } from './form-state.js';

/**
 * The Contact Info and About sections of Profile and Edit User, in user-edit.php's markup:
 *
 * - Email (required), with its description that a change is confirmed by mail when WordPress says
 *   so (`contact.emailConfirms`, one's own profile), and the pending change's inline notice with
 *   its Cancel request (`contact.pendingEmail`), which emits `cancel` with the route to send;
 * - Website and each contact method WordPress lists (`contact.methods`, labels as text);
 * - the About heading WordPress gives, Biographical Info and, with avatars shown, the Profile
 *   Picture (`about.avatar`: the image at `url`, or what a {@see 'get_avatar'} filter printed
 *   through kit/LegacyHtml, and the description).
 *
 * Every value is text in its field. `values` is the page's reactive form values, which the
 * sections edit.
 */
export default {
	name: 'UserEditContact',
	components: { InlineMarkup, LegacyHtml },
	props: {
		data: { type: Object, required: true },
		values: { type: Object, required: true },
	},
	emits: [ 'cancel' ],
	setup( props ) {
		const contact = computed( () => props.data.contact ?? {} );
		const about = computed( () => props.data.about ?? {} );
		const avatar = computed( () => ( about.value.avatar && typeof about.value.avatar === 'object' ? about.value.avatar : null ) );
		return {
			contact, about, avatar,
			confirmText: computed( () => __( 'If you change this, an email will be sent at your new address to confirm it. <strong>The new address will not become active until confirmed.</strong>', 'default' ) ),
			// Only an http(s) address is an image source.
			avatarSrc: computed( () => ( typeof avatar.value?.url === 'string' && /^https?:\/\//i.test( avatar.value.url ) ? avatar.value.url : null ) ),
			methods: computed( () => contactMethods( props.data ) ),
			pending: computed( () => ( typeof contact.value.pendingEmail?.markup === 'string' ? contact.value.pendingEmail : null ) ),
		};
	},
	template: `
		<h2>{{ $__( 'Contact Info', 'default' ) }}</h2>
		<table class="form-table" role="presentation">
			<tr class="user-email-wrap">
				<th><label for="email">{{ $__( 'Email', 'default' ) }} <span class="description">{{ $__( '(required)', 'default' ) }}</span></label></th>
				<td>
					<template v-if="contact.emailConfirms === true">
						<input type="email" name="email" id="email" aria-describedby="email-description" :value="values.email" autocomplete="email" class="regular-text ltr" @input="values.email = $event.target.value" />
						<p class="description" id="email-description"><InlineMarkup :html="confirmText" /></p>
					</template>
					<input v-else type="email" name="email" id="email" :value="values.email" class="regular-text ltr" @input="values.email = $event.target.value" />
					<div v-if="pending" class="notice notice-info inline"><p><InlineMarkup :html="pending.markup" /> <button v-if="pending.cancel" type="button" class="button-link" @click="$emit( 'cancel', pending.cancel )">{{ pending.cancel.label }}</button></p></div>
				</td>
			</tr>
			<tr class="user-url-wrap">
				<th><label for="url">{{ $__( 'Website', 'default' ) }}</label></th>
				<td><input type="url" name="url" id="url" :value="values.url" class="regular-text code" @input="values.url = $event.target.value" /></td>
			</tr>
			<tr v-for="method in methods" :key="method.name" :class="'user-' + method.name + '-wrap'">
				<th><label :for="method.name">{{ method.label }}</label></th>
				<td><input type="text" :name="method.name" :id="method.name" :value="values.contact[ method.name ]" class="regular-text" @input="values.contact[ method.name ] = $event.target.value" /></td>
			</tr>
		</table>

		<h2>{{ about.heading }}</h2>
		<table class="form-table" role="presentation">
			<tr class="user-description-wrap">
				<th><label for="description">{{ $__( 'Biographical Info', 'default' ) }}</label></th>
				<td><textarea name="description" id="description" rows="5" cols="30" aria-describedby="description-description" :value="values.description" @input="values.description = $event.target.value"></textarea>
				<p class="description" id="description-description">{{ $__( 'Share a little biographical information to fill out your profile. This may be shown publicly.', 'default' ) }}</p></td>
			</tr>
			<tr v-if="avatar" class="user-profile-picture">
				<th>{{ $__( 'Profile Picture', 'default' ) }}</th>
				<td>
					<LegacyHtml v-if="typeof avatar.html === 'string'" tag="span" :html="avatar.html" />
					<img v-else-if="avatarSrc" alt="" :src="avatarSrc" class="avatar avatar-96 photo" height="96" width="96" loading="lazy" decoding="async" />
					<p class="description"><InlineMarkup :html="avatar.description ?? ''" /></p>
				</td>
			</tr>
		</table>
	`,
};
