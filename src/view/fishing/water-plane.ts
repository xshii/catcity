import { planeBox } from '../art/water-view';

/**
 * Keeps something placed over the canvas's open water (`planeBox`): `placed` hears the
 * plane whenever the canvas box or the canvas in it changes size. Phaser resizes its
 * canvas a little after the box, so both are watched. Returns a way to place it now.
 */
export function followWaterPlane(
  box: HTMLElement,
  placed: (plane: ReturnType<typeof planeBox>) => void,
) {
  const place = () => {
    const canvas = box.querySelector('canvas');
    if (!canvas) return;
    observer.observe(canvas);
    placed(
      planeBox(box.getBoundingClientRect(), canvas.getBoundingClientRect()),
    );
  };
  const observer = new ResizeObserver(place);
  observer.observe(box);
  return place;
}
