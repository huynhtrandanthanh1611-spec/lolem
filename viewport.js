// Keep the shell inside Safari's visible area. This does not alter game/camera state.
const root = document.documentElement;
let viewportFrame = 0;

function updateViewport() {
  const viewport = window.visualViewport;
  // Pinch zoom must magnify the page, not resize/reflow its contents.
  if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
  const height = viewport?.height || window.innerHeight;
  if (Number.isFinite(height) && height > 0) {
    root.style.setProperty('--visible-height', `${height}px`);
  }
}

function queueViewport() {
  cancelAnimationFrame(viewportFrame);
  viewportFrame = requestAnimationFrame(updateViewport);
}

updateViewport();
window.addEventListener('resize', queueViewport, { passive: true });
window.addEventListener('pageshow', queueViewport, { passive: true });
window.visualViewport?.addEventListener('resize', queueViewport, { passive: true });
