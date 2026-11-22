import { computed, ref, watch } from 'vue';
import { displayChoices } from './form-state.js';

const list = ( value ) => ( Array.isArray( value ) ? value : [] );
const text = ( value ) => ( value === null || value === undefined ? '' : String( value ) );

/**
 * The Name section of Profile and Edit User, in user-edit.php's markup: Username (read-only),
 * the Role on Edit User of another user when WordPress offers it (`name.role`: the editable roles
 * and "No role for this site"), First Name, Last Name, Nickname (required) and "Display name
 * publicly as" with the choices WordPress gives (`name.displayNames`). When First Name, Last Name
 * or Nickname loses focus, the names typed are added to the choices (form-state.js's
 * displayChoices()), as user-profile.js does. On one's own profile (`isProfile`) the name fields
 * carry their `autocomplete` tokens, as classic.
 *
 * `values` is the page's reactive form values, which the section edits.
 */
export default {
	name: 'UserEditName',
	props: {
		name: { type: Object, required: true },
		login: { type: String, required: true },
		values: { type: Object, required: true },
		isProfile: { type: Boolean, default: false },
	},
	setup( props ) {
		const choices = ref( list( props.name.displayNames ).map( text ) );
		watch( () => props.name, ( name ) => {
			choices.value = list( name?.displayNames ).map( text );
		} );
		const roleOptions = computed( () => list( props.name.role?.options ).filter( ( option ) => typeof option?.value === 'string' ) );

		return {
			choices, roleOptions,
			auto: ( token ) => ( props.isProfile ? token : null ),
			addChoices: () => {
				choices.value = displayChoices( choices.value, { ...props.values, login: props.login } );
			},
		};
	},
	template: `
		<h2>{{ $__( 'Name', 'default' ) }}</h2>
		<table class="form-table" role="presentation">
			<tr class="user-user-login-wrap">
				<th><label for="user_login">{{ $__( 'Username', 'default' ) }}</label></th>
				<td><input type="text" name="user_login" id="user_login" aria-describedby="user-login-description" :value="login" readonly="readonly" class="regular-text ltr" /> <span class="description" id="user-login-description">{{ $__( 'Usernames cannot be changed.', 'default' ) }}</span></td>
			</tr>
			<tr v-if="name.role" class="user-role-wrap">
				<th><label for="role">{{ $__( 'Role', 'default' ) }}</label></th>
				<td>
					<select name="role" id="role" :value="values.role" @change="values.role = $event.target.value">
						<option v-for="option in roleOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
					</select>
				</td>
			</tr>
			<tr class="user-first-name-wrap">
				<th><label for="first_name">{{ $__( 'First Name', 'default' ) }}</label></th>
				<td><input type="text" name="first_name" id="first_name" :value="values.first_name" :autocomplete="auto( 'given-name' )" class="regular-text" @input="values.first_name = $event.target.value" @blur="addChoices" /></td>
			</tr>
			<tr class="user-last-name-wrap">
				<th><label for="last_name">{{ $__( 'Last Name', 'default' ) }}</label></th>
				<td><input type="text" name="last_name" id="last_name" :value="values.last_name" :autocomplete="auto( 'family-name' )" class="regular-text" @input="values.last_name = $event.target.value" @blur="addChoices" /></td>
			</tr>
			<tr class="user-nickname-wrap">
				<th><label for="nickname">{{ $__( 'Nickname', 'default' ) }} <span class="description">{{ $__( '(required)', 'default' ) }}</span></label></th>
				<td><input type="text" name="nickname" id="nickname" :value="values.nickname" :autocomplete="auto( 'nickname' )" class="regular-text" @input="values.nickname = $event.target.value" @blur="addChoices" /></td>
			</tr>
			<tr class="user-display-name-wrap">
				<th><label for="display_name">{{ $__( 'Display name publicly as', 'default' ) }}</label></th>
				<td>
					<select name="display_name" id="display_name" :value="values.display_name" @change="values.display_name = $event.target.value">
						<option v-for="choice in choices" :key="choice" :value="choice">{{ choice }}</option>
					</select>
				</td>
			</tr>
		</table>
	`,
};
