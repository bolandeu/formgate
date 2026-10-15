// Public entry of the npm client (formgate/client): bindForm and bindForms (they set the lazy loader of the ALTCHA
// widget module) and the field rules.
import { bindForm as bind, bindForms as bindAll, type BindOptions } from './bind-form.ts';

export type { BindOptions } from './bind-form.ts';
export { checkEmail, checkPhone, rules } from './rules.ts';

// The widget module is a separate file: a bundler splits it off, and only a form with the attribute loads it.
const loadPowWidget = () => import('./pow-widget.ts');

export const bindForm = (form: HTMLFormElement, options: BindOptions = {}) => bind(form, { loadPowWidget, ...options });
export const bindForms = (root: ParentNode = document, options: BindOptions = {}) => bindAll(root, { loadPowWidget, ...options });
