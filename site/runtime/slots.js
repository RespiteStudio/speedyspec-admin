import { defineComponent, h, inject, unref, shallowRef, ref, onMounted, onUnmounted, onErrorCaptured } from 'vue';
import { __ } from '@wp-admin/i18n';
import { contracts, loader } from './contracts-instance.js';
import { isModuleFailure } from './loader.js';
import { notify } from './notify.js';

/** One slot module, loaded on its own and isolated from its siblings. */
const SlotEntry = defineComponent( {
	name: 'SlotEntry',
	props: { module: { type: String, required: true }, context: { type: Object, default: () => ( {} ) } },
	setup( props ) {
		const notices = inject( 'notices', null );
		const component = shallowRef( null );
		const failed = ref( false );
		const skip = () => {
			failed.value = true;
			notify( notices, __( 'An extension could not be loaded and was skipped.', 'wp-admin-site' ) );
		};

		onMounted( async () => {
			const loaded = await loader.loadComponent( props.module );
			if ( isModuleFailure( loaded ) ) {
				skip();
			} else {
				component.value = loaded;
			}
		} );
		onErrorCaptured( () => {
			skip();
			return false;
		} );

		return () => ( failed.value || ! component.value ? null : h( component.value, props.context ) );
	},
} );

/** <SlotOutlet name="row-actions" :context="{ row }" /> inside a <Contracted>. */
export const SlotOutlet = defineComponent( {
	name: 'SlotOutlet',
	props: { name: { type: String, required: true }, context: { type: Object, default: () => ( {} ) } },
	setup( props ) {
		const contractId = inject( 'contractId', null );
		// The slot configuration is a plain object: a live update (a plugin activated or deactivated)
		// must re-render the outlet, so it reads this counter, bumped on every change.
		const configVersion = ref( 0 );
		const off = contracts.onChange( () => {
			configVersion.value++;
		} );
		onUnmounted( off );
		return () => {
			void configVersion.value;
			const id = unref( contractId );
			if ( ! id ) {
				return null;
			}
			return contracts.slotEntries( id, props.name ).map( ( entry, index ) => h( SlotEntry, { key: index + ':' + entry.module, module: entry.module, context: props.context } ) );
		};
	},
} );

export default SlotOutlet;
