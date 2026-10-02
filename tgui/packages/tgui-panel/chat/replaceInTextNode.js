/**
 * @file
 * @copyright 2020 Aleksej Komarov
 * @license MIT
 */

/**
 * Replaces text matching a regular expression with a custom node.
 */
const regexParseNode = (params) => {
  const { node, regex, createNode, captureAdjust } = params;
  const text = node.textContent;
  const textLength = text.length;
  let nodes;
  let new_node;
  let match;
  let lastIndex = 0;
  let fragment;
  let n = 0;
  let count = 0;
  regex.lastIndex = 0;
  // eslint-disable-next-line no-cond-assign
  while ((match = regex.exec(text))) {
    if (match[0].length === 0) {
      regex.lastIndex = match.index + 1;
      continue;
    }
    // Safety check to prevent permanent
    // client crashing
    if (++count > 9999) {
      regex.lastIndex = 0;
      return { n: 0 };
    }
    n += 1;
    // Lazy init fragment
    if (!fragment) {
      fragment = document.createDocumentFragment();
    }
    // Lazy init nodes
    if (!nodes) {
      nodes = [];
    }
    const matchText = captureAdjust ? captureAdjust(match[0]) : match[0];
    const matchLength = matchText.length;
    // If matchText is set to be a substring nested within the original
    // matched text make sure to properly offset the index
    const matchIndex = match.index + match[0].indexOf(matchText);
    // Insert previous unmatched chunk
    if (lastIndex < matchIndex) {
      new_node = document.createTextNode(text.substring(lastIndex, matchIndex));
      nodes.push(new_node);
      fragment.appendChild(new_node);
    }
    lastIndex = matchIndex + matchLength;
    // Create a wrapper node
    new_node = createNode(matchText);
    fragment.appendChild(new_node);
  }
  if (fragment) {
    // Insert the remaining unmatched chunk
    if (lastIndex < textLength) {
      new_node = document.createTextNode(text.substring(lastIndex, textLength));
      nodes.push(new_node);
      fragment.appendChild(new_node);
    }
    // Commit the fragment
    node.parentNode.replaceChild(fragment, node);
  }

  return {
    nodes: nodes,
    n: n,
  };
};

/**
 * Replace text of a node with custom nades if they match
 * a regex expression or are in a word list
 */
export const replaceInTextNode = (regex, words, createNode) => {
  let wordRegex;
  if (words?.length) {
    let i = 0;
    let wordRegexStr = '(';
    for (const word of words) {
      // Capture if the word is at the beginning, end, middle,
      // or by itself in a message
      wordRegexStr += `^${word}\\s\\W|\\s\\W${word}\\s\\W|\\s\\W${word}$|^${word}\\s\\W$`;
      // Make sure the last character for the expression is NOT '|'
      if (++i !== words.length) {
        wordRegexStr += '|';
      }
    }
    wordRegexStr += ')';
    wordRegex = new RegExp(wordRegexStr, 'gi');
  }

  return (node) => {
    let nodes;
    let result;
    let n = 0;

    if (regex) {
      result = regexParseNode({
        node,
        regex,
        createNode,
      });
      nodes = result.nodes;
      n += result.n;
    }

    if (wordRegex) {
      // Only unmatched text is eligible for the secondary word pass.
      for (const textNode of nodes || [node]) {
        result = regexParseNode({
          node: textNode,
          regex: wordRegex,
          createNode: createNode,
          captureAdjust: (str) => str.replace(/^\W|\W$/g, ''),
        });
        n += result.n;
      }
    }
    return n;
  };
};

const replaceChildText = (node, replaceText, skipLinks = false) => {
  let n = 0;
  let child = node.firstChild;
  while (child) {
    // Replacements insert siblings; visit only the original children.
    const next = child.nextSibling;
    if (child.nodeType === 3) {
      n += replaceText(child);
    } else if (!skipLinks || child.nodeName.toLowerCase() !== 'a') {
      n += replaceChildText(child, replaceText, skipLinks);
    }
    child = next;
  }
  return n;
};

// Highlight
// --------------------------------------------------------

/**
 * Default highlight node.
 */
const createHighlightNode = (text) => {
  const node = document.createElement('span');
  node.setAttribute('style', 'background-color:#fd4;color:#000');
  node.textContent = text;
  return node;
};

/**
 * Highlights the text in the node based on the provided regular expression.
 *
 * @param {Node} node Node which you want to process
 * @param {RegExp} regex Regular expression to highlight
 * @param {(text: string) => Node} createNode Highlight node creator
 * @returns {number} Number of matches
 */
export const highlightNode = (
  node,
  regex,
  words,
  createNode = createHighlightNode,
) => {
  if (!createNode) {
    createNode = createHighlightNode;
  }
  return replaceChildText(node, replaceInTextNode(regex, words, createNode));
};

// Linkify
// --------------------------------------------------------

const URL_REGEX =
  /(?:(?:https?:\/\/)|(?:www\.))(?:[^ ]*?\.[^ ]*?)+[-A-Za-z0-9+&@#/%?=~_|$!:,.;(){}]+/gi;

/**
 * Highlights the text in the node based on the provided regular expression.
 *
 * @param {Node} node Node which you want to process
 * @returns {number} Number of matches
 */
export const linkifyNode = (node) => {
  return replaceChildText(node, linkifyTextNode, true);
};

const linkifyTextNode = replaceInTextNode(URL_REGEX, null, (text) => {
  const node = document.createElement('a');
  node.href = text;
  node.textContent = text;
  return node;
});
