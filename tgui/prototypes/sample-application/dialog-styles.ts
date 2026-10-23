import { parse } from 'postcss';

/** Reuse domain rules, never the standalone page or preview-control chrome. */
export function dialogScreenCss(
  source: string,
  family: 'Selection' | 'Value' | 'Alert',
): string {
  const css = parse(source);
  const prompt = new RegExp(`^\\.${family}Prompt(?:\\b|__)`);
  const preview = new RegExp(`^\\.${family}Preview(?:\\b|__)`);
  css.walkRules((rule) => {
    const retained: string[] = [];
    for (const selector of rule.selectors) {
      if (prompt.test(selector))
        retained.push(`.SampleApplication ${selector}`);
      else if (
        !/^(?:html|body|#root|#controls)$/.test(selector) &&
        !preview.test(selector)
      ) {
        throw new Error(`Unreviewed prompt selector: ${selector}`);
      }
    }
    if (retained.length) rule.selectors = retained;
    else rule.remove();
  });
  css.walkAtRules((rule) => {
    if (rule.name !== 'media') {
      throw new Error(`Unreviewed prompt at-rule: ${rule.name}`);
    }
    if (!rule.nodes?.length) rule.remove();
  });
  return css.toString();
}
