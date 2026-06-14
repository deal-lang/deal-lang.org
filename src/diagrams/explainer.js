"use strict";
/* ============================================================================
 * explainer.js — the connector hover explainer card.
 *
 * Each mounted diagram gets its OWN card (appended to <body>, positioned by
 * pointer coordinates) so stacked diagrams never fight over one singleton.
 * Dwelling ~½s over a connector raises a plain-language reading of the
 * relationship; leaving or pressing hides it. Styling lives in diagrams.css.
 * ==========================================================================*/

import { connectorExplanation } from './connector.js';

export function createExplainer() {
  const card = document.createElement('div');
  card.className = 'dd-explainer';
  card.style.display = 'none';
  document.body.appendChild(card);

  function attach(node, spec) {
    let timer = null;
    const show = (ev) => {
      const x = connectorExplanation(spec);
      if (!x) return;
      card.innerHTML = '';
      const add = (cls, text) => {
        const d = document.createElement('div');
        d.className = cls;
        d.textContent = text;
        card.appendChild(d);
      };
      add('ck', '«' + x.kind + '»');
      add('cr', x.reading);
      add('cm', x.meaning);
      add('cd', x.dirNote);
      add('cf', (x.ref ? x.ref + '  ·  ' : '') + 'declared in ' + x.declaredIn);
      card.style.display = 'block';
      const pad = 14;
      let cx = ev.pageX + pad;
      const r = card.getBoundingClientRect();
      if (cx + r.width > window.scrollX + document.documentElement.clientWidth - 8) cx = ev.pageX - r.width - pad;
      card.style.left = cx + 'px';
      card.style.top = (ev.pageY + pad) + 'px';
    };
    node.addEventListener('pointerenter', (ev) => {
      clearTimeout(timer);
      timer = setTimeout(() => show(ev), 500);   // dwell, so casual mouse travel never flashes cards
    });
    node.addEventListener('pointerleave', () => { clearTimeout(timer); card.style.display = 'none'; });
    node.addEventListener('pointerdown', () => { clearTimeout(timer); card.style.display = 'none'; });
  }

  return {attach};
}
