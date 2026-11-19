import { computed, ref, watch } from 'vue';

const list = ( value ) => ( Array.isArray( value ) ? value : [] );

/**
 * Default implementation of core/list-table-search: WP_List_Table::search_box()'s markup, the
 * hidden fields the search keeps, then `p.search-box` (the input's hidden label, the search input
 * named `s` and the compact submit button `search-submit`). Nothing is submitted: the button and
 * Enter in the field emit `search` with the term typed.
 */
export default {
	name: 'ListTableSearch',
	props: {
		search: { type: Object, required: true },
	},
	emits: [ 'search' ],
	setup( props, { emit } ) {
		const term = ref( '' );
		watch( () => props.search?.value, ( value ) => {
			term.value = String( value ?? '' );
		}, { immediate: true } );
		const keep = computed( () => list( props.search?.keep ).filter( ( field ) => typeof field?.name === 'string' && field.name !== '' ) );
		function submit( event ) {
			event?.preventDefault?.();
			emit( 'search', term.value );
		}
		function onKey( event ) {
			if ( event?.key === 'Enter' && ! event.isComposing ) {
				submit( event );
			}
		}
		return { term, keep, submit, onKey, onInput: ( event ) => {
			term.value = String( event?.target?.value ?? '' );
		} };
	},
	template: `
		<template v-if="search.shown">
			<input v-for="field in keep" :key="field.name" type="hidden" :name="field.name" :value="field.value" />
			<p class="search-box">
				<label class="screen-reader-text" :for="search.inputId">{{ search.label }}{{ ':' }}</label>
				<input type="search" :id="search.inputId" name="s" :value="term" @input="onInput" @keydown="onKey" />
				<input type="submit" id="search-submit" class="button button-compact" :value="search.label" @click="submit" />
			</p>
		</template>
	`,
};
