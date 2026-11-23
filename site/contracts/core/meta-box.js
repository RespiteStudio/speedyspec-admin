/**
 * Contract of one meta box (a classic `.postbox`), as core/meta-box-holder shows it.
 *
 * - `box`: `{ id, title, basename, classes, closed, hidden, pinned, warning }` as WordPress's
 *   meta box layout computes it (wp_admin_get_meta_box_layout()): `title` is HTML limited to
 *   links, code, strong and em (shown through the kit's InlineMarkup), `basename` plain text,
 *   `classes` the extra classes of the box, `closed` and `hidden` its state, `pinned` a box that
 *   cannot be closed, moved or dragged (the browser nag) and `warning` one whose title has the
 *   warning icon (the PHP nag). The implementation decides none of these.
 * - `index` and `count`: the box's position among the positions a visible box can take on the
 *   screen, in reading order (an empty first or last container counts as one), so that
 *   `index === 0` is the first position (moving up is not possible: the move up button is
 *   `aria-disabled`) and `index === count - 1` the last (likewise moving down).
 * - `reordering`: whether the user may rearrange the boxes; the heading is then a drag handle.
 *
 * `toggle` asks to close or open the box; `move` asks to move it by one position, `-1` up and
 * `1` down, also from a disabled button (the holder then says that it is on the first or last
 * position). The default slot is the box's content; slot `header-actions` (also a slot for
 * modules, which get `{ box }`) follows the title.
 */
export default {
	id: 'core/meta-box',
	version: '1.0.0',
	props: {
		box: { type: 'Object', required: true },
		index: { type: 'Number', required: true },
		count: { type: 'Number', required: true },
		reordering: { type: 'Boolean', required: false },
	},
	slots: {
		default: { props: {} },
		'header-actions': { props: { box: { type: 'Object', required: true } } },
	},
	emits: [ 'move', 'toggle' ],
};
