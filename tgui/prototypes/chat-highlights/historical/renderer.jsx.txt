/**
 * @file
 * @copyright 2020 Aleksej Komarov
 * @license MIT
 */

import { useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { TooltipHTML } from 'tgui/components/TooltipHTML';
import { createLogger } from 'tgui/logging';
import { Tooltip } from 'tgui-core/components';
import { EventEmitter } from 'tgui-core/events';
import { classes } from 'tgui-core/react';

import {
  COMBINE_MAX_MESSAGES,
  COMBINE_MAX_TIME_WINDOW,
  IMAGE_RETRY_DELAY,
  IMAGE_RETRY_LIMIT,
  IMAGE_RETRY_MESSAGE_AGE,
  MAX_PERSISTED_MESSAGES,
  MAX_VISIBLE_MESSAGES,
  MESSAGE_PRUNE_INTERVAL,
  MESSAGE_TYPE_INTERNAL,
  MESSAGE_TYPE_UNKNOWN,
  MESSAGE_TYPES,
} from './constants';
import { canPageAcceptType, createMessage, isSameMessage } from './model';
import { highlightNode, linkifyNode } from './replaceInTextNode';

const logger = createLogger('chatRenderer');

// We consider this as the smallest possible scroll offset
// that is still trackable.
const SCROLL_TRACKING_TOLERANCE = 24;

// List of injectable component names to the actual type
export const TGUI_CHAT_COMPONENTS = {
  Tooltip,
  TooltipHTML,
};

// List of injectable attibute names mapped to their proper prop
// We need this because attibutes don't support lowercase names
export const TGUI_CHAT_ATTRIBUTES_TO_PROPS = {
  position: 'position',
  content: 'content',
  html: 'html',
};

const findNearestScrollableParent = (startingNode) => {
  let node = startingNode;
  while (node && node !== document.body) {
    if (/^(auto|scroll)$/.test(getComputedStyle(node).overflowY)) {
      return node;
    }
    node = node.parentElement;
  }
  return document.scrollingElement || document.documentElement;
};

// Keep processed text, image listeners, and nested component hosts intact when
// React takes ownership of the tooltip wrapper.
const ChatComponentContent = ({ nodes, onMount, ref, ...props }) => {
  const attach = useCallback(
    (node) => {
      if (node) {
        for (const child of nodes) {
          node.appendChild(child);
        }
        onMount();
      }
      if (typeof ref === 'function') {
        return ref(node);
      }
      if (ref) {
        ref.current = node;
      }
    },
    [nodes, onMount, ref],
  );
  return <span {...props} ref={attach} />;
};

const createHighlightNode = (text, color) => {
  const node = document.createElement('span');
  node.className = 'Chat__highlight';
  node.setAttribute('style', `background-color:${color}`);
  node.textContent = text;
  return node;
};

const createMessageNode = () => {
  const node = document.createElement('div');
  node.className = 'ChatMessage';
  return node;
};

const createReconnectedNode = () => {
  const node = document.createElement('div');
  node.className = 'Chat__reconnected';
  return node;
};

const imageRetryTimers = new WeakMap();

const handleImageError = (e) => {
  const node = e.target;
  if (imageRetryTimers.has(node)) {
    return;
  }
  const timer = setTimeout(() => {
    imageRetryTimers.delete(node);
    const attempts = parseInt(node.getAttribute('data-reload-n'), 10) || 0;
    if (attempts >= IMAGE_RETRY_LIMIT) {
      logger.error(`failed to load an image after ${attempts} attempts`);
      return;
    }
    const src = node.src.split('#')[0];
    node.removeAttribute('src');
    node.src = `${src}#${attempts}`;
    node.setAttribute('data-reload-n', attempts + 1);
  }, IMAGE_RETRY_DELAY);
  imageRetryTimers.set(node, timer);
};

/**
 * Assigns a "times-repeated" badge to the message.
 */
const updateMessageBadge = (message) => {
  const { node, times } = message;
  if (!node || !times) {
    // Nothing to update
    return;
  }
  const foundBadge = node.querySelector('.Chat__badge');
  const badge = foundBadge || document.createElement('div');
  badge.textContent = times;
  badge.className = classes(['Chat__badge', 'Chat__badge--animate']);
  cancelAnimationFrame(message.badgeFrame);
  message.badgeFrame = requestAnimationFrame(() => {
    message.badgeFrame = null;
    badge.className = 'Chat__badge';
  });
  if (!foundBadge) {
    node.appendChild(badge);
  }
};

class ChatRenderer {
  constructor() {
    this.loaded = false;
    /** @type {HTMLElement} */
    this.rootNode = null;
    this.queue = [];
    this.messages = [];
    this.visibleMessages = [];
    this.page = null;
    this.events = new EventEmitter();
    // Scroll handler
    /** @type {HTMLElement} */
    this.scrollNode = null;
    this.scrollTracking = true;
    this.scrollTop = 0;
    this.scrollFrame = null;
    this.handleScroll = () => {
      const node = this.scrollNode;
      if (!node) {
        return;
      }
      const height = node.scrollHeight;
      const bottom = node.scrollTop + node.clientHeight;
      const scrollTracking = height - bottom < SCROLL_TRACKING_TOLERANCE;
      if (scrollTracking !== this.scrollTracking) {
        this.scrollTracking = scrollTracking;
        this.events.emit('scrollTrackingChanged', scrollTracking);
        logger.debug('tracking', this.scrollTracking);
      }
    };
    this.ensureScrollTracking = () => {
      if (this.scrollTracking && this.scrollNode && this.scrollFrame === null) {
        this.scrollFrame = requestAnimationFrame(() => {
          this.scrollFrame = null;
          if (this.scrollTracking) {
            this.scrollToBottom();
          }
        });
      }
    };
    // Periodic message pruning
    setInterval(() => this.pruneMessages(), MESSAGE_PRUNE_INTERVAL);
  }

  isReady() {
    return this.loaded && this.rootNode && this.page;
  }

  mount(node) {
    this.unmount(this.rootNode);
    if (this.rootNode && this.rootNode !== node) {
      const fragment = document.createDocumentFragment();
      while (this.rootNode.firstChild) {
        fragment.appendChild(this.rootNode.firstChild);
      }
      node.appendChild(fragment);
    }
    this.rootNode = node;
    // Find scrollable parent
    this.scrollNode = findNearestScrollableParent(this.rootNode);
    this.scrollNode.addEventListener('scroll', this.handleScroll);
    if (!this.scrollTracking) {
      this.scrollNode.scrollTop = this.scrollTop;
    }
    this.ensureScrollTracking();
    // Flush the queue
    this.tryFlushQueue();
  }

  unmount(node) {
    if (node !== this.rootNode) {
      return;
    }
    if (this.scrollNode) {
      this.scrollTop = this.scrollNode.scrollTop;
      this.scrollNode.removeEventListener('scroll', this.handleScroll);
    }
    this.scrollNode = null;
    cancelAnimationFrame(this.scrollFrame);
    this.scrollFrame = null;
  }

  onStateLoaded() {
    this.loaded = true;
    this.tryFlushQueue();
  }

  tryFlushQueue() {
    if (this.isReady() && this.queue.length > 0) {
      const queue = this.queue;
      this.queue = [];
      const ordered = queue
        .filter((entry) => entry.prepend)
        .reverse()
        .concat(queue.filter((entry) => !entry.prepend));
      let batch = [];
      let notifyListeners = ordered[0].notifyListeners;
      for (const entry of ordered) {
        if (entry.notifyListeners !== notifyListeners) {
          this.processBatch(batch, { notifyListeners });
          batch = [];
          notifyListeners = entry.notifyListeners;
        }
        for (const message of entry.batch) {
          batch.push(message);
        }
      }
      this.processBatch(batch, { notifyListeners });
    }
  }

  assignStyle(style = {}) {
    for (const key of Object.keys(style)) {
      this.rootNode.style.setProperty(key, style[key]);
    }
  }

  setHighlight(highlightSettings, highlightSettingById) {
    this.highlightParsers = null;
    if (!highlightSettings) {
      return;
    }
    highlightSettings.map((id) => {
      const setting = highlightSettingById[id];
      const text = setting.highlightText;
      const highlightColor = setting.highlightColor;
      const highlightWholeMessage = setting.highlightWholeMessage;
      const matchWord = setting.matchWord;
      const matchCase = setting.matchCase;
      const allowedRegex = /^[a-zа-яё0-9_\-$/^[\s\]\\]+$/gi;
      const regexEscapeCharacters = /[!#$%^&*)(+=.<>{}[\]:;'"|~`_\-\\/]/g;
      const lines = String(text)
        .split(',')
        .map((str) => str.trim())
        .filter(
          (str) =>
            // Must be longer than one character
            str &&
            str.length > 1 &&
            // Must be alphanumeric (with some punctuation)
            (allowedRegex.test(str) ||
              (str.charAt(0) === '/' && str.charAt(str.length - 1) === '/')) &&
            // Reset lastIndex so it does not mess up the next word
            ((allowedRegex.lastIndex = 0) || true),
        );
      let highlightWords;
      let highlightRegex;
      // Nothing to match, reset highlighting
      if (lines.length === 0) {
        return;
      }
      const regexExpressions = [];
      // Organize each highlight entry into regex expressions and words
      for (let line of lines) {
        // Regex expression syntax is /[exp]/
        if (line.charAt(0) === '/' && line.charAt(line.length - 1) === '/') {
          const expr = line.substring(1, line.length - 1);
          // Check if this is more than one character
          if (/^(\[.*\]|\\.|.)$/.test(expr)) {
            continue;
          }
          regexExpressions.push(expr);
        } else {
          // Lazy init
          if (!highlightWords) {
            highlightWords = [];
          }
          // We're not going to let regex characters fuck up our RegEx operation.
          line = line.replace(regexEscapeCharacters, '\\$&');

          highlightWords.push(line);
        }
      }
      const regexStr = regexExpressions.join('|');
      const flags = `g${matchCase ? '' : 'i'}`;
      // We wrap this in a try-catch to ensure that broken regex doesn't break
      // the entire chat.
      try {
        // setting regex overrides matchword
        if (regexStr) {
          highlightRegex = new RegExp(`(${regexStr})`, flags);
        } else {
          const pattern = `${matchWord ? '\\b' : ''}(${highlightWords.join(
            '|',
          )})${matchWord ? '\\b' : ''}`;
          highlightRegex = new RegExp(pattern, flags);
        }
      } catch {
        // We just reset it if it's invalid.
        highlightRegex = null;
      }
      // Lazy init
      if (!this.highlightParsers) {
        this.highlightParsers = [];
      }
      this.highlightParsers.push({
        highlightWords,
        highlightRegex,
        highlightColor,
        highlightWholeMessage,
      });
    });
  }

  scrollToBottom() {
    // scrollHeight is always bigger than scrollTop and is
    // automatically clamped to the valid range.
    if (this.scrollNode) {
      this.scrollNode.scrollTop = this.scrollNode.scrollHeight;
    }
  }

  changePage(page) {
    if (!this.isReady()) {
      this.page = page;
      this.tryFlushQueue();
      return;
    }
    this.page = page;
    const retained = new Set(this.messages);
    for (const message of this.visibleMessages) {
      if (!retained.has(message)) {
        this.disposeMessage(message);
      }
    }
    // Fast clear of the root node
    this.rootNode.textContent = '';
    this.visibleMessages = [];
    // Re-add message nodes
    const fragment = document.createDocumentFragment();
    let node;
    for (const message of this.messages) {
      if (canPageAcceptType(page, message.type)) {
        node = message.node;
        fragment.appendChild(node);
        this.visibleMessages.push(message);
      }
    }
    if (node) {
      this.rootNode.appendChild(fragment);
      this.scrollToBottom();
    }
  }

  getCombinableMessage(predicate) {
    const now = Date.now();
    const len = this.visibleMessages.length;
    const from = len - 1;
    const to = Math.max(0, len - COMBINE_MAX_MESSAGES);
    for (let i = from; i >= to; i--) {
      const message = this.visibleMessages[i];

      const matches =
        // Is not an internal message
        !message.type.startsWith(MESSAGE_TYPE_INTERNAL) &&
        // Text payload must fully match
        isSameMessage(message, predicate) &&
        // Must land within the specified time window
        now < message.createdAt + COMBINE_MAX_TIME_WINDOW;
      if (matches) {
        return message;
      }
    }
    return null;
  }

  processBatch(batch, options = {}) {
    const { prepend, notifyListeners = true } = options;
    const now = Date.now();
    // Queue up messages until chat is ready
    if (!this.isReady()) {
      this.queue.push({ batch, prepend, notifyListeners });
      return;
    }
    // Prepended history combines within its own batch, before newer messages.
    const previousMessages = prepend ? this.messages : null;
    const previousVisibleMessages = prepend ? this.visibleMessages : null;
    if (prepend) {
      this.messages = [];
      this.visibleMessages = [];
    }
    // Insert messages
    const fragment = document.createDocumentFragment();
    const countByType = {};
    let node;
    for (const payload of batch) {
      const message = createMessage(payload);
      // Combine messages
      const combinable = this.getCombinableMessage(message);
      if (combinable) {
        combinable.times = (combinable.times || 1) + 1;
        updateMessageBadge(combinable);
        continue;
      }
      // Reuse message node
      if (message.node) {
        node = message.node;
      }
      // Reconnected
      else if (message.type === 'internal/reconnected') {
        node = createReconnectedNode();
      }
      // Create message node
      else {
        node = createMessageNode();
        // Payload is plain text
        if (message.text) {
          node.textContent = message.text;
        }
        // Payload is HTML
        else if (message.html) {
          node.innerHTML = message.html;
        } else {
          logger.error('Error: message is missing text payload', message);
        }
        // Highlight text
        if (!message.avoidHighlighting && this.highlightParsers) {
          this.highlightParsers.map((parser) => {
            const highlighted = highlightNode(
              node,
              parser.highlightRegex,
              parser.highlightWords,
              (text) => createHighlightNode(text, parser.highlightColor),
            );
            if (highlighted && parser.highlightWholeMessage) {
              node.className += ' ChatMessage--highlighted';
            }
          });
        }
        // Linkify text
        const linkifyNodes = node.querySelectorAll('.linkify');
        for (let i = 0; i < linkifyNodes.length; ++i) {
          linkifyNode(linkifyNodes[i]);
        }
        // Assign an image error handler
        if (now < message.createdAt + IMAGE_RETRY_MESSAGE_AGE) {
          const imgNodes = node.querySelectorAll('img');
          message.images = imgNodes;
          for (let i = 0; i < imgNodes.length; i++) {
            const imgNode = imgNodes[i];
            imgNode.addEventListener('error', handleImageError);
          }
        }
      }
      // Store the node in the message
      message.node = node;
      // Query all possible selectors to find out the message type
      if (!message.type) {
        const typeDef = MESSAGE_TYPES.find(
          (typeDef) => typeDef.selector && node.querySelector(typeDef.selector),
        );
        message.type = typeDef?.type || MESSAGE_TYPE_UNKNOWN;
      }
      if (!message.componentRoots) {
        this.renderComponents(message);
      }
      updateMessageBadge(message);
      if (!countByType[message.type]) {
        countByType[message.type] = 0;
      }
      countByType[message.type] += 1;
      this.messages.push(message);
      if (canPageAcceptType(this.page, message.type)) {
        fragment.appendChild(node);
        this.visibleMessages.push(message);
      }
    }
    if (prepend) {
      this.messages = this.messages.concat(previousMessages);
      this.visibleMessages = this.visibleMessages.concat(previousVisibleMessages);
    }
    if (node) {
      const firstChild = this.rootNode.childNodes[0];
      if (prepend && firstChild) {
        this.rootNode.insertBefore(fragment, firstChild);
      } else {
        this.rootNode.appendChild(fragment);
      }
      this.ensureScrollTracking();
    }
    // Notify listeners that we have processed the batch
    if (notifyListeners) {
      this.events.emit('batchProcessed', countByType);
    }
  }

  renderComponents(message) {
    const roots = [];
    message.componentRoots = roots;
    for (const node of message.node.querySelectorAll('[data-component]')) {
      const name = node.getAttribute('data-component');
      const Element = TGUI_CHAT_COMPONENTS[name];
      // Unknown components retain their original content.
      if (!Object.hasOwn(TGUI_CHAT_COMPONENTS, name)) {
        continue;
      }
      const props = {};
      for (const attribute of node.attributes) {
        const name = attribute.nodeName.replace('data-', '');
        if (!Object.hasOwn(TGUI_CHAT_ATTRIBUTES_TO_PROPS, name)) {
          continue;
        }
        let value = attribute.nodeValue;
        if (value === '$true') {
          value = true;
        } else if (value === '$false') {
          value = false;
        } else if (!isNaN(value) && !isNaN(parseFloat(value))) {
          value = parseFloat(value);
        }
        props[TGUI_CHAT_ATTRIBUTES_TO_PROPS[name]] = value;
      }
      const nodes = Array.from(node.childNodes);
      const root = createRoot(node);
      roots.push(root);
      root.render(
        <Element {...props}>
          <ChatComponentContent
            nodes={nodes}
            onMount={this.ensureScrollTracking}
          />
        </Element>,
      );
    }
  }

  disposeMessage(message) {
    cancelAnimationFrame(message.badgeFrame);
    message.badgeFrame = null;
    // Inner roots must release their portals and listeners before outer roots.
    const roots = message.componentRoots || [];
    for (let i = roots.length - 1; i >= 0; i--) {
      roots[i].unmount();
    }
    message.componentRoots = null;
    for (const image of message.images || []) {
      image.removeEventListener('error', handleImageError);
      clearTimeout(imageRetryTimers.get(image));
      imageRetryTimers.delete(image);
    }
    message.images = null;
    message.node?.remove();
    message.node = null;
  }

  pruneMessages() {
    if (!this.isReady()) {
      return;
    }
    // Delay pruning because user is currently interacting
    // with chat history
    if (!this.scrollTracking) {
      logger.debug('pruning delayed');
      return;
    }
    // Visible messages
    {
      const messages = this.visibleMessages;
      const fromIndex = Math.max(0, messages.length - MAX_VISIBLE_MESSAGES);
      if (fromIndex > 0) {
        this.visibleMessages = messages.slice(fromIndex);
        for (let i = 0; i < fromIndex; i++) {
          const message = messages[i];
          this.disposeMessage(message);
        }
        // Remove pruned messages from the message array

        this.messages = this.messages.filter((message) => message.node);
        logger.log(`pruned ${fromIndex} visible messages`);
      }
    }
    // All messages
    {
      const fromIndex = Math.max(
        0,
        this.messages.length - MAX_PERSISTED_MESSAGES,
      );
      if (fromIndex > 0) {
        const visible = new Set(this.visibleMessages);
        for (let i = 0; i < fromIndex; i++) {
          const message = this.messages[i];
          if (!visible.has(message)) {
            this.disposeMessage(message);
          }
        }
        this.messages = this.messages.slice(fromIndex);
        logger.log(`pruned ${fromIndex} stored messages`);
      }
    }
  }

  rebuildChat() {
    if (!this.isReady()) {
      return;
    }
    // Make a copy of messages
    const fromIndex = Math.max(
      0,
      this.messages.length - MAX_PERSISTED_MESSAGES,
    );
    const messages = this.messages.slice(fromIndex);
    // Remove existing nodes
    const existingMessages = new Set(this.messages.concat(this.visibleMessages));
    for (const message of existingMessages) {
      this.disposeMessage(message);
    }
    // Fast clear of the root node
    this.rootNode.textContent = '';
    this.messages = [];
    this.visibleMessages = [];
    // Repopulate the chat log
    this.processBatch(messages, {
      notifyListeners: false,
    });
  }

  /**
   * @clearChat
   * @copyright 2023
   * @author Cheffie
   * @link https://github.com/CheffieGithub
   * @license MIT
   */
  clearChat() {
    const messages = this.visibleMessages;
    this.visibleMessages = [];
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      this.disposeMessage(message);
    }
    // Remove pruned messages from the message array
    this.messages = this.messages.filter((message) => message.node);
    logger.log(`Cleared chat`);
  }

  saveToDisk() {
    // Compile currently loaded stylesheets as CSS text
    let cssText = '';
    const styleSheets = document.styleSheets;
    for (let i = 0; i < styleSheets.length; i++) {
      const cssRules = styleSheets[i].cssRules;
      for (let i = 0; i < cssRules.length; i++) {
        const rule = cssRules[i];
        if (rule && typeof rule.cssText === 'string') {
          cssText += `${rule.cssText}\n`;
        }
      }
    }
    cssText += 'body, html { background-color: #141414 }\n';
    // Compile chat log as HTML text
    let messagesHtml = '';
    for (const message of this.visibleMessages) {
      if (message.node) {
        messagesHtml += `${message.node.outerHTML}\n`;
      }
    }
    // Create a page

    const pageHtml =
      '<!doctype html>\n' +
      '<html>\n' +
      '<head>\n' +
      '<title>SS13 Chat Log</title>\n' +
      '<style>\n' +
      cssText +
      '</style>\n' +
      '</head>\n' +
      '<body>\n' +
      '<div class="Chat">\n' +
      messagesHtml +
      '</div>\n' +
      '</body>\n' +
      '</html>\n';
    // Create and send a nice blob
    const blob = new Blob([pageHtml], { type: 'text/plain' });
    const timestamp = new Date()
      .toISOString()
      .substring(0, 19)
      .replace(/[-:]/g, '')
      .replace('T', '-');
    Byond.saveBlob(blob, `ss13-chatlog-${timestamp}.html`, '.html');
  }
}

// Make chat renderer global so that we can continue using the same
// instance after hot code replacement.
if (!window.__chatRenderer__) {
  window.__chatRenderer__ = new ChatRenderer();
}

/** @type {ChatRenderer} */
export const chatRenderer = window.__chatRenderer__;
