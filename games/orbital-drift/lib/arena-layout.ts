type Point = { x: number; y: number };
export type ArenaView = { scale: number; centerY: number; halfWidth: number; halfHeight: number };

// Keep the previous planet/ship scale, but reclaim every edge of the viewport
// as playable world space. HUD controls now float over the scene.
export function arenaLayout(
  width: number,
  height: number,
  radius: number,
  keepVisible?: Point,
): ArenaView {
  const mobile = width <= 700;
  const previousMargins = mobile ? Math.min(195, height * 0.28) + 135 : 150;
  const innerWidth = Math.max(1, width - 32),
    innerHeight = Math.max(1, height - 32);
  let scale = Math.max(
    0.001,
    Math.min(innerWidth, Math.max(1, height - previousMargins)) / ((radius + 18) * 2),
  );
  // Rotating/resizing the screen must not strand a live ship outside the map.
  if (keepVisible)
    scale = Math.min(
      scale,
      innerWidth / (2 * (Math.abs(keepVisible.x) + 50)),
      innerHeight / (2 * (Math.abs(keepVisible.y) + 50)),
    );
  return {
    scale,
    centerY: height / 2,
    halfWidth: innerWidth / (2 * scale),
    halfHeight: innerHeight / (2 * scale),
  };
}

export function boundaryClearance(point: Point, view: Pick<ArenaView, 'halfWidth' | 'halfHeight'>) {
  return Math.min(view.halfWidth - Math.abs(point.x), view.halfHeight - Math.abs(point.y));
}
