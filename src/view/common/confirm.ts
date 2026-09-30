import './confirm.css';

/** What a confirmation says (ui-design 4.2): a question, what follows, the price, the act. */
export interface ConfirmContent {
  title: string;
  /** What follows, a sentence or two, each its own line. */
  body: readonly string[];
  cost: string;
  /** The act itself ("确定绝育"), never "OK". */
  confirm: string;
}

const CONFIRM_COPY = { cancel: '取消' } as const;

/**
 * The confirmation before something that cannot be undone (ui-design P7, 4.2), over every
 * other layer (3.1: its scrim 50, itself 51). Cancel, on the left, has the focus at first;
 * the scrim, Escape and cancel all cancel; Tab goes between its two buttons. Closing gives
 * the focus back to the button that asked, and only a confirmation runs the act. Made
 * once and kept: each question only changes its words.
 */
export function mountConfirm(layer: HTMLElement) {
  const shade = document.createElement('div');
  shade.className = 'confirm-shade';
  shade.hidden = true;
  const dialog = document.createElement('section');
  dialog.id = 'confirm';
  dialog.className = 'confirm';
  dialog.hidden = true;
  dialog.setAttribute('role', 'alertdialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'confirm-title');
  dialog.setAttribute('aria-describedby', 'confirm-body');
  dialog.innerHTML =
    '<h2 id="confirm-title"></h2><div id="confirm-body"></div><p id="confirm-cost"></p>' +
    `<div class="confirm-actions"><button id="confirm-cancel" type="button">${CONFIRM_COPY.cancel}</button><button id="confirm-ok" type="button"></button></div>`;
  layer.append(shade, dialog);
  const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
    dialog.querySelector<T>(`#${id}`)!;
  const cancel = $<HTMLButtonElement>('confirm-cancel');
  const ok = $<HTMLButtonElement>('confirm-ok');
  let asked: { opener: HTMLElement; act: () => void } | null = null;

  const close = (confirmed: boolean) => {
    if (!asked) return;
    const { opener, act } = asked;
    asked = null;
    shade.hidden = true;
    dialog.hidden = true;
    opener.focus({ preventScroll: true });
    if (confirmed) act();
  };
  cancel.addEventListener('click', () => close(false));
  ok.addEventListener('click', () => close(true));
  shade.addEventListener('click', () => close(false));
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      // On top of everything: Escape closes the dialog, not the panel under it.
      event.preventDefault();
      event.stopPropagation();
      close(false);
    } else if (event.key === 'Tab') {
      // Modal: the focus stays on its two buttons, either way round.
      event.preventDefault();
      (document.activeElement === cancel ? ok : cancel).focus();
    }
  });

  return {
    /** Asks; `act` runs only when the player confirms. `opener` gets the focus back. */
    ask(content: ConfirmContent, opener: HTMLElement, act: () => void) {
      asked = { opener, act };
      $('confirm-title').textContent = content.title;
      $('confirm-body').replaceChildren(
        ...content.body.map((line) => {
          const text = document.createElement('p');
          text.textContent = line;
          return text;
        }),
      );
      $('confirm-cost').textContent = content.cost;
      ok.textContent = content.confirm;
      shade.hidden = false;
      dialog.hidden = false;
      cancel.focus({ preventScroll: true });
    },
  };
}
export type Confirm = ReturnType<typeof mountConfirm>;
