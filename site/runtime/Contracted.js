import { defineComponent, h, inject, computed, provide, ref, shallowRef, watch, onBeforeUnmount, onErrorCaptured } from 'vue';
import { __ } from '@wp-admin/i18n';
import { contracts } from './contracts-instance.js';
import { renderErrorAction } from './contracts.js';
import { notify } from './notify.js';

/**
 * <Contracted id="core/list-table" v-bind="props" />
 *
 * Renders the implementation of a contract (a compatible replacement, else the
 * static default) inside an error boundary. Logic lives in contracts.js.
 */
export default defineComponent( {
	name: 'Contracted',
	inheritAttrs: false,
	props: {
		id: { type: String, required: true },
		module: { type: String, default: undefined },
	},
	setup( props, { attrs, slots } ) {
		const notices = inject( 'notices', null );
		const state = ref( 'loading' ); // loading | ready | failed
		const resolved = shallowRef( null );
		const component = shallowRef( null );
		const usingDefault = ref( true );
		const configVersion = ref( 0 );
		let token = 0;

		provide( 'contractId', computed( () => props.id ) );

		const fallbackNotice = () => notify( notices, __( 'An extension for this screen could not be loaded, so the standard version is shown.', 'wp-admin-site' ) );

		async function resolve() {
			const mine = ++token;
			state.value = 'loading';
			try {
				const result = await contracts.resolve( props.id, { module: props.module } );
				if ( mine !== token ) {
					return;
				}
				resolved.value = result;
				component.value = result.component;
				usingDefault.value = ! result.replaced;
				state.value = 'ready';
				if ( result.fallbackReason ) {
					fallbackNotice();
				}
			} catch ( error ) {
				if ( mine === token ) {
					console.warn( 'Could not resolve contract ' + props.id + ':', error );
					notify( notices, __( 'This screen could not be loaded.', 'wp-admin-site' ) );
					state.value = 'failed';
				}
			}
		}

		const off = contracts.onChange( () => { configVersion.value++; } );
		onBeforeUnmount( () => { off(); token++; } );
		watch( () => [ props.id, props.module, configVersion.value ], resolve );
		resolve();

		onErrorCaptured( () => {
			if ( state.value === 'ready' && renderErrorAction( { replaced: ! usingDefault.value, usingDefault: usingDefault.value } ) === 'use-default' ) {
				component.value = resolved.value.defaultComponent;
				usingDefault.value = true;
				fallbackNotice();
			} else {
				state.value = 'failed';
			}
			return false;
		} );

		return () => {
			if ( state.value === 'loading' ) {
				return null;
			}
			if ( state.value === 'failed' ) {
				return h( 'p', { class: 'contracted-failure', role: 'alert' }, __( 'This screen could not be displayed.', 'wp-admin-site' ) );
			}
			return h( component.value, attrs, slots );
		};
	},
} );
