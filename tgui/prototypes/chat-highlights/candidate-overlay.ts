/**
 * EXPERIMENT ONLY: build-time overlay, never imported by production.
 * Source excerpts retain copyright 2020 Aleksej Komarov, license MIT.
 */
import { createHash } from 'node:crypto';

export type Variant = 'baseline' | 'candidate';

export const SOURCE_SHA256 = {
  'tgui/packages/tgui-panel/chat/replaceInTextNode.js':
    '6daebda8580b630e4e3850468c1724935e729fabfcaedc15fbd8e0730e79481c',
  'tgui/packages/tgui-panel/chat/renderer.jsx':
    '60703d0758d3130fa1927dd8a15edd86d83fc25ebf3bd08c6ea83caa246f1ee2',
} as const;

export type SourcePath = keyof typeof SOURCE_SHA256;

const PREPARED_HIGHLIGHTER = `/**
 * Experiment: retain preparation only, never a message node.
 * Construction stays lazy so invalid secondary patterns still throw when
 * the first eligible message is highlighted, not when settings are applied.
 */
export const prepareHighlightNode = (
  regex,
  words,
  createNode = createHighlightNode,
) => {
  let replaceText;
  return (node) => {
    if (!replaceText) {
      replaceText = replaceInTextNode(
        regex,
        words,
        createNode || createHighlightNode,
      );
    }
    return replaceChildText(node, replaceText);
  };
};

`;

const LINKIFY_ANCHOR = `// Linkify
// --------------------------------------------------------`;

const OLD_IMPORT =
  "import { highlightNode, linkifyNode } from './replaceInTextNode';";
const NEW_IMPORT =
  "import { prepareHighlightNode, linkifyNode } from './replaceInTextNode';";

const OLD_PARSER = `      this.highlightParsers.push({
        highlightWords,
        highlightRegex,
        highlightColor,
        highlightWholeMessage,
      });`;
const NEW_PARSER = `      this.highlightParsers.push({
        highlightWords,
        highlightRegex,
        highlightColor,
        highlightWholeMessage,
        highlight: prepareHighlightNode(
          highlightRegex,
          highlightWords,
          (text) => createHighlightNode(text, highlightColor),
        ),
      });`;
const OLD_CALL = `            const highlighted = highlightNode(
              node,
              parser.highlightRegex,
              parser.highlightWords,
              (text) => createHighlightNode(text, parser.highlightColor),
            );`;
const NEW_CALL = `            const highlighted = parser.highlight(node);`;

type Edit = readonly [before: string, after: string];
const EDITS: Record<SourcePath, readonly Edit[]> = {
  'tgui/packages/tgui-panel/chat/replaceInTextNode.js': [
    [LINKIFY_ANCHOR, PREPARED_HIGHLIGHTER + LINKIFY_ANCHOR],
  ],
  'tgui/packages/tgui-panel/chat/renderer.jsx': [
    [OLD_IMPORT, NEW_IMPORT],
    [OLD_PARSER, NEW_PARSER],
    [OLD_CALL, NEW_CALL],
  ],
};

/**
 * Pure build-time transform for bundler hooks and differential tests.
 * Paths must be exact repository-relative SOURCE_SHA256 keys. Both variants
 * validate the identical pinned baseline; unknown paths, variants, source
 * drift, repeated application, or missing/duplicate anchors throw.
 * No filesystem writes, instrumentation, or runtime source cache occur here.
 */
export function transformSource(
  path: string,
  source: string,
  variant: Variant,
): string {
  if (!Object.prototype.hasOwnProperty.call(SOURCE_SHA256, path)) {
    throw new Error(`Unsupported chat highlight overlay source: ${path}`);
  }
  if (variant !== 'baseline' && variant !== 'candidate') {
    throw new Error(`Unsupported chat highlight overlay variant: ${variant}`);
  }
  const key = path as SourcePath;
  const hash = createHash('sha256').update(source, 'utf8').digest('hex');
  if (hash !== SOURCE_SHA256[key]) {
    throw new Error(`Chat highlight source drift: ${path} (${hash})`);
  }
  const edits = EDITS[key];
  for (const [before] of edits) {
    const occurrences = source.split(before).length - 1;
    if (occurrences !== 1) {
      throw new Error(
        `Chat highlight overlay expected one anchor in ${path}; found ${occurrences}`,
      );
    }
  }
  if (variant === 'baseline') {
    return source;
  }
  let result = source;
  for (const [before, after] of edits) {
    result = result.replace(before, () => after);
  }
  return result;
}
