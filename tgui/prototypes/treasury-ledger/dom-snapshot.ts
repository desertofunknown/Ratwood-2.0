export function viewSnapshot(host: HTMLElement) {
  const normalize = (text: string | null | undefined) =>
    text?.replace(/\s+/g, ' ').trim() ?? '';
  const input = host.querySelector('input');
  return {
    title: normalize(host.querySelector('h2')?.textContent),
    message: normalize(host.querySelector('p')?.textContent),
    headers: [...host.querySelectorAll('th')].map((cell) => [
      cell.textContent,
      cell.getAttribute('scope'),
    ]),
    rows: [...host.querySelectorAll('tbody tr')].map((row) =>
      [...row.querySelectorAll('td')].map((cell) => cell.textContent),
    ),
    tones: [...host.querySelectorAll('tbody tr td:last-child')].map((cell) =>
      /(?:--mint|__good)\b/.test(cell.className)
        ? 'mint'
        : /(?:--burn|__bad)\b/.test(cell.className)
          ? 'burn'
          : 'other',
    ),
    input: input
      ? { type: input.type, value: input.value, placeholder: input.placeholder }
      : null,
    buttons: [...host.querySelectorAll('button')].map((button) => ({
      text: normalize(button.textContent),
      disabled: button.disabled,
    })),
    pagination: normalize(
      host.querySelector('[class$="__pagination"] span')?.textContent,
    ),
  };
}

export function button(host: HTMLElement, label: string) {
  const found = [...host.querySelectorAll('button')].find(
    (node) => node.textContent?.trim() === label,
  );
  if (!found) throw Error(`Missing button: ${label}`);
  return found;
}

export function enter(host: HTMLElement, value: string) {
  const input = host.querySelector('input')!;
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
