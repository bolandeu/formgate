// Entry of the standalone formgate.js: binds every form with data-formgate once the page is parsed.
import { bindForms } from './bind-form.ts';

// The widget module sits next to formgate.js (the build writes it there); it loads only for a form with the attribute.
declare const POW_WIDGET_FILE: string;
const script = document.currentScript as HTMLScriptElement | null;
const loadPowWidget = () => import(/* @vite-ignore */ new URL(POW_WIDGET_FILE, script?.src ?? document.baseURI).href);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => bindForms(document, { loadPowWidget }));
} else {
  bindForms(document, { loadPowWidget });
}
