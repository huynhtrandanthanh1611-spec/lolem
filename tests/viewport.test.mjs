import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../viewport.js', import.meta.url), 'utf8');
function shell(viewport) {
  let height;
  const events = {};
  const window = { innerHeight: 820, addEventListener: (type, callback) => { events[type] = callback; } };
  if (viewport) window.visualViewport = { ...viewport, addEventListener: (type, callback) => { events[`visual-${type}`] = callback; } };
  runInNewContext(source, {
    window, document: { documentElement: { style: { setProperty: (_, value) => { height = value; } } } },
    requestAnimationFrame: callback => { callback(); return 1; }, cancelAnimationFrame() {},
  });
  return { window, events, height: () => height };
}

const ipad = shell({ height: 700, scale: 1 });
assert.equal(ipad.height(), '700px', 'Safari toolbar area must not count as visible content');
ipad.window.visualViewport.height = 820;
ipad.events['visual-resize']();
assert.equal(ipad.height(), '820px', 'Follow expanding/collapsing Safari toolbars');
ipad.window.visualViewport.height = 410;
ipad.window.visualViewport.scale = 2;
ipad.events['visual-resize']();
assert.equal(ipad.height(), '820px', 'Pinch zoom must not reflow the app');
ipad.window.visualViewport.scale = 1;
ipad.window.visualViewport.height = 1180;
ipad.events.resize();
assert.equal(ipad.height(), '1180px', 'Follow rotation back to portrait');
ipad.window.visualViewport.height = 700;
ipad.events.pageshow();
assert.equal(ipad.height(), '700px', 'Refresh a restored Safari page');
const fallback = shell();
assert.equal(fallback.height(), '820px');
fallback.window.innerHeight = 648;
fallback.events.resize();
assert.equal(fallback.height(), '648px', 'Older browsers use innerHeight');
console.log('Viewport regression checks passed (Safari toolbar, rotation, zoom, restore, fallback).');
