"use strict";
/* ============================================================================
 * example-view.js — the composed "EVPlatform · Propulsion" hero diagram.
 *
 * The redraw() composition lifted from the standalone Example View mockup: a
 * package frame containing element boxes (with status badges) wired by typed
 * connectors and ports. Fold state and the slid label position are local to the
 * mount (the .dealview tool-managed block in the real viewer). A live Validate
 * line under the diagram demonstrates the planned status/debug surface.
 * ==========================================================================*/

import { el, FONT_FAMILY, SVGNS } from './core.js';
import { renderElementBox } from './element-box.js';
import { renderConnector, renderPort, computeCrossingHops, CN_TOKENS } from './connector.js';
import { renderPackage } from './package.js';
import { createExplainer } from './explainer.js';

export function mountExampleView(root, opts) {
  const o = opts || {};
  const onNavigate = o.onNavigate || (() => {});
  const explainer = createExplainer();

  const svg = el('svg', {
    xmlns: SVGNS, viewBox: '0 0 1100 700', class: 'dd-svg dd-example',
    preserveAspectRatio: 'xMidYMin meet', role: 'img',
    'aria-label': 'EVPlatform Propulsion interconnection view'
  });
  root.appendChild(svg);
  const view = svg;

  // live status/debug line (the viewer surfaces diagnostics here)
  const status = document.createElement('div');
  status.className = 'dd-status';
  root.appendChild(status);

  const NAV = (ref) => {
    status.textContent = '→ goto: ' + ref + '  (the viewer resolves this to its .deal/.dealx source and opens the editor)';
    onNavigate(ref);
  };

  // persistent representation state — fold states + the slid label position.
  const state = {
    collapsed: {battery: true, inverter: false, motor: false, gearbox: false, req: false, idef: false},
    satisfyAt: null
  };

  const _mctx = document.createElement('canvas').getContext('2d');
  _mctx.font = '400 11px ' + FONT_FAMILY;   // name labels are plain upright
  const gapHV = Math.ceil(_mctx.measureText('HVDCCable').width + 24 + 28 + 18 + 16);

  function redraw() {
    view.replaceChildren();
    const VC = [];

    const frame = renderPackage({name: 'EVPlatform::Propulsion — Interconnection View', namePlacement: 'tab',
      minWidth: 1080, minHeight: 660, ref: 'model::EVPlatform::Propulsion'}, {maxWidth: 1080, onNavigate: NAV});
    {
      const w = el('g', {transform: 'translate(10, 10)'});
      w.appendChild(frame.node);
      view.appendChild(w);
    }

    function place(key, spec, x, y) {
      spec.collapsed = state.collapsed[key];
      const r = renderElementBox(spec, {onNavigate: NAV,
        onToggle: (c) => { state.collapsed[key] = c; redraw(); }});
      const w = el('g', {transform: 'translate(' + x + ',' + y + ')'});
      w.appendChild(r.node);
      view.appendChild(w);
      return {x, y, w: r.layout.width, h: r.layout.height};
    }

    const Y0 = 110;
    const bat = place('battery', {keyword: 'part', name: 'battery : BatteryPack',
      badges: {diagnostics: {warnings: 1}}, ref: 'model::EVPlatform::EnergyStorage::battery',
      compartments: [{title: 'attributes', items: [
        {text: 'totalCapacity = kWh(89)', ref: 'model::…::battery::totalCapacity'},
        'nominalVoltage = V(800)', 'packMass = kg(550)']}]}, 56, Y0);
    const inv = place('inverter', {keyword: 'part', name: 'inverter : Inverter',
      badges: {verification: 'pass'}, ref: 'model::EVPlatform::Propulsion::inverter',
      compartments: [{title: 'attributes', items: [
        {text: 'peakPower = kW(270)', ref: 'vehicle.components::Inverter::peakPower'},
        'efficiency = 0.97', 'mass = kg(12)']}]}, bat.x + bat.w + gapHV, Y0);
    const mot = place('motor', {keyword: 'part', name: 'motor : TractionMotor',
      badges: {verification: 'pass', diagnostics: {warnings: 1}},
      ref: 'model::EVPlatform::Propulsion::motor',
      compartments: [{title: 'attributes', items: [
        {text: 'peakPower = kW(250)', ref: 'vehicle.motor::TractionMotor::peakPower'},
        'peakTorque = Nm(430)', 'maxSpeed = rpm(16000)']}]}, inv.x + inv.w + gapHV + 14, Y0);
    const req = place('req', {keyword: 'requirement def', name: 'REQ_MOT_001',
      badges: {verification: 'unverified'}, ref: 'requirements.system::REQ_MOT_001',
      compartments: [
        {title: 'doc', items: ['"…minimum peak power of 250 kW."']},
        {title: 'verification', items: ['accepts: [simulation, test]', 'minPeakPower >= kW(250)']}]}, 92, 430);
    const idef = place('idef', {keyword: 'part def', name: 'Inverter',
      ref: 'vehicle.components::Inverter',
      compartments: [{title: 'ports', items: [
        {text: 'in dcIn : HVDCPort', ref: 'vehicle.components::Inverter::dcIn'},
        {text: 'out acOut : HVDCPort', ref: 'vehicle.components::Inverter::acOut'}]}]},
      req.x + req.w + 56, 430);
    const gearSpec = {keyword: 'part', name: 'gearbox : ReductionGear',
      badges: {verification: 'pass'}, ref: 'model::EVPlatform::Propulsion::gearbox',
      compartments: [{title: 'attributes', items: ['ratio = 9.0', 'efficiency = 0.98']}]};
    const shaftX = mot.x + mot.w - 46;
    gearSpec.collapsed = state.collapsed.gearbox;
    const gearR = renderElementBox(gearSpec, {onNavigate: NAV,
      onToggle: (c) => { state.collapsed.gearbox = c; redraw(); }});
    const gear = {x: Math.round(shaftX - gearR.layout.width / 2), y: 430,
                  w: gearR.layout.width, h: gearR.layout.height};
    {
      const w = el('g', {transform: 'translate(' + gear.x + ',' + gear.y + ')'});
      w.appendChild(gearR.node);
      view.appendChild(w);
    }

    // ports — cy clamped ≥17px from corners, shared per connected pair so
    // port-to-port connects stay zero-bend even with one end folded
    const cyA = Y0 + Math.min(64, bat.h - 17, inv.h - 17);   // battery ↔ inverter
    const cyB = Y0 + Math.min(64, inv.h - 17, mot.h - 17);   // inverter ↔ motor
    function port(cx, cy, side, dir, name, ref) {
      view.appendChild(renderPort({cx, cy, side, direction: dir, name, ref}, {onNavigate: NAV}).node);
    }
    port(bat.x + bat.w, cyA, 'E', 'out', 'hvOut', 'model::…::battery::hvOut');
    port(inv.x, cyA, 'W', 'in', 'dcIn', 'model::…::inverter::dcIn');
    port(inv.x + inv.w, cyB, 'E', 'out', 'acOut', 'model::…::inverter::acOut');
    port(mot.x, cyB, 'W', 'in', 'powerIn', 'model::…::motor::powerIn');
    port(shaftX, mot.y + mot.h, 'S', 'out', 'shaftOut', 'model::…::motor::shaftOut');
    port(shaftX, gear.y, 'N', 'in', 'input', 'model::…::gearbox::input');

    function conn(spec, copts) {
      const r = renderConnector(spec, Object.assign({onNavigate: NAV}, copts || {}));
      explainer.attach(r.node, spec);
      view.appendChild(r.node);
      VC.push({kind: spec.kind, ref: spec.ref, points: spec.points, invalid: r.layout.invalid || []});
      return r;
    }
    conn({kind: 'connect', label: 'HVDCCable',
      source: {name: 'battery.hvOut', kind: 'port'}, target: {name: 'inverter.dcIn', kind: 'port'},
      points: [{x: bat.x + bat.w + 9, y: cyA}, {x: inv.x - 9, y: cyA}],
      ref: 'model~connect[battery.hvOut → inverter.dcIn via HVDCCable]'});
    conn({kind: 'connect', label: 'HVDCCable',
      source: {name: 'inverter.acOut', kind: 'port'}, target: {name: 'motor.powerIn', kind: 'port'},
      points: [{x: inv.x + inv.w + 9, y: cyB}, {x: mot.x - 9, y: cyB}],
      ref: 'model~connect[inverter.acOut → motor.powerIn via HVDCCable]'});
    conn({kind: 'connect', label: 'DriveShaft',
      source: {name: 'motor.shaftOut', kind: 'port'}, target: {name: 'gearbox.input', kind: 'port'},
      points: [{x: shaftX, y: mot.y + mot.h + 9}, {x: shaftX, y: gear.y - 9}],
      ref: 'model~connect[motor.shaftOut → gearbox.input via DriveShaft]'});
    const dbX = Math.max(idef.x + 16, Math.min(idef.x + idef.w - 16,
                Math.max(inv.x + 16, Math.min(inv.x + inv.w - 16, inv.x + 70))));
    conn({kind: 'definedBy',
      source: {name: 'inverter', kind: 'part'}, target: {name: 'Inverter', kind: 'part def'},
      points: [{x: dbX, y: inv.y + inv.h}, {x: dbX, y: 430}],
      ref: 'model::…::inverter~definedBy[Inverter]'});
    let wy = mot.y + mot.h - 24;
    if (Math.abs(wy - cyB) < 26) wy = mot.y + 20;   // stay clear of the powerIn port when folded
    const xCorr = Math.min(mot.x - 16, Math.max(inv.x + inv.w + 24, idef.x + idef.w + 16));
    const satY = Math.max(req.y + req.h, idef.y + idef.h, gear.y + gear.h) + 36;   // clears the bottom row in any fold state
    conn({kind: 'association', label: '«satisfy»', labelAt: state.satisfyAt,
      source: {name: 'motor', kind: 'part'}, target: {name: 'REQ_MOT_001', kind: 'requirement'},
      points: [{x: mot.x, y: wy}, {x: xCorr, y: wy}, {x: xCorr, y: satY},
               {x: req.x + Math.round(req.w / 2), y: satY},
               {x: req.x + Math.round(req.w / 2), y: req.y + req.h}],
      ref: 'traceability~satisfy[motor → REQ_MOT_001]'},
      {onLabelSlide: (t, phase) => {
        state.satisfyAt = t;
        redraw();
        status.textContent = '«satisfy» label moved to ' + t.toFixed(3) +
          (phase === 'commit' ? '  → saved to the view' : '  (dragging…)');
      }});

    // runtime Validate pass — re-runs after every fold/slide, on real metrics
    const rects = [bat, inv, mot, req, idef, gear];
    const probs = [];
    for (const c of VC) probs.push(...c.invalid);
    const segHits = (a, b, r) => a.x === b.x
      ? (a.x > r.x && a.x < r.x + r.w && Math.max(a.y, b.y) > r.y && Math.min(a.y, b.y) < r.y + r.h)
      : (a.y > r.y && a.y < r.y + r.h && Math.max(a.x, b.x) > r.x && Math.min(a.x, b.x) < r.x + r.w);
    for (const c of VC)
      for (let i = 1; i < c.points.length; i++)
        for (const r of rects)
          if (segHits(c.points[i - 1], c.points[i], r))
            probs.push('"' + (c.ref || c.kind) + '" crosses an element box');
    probs.push(...computeCrossingHops(VC.map(c => c.points), CN_TOKENS).diagnostics);
    status.textContent = probs.length
      ? '⚠ ' + probs.length + ' issue' + (probs.length > 1 ? 's' : '') + ': ' + probs.join(' · ')
      : '✓ checks pass — no crossings, approaches and lengths valid (re-checked live on every fold/drag)';
  }
  redraw();

  // notation theme is a class on `root` (driven by the toolbar); paint, never geometry.
  return {
    setTheme(brand) {
      root.classList.toggle('eb-brand', brand);
      root.classList.toggle('eb-plain', !brand);
    }
  };
}
