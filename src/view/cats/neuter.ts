import type { GameSession } from '../../application';
import type { Confirm } from '../common/confirm';
import { ERROR_MESSAGES } from '../common/errors';
import { neuterScreen } from './neuter-screen';
import type { CatsViewStore } from './view-state';

/**
 * Neutering at the end of a cat's family section (spec 041 T-20, ui-design 5.2): a button
 * that asks first (4.2) and only then sends NEUTER_CAT, or the line in its place.
 * `neuterScreen` decides; its elements are made once (design 10.2). It dry-runs only
 * while the family section is open, not on every clock tick behind it.
 */
export function mountNeuter(deps: {
  session: GameSession;
  view: CatsViewStore;
  confirm: Confirm;
  notify: (text: string) => void;
  /** The detail's family section: the way to neuter ends it. */
  section: HTMLElement;
  /** Where the focus goes once the button has given way to "已绝育": the section's title. */
  title: HTMLElement;
}) {
  const { session, view } = deps;
  const box = document.createElement('div');
  box.className = 'profile-actions';
  box.innerHTML =
    '<button id="profile-neuter" type="button" class="quiet"></button><small class="profile-reason"></small><p class="profile-status"></p>';
  deps.section.append(box);
  const button = box.querySelector('button')!;
  const reason = box.querySelector('small')!;
  const status = box.querySelector('p')!;
  let model: ReturnType<typeof neuterScreen> = null;
  const render = () => {
    const { detail, open } = view.get();
    box.hidden = !detail || !open.includes('family');
    if (!detail || box.hidden) return;
    model = neuterScreen(session.getSnapshot(), detail, (command) =>
      session.check(command),
    );
    if (!model) return;
    button.hidden = !model.button;
    button.disabled = model.disabled;
    button.textContent = model.text;
    button.setAttribute('aria-label', model.label);
    reason.textContent = model.reason;
    reason.hidden = !model.reason;
    status.textContent = model.status;
    status.hidden = !model.status;
  };
  button.addEventListener('click', () => {
    const catId = view.get().detail;
    if (!model || !catId) return;
    const { done } = model;
    deps.confirm.ask(model.confirm, button, () => {
      const result = session.execute({ type: 'NEUTER_CAT', catId });
      if (!result.ok) return deps.notify(ERROR_MESSAGES[result.error]);
      deps.notify(done);
      deps.title.focus({ preventScroll: true });
    });
  });
  session.subscribe(render);
  view.subscribe(render);
  render();
}
