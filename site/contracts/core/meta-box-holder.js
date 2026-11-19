/**
 * Contract of a screen's meta boxes (the classic `.metabox-holder` with its
 * `.postbox-container`s), shared by the screens that show them (the Dashboard first).
 *
 * Everything that WordPress decides comes as data (wp_admin_get_meta_box_layout() and the
 * page's endpoint); the holder only shows it and handles what the user does:
 *
 * - `id`: the id of the `.metabox-holder` element (the Dashboard's `dashboard-widgets`), or
 *   empty. Pass it with `contract="core/meta-box-holder"` on Contracted, as `id` names the
 *   contract otherwise.
 * - `screen`: the screen id, under which the preferences are saved.
 * - `layout`: `{ contexts: { <context>: [ box ids in order ] } }`, one container per context, in
 *   the order given (the Dashboard: `normal`, `side`, `column3`, `column4`).
 * - `boxes`: by id, `{ id, title, basename, classes, closed, hidden, pinned, warning }` (see
 *   core/meta-box).
 * - `reordering`: whether the user lets screen elements be rearranged.
 * - `columns`: the number of columns the user chose (`columns-N` on the holder), 0 when the
 *   width decides (CSS).
 * - `sections`: the screen's Screen Options sections (see core/screen-options), which the holder
 *   gives to the frame with its reordering switch and, when `maxColumns` is above 0, the layout
 *   choice of 1 to `maxColumns` columns.
 *
 * The page fills one named slot per box id with the box's content (core widgets with their
 * components, plugin boxes with LegacyHtml) and may fill `header-actions` (it gets `{ box }`).
 * Slots `before-containers` and `after-containers` (also slots for modules) get `{ screen }`.
 *
 * Changes are saved through `POST wp-admin/v1/screen-preferences/{screen}` and then raised:
 * `order` ( contexts, the complete order ), `toggle` ( id, closed ), `hide` ( id, hidden ),
 * `reordering` ( enabled ), `columns` ( count ); `option` ( id, value ) is a Screen Options
 * change that is not the holder's (the Dashboard's Welcome checkbox), left to the page.
 */
const holderSlot = {
	props: {
		screen: { type: 'String', required: true },
	},
};

export default {
	id: 'core/meta-box-holder',
	version: '1.0.0',
	props: {
		id: { type: 'String', required: false },
		screen: { type: 'String', required: true },
		layout: { type: 'Object', required: true },
		boxes: { type: 'Object', required: true },
		reordering: { type: 'Boolean', required: false },
		columns: { type: 'Number', required: false },
		sections: { type: 'Array', required: false },
		maxColumns: { type: 'Number', required: false },
	},
	slots: {
		'before-containers': holderSlot,
		'after-containers': holderSlot,
	},
	emits: [ 'order', 'toggle', 'hide', 'reordering', 'columns', 'option' ],
};
