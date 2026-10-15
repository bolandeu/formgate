// Entry of the standalone formgate.js: binds every form with data-formgate once the page is parsed.
import { bindForms } from './bind-form.ts';

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => bindForms());
} else {
  bindForms();
}
