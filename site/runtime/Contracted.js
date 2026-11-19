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
 *
 * A contract that has an `id` prop of its own (a form field) is named with `contract`
 * instead; `id` is then passed to the implementation like any other prop:
 * <Contracted contract="core/settings-field" id="blogname" … />
 *
 * A contract whose files the proxy refuses (403: the user's role may not load that page) raises
 * `forbidden`, without a notice; the page host then shows the forbidden screen in its place.
 *
 * Each successful resolution raises `resolved` with what contracts.resolve() returned (the
 * page host reads the page module's `help` export from it). A resolution that fails, or an
 * implementation that fails to render, raises `failed`, so that a caller waiting for the
 * implementation to be shown (the frame, for core/notices) does not wait for ever.
 *
 * `prepare`, when given, is awaited with that result before the implementation is shown (the
 * page host loads the page's own stylesheets with it, so that the page never shows unstyled).
 * A `prepare` that fails does not keep the implementation from showing.
 */
export default defineComponent( {
	name: 'Contracted',
	inheritAttrs: false,
	emits: [ 'forbidden', 'resolved', 'failed' ],
	props: {
		// The contract id, unless `contract` is given.
		id: { type: String, default: undefined },
		contract: { type: String, default: undefined },
		module: { type: String, default: undefined },
		// Shown, without a notice, when the contract does not exist (e.g. a screen not built yet).
		unresolvedMessage: { type: String, default: undefined },
		// Awaited with the resolution before the implementation is shown.
		prepare: { type: Function, default: undefined },
	},
	setup( props, { attrs, slots, emit } ) {
		const notices = inject( 'notices', null );
		const state = ref( 'loading' ); // loading | ready | failed
		const resolved = shallowRef( null );
		const component = shallowRef( null );
		const usingDefault = ref( true );
		const configVersion = ref( 0 );
		const unresolved = ref( false );
		let token = 0;
		let shownKey = null; // id and module of what is on screen
		const contractId = computed( () => props.contract ?? props.id ?? '' );
		if ( props.contract === undefined && props.id === undefined ) {
			console.warn( 'Contracted needs an `id` or a `contract`.' );
		}

		provide( 'contractId', contractId );

		const fallbackNotice = () => notify( notices, __( 'An extension for this screen could not be loaded, so the standard version is shown.', 'wp-admin-site' ) );

		async function resolve() {
			const mine = ++token;
			const id = contractId.value;
			const key = id + '\u0000' + ( props.module ?? '' );
			// Re-resolving the same contract (new replacements after a navigation) keeps the
			// current implementation on screen, so it is not torn down and mounted again.
			if ( ! ( state.value === 'ready' && shownKey === key ) ) {
				state.value = 'loading';
			}
			try {
				const result = await contracts.resolve( id, { module: props.module } );
				if ( mine !== token ) {
					return;
				}
				if ( props.prepare ) {
					try {
						await props.prepare( result );
					} catch ( error ) {
						console.warn( 'Could not prepare contract ' + id + ':', error );
					}
					if ( mine !== token ) {
						return;
					}
				}
				resolved.value = result;
				component.value = result.component;
				usingDefault.value = ! result.replaced;
				unresolved.value = false;
				shownKey = key;
				state.value = 'ready';
				emit( 'resolved', result );
				if ( result.fallbackReason ) {
					fallbackNotice();
				}
			} catch ( error ) {
				if ( mine === token ) {
					console.warn( 'Could not resolve contract ' + id + ':', error );
					unresolved.value = error?.code === 'contract_not_found';
					shownKey = null;
					const refused = error?.code === 'contract_forbidden';
					if ( ! refused && ! ( unresolved.value && props.unresolvedMessage ) ) {
						notify( notices, __( 'This screen could not be loaded.', 'wp-admin-site' ) );
					}
					state.value = 'failed';
					if ( refused ) {
						emit( 'forbidden' );
					}
					emit( 'failed' );
				}
			}
		}

		const off = contracts.onChange( () => { configVersion.value++; } );
		onBeforeUnmount( () => { off(); token++; } );
		watch( () => [ contractId.value, props.module, configVersion.value ], resolve );
		resolve();

		onErrorCaptured( () => {
			if ( state.value === 'ready' && renderErrorAction( { replaced: ! usingDefault.value, usingDefault: usingDefault.value } ) === 'use-default' ) {
				component.value = resolved.value.defaultComponent;
				usingDefault.value = true;
				// Not tried again (nor reported again) until its configuration changes.
				contracts.markFailed( contractId.value, resolved.value.replacementKey );
				fallbackNotice();
			} else {
				state.value = 'failed';
				emit( 'failed' );
			}
			return false;
		} );

		return () => {
			if ( state.value === 'loading' ) {
				return null;
			}
			if ( state.value === 'failed' && unresolved.value && props.unresolvedMessage ) {
				return h( 'p', { class: 'contracted-unavailable' }, props.unresolvedMessage );
			}
			if ( state.value === 'failed' ) {
				return h( 'p', { class: 'contracted-failure', role: 'alert' }, __( 'This screen could not be displayed.', 'wp-admin-site' ) );
			}
			return h( component.value, props.contract !== undefined && props.id !== undefined ? { ...attrs, id: props.id } : attrs, slots );
		};
	},
} );
