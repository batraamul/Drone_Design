/**
 * Stratospheric Sounding Laboratory: balloon-launched glide-sonde mission.
 * Ascent to the release altitude (default 33 km AGL) → release, stall and pull-out →
 * unpowered glide with sonde sampling → hybrid powered stage. Simulation only.
 * Data: project.modules.sounding. Model: js/engineering/sounding.js.
 */
import { h, debounce } from '../utils/dom.js';
import { icon } from '../ui/icons.js';
import { badge, button, card, checkCard, derivedList, emptyState, field, formatQuantity, nextId, pageHeader, provenanceBadge, quantityInput, selectControl } from '../ui/components.js';
import { BALLOON_CATALOGUE, GASES, SOUNDING_FIELDS, parseTawhiri, tawhiriQuery, trackToKml } from '../engineering/sounding.js';
import { lineChart } from '../visualisation/plots.js';
import { flowBar } from '../ui/design-flow.js';

/** Inputs for analyseSounding() from the project's own design (mass, wing, battery). */
export function soundingInputs(sounding, propulsion, geometry, aeroModel = null) {
  const wing = geometry?.wing ? { area: (geometry.wing.span * (geometry.wing.rootChord + geometry.wing.tipChord)) / 2, span: geometry.wing.span, mac: geometry.wing.mac, aero: aeroModel ?? null } : null;
  const battery = propulsion?.battery ? { energy: propulsion.battery.usableEnergy, avionicsPower: propulsion.avionicsPower ?? 0 } : null;
  return { sounding, designMass: propulsion?.mass?.total ?? null, designWing: wing, battery };
}

const path = (...keys) => ['modules', 'sounding', ...keys];

/** "Suggest a balloon": the smallest example balloon that reaches release with ≥ 3 km burst margin. */
function suggestButton(ctx) {
  return button({
    label: 'Suggest a balloon for this aircraft',
    icon: 'balloon',
    size: 'sm',
    onClick: async () => {
      const { suggestBalloon } = await import('../engineering/templates.js');
      const s = ctx.store.doc.modules.sounding;
      const r = ctx.engineering.sounding();
      const mass = r?.mass ?? ctx.engineering.propulsion()?.mass?.total ?? s.params.payloadMass;
      const pick = suggestBalloon(s.params, mass, s.gas);
      if (!pick) {
        ctx.notify({ level: 'warning', title: 'No example balloon is big enough', message: `None of the example balloons reaches ${(s.params.releaseAltitude / 1000).toFixed(0)} km with a 3 km burst margin for ${mass.toFixed(2)} kg. Lower the release altitude, reduce free lift or mass, or enter a larger balloon’s datasheet values.` });
        return;
      }
      const b = pick.balloon;
      ctx.store.transact(`Choose ${b.name}`, (set) => {
        set(path('balloon'), { name: b.name, catalogueId: b.catalogueId, provenance: 'illustrative', source: '' });
        set(path('params', 'balloonMass'), b.specs.mass);
        set(path('params', 'burstDiameter'), b.specs.burstDiameter);
      });
      ctx.notify({ level: 'success', title: `${b.name} selected`, message: pick.ascent.burstAltitude === null ? 'It does not reach its burst diameter within the modelled atmosphere.' : `Predicted burst ${((pick.ascent.burstAltitude - s.params.launchElevation) / 1000).toFixed(1)} km above ground, ${((pick.ascent.burstAltitude - pick.ascent.releaseAltitudeAMSL) / 1000).toFixed(1)} km above release.` });
    },
  });
}

function paramRow(ctx, key, provenance = 'user-input') {
  const { store, prefs } = ctx;
  const f = SOUNDING_FIELDS[key];
  const id = nextId('sd');
  const control = quantityInput({
    id,
    label: f.label,
    siUnit: f.unit,
    units: f.displayUnits,
    unit: prefs.displayUnit(`snd.${key}`, f.displayUnits[0]),
    valueSI: store.doc.modules.sounding.params[key],
    validate: (si) => (si === null ? 'A value is required' : si < f.min || si > f.max ? `Must be between ${f.min} and ${f.max} ${f.unit}` : null),
    onCommit: (si) => store.set(path('params', key), si, { label: `Set ${f.label}` }),
    onUnitChange: (u) => prefs.setDisplayUnit(`snd.${key}`, u),
  });
  return { key, control, element: h('div', { class: 'requirement', dataset: { field: key } }, field({ id, label: `${f.label} (${f.symbol})`, control: control.element, hint: f.help }), h('span', { class: 'requirement__badge' }, provenanceBadge(provenance))) };
}

function toggle(ctx, label, value, onChange, hint) {
  const id = nextId('tg');
  const box = h('input', { id, type: 'checkbox', class: 'switch', checked: Boolean(value) });
  box.addEventListener('change', () => onChange(box.checked));
  return h('div', { class: 'field' }, h('label', { class: 'switch-row', for: id }, box, h('span', null, label)), hint ? h('p', { class: 'field__hint' }, hint) : null);
}

function profileChart(result) {
  const pts = [];
  const z0 = result.ascent.points[0]?.z ?? 0;
  for (const p of result.ascent.points) pts.push([p.t / 3600, (p.z - z0) / 1000]);
  const t0 = result.ascent.timeToRelease;
  for (const p of result.glide?.points ?? []) pts.push([(t0 + p.t) / 3600, (p.h - z0) / 1000]);
  const powered = result.powered;
  if (powered && powered.time > 0 && result.glide) {
    const tStart = t0 + result.glide.time;
    const zEnd = (result.glide.end.h - z0) / 1000;
    pts.push([tStart / 3600, zEnd], [(tStart + powered.time) / 3600, zEnd], [(tStart + powered.time) / 3600 + 0.05, 0]);
  }
  return lineChart({ points: pts, marker: [t0 / 3600, (result.ascent.releaseAltitudeAMSL - z0) / 1000], width: 520, height: 280, title: 'Mission altitude profile', description: 'Altitude above ground versus time: balloon ascent, release and pull-out, glide, powered stage. Marker: release.', xLabel: 'Time (h)', yLabel: 'Altitude AGL (km)' });
}

function stagesTable(result) {
  return h(
    'table',
    { class: 'table table--compact stages-table' },
    h('thead', null, h('tr', null, h('th', null, 'Stage'), h('th', null, 'Duration'), h('th', null, 'Altitude (AGL)'), h('th', null, 'Distance (still air)'))),
    h(
      'tbody',
      null,
      result.stages.map((st, i) => {
        const z0 = result.stages[0].from;
        return h(
          'tr',
          { dataset: { stage: st.id } },
          h('th', { scope: 'row' }, `${i + 1}. ${st.name}`),
          h('td', { class: 'mono' }, formatQuantity(st.duration, 's', st.duration > 3600 ? 'h' : 'min', { digits: 3 })),
          h('td', { class: 'mono' }, `${((st.from - z0) / 1000).toFixed(1)} → ${((st.to - z0) / 1000).toFixed(1)} km`),
          h('td', { class: 'mono' }, formatQuantity(st.range, 'm', 'km', { digits: 3 })),
        );
      }),
    ),
  );
}

function predictionCard(ctx, result) {
  const { store } = ctx;
  const site = store.doc.modules.sounding.site;
  const latId = nextId('lat');
  const lonId = nextId('lon');
  const timeId = nextId('dt');
  const lat = h('input', { id: latId, class: 'input input--number', type: 'number', step: 'any', min: -90, max: 90, value: site.latitude });
  const lon = h('input', { id: lonId, class: 'input input--number', type: 'number', step: 'any', min: -180, max: 180, value: site.longitude });
  const soon = new Date(Date.now() + 3 * 3600 * 1000);
  soon.setUTCMinutes(0, 0, 0);
  const when = h('input', { id: timeId, class: 'input', type: 'datetime-local', value: soon.toISOString().slice(0, 16) });
  const out = h('div', { class: 'stack', 'aria-live': 'polite' });
  const saveSite = () => {
    const la = Number(lat.value);
    const lo = Number(lon.value);
    if (Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180) store.set(path('site'), { latitude: la, longitude: lo }, { label: 'Set launch site' });
  };
  lat.addEventListener('change', saveSite);
  lon.addEventListener('change', saveSite);
  const run = button({
    label: 'Predict balloon drift (online)',
    icon: 'route',
    variant: 'primary',
    onClick: async () => {
      if (!navigator.onLine) return out.replaceChildren(h('p', { class: 'field__error' }, 'You are offline. The wind prediction needs the internet; the rest of this page works offline.'));
      const url = tawhiriQuery({ latitude: Number(lat.value), longitude: Number(lon.value), elevation: store.doc.modules.sounding.params.launchElevation, datetime: `${when.value}:00Z`, ascentRate: result.ascent.meanRate, releaseAltitudeAMSL: result.ascent.releaseAltitudeAMSL });
      out.replaceChildren(h('p', { class: 'muted' }, 'Asking the SondeHub prediction service (GFS forecast winds)…'));
      try {
        const response = await fetch(url, { headers: { Accept: 'application/json' } });
        const json = await response.json();
        if (!response.ok) throw new Error(json?.error?.description ?? `Service answered ${response.status}`);
        const track = parseTawhiri(json);
        const first = track[0];
        const last = track.at(-1);
        const R = 6371000;
        const toRad = (d) => (d * Math.PI) / 180;
        const dLat = toRad(last.lat - first.lat);
        const dLon = toRad(last.lon - first.lon);
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(first.lat)) * Math.cos(toRad(last.lat)) * Math.sin(dLon / 2) ** 2;
        const drift = 2 * R * Math.asin(Math.sqrt(a));
        const kml = trackToKml(track, `${store.doc.name} — balloon ascent`);
        const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
        const href = URL.createObjectURL(blob);
        out.replaceChildren(
          h('dl', { class: 'kv' }, h('div', { class: 'kv__row' }, h('dt', null, 'Predicted release point'), h('dd', { class: 'mono' }, `${last.lat.toFixed(4)}°, ${last.lon.toFixed(4)}° at ${(last.alt / 1000).toFixed(1)} km`)), h('div', { class: 'kv__row' }, h('dt', null, 'Drift from launch during ascent'), h('dd', { class: 'mono' }, `${(drift / 1000).toFixed(1)} km`)), h('div', { class: 'kv__row' }, h('dt', null, 'Release time (UTC)'), h('dd', { class: 'mono' }, last.time))),
          h('div', { class: 'button-row' }, h('a', { class: 'btn btn--sm', href, download: `${store.doc.name.replace(/[^\w-]+/g, '_')}_ascent.kml` }, 'Download KML (Google Earth, QGIS)'), h('a', { class: 'btn btn--sm', href: `https://predict.sondehub.org/?${url.split('?')[1]}`, target: '_blank', rel: 'noopener' }, 'Open in SondeHub predictor')),
          h('p', { class: 'muted' }, 'Source: SondeHub instance of the Tawhiri predictor (NOAA GFS winds), for non-commercial use. A forecast, not a guarantee: plan recovery areas with margin and follow airspace rules.'),
        );
        ctx.log.info('sounding', `Ascent prediction: release ${last.lat.toFixed(3)}, ${last.lon.toFixed(3)}; drift ${(drift / 1000).toFixed(1)} km`);
      } catch (error) {
        out.replaceChildren(h('p', { class: 'field__error' }, `Prediction failed: ${error.message}. The service may be busy; try again later.`));
      }
    },
  });
  return card({
    title: 'Where will the balloon take it? (wind-aware, online)',
    icon: 'route',
    class: 'span-2',
    description: 'Uses the open Tawhiri predictor with forecast winds to find the release point. The glide that follows is not part of the prediction.',
    body: h('div', { class: 'stack' }, h('div', { class: 'requirement-list requirement-list--compact' }, field({ id: latId, label: 'Launch latitude (°)', control: lat }), field({ id: lonId, label: 'Launch longitude (°)', control: lon }), field({ id: timeId, label: 'Launch time (UTC)', control: when })), h('div', null, run), out),
  });
}

export async function mount(container, ctx) {
  const { store } = ctx;
  let rows = [];
  let results = null;
  let key = null;
  const header = () => pageHeader({ title: 'Stratospheric Sounding Lab: Balloon & Glide-Sonde', icon: 'balloon', subtitle: 'Carry the aircraft to the stratosphere on a balloon, release it, recover from the stall, glide down sampling the atmosphere, then fly home under power.', badges: [badge('Build 13 · early', 'neutral')] });
  const structure = () => {
    const s = store.doc?.modules?.sounding;
    return s ? [s.enabled, s.useDesignMass, s.useDesignWing, s.balloon.catalogueId, s.gas, store.doc.modules.configuration?.layout].join('|') : 'none';
  };

  const renderResults = () => {
    if (!results) return;
    const r = ctx.engineering.sounding();
    if (!r) return results.replaceChildren();
    results.replaceChildren(
      card({ title: 'Mission at a glance', icon: 'balloon', class: 'span-2', body: h('div', { class: 'stack' }, profileChart(r), stagesTable(r), h('p', { class: 'muted' }, `Aircraft mass ${r.mass.toFixed(2)} kg · wing ${r.wing.area.toFixed(3)} m², span ${r.wing.span.toFixed(2)} m · total mission ${(r.totalTime / 3600).toFixed(1)} h.`)) }),
      card({
        title: 'Checks and calculations',
        icon: 'checkCircle',
        class: 'span-2',
        body: h('div', { class: 'stack' }, r.checks.length ? h('div', { class: 'check-list' }, r.checks.map((c) => checkCard(c, ctx.prefs))) : h('p', { class: 'inspector__ok' }, icon('checkCircle', { size: 16 }), 'No mission problems found.'), r.notes.length ? h('ul', { class: 'scope-list' }, r.notes.map((n) => h('li', null, n))) : null, derivedList(r.derived, ctx.prefs)),
      }),
      predictionCard(ctx, r),
    );
  };

  const build = () => {
    key = structure();
    rows = [];
    results = null;
    const doc = store.doc;
    if (!doc) {
      container.replaceChildren(header(), flowBar(ctx, 'sounding'), emptyState({ icon: 'balloon', title: 'Open a project first', message: 'The mission uses the project’s aircraft mass, wing and battery.', actions: [button({ label: 'New project', icon: 'plus', variant: 'primary', onClick: () => ctx.actions.newProject() })] }));
      return;
    }
    const s = doc.modules.sounding;
    const enable = toggle(ctx, 'Plan a balloon-launched glide-sonde mission for this design', s.enabled, (v) => store.set(path('enabled'), v, { label: v ? 'Enable balloon mission' : 'Disable balloon mission', coalesce: false }), 'When on, the mission checks join the design review and the summary.');
    if (!s.enabled) {
      container.replaceChildren(
        header(),
        flowBar(ctx, 'sounding'),
        card({ title: 'Balloon-launched glide-sonde', icon: 'balloon', body: h('div', { class: 'stack' }, h('p', null, 'A latex balloon lifts the aircraft to the release altitude (33 km above ground by default). It is released nose-down with almost no airspeed, so it first falls like a stone (the stall phase) until the airspeed is high enough to pull out. It then glides down at its best lift-to-drag ratio while its sensors sample temperature, humidity, pressure and wind. Below a switch altitude the motor starts (hybrid stage) to fly it back for recovery.'), enable) }),
      );
      return;
    }
    const balloonId = nextId('bl');
    const balloonSelect = selectControl({
      id: balloonId,
      options: [...BALLOON_CATALOGUE.map((b) => ({ value: b.catalogueId, label: b.name })), { value: '', label: 'My own balloon (datasheet values)' }],
      value: s.balloon.catalogueId ?? '',
      onChange: (v) => {
        const b = BALLOON_CATALOGUE.find((x) => x.catalogueId === v);
        store.transact(b ? `Choose ${b.name}` : 'Use my own balloon', (set) => {
          set(path('balloon'), b ? { name: b.name, catalogueId: b.catalogueId, provenance: 'illustrative', source: '' } : { name: 'My balloon', catalogueId: null, provenance: 'datasheet', source: '' });
          if (b) {
            set(path('params', 'balloonMass'), b.specs.mass);
            set(path('params', 'burstDiameter'), b.specs.burstDiameter);
          }
        });
      },
    });
    const gasId = nextId('gs');
    const gasSelect = selectControl({ id: gasId, options: Object.entries(GASES).map(([id, g]) => ({ value: id, label: g.label })), value: s.gas, onChange: (v) => store.set(path('gas'), v, { label: 'Choose lifting gas' }) });
    const balloonRows = ['launchElevation', 'releaseAltitude', 'balloonMass', 'burstDiameter', 'freeLift', 'trainMass', 'balloonCd'].map((k) => paramRow(ctx, k, k === 'balloonMass' || k === 'burstDiameter' ? s.balloon.provenance : k === 'balloonCd' ? 'conceptual-estimate' : 'user-input'));
    const geo = ctx.engineering.geometry();
    const aircraftRows = [...(s.useDesignMass ? [] : ['payloadMass']), ...(s.useDesignWing && geo?.wing ? [] : ['wingArea', 'wingSpan']), ...(s.useDesignWing && geo?.wing ? [] : ['cd0', 'oswald', 'clMax']), 'maxLoadFactor'].map((k) => paramRow(ctx, k, ['cd0', 'oswald', 'clMax'].includes(k) ? 'conceptual-estimate' : 'user-input'));
    const sondeRows = ['sampleInterval', 'hybridAltitude', 'poweredLD', 'poweredEfficiency'].map((k) => paramRow(ctx, k, k === 'poweredLD' || k === 'poweredEfficiency' ? 'conceptual-estimate' : 'user-input'));
    rows = [...balloonRows, ...aircraftRows, ...sondeRows];
    results = h('div', { class: 'page-grid span-2 results-grid' });
    container.replaceChildren(
      header(),
      flowBar(ctx, 'sounding'),
      h('div', { class: 'notice notice--info', role: 'note' }, icon('info', { size: 18 }), h('p', null, 'Simulation for research planning. Balloon launches need airspace clearance from the aviation authority (in India, the DGCA and the air navigation service provider) and a recovery plan. Nothing here controls real hardware.')),
      enable,
      h(
        'div',
        { class: 'page-grid sounding-grid' },
        card({ title: '1. Balloon and ascent', icon: 'balloon', body: h('div', { class: 'stack' }, h('div', { class: 'requirement-list' }, field({ id: balloonId, label: 'Balloon', control: balloonSelect, hint: 'Example balloons are illustrative; use your balloon’s datasheet (mass and burst diameter).' }), field({ id: gasId, label: 'Lifting gas', control: gasSelect })), suggestButton(ctx), h('div', { class: 'requirement-list' }, balloonRows.map((r) => r.element))) }),
        card({
          title: '2–3. Aircraft: release, pull-out and glide',
          icon: 'fixedWing',
          body: h(
            'div',
            { class: 'stack' },
            toggle(ctx, 'Use the mass from the Propulsion & Energy mass budget', s.useDesignMass, (v) => store.set(path('useDesignMass'), v, { label: 'Toggle design mass' })),
            toggle(ctx, geo?.wing ? 'Use the wing from Drone Architecture' : 'Use the wing from Drone Architecture (this layout has no wing — enter one)', s.useDesignWing && Boolean(geo?.wing), (v) => store.set(path('useDesignWing'), v, { label: 'Toggle design wing' })),
            h('div', { class: 'requirement-list' }, aircraftRows.map((r) => r.element)),
          ),
        }),
        card({ title: '4. Sonde sampling and hybrid powered stage', icon: 'lightning', body: h('div', { class: 'requirement-list' }, sondeRows.map((r) => r.element)) }),
        results,
      ),
    );
    renderResults();
  };

  const refresh = debounce(renderResults, 150);
  build();
  const offs = [
    store.on('change', ({ undo, redo }) => {
      if (structure() !== key) return build();
      if (undo || redo) for (const r of rows) r.control.update(store.doc.modules.sounding.params[r.key], { force: true });
      refresh();
    }),
    store.on('load', () => build()),
  ];
  return () => offs.forEach((off) => off());
}
