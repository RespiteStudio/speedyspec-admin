/**
 * Contract of the password rows of the user forms: what user-profile.js does on Add User, Your
 * Profile and Edit User. The rows (`tr`s) go inside the form's table.
 *
 * - `mode`: `new` or `change`, nothing else. `new` (Add User): the password field is shown, filled with `initialPassword`, with
 *   the Hide/Show toggle (`button.wp-hide-pw`), the strength meter (`#pass-strength-result`) and,
 *   for a short or bad strength, the `pw-weak` row. `change` (Profile, Edit User): "Set New
 *   Password" (`button.wp-generate-pw`, `aria-expanded`) reveals the field filled with
 *   `initialPassword`; Cancel (`button.wp-cancel-pw`) hides it and empties the password.
 * - `initialPassword`: the password PHP generated (`wp_generate_password( 24 )`). The part
 *   decides no password itself.
 * - `disallowed`: the page's user fields (login, names, email, …), as
 *   `wp.passwordStrength.userInputDisallowedList()` reads them; the part keeps the words of four
 *   letters or more, once each.
 * - `labels`: the classic strings, from the page data. All optional; a missing one is core's own
 *   string. `password`, `generate`, `hide`, `show`, `hidePassword`, `showPassword`, `cancel`,
 *   `cancelPassword`, `weakRow` ("Confirm Password") and `weakConfirm`.
 * - `generate`: a function answering a promise of a new password (`GET users/generate-password`).
 *   In `new` it is what the Generate password button asks, and the button shows only with it; in
 *   `change` it is asked when the field opens, to have the next password ready for the next
 *   opening, as user-profile.js does. A failure keeps the password as it is.
 *
 * Removed from 1.0.0 before any release used it: `pollMs`, which only tests set (the part waits
 * user-profile.js's 50 ms between strength checks while core's meter is not loaded). The one
 * non-additive change to this contract, allowed because no released consumer uses the part
 * outside the Users and Profile batch that introduced it (final fix wave ruling, 2026-11-22).
 *
 * The strength comes from core's `wp.passwordStrength.meter`, which the page's `screen_scripts`
 * load (runtime/password-strength.js). While it is not loaded a password counts as weak, as
 * user-profile.js's -1 answer does.
 *
 * Emits, each on every change and once when the part appears:
 * - `update:password( text )`: the password to post as `pass1`; empty while `change` is closed.
 * - `update:weakConfirmed( boolean )`: the `pw_weak` checkbox.
 * - `update:canSubmit( boolean )`: whether the form may be submitted. True for a closed `change`;
 *   false for an empty password; for a short, bad or unknown strength only once the weak
 *   confirmation is checked; true for a better strength.
 *
 * The part is shared: Add User, Profile and Edit User use it, so it is never in a session's
 * `components` list of one page.
 */
export default {
	id: 'core/user-password',
	version: '1.0.0',
	props: {
		mode: { type: 'String', required: true },
		initialPassword: { type: 'String', required: false },
		disallowed: { type: 'Array', required: false },
		labels: { type: 'Object', required: false },
		generate: { type: 'Function', required: false },
	},
	slots: {},
	emits: [ 'update:password', 'update:weakConfirmed', 'update:canSubmit' ],
};
