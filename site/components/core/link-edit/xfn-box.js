import { computed, reactive, ref, shallowRef, watch } from 'vue';
import { __ } from '../../../runtime/text.js';
import InlineMarkup from '../../../kit/InlineMarkup.js';
import { choiceId, composeRel, meDisables } from './xfn.js';

const list = ( value ) => ( Array.isArray( value ) ? value : [] );
const key = ( group, value ) => group + '|' + value;

/** The checks of the data's choices, by group and value. Pure. */
const checksOf = ( xfn ) => Object.fromEntries( list( xfn?.groups ).flatMap( ( group ) => list( group?.choices ).map( ( choice ) => [ key( group.name, choice.value ), choice.checked === true ] ) ) );

/**
 * The Link Relationship (XFN) box of the link form (link_xfn_meta_box()): the read-only `rel`
 * field, "another web address of mine" (`#me`) and the groups WordPress sends, with the choices
 * it checks (xfn_check()). As xfn.js, a click or a key in the box composes `rel` from the checked
 * choices (xfn.js's composeRel()) and, while "me" is checked, disables the other choices; until
 * then the stored `rel` stays as it is.
 *
 * Props: `xfn` (`{ rel, me, groups }`). v-model: the `rel` value.
 */
export default {
	name: 'LinkXfnBox',
	components: { InlineMarkup },
	props: {
		xfn: { type: Object, required: true },
		modelValue: { type: String, default: '' },
	},
	emits: [ 'update:modelValue' ],
	setup( props, { emit } ) {
		const checks = reactive( checksOf( props.xfn ) );
		const me = ref( props.xfn?.me === true );
		const disabled = ref( false );
		const root = shallowRef( null );

		watch( () => props.xfn, ( xfn ) => {
			for ( const name of Object.keys( checks ) ) {
				delete checks[ name ];
			}
			Object.assign( checks, checksOf( xfn ) );
			me.value = xfn?.me === true;
			disabled.value = false;
		} );

		/** The box's inputs as the user left them (xfn.js reads the DOM). Changes the state. */
		function sync() {
			const element = root.value;
			if ( ! element ) {
				return { me: me.value, values: [] };
			}
			const values = [];
			for ( const input of element.querySelectorAll( 'input.valinp' ) ) {
				checks[ key( input.name, input.value ) ] = input.checked;
				if ( input.checked ) {
					values.push( input.value );
				}
			}
			me.value = Boolean( element.querySelector( '#me' )?.checked );
			return { me: me.value, values };
		}

		/**
		 * xfn.js (`$( '#linkxfndiv input' ).on( 'click keyup', … )`): on a click or a key on an input
		 * of the box, `rel` is composed and "me" disables the others. Anywhere else in the box (the
		 * help text, a heading) nothing changes, so a stored non-XFN `rel` such as `nofollow` stays.
		 */
		function compose( event ) {
			if ( ! event?.target?.matches?.( 'input' ) ) {
				return;
			}
			const choices = sync();
			disabled.value = meDisables( choices );
			emit( 'update:modelValue', composeRel( choices ) );
		}

		return {
			checks, me, disabled, root, choiceId, compose, sync,
			help: computed( () => __( 'If the link is to a person, you can specify your relationship with them using the above form. If you would like to learn more about the idea check out <a href="https://gmpg.org/xfn/">XFN</a>.', 'default' ) ),
			groups: () => list( props.xfn?.groups ).filter( ( group ) => group && typeof group.name === 'string' ),
			checked: ( group, value ) => checks[ key( group, value ) ] === true,
		};
	},
	template: `
		<div ref="root" class="wp-admin-link-xfn" @click="compose" @keyup="compose">
			<table class="links-table">
				<tr>
					<!-- translators: xfn: https://gmpg.org/xfn/ -->
					<th scope="row"><label for="link_rel">{{ $__( 'rel:', 'default' ) }}</label></th>
					<td><input type="text" name="link_rel" id="link_rel" :value="modelValue" readonly /></td>
				</tr>
				<tr>
					<!-- translators: xfn: https://gmpg.org/xfn/ -->
					<th scope="row">{{ $__( 'identity', 'default' ) }}</th>
					<td><fieldset>
						<legend class="screen-reader-text"><span>{{ $__( 'identity', 'default' ) }}</span></legend>
						<label for="me">
						<input type="checkbox" name="identity" value="me" id="me" :checked="me" @change="sync" />
						{{ ' ' }}{{ $__( 'another web address of mine', 'default' ) }}</label>
					</fieldset></td>
				</tr>
				<tr v-for="group in groups()" :key="group.name">
					<th scope="row">{{ group.label }}</th>
					<td><fieldset>
						<legend class="screen-reader-text"><span>{{ group.label }}</span></legend>
						<label v-for="choice in group.choices" :key="choice.value" :for="choiceId( group.name, choice.value )" :class="disabled ? 'disabled' : null">
						<input class="valinp" :type="group.type === 'radio' ? 'radio' : 'checkbox'" :name="group.name" :value="choice.value" :id="choiceId( group.name, choice.value )" :checked="checked( group.name, choice.value )" :disabled="disabled" @change="sync" />{{ '\\u00a0' }}{{ choice.label }}
						</label>
					</fieldset></td>
				</tr>
			</table>
			<p><InlineMarkup :html="help" /></p>
		</div>
	`,
};
