import { computed, nextTick, reactive, ref, shallowRef, watch } from 'vue';
import api from '@wp-admin/api';
import { __, _x } from '../../../runtime/text.js';
import InertHtml from '../../../kit/InertHtml.js';
import { preferencesRoute } from '../meta-box-holder.js';

const CATEGORIES_ROUTE = 'wp-admin/v1/links/categories';
const TABS = [ 'all', 'pop' ];

const list = ( value ) => ( Array.isArray( value ) ? value : [] );
const terms = ( value ) => list( value ).filter( ( term ) => term && Number.isInteger( term.id ) );

/**
 * The categories checked when the form opens: the link's in All categories and, as link.js's
 * sync on load (a checked box checks its twin), those checked in Most Used, in All categories'
 * order, as the strings a form posts. Pure.
 *
 * @param {object} categories The box's data (`all`, `popular`).
 * @return {string[]} The IDs.
 */
export function initialChecked( categories ) {
	const checked = new Set( [ ...terms( categories?.all ), ...terms( categories?.popular ) ].filter( ( term ) => term.checked === true ).map( ( term ) => term.id ) );
	return terms( categories?.all ).filter( ( term ) => checked.has( term.id ) ).map( ( term ) => String( term.id ) );
}

/**
 * The Categories box of the link form (link_categories_meta_box()), as link.js runs it:
 *
 * - The tabs All categories and Most Used (`#category-tabs`, `role=tablist`): a click, Enter, or
 *   Space shows a tab and posts it as the link screen's `categoryTab` (the `cats` setting);
 *   ArrowRight and ArrowLeft move the focus to the other tab. The box opens on the tab WordPress
 *   names.
 * - The checkboxes of both tabs are the same choice (link.js's syncChecks()): `modelValue` is the
 *   checked IDs, in All categories' order, which the form posts as `link_category`.
 * - "+ Add Category" (when WordPress says the user may add one) opens the form on All
 *   categories; the field's tip clears on its first focus; Add posts the comma-separated names
 *   to `links/categories` and puts each new category first in All categories, checked, then
 *   empties the field. A refusal shows in `#category-ajax-response`.
 *
 * The names are escaped HTML (as the_category() prints them) and show through kit/InertHtml,
 * which runs nothing. Props: `categories` (`{ all, popular, tab, canAdd }`). Emits
 * `update:modelValue` and `failed( error, what )` for a refused tab.
 */
export default {
	name: 'LinkCategoriesBox',
	components: { InertHtml },
	props: {
		categories: { type: Object, required: true },
		modelValue: { type: Array, default: () => [] },
	},
	emits: [ 'update:modelValue', 'failed' ],
	setup( props, { emit } ) {
		const added = ref( [] );
		const tab = ref( props.categories?.tab === 'pop' ? 'pop' : 'all' );
		// tabindex of each tab link, as link.js leaves them (null: none).
		// link.js clicks Most Used on load when the setting names it.
		const tabindex = reactive( { all: tab.value === 'pop' ? '-1' : null, pop: null } );
		const adderOpen = ref( false );
		const tip = ref( true );
		const newcat = ref( __( 'New category name', 'default' ) );
		const adding = ref( false );
		const adderError = ref( '' );
		const tabLinks = {};
		const newcatEl = shallowRef( null );

		watch( () => props.categories, ( categories ) => {
			added.value = [];
			tab.value = categories?.tab === 'pop' ? 'pop' : 'all';
			Object.assign( tabindex, { all: tab.value === 'pop' ? '-1' : null, pop: null } );
			adderError.value = '';
		} );

		const all = computed( () => [ ...added.value, ...terms( props.categories?.all ) ] );
		const popular = computed( () => terms( props.categories?.popular ) );
		const checkedSet = computed( () => new Set( list( props.modelValue ).map( String ) ) );

		/** Checks or unchecks a category in both tabs; the IDs go out in All categories' order. */
		function setChecked( id, checked ) {
			const next = new Set( checkedSet.value );
			if ( checked ) {
				next.add( String( id ) );
			} else {
				next.delete( String( id ) );
			}
			emit( 'update:modelValue', all.value.map( ( term ) => String( term.id ) ).filter( ( value ) => next.has( value ) ) );
		}

		/** Shows a tab and posts it, as link.js's tab handler and its user setting. */
		function activate( which ) {
			tab.value = which;
			for ( const other of TABS ) {
				tabindex[ other ] = other === which ? null : '-1';
			}
			api.post( preferencesRoute( 'link' ), { categoryTab: which } ).catch( ( error ) => emit( 'failed', error, 'Could not save the categories tab:' ) );
		}

		/** link.js's keys on a tab link: Enter and Space show it, the arrows move the focus. */
		function onTabKey( which, event ) {
			if ( event.type === 'keydown' && event.key === ' ' ) {
				event.preventDefault();
			}
			if ( ( event.type === 'keyup' && event.key === ' ' ) || ( event.type === 'keydown' && event.key === 'Enter' ) ) {
				event.preventDefault();
				activate( which );
				return;
			}
			if ( event.type === 'keyup' && ( event.key === 'ArrowRight' || event.key === 'ArrowLeft' ) ) {
				tabindex[ which ] = '-1';
				const at = TABS.indexOf( which );
				const target = TABS[ at + 1 ] ?? TABS[ at - 1 ];
				tabindex[ target ] = null;
				nextTick( () => tabLinks[ target ]?.focus?.() );
			}
		}

		/** "+ Add Category": the form opens or closes, and All categories shows. */
		function toggleAdder() {
			adderOpen.value = ! adderOpen.value;
			activate( 'all' );
		}

		function onNewcatFocus() {
			if ( tip.value ) {
				tip.value = false;
				newcat.value = '';
			}
		}

		async function addCategory() {
			// link.js focuses the field first (its tip clears), then wpList posts it.
			newcatEl.value?.focus?.();
			onNewcatFocus();
			if ( adding.value ) {
				return;
			}
			adding.value = true;
			adderError.value = '';
			try {
				const answer = await api.post( CATEGORIES_ROUTE, { names: newcat.value } );
				const made = terms( answer?.categories );
				// Each new category goes first, as wpList adds a response at position -1.
				for ( const term of made ) {
					added.value = [ { id: term.id, name: String( term.name ?? '' ) }, ...added.value ];
				}
				const next = new Set( [ ...checkedSet.value, ...made.map( ( term ) => String( term.id ) ) ] );
				emit( 'update:modelValue', all.value.map( ( term ) => String( term.id ) ).filter( ( value ) => next.has( value ) ) );
				newcat.value = '';
			} catch ( error ) {
				adderError.value = typeof error?.message === 'string' && error.message !== '' ? error.message : __( 'An error occurred while processing your request. Please try again later.', 'default' );
			} finally {
				adding.value = false;
			}
		}

		return {
			all, popular, tab, tabindex, adderOpen, tip, newcat, adderError, newcatEl, checkedSet,
			activate, onTabKey, toggleAdder, onNewcatFocus, addCategory, setChecked,
			mostUsed: computed( () => _x( 'Most Used', 'categories', 'default' ) ),
			tabRef: ( which ) => ( element ) => {
				tabLinks[ which ] = element;
			},
			isChecked: ( id ) => checkedSet.value.has( String( id ) ),
		};
	},
	template: `
		<div id="taxonomy-linkcategory" class="categorydiv">
			<ul id="category-tabs" class="category-tabs" role="tablist">
				<li :class="tab === 'all' ? 'tabs' : null"><a :ref="tabRef( 'all' )" href="#categories-all" role="tab" aria-controls="categories-all" :aria-selected="tab === 'all' ? 'true' : null" :tabindex="tabindex.all" @click.prevent="activate( 'all' )" @keydown="onTabKey( 'all', $event )" @keyup="onTabKey( 'all', $event )">{{ $__( 'All categories', 'default' ) }}</a></li>
				<li :class="[ 'hide-if-no-js', tab === 'pop' ? 'tabs' : null ]"><a :ref="tabRef( 'pop' )" href="#categories-pop" role="tab" aria-controls="categories-pop" :aria-selected="tab === 'pop' ? 'true' : null" :tabindex="tabindex.pop" @click.prevent="activate( 'pop' )" @keydown="onTabKey( 'pop', $event )" @keyup="onTabKey( 'pop', $event )">{{ mostUsed }}</a></li>
			</ul>

			<div id="categories-all" class="tabs-panel" role="tabpanel" :style="{ display: tab === 'all' ? null : 'none' }">
				<ul id="categorychecklist" data-wp-lists="list:category" class="categorychecklist form-no-clear">
					<li v-for="term in all" :key="term.id" :id="'link-category-' + term.id"><label :for="'in-link-category-' + term.id" class="selectit"><input :value="String( term.id )" type="checkbox" name="link_category[]" :id="'in-link-category-' + term.id" :checked="isChecked( term.id )" @change="setChecked( term.id, $event.target.checked )" />{{ ' ' }}<InertHtml tag="span" :html="term.name" /></label></li>
				</ul>
			</div>

			<div id="categories-pop" class="tabs-panel" role="tabpanel" :style="{ display: tab === 'pop' ? null : 'none' }">
				<ul id="categorychecklist-pop" class="categorychecklist form-no-clear">
					<li v-for="term in popular" :key="term.id" :id="'popular-link_category-' + term.id" class="popular-category"><label class="selectit"><input :id="'in-popular-link_category-' + term.id" type="checkbox" :value="String( term.id )" :checked="isChecked( term.id )" :disabled="term.disabled === true" @change="setChecked( term.id, $event.target.checked )" />{{ ' ' }}<InertHtml tag="span" :html="term.name" /></label></li>
				</ul>
			</div>

			<div v-if="categories.canAdd" id="category-adder" :class="adderOpen ? null : 'wp-hidden-children'">
				<a id="category-add-toggle" href="#category-add" class="taxonomy-add-new" @click.prevent="toggleAdder">{{ $__( '+ Add Category', 'default' ) }}</a>
				<p id="link-category-add" class="wp-hidden-child">
					<label class="screen-reader-text" for="newcat">
						<!-- translators: Hidden accessibility text. -->
						{{ $__( '+ Add Category', 'default' ) }}
					</label>
					<input ref="newcatEl" type="text" name="newcat" id="newcat" :class="[ 'form-required', tip ? 'form-input-tip' : null ]" v-model="newcat" aria-required="true" @focus="onNewcatFocus" />
					{{ ' ' }}<input type="button" id="link-category-add-submit" data-wp-lists="add:categorychecklist:link-category-add" class="button" :value="$__( 'Add', 'default' )" @click="addCategory" />
					<span id="category-ajax-response"><div v-if="adderError" class="notice notice-error" role="alert"><p>{{ adderError }}</p></div></span>
				</p>
			</div>
		</div>
	`,
};
