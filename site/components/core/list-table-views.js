import { computed } from 'vue';
import Interpolate from '../../kit/Interpolate.js';
import LegacyHtml from '../../kit/LegacyHtml.js';
import { SlotOutlet } from '../../runtime/slots.js';
import { adminHref } from './dashboard-parts/links.js';

const list = ( value ) => ( Array.isArray( value ) ? value : [] );

/**
 * The views plugins filtered, as `[ { key, html } ]`, from a map `{ key: html }` or a list; null when
 * there are none to show in place of the views (no filter ran). Pure.
 */
export function filteredViews( viewsHtml ) {
	if ( viewsHtml === null || viewsHtml === undefined || typeof viewsHtml !== 'object' ) {
		return null;
	}
	const entries = Array.isArray( viewsHtml ) ? viewsHtml.map( ( entry ) => [ entry?.key, entry?.html ] ) : Object.entries( viewsHtml );
	return entries.filter( ( [ key, html ] ) => typeof key === 'string' && typeof html === 'string' ).map( ( [ key, html ] ) => ( { key, html } ) );
}

/**
 * Default implementation of core/list-table-views: WP_List_Table::views()'s `ul.subsubsub`, each
 * view a link as get_views_links() builds it (`current` with `aria-current="page"`), separated by
 * " |", after the hidden heading WordPress prints. The labels are translated sentences with the
 * count in its span (kit/Interpolate, never HTML); views that plugins filtered are their HTML
 * (kit/LegacyHtml).
 */
export default {
	name: 'ListTableViews',
	components: { Interpolate, LegacyHtml, SlotOutlet },
	props: {
		views: { type: Array, required: true },
		viewsHtml: { type: [ Object, Array ], default: null },
		heading: { type: String, default: null },
	},
	setup( props ) {
		const filtered = computed( () => filteredViews( props.viewsHtml ) );
		const shown = computed( () => list( props.views ).filter( ( view ) => typeof view?.key === 'string' ) );
		const countArgs = ( view ) => [ { tag: 'span', attributes: { class: view.countClass ?? view.class ?? null }, text: String( view.countText ?? view.count ?? '' ) } ];
		const any = computed( () => ( filtered.value ? filtered.value.length > 0 : shown.value.length > 0 ) );
		return { filtered, shown, countArgs, any, href: ( path ) => adminHref( path ) };
	},
	template: `
		<SlotOutlet name="before" :context="{ views }" />
		<template v-if="any">
			<h2 v-if="heading" class="screen-reader-text">{{ heading }}</h2>
			<ul class="subsubsub">
				<template v-if="filtered">
					<li v-for="( view, index ) in filtered" :key="view.key" :class="view.key"><LegacyHtml tag="span" :html="view.html" /><template v-if="index < filtered.length - 1">{{ ' |' }}</template></li>
				</template>
				<template v-else>
					<li v-for="( view, index ) in shown" :key="view.key" :class="view.key"><a :href="href( view.url )" :class="view.current ? 'current' : null" :aria-current="view.current ? 'page' : null"><Interpolate v-if="view.format" :text="view.format" :args="countArgs( view )" :tags="{ span: { class: 'count' } }" /><template v-else>{{ view.label }}</template></a><template v-if="index < shown.length - 1">{{ ' |' }}</template></li>
				</template>
			</ul>
		</template>
		<SlotOutlet name="after" :context="{ views }" />
	`,
};
