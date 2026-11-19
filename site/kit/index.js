/**
 * The component kit page modules import as `@wp-admin/kit`.
 *
 * `VERSION` follows semantic versioning: a minor release only adds components or props,
 * a major one may remove or change them, so a module can check what it needs.
 * 1.1.0 added InlineMarkup.
 * 1.2.0: Interpolate `tags` entries may be functions of their placeholders' arguments.
 * 1.3.0: LegacyHtml waits for the page's screen assets (`SCREEN_ASSETS`) before its own.
 * 1.4.0: LegacyHtml assets: styles load for their `media`, and inline CSS added later to a style applies.
 * 1.5.0: LegacyHtml's styles apply while the component is there (they stop applying when it goes).
 * 1.6.0 added InertHtml (HTML inserted without running its scripts or handlers).
 */
export const VERSION = '1.6.0';

export { default as Button } from './Button.js';
export { default as Notice } from './Notice.js';
export { default as TextField } from './TextField.js';
export { default as SelectField } from './SelectField.js';
export { default as CheckboxField } from './CheckboxField.js';
export { default as RadioGroup } from './RadioGroup.js';
export { default as FormTable } from './FormTable.js';
export { default as Spinner } from './Spinner.js';
export { default as Interpolate } from './Interpolate.js';
export { default as LegacyHtml } from './LegacyHtml.js';
export { default as InlineMarkup } from './InlineMarkup.js';
export { default as InertHtml } from './InertHtml.js';
