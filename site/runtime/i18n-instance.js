import api from './api-instance.js';
import { createI18n } from './i18n.js';

const i18n = createI18n( { api } );

export default i18n;
export const { load, __, _x, _n, _nx, sprintf, setLocale, getLocale } = i18n;
