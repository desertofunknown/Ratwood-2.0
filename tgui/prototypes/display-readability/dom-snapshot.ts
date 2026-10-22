export function viewSnapshot(host: HTMLElement) {
  const text = (node: Element | null) =>
    node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  return {
    title: text(host.querySelector('h2')),
    categories: [...host.querySelectorAll('[data-category-name]')].map(
      (category) => ({
        name: category.getAttribute('data-category-name'),
        toggles: [
          ...category.querySelectorAll<HTMLButtonElement>('[data-toggle-id]'),
        ].map((button) => ({
          id: button.dataset.toggleId,
          label: text(button.querySelector('span')),
          state: text(button.querySelector('[aria-hidden]')),
          pressed: button.getAttribute('aria-pressed'),
          description: text(
            host.querySelector(
              `[id="${button.getAttribute('aria-describedby')}"]`,
            ),
          ),
          type: button.type,
        })),
        selects: [...category.querySelectorAll('[data-select-id]')].map(
          (group) => ({
            id: group.getAttribute('data-select-id'),
            label: text(group.querySelector('legend')),
            description: text(group.querySelector('p')),
            options: [
              ...group.querySelectorAll<HTMLButtonElement>('button'),
            ].map((button) => ({
              value: button.dataset.optionValue,
              label: text(button),
              pressed: button.getAttribute('aria-pressed'),
              type: button.type,
            })),
          }),
        ),
      }),
    ),
  };
}
export function toggleButton(host: HTMLElement, id: string): HTMLButtonElement {
  const node = host.querySelector<HTMLButtonElement>(
    `[data-toggle-id="${id}"]`,
  );
  if (!node) throw Error(`Missing toggle ${id}`);
  return node;
}
export function paletteButton(
  host: HTMLElement,
  value: string,
): HTMLButtonElement {
  const node = host.querySelector<HTMLButtonElement>(
    `[data-option-value="${value}"]`,
  );
  if (!node) throw Error(`Missing palette ${value}`);
  return node;
}
