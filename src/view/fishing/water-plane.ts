import { planeBox } from '../art/water-view';

/**
 * Keeps something placed over the canvas as drawn: `placed` hears the box and the canvas
 * in it whenever either changes size. Phaser resizes its canvas a little after the box,
 * so both are watched. Returns a way to place it now.
 */
export function followCanvas(
  box: HTMLElement,
  placed: (box: DOMRect, art: DOMRect) => void,
) {
  const place = () => {
    const canvas = box.querySelector('canvas');
    if (!canvas) return;
    observer.observe(canvas);
    placed(box.getBoundingClientRect(), canvas.getBoundingClientRect());
  };
  const observer = new ResizeObserver(place);
  observer.observe(box);
  return place;
}

/** Keeps something placed over the canvas's open water (`planeBox`). */
export const followWaterPlane = (
  box: HTMLElement,
  placed: (plane: ReturnType<typeof planeBox>) => void,
) => followCanvas(box, (box, art) => placed(planeBox(box, art)));
