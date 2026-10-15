// The ALTCHA widget for a form with data-formgate-pow="widget". This module is loaded on demand, so a form without
// the attribute never pays for the widget code. The widget shows the solving to the visitor; its payload is the __pow.
import 'altcha';
import type { PowChallenge, PowSolver } from './pow.ts';

// The solver of one form: feeds the widget with the challenge of the current token and starts the solving at once,
// so the visitor does not need to tick the widget. The widget goes before the submit button of the form (the button can
// sit in a wrapper element), or to the end of a form without one.
export function mountPowWidget(form: HTMLFormElement, button: Element | null): PowSolver {
  const widget = document.createElement('altcha-widget');
  widget.setAttribute('name', '__pow');
  if (button) button.before(widget);
  else form.append(widget);

  // The element gets its methods one tick after it joins the page.
  const ready = new Promise<void>((resolve) => setTimeout(resolve, 0));

  return async (challenge: PowChallenge) => {
    await ready;
    await widget.configure({ challenge: JSON.stringify(challenge) });
    const result = await widget.verify();
    return result?.payload ?? undefined;
  };
}
