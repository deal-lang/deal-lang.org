"use strict";
/* ============================================================================
 * mount.js — dispatcher + page initializer for the DEAL Viewer diagrams.
 *
 * One hoisted module script (DealDiagram.astro) imports initDealDiagrams() and
 * calls it. It mounts every [data-deal-diagram] node on the page by its
 * data-kind, wires the optional branded/standard toolbar, and defers the first
 * mount until the diagram font has loaded so measured box widths are correct.
 * ==========================================================================*/

import { el } from './core.js';
import { renderElementBox, mountBox, VEHICLE, GALLERY } from './element-box.js';
import { buildConnectorDemos } from './connector.js';
import { buildPackageDemos } from './package.js';
import { mountExampleView } from './example-view.js';
import { createExplainer } from './explainer.js';

function fig(captionText, child) {
  const f = document.createElement('figure');
  f.className = 'dd-fig';
  f.appendChild(child);
  if (captionText) {
    const c = document.createElement('figcaption');
    c.textContent = captionText;
    f.appendChild(c);
  }
  return f;
}

function noteNavigate(canvas) {
  // surface go-to clicks on a small status line beneath the diagram
  let status = canvas.parentElement.querySelector('.dd-status');
  return (ref) => {
    if (!status) {
      status = document.createElement('div');
      status.className = 'dd-status';
      canvas.after(status);
    }
    status.textContent = '→ goto: ' + ref;
  };
}

/* render one element box, folding live, into its own <svg> */
function mountElementBox(canvas, spec, onNavigate) {
  let cur = {...spec};
  const draw = () => {
    canvas.querySelector('svg')?.remove();
    const r = renderElementBox(cur, {
      onNavigate,
      onToggle: (c) => { cur = {...cur, collapsed: c}; draw(); }
    });
    const m = 6;
    const svg = el('svg', {
      class: 'dd-svg', viewBox: (-m) + ' ' + (-m) + ' ' + (r.layout.width + 2 * m) + ' ' + (r.layout.height + 2 * m),
      width: r.layout.width + 2 * m, height: r.layout.height + 2 * m, role: 'img'
    });
    svg.appendChild(r.node);
    canvas.appendChild(svg);
  };
  draw();
}

function mountDiagram(canvas, kind) {
  const onNavigate = noteNavigate(canvas);
  switch (kind) {
    case 'example':
      // the example owns its own status line; don't double up via noteNavigate
      mountExampleView(canvas, {});
      break;
    case 'element-box':
      mountElementBox(canvas, VEHICLE, onNavigate);
      break;
    case 'element-gallery': {
      const gallery = document.createElement('div');
      gallery.className = 'dd-gallery';
      for (const d of GALLERY) {
        const {svg} = mountBox(d.spec, {onNavigate});
        svg.setAttribute('class', 'dd-svg');
        gallery.appendChild(fig(d.caption, svg));
      }
      canvas.appendChild(gallery);
      break;
    }
    case 'connectors': {
      const explainer = createExplainer();
      buildConnectorDemos(canvas, {onNavigate, attach: explainer.attach});
      break;
    }
    case 'packages':
      buildPackageDemos(canvas, {onNavigate});
      break;
    case 'playground':
      mountPlayground(canvas, onNavigate);
      break;
    default:
      canvas.textContent = 'Unknown diagram: ' + kind;
  }
}

/* live element-box editor: edit the JSON spec, the box redraws */
function mountPlayground(canvas, onNavigate) {
  const src = canvas.querySelector('[data-dd-pg-src]');
  const err = canvas.querySelector('[data-dd-pg-err]');
  const out = canvas.querySelector('[data-dd-pg-out]');
  const presetsBar = canvas.querySelector('[data-dd-pg-presets]');
  if (!src || !out) return;
  const byName = (n) => (GALLERY.find(d => d.spec.name === n) || {}).spec;
  const presets = {
    Vehicle: VEHICLE,
    Minimal: byName('cylinders[6]'),
    'Five sections': byName('FlightComputer'),
    'Status slots': byName('Actuator'),
    Stress: GALLERY[GALLERY.length - 1].spec
  };
  let svg = el('svg', {class: 'dd-svg', role: 'img'});
  out.appendChild(svg);

  const render = () => {
    let spec;
    try { spec = JSON.parse(src.value); err.textContent = ''; }
    catch (e) { err.textContent = 'JSON: ' + e.message; return; }
    try {
      const {node, layout} = renderElementBox(spec, {
        onToggle: (c) => { spec.collapsed = c; src.value = JSON.stringify(spec, null, 2); render(); },
        onNavigate
      });
      const m = 6;
      const ns = el('svg', {
        class: 'dd-svg', viewBox: (-m) + ' ' + (-m) + ' ' + (layout.width + 2 * m) + ' ' + (layout.height + 2 * m),
        width: layout.width + 2 * m, height: layout.height + 2 * m, role: 'img'
      });
      ns.appendChild(node);
      svg.replaceWith(ns);
      svg = ns;
      err.textContent = (layout.badgeInvalid && layout.badgeInvalid.length)
        ? 'status slots: ' + layout.badgeInvalid.join(' · ') : '';
    } catch (e) { err.textContent = 'spec: ' + e.message; }
  };

  for (const name in presets) {
    if (!presets[name]) continue;
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = name;
    b.addEventListener('click', () => { src.value = JSON.stringify(presets[name], null, 2); render(); });
    presetsBar && presetsBar.appendChild(b);
  }
  let deb;
  src.addEventListener('input', () => { clearTimeout(deb); deb = setTimeout(render, 250); });
  src.value = JSON.stringify(VEHICLE, null, 2);
  render();
}

function wireToolbar(figure, canvas) {
  const buttons = figure.querySelectorAll('[data-dd-theme]');
  if (!buttons.length) return;
  const set = (brand) => {
    canvas.classList.toggle('eb-brand', brand);
    canvas.classList.toggle('eb-plain', !brand);
    buttons.forEach(b => b.classList.toggle('on', (b.getAttribute('data-dd-theme') === 'brand') === brand));
  };
  buttons.forEach(b => b.addEventListener('click', () => set(b.getAttribute('data-dd-theme') === 'brand')));
}

function mountAll() {
  document.querySelectorAll('[data-deal-diagram]').forEach((canvas) => {
    if (canvas.dataset.mounted) return;
    canvas.dataset.mounted = '1';
    mountDiagram(canvas, canvas.dataset.kind);
    const figure = canvas.closest('.deal-diagram');
    if (figure) wireToolbar(figure, canvas);
  });
}

export function initDealDiagrams() {
  if (typeof document === 'undefined') return;
  // Defer the first measurement until the diagram font has loaded, so box widths
  // size to Inter rather than a fallback. Cap the wait so we always render.
  if (document.fonts && document.fonts.ready) {
    Promise.race([
      document.fonts.ready,
      new Promise((r) => setTimeout(r, 800))
    ]).then(mountAll);
  } else {
    mountAll();
  }
}
