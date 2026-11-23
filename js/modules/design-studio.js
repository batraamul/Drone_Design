/**
 * 3D Design Studio (Build 2, first part): interactive 3D conceptual model built from
 * the project geometry, with the same parameter form as Drone Architecture beside it,
 * so every change updates the shared model, the drawings and the review.
 * Falls back to the 2D drawings when WebGL is unavailable.
 */
import { h } from '../utils/dom.js';
import { icon } from '../ui/icons.js';
import { badge, button, card, emptyState, pageHeader } from '../ui/components.js';
import { layoutInfo } from '../engineering/configuration.js';
import { VIEW_LABELS, drawView } from '../visualisation/views2d.js';
import { createViewer, webglAvailable } from '../visualisation/view3d.js';
import { parameterForm } from './architecture.js';
import { flowBar } from '../ui/design-flow.js';

const STANDARD_VIEWS = [
  ['iso', 'Perspective'],
  ['top', 'Top'],
  ['front', 'Front'],
  ['side', 'Side'],
];

export async function mount(container, ctx) {
  const { store, log } = ctx;
  let viewer = null;
  let form = null;
  let stage = null;
  let fallback = null;
  let renderedLayout = null;
  let destroyed = false;

  const header = () =>
    pageHeader({
      title: '3D Design Studio',
      icon: 'cube',
      subtitle: 'Rotate, pan and zoom a conceptual 3D model of your design. Change a dimension and the model, drawings and review follow.',
      badges: [badge('Build 2', 'neutral')],
    });

  const teardown = () => {
    viewer?.destroy();
    viewer = null;
  };

  const build = async () => {
    teardown();
    form = null;
    stage = null;
    fallback = null;
    const doc = store.doc;
    renderedLayout = doc?.modules?.configuration?.layout ?? null;
    if (!doc) {
      container.replaceChildren(
        header(),
        flowBar(ctx, 'design-studio'),
        emptyState({
          icon: 'cube',
          title: 'Open a project to see it in 3D',
          message: 'The 3D model is built from the project’s layout and dimensions.',
          actions: [button({ label: 'New project', icon: 'plus', variant: 'primary', onClick: () => ctx.actions.newProject() }), button({ label: 'All projects', onClick: () => ctx.router.navigate('projects') })],
        }),
      );
      return;
    }
    const layout = layoutInfo(renderedLayout);
    const geo = ctx.engineering.geometry();
    if (!layout || layout.category !== doc.category || !geo) {
      container.replaceChildren(
        header(),
        h(
          'div',
          { class: 'notice notice--info', role: 'note' },
          icon('info', { size: 18 }),
          h('p', null, !layout || layout.category !== doc.category ? 'Choose a layout for this project in Drone Architecture first.' : `${layout.label}: no geometry model exists for this layout yet, so there is nothing to show in 3D.`),
        ),
        h('p', null, button({ label: 'Open Drone Architecture', icon: 'multirotor', variant: 'primary', onClick: () => ctx.router.navigate('architecture') })),
      );
      return;
    }

    stage = h('div', { class: 'view3d', dataset: { testid: 'view3d' } });
    const viewButtons = h(
      'div',
      { class: 'segmented', role: 'group', 'aria-label': 'Standard views' },
      STANDARD_VIEWS.map(([id, label]) => button({ label, size: 'sm', dataset: { view: id }, onClick: () => viewer?.setView(id) })),
    );
    const exportAs = async (format) => {
      if (!viewer) return ctx.notify({ level: 'warning', title: 'Export needs the 3D view', message: 'WebGL is unavailable in this browser.' });
      try {
        const blob = await viewer.exportModel(format);
        const link = h('a', { href: URL.createObjectURL(blob), download: `${store.doc.name.replace(/[^\w-]+/g, '_')}.${format === 'stl' ? 'stl' : 'glb'}` });
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 4000);
        ctx.log.info('3d', `Exported ${format.toUpperCase()} model`);
      } catch (error) {
        ctx.notify({ level: 'error', title: 'Export failed', message: error.message });
      }
    };
    const exports = h(
      'div',
      { class: 'button-row' },
      button({ label: 'Export STL (FreeCAD, OpenVSP, 3D printing)', icon: 'download', size: 'sm', onClick: () => exportAs('stl') }),
      button({ label: 'Export glTF (Blender)', icon: 'download', size: 'sm', onClick: () => exportAs('gltf') }),
    );
    const legend = h(
      'ul',
      { class: 'view3d__legend' },
      geo.wing ? h('li', null, h('span', { class: 'swatch swatch--surface' }), 'Wing, tail and fin') : null,
      geo.rotors.some((r) => r.role === 'lift') ? h('li', null, h('span', { class: 'swatch swatch--rotor' }), geo.family === 'multirotor' ? 'Rotor discs (props spin within these circles)' : 'Lift rotor discs') : null,
      geo.rotors.some((r) => r.role === 'cruise') ? h('li', null, h('span', { class: 'swatch swatch--cruise' }), 'Cruise propeller disc') : null,
    );
    form = parameterForm(ctx, doc, { title: 'Dimensions' });
    container.replaceChildren(
      header(),
      flowBar(ctx, 'design-studio'),
      h(
        'div',
        { class: 'page-grid studio-grid' },
        card({
          title: layout.label,
          icon: 'cube',
          class: 'span-2',
          actions: [viewButtons],
          description: 'Drag to rotate · right-drag (or two fingers) to pan · scroll or pinch to zoom. Conceptual shape only: surfaces are drawn flat, without aerofoil thickness.',
          body: h('div', { class: 'stack' }, stage, legend, exports, h('p', { class: 'muted' }, 'Exports are the conceptual shape in metres (z up, y forward, x to the right): a starting point for detailed CAD, not a manufacturing model.')),
        }),
        form.element,
      ),
    );

    if (!webglAvailable()) {
      showFallback('WebGL is not available in this browser, so the 3D model cannot be shown. The scale drawings below are generated from the same geometry.');
      return;
    }
    try {
      const created = await createViewer(stage);
      if (destroyed || !stage.isConnected) {
        created.destroy();
        return;
      }
      viewer = created;
      viewer.update(ctx.engineering.geometry());
    } catch (error) {
      log.warn('3d', `3D viewer unavailable: ${error.message}`);
      showFallback(`The 3D viewer could not start (${error.message}). The scale drawings below are generated from the same geometry.`);
    }
  };

  const showFallback = (message) => {
    fallback = h('div', { class: 'views2d' });
    stage.replaceChildren(h('div', { class: 'notice notice--info', role: 'note' }, icon('info', { size: 18 }), h('p', null, message)), fallback);
    stage.classList.add('view3d--fallback');
    renderFallback();
  };

  const renderFallback = () => {
    const geo = ctx.engineering.geometry();
    if (fallback && geo) fallback.replaceChildren(...['top', 'front', 'side'].map((view) => h('figure', { class: 'view2d-figure' }, drawView(geo, view), h('figcaption', null, VIEW_LABELS[view]))));
  };

  await build();
  const offs = [
    store.on('change', ({ undo, redo }) => {
      const doc = store.doc;
      if (!doc || doc.modules.configuration?.layout !== renderedLayout) {
        build();
        return;
      }
      form?.sync({ force: undo || redo });
      const geo = ctx.engineering.geometry();
      if (geo && viewer) viewer.update(geo);
      else renderFallback();
    }),
    store.on('load', () => build()),
  ];
  return () => {
    destroyed = true;
    offs.forEach((off) => off());
    teardown();
  };
}
