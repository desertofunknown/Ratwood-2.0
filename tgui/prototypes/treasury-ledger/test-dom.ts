// Happy DOM 17.6.3 drops standalone <tr> tags in template.innerHTML. Browsers
// retain them. Correct only that parser context for compiled Svelte row templates;
// this module is test-only and is never imported by either preview entry point.
const descriptor = Object.getOwnPropertyDescriptor(
  HTMLTemplateElement.prototype,
  'innerHTML',
)!;
Object.defineProperty(HTMLTemplateElement.prototype, 'innerHTML', {
  ...descriptor,
  set(value: string) {
    if (/^\s*<tr(?:\s|>)/i.test(value)) {
      descriptor.set!.call(this, `<table><tbody>${value}</tbody></table>`);
      const body = this.content.querySelector('tbody')!;
      this.content.replaceChildren(...body.childNodes);
    } else descriptor.set!.call(this, value);
  },
});
