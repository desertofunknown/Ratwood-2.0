import { parse } from 'postcss';

/** Reuse domain rules, never the standalone page or preview-control chrome. */
export function archiveScreenCss(source: string): string {
  const css = parse(source);
  css.walkRules((rule) => {
    if (
      rule.selectors.every((selector) =>
        /^\.ChangesArchive(?:\b|__)/.test(selector),
      )
    ) {
      rule.selectors = rule.selectors.map(
        (selector) => `.SampleApplication ${selector}`,
      );
      return;
    }
    if (
      rule.selectors.every((selector) =>
        /^(?:body$|\.PreviewControls(?:\b|__))/.test(selector),
      )
    ) {
      rule.remove();
      return;
    }
    throw new Error(`Unreviewed archive selector: ${rule.selector}`);
  });
  css.walkAtRules((rule) => {
    if (rule.name !== 'media') {
      throw new Error(`Unreviewed archive at-rule: ${rule.name}`);
    }
    if (!rule.nodes?.length) rule.remove();
  });
  return css.toString();
}
