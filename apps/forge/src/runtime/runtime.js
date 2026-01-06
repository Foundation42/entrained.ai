// Forge Runtime - Client-side WebComponent Library

class StorageAPI {
  constructor(baseUrl, componentId, scope, instanceId) {
    this.baseUrl = baseUrl;
    this.componentId = componentId;
    this.scope = scope;
    this.instanceId = instanceId;
    this._pending = new Map();
    this._timers = new Map();
  }

  url(key) {
    const base = this.baseUrl + '/api/forge/' + this.componentId;
    if (this.scope === 'instance') {
      return key ? base + '/instance/' + this.instanceId + '/data/' + key : base + '/instance/' + this.instanceId + '/data';
    } else if (this.scope === 'class') {
      return key ? base + '/class/data/' + key : base + '/class/data';
    } else {
      return key ? this.baseUrl + '/api/forge/global/data/' + key : this.baseUrl + '/api/forge/global/data';
    }
  }

  async get(key) {
    // Return pending write for read-your-writes consistency
    if (this._pending.has(key)) return this._pending.get(key);
    try {
      const response = await fetch(this.url(key));
      if (!response.ok) return null;
      const data = await response.json();
      return data.value;
    } catch { return null; }
  }

  async set(key, value) {
    // Store pending value for read-your-writes
    this._pending.set(key, value);
    // Debounce writes (300ms) to avoid KV rate limiting
    if (this._timers.has(key)) clearTimeout(this._timers.get(key));
    this._timers.set(key, setTimeout(async () => {
      this._timers.delete(key);
      try {
        await fetch(this.url(key), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(value),
        });
      } finally {
        if (this._pending.get(key) === value) this._pending.delete(key);
      }
    }, 300));
  }

  async delete(key) {
    this._pending.delete(key);
    await fetch(this.url(key), { method: 'DELETE' });
  }

  async list() {
    try {
      const response = await fetch(this.url());
      if (!response.ok) return [];
      const data = await response.json();
      return data.keys || [];
    } catch { return []; }
  }
}

// Current component being rendered (for event delegation)
let _currentComponent = null;

// Events to delegate (covers most common use cases)
const _delegatedEvents = ['click', 'dblclick', 'input', 'change', 'submit', 'keydown', 'keyup', 'keypress', 'focus', 'blur', 'mousedown', 'mouseup', 'mouseover', 'mouseout', 'touchstart', 'touchend'];

// DOM morphing - updates existing DOM to match new structure while preserving focus
function morph(fromNode, toNode) {
  // Different node types - replace entirely (use actual node, not clone, to preserve handlers)
  if (fromNode.nodeType !== toNode.nodeType || fromNode.nodeName !== toNode.nodeName) {
    fromNode.parentNode?.replaceChild(toNode, fromNode);
    return;
  }

  // Text nodes - update content
  if (fromNode.nodeType === 3) {
    if (fromNode.textContent !== toNode.textContent) {
      fromNode.textContent = toNode.textContent;
    }
    return;
  }

  // Element nodes
  if (fromNode.nodeType === 1) {
    // Skip morphing focused inputs to preserve cursor position
    // Use :focus pseudo-class which works correctly in Shadow DOM
    const isFocused = fromNode.matches && fromNode.matches(':focus');
    const isFocusedInput = isFocused &&
      (fromNode.tagName === 'INPUT' || fromNode.tagName === 'TEXTAREA' || fromNode.tagName === 'SELECT');

    // Update attributes (but preserve value on focused inputs)
    const fromAttrs = new Set(Array.from(fromNode.attributes).map(a => a.name));
    const toAttrs = new Set(Array.from(toNode.attributes).map(a => a.name));

    // Remove old attributes
    for (const name of fromAttrs) {
      if (!toAttrs.has(name)) fromNode.removeAttribute(name);
    }

    // Add/update attributes
    for (const attr of toNode.attributes) {
      // Skip value on focused inputs
      if (isFocusedInput && attr.name === 'value') continue;
      if (fromNode.getAttribute(attr.name) !== attr.value) {
        fromNode.setAttribute(attr.name, attr.value);
      }
    }

    // Sync special properties (but not on focused inputs)
    if (!isFocusedInput) {
      if ('value' in toNode && fromNode.value !== toNode.value) fromNode.value = toNode.value;
      if ('checked' in toNode && fromNode.checked !== toNode.checked) fromNode.checked = toNode.checked;
      if ('selected' in toNode && fromNode.selected !== toNode.selected) fromNode.selected = toNode.selected;
    }

    // Event handlers are now delegated at shadow root level via data-forge-* attributes
    // No need to transfer handlers during morph - they're looked up dynamically

    // Morph children
    const fromChildren = Array.from(fromNode.childNodes);
    const toChildren = Array.from(toNode.childNodes);

    // Build key map for efficient matching
    const fromKeyMap = new Map();
    fromChildren.forEach((child, i) => {
      const key = child.nodeType === 1 ? child.getAttribute('key') || child.getAttribute('id') : null;
      if (key) fromKeyMap.set(key, { node: child, index: i });
    });

    let fromIndex = 0;
    for (let toIndex = 0; toIndex < toChildren.length; toIndex++) {
      const toChild = toChildren[toIndex];
      const toKey = toChild.nodeType === 1 ? toChild.getAttribute('key') || toChild.getAttribute('id') : null;

      // Try to find matching node by key
      if (toKey && fromKeyMap.has(toKey)) {
        const match = fromKeyMap.get(toKey);
        if (match.index !== fromIndex) {
          // Move node to correct position
          fromNode.insertBefore(match.node, fromChildren[fromIndex] || null);
        }
        morph(match.node, toChild);
        fromIndex++;
        continue;
      }

      // Match by position
      if (fromIndex < fromChildren.length) {
        const fromChild = fromChildren[fromIndex];
        // If types match, morph; otherwise replace (use actual node to preserve handlers)
        if (fromChild.nodeType === toChild.nodeType && fromChild.nodeName === toChild.nodeName) {
          morph(fromChild, toChild);
        } else {
          fromNode.replaceChild(toChild, fromChild);
        }
        fromIndex++;
      } else {
        // No more from children - append (use actual node to preserve handlers)
        fromNode.appendChild(toChild);
      }
    }

    // Remove extra from children
    while (fromIndex < fromChildren.length) {
      fromNode.removeChild(fromChildren[fromIndex]);
      fromIndex++;
    }
  }
}

export function Component(options) {
  return function(target) {
    // Store metadata directly on class (more robust than WeakMap with decorators)
    target.__forgeMetadata__ = options;
    if (!customElements.get(options.tag)) {
      customElements.define(options.tag, target);
    }
    return target;
  };
}

export class ForgeComponent extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._instanceId = crypto.randomUUID();
    this._baseUrl = this.getAttribute('data-forge-url') || 'https://forge.entrained.ai';
    this._componentId = this.getAttribute('data-forge-id') || this.tagName.toLowerCase();
    this._props = {};

    // Event delegation: handlers registered per-render, looked up by ID at event time
    this._handlers = new Map();
    this._handlerCounter = 0;
    this._hasRendered = false;

    this.instance = new StorageAPI(this._baseUrl, this._componentId, 'instance', this._instanceId);
    this.class = new StorageAPI(this._baseUrl, this._componentId, 'class');
    this.global = new StorageAPI(this._baseUrl, this._componentId, 'global');
  }

  get props() { return this._props; }

  initProps() {
    const metadata = this.constructor.__forgeMetadata__;
    if (!metadata?.props) return;
    for (const [name, config] of Object.entries(metadata.props)) {
      const attrValue = this.getAttribute(name);
      if (attrValue !== null) {
        if (config.type === Number) this._props[name] = parseFloat(attrValue);
        else if (config.type === Boolean) this._props[name] = attrValue !== 'false';
        else this._props[name] = attrValue;
      } else if (config.default !== undefined) {
        this._props[name] = config.default;
      }
    }
  }

  static get observedAttributes() {
    const metadata = this.__forgeMetadata__;
    return metadata?.props ? Object.keys(metadata.props) : [];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    const metadata = this.constructor.__forgeMetadata__;
    const propConfig = metadata?.props?.[name];
    if (propConfig) {
      if (newValue === null) this._props[name] = propConfig.default;
      else if (propConfig.type === Number) this._props[name] = parseFloat(newValue);
      else if (propConfig.type === Boolean) this._props[name] = newValue !== 'false';
      else this._props[name] = newValue;
      this.onUpdate([name]);
    }
  }

  connectedCallback() {
    this.initProps();
    this._setupEventDelegation();
    this.update();
    requestAnimationFrame(() => Promise.resolve(this.onMount()));
  }

  _setupEventDelegation() {
    // Set up delegated event listeners on shadow root
    // Handlers are looked up dynamically by ID, so closures are always fresh
    const component = this;
    _delegatedEvents.forEach(eventType => {
      const useCapture = eventType === 'focus' || eventType === 'blur';
      this.shadowRoot.addEventListener(eventType, (e) => {
        // Walk up from target to find element with handler for this event
        let target = e.target;
        while (target && target !== component.shadowRoot) {
          const handlerId = target.getAttribute?.('data-forge-' + eventType);
          if (handlerId) {
            const handler = component._handlers.get(parseInt(handlerId));
            if (handler) {
              handler.call(component, e);
            }
            break;
          }
          target = target.parentNode;
        }
      }, useCapture);
    });
  }

  disconnectedCallback() { this.onUnmount(); }
  async onMount() {}
  onUpdate(changedProps) {}
  onUnmount() {}
  onFirstRender() {}

  update() {
    if (!this.shadowRoot) return;
    // Reset handler registry for fresh closures
    this._handlers.clear();
    this._handlerCounter = 0;
    // Set current component so h() can register handlers
    _currentComponent = this;
    const rendered = this.render();
    _currentComponent = null;
    if (typeof rendered === 'string') {
      this.shadowRoot.innerHTML = rendered;
    } else if (rendered instanceof Node) {
      // Use DOM morphing to preserve focus and input state
      if (this.shadowRoot.firstChild) {
        morph(this.shadowRoot.firstChild, rendered);
      } else {
        this.shadowRoot.appendChild(rendered);
      }    }
    // Call onFirstRender after first render (refs now available)
    if (!this._hasRendered) {
      this._hasRendered = true;
      // Defer to next frame so browser has completed layout
      requestAnimationFrame(() => this.onFirstRender());
    }
  }

  emit(eventName, detail) {
    this.dispatchEvent(new CustomEvent(eventName, { detail, bubbles: true, composed: true }));
  }

  query(selector) { return this.shadowRoot?.querySelector(selector) ?? null; }
  queryAll(selector) { return Array.from(this.shadowRoot?.querySelectorAll(selector) ?? []); }

  // Asset generation methods
  async createImage(prompt, options = {}) {
    const response = await fetch(this._baseUrl + '/api/forge/assets/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, options }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Image generation failed');
    }
    const result = await response.json();
    return result.url;
  }

  async createSpeech(text, options = {}) {
    const response = await fetch(this._baseUrl + '/api/forge/assets/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, options }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Speech generation failed');
    }
    const result = await response.json();
    return result.url;
  }

  // AI chat/completion - add intelligence to components
  async ai(input, options = {}) {
    // Build messages array from input
    let messages;
    if (typeof input === 'string') {
      // Simple string prompt
      messages = options.system
        ? [{ role: 'system', content: options.system }, { role: 'user', content: input }]
        : [{ role: 'user', content: input }];
    } else if (Array.isArray(input)) {
      // Full messages array
      messages = input;
    } else {
      throw new Error('ai() expects a string prompt or messages array');
    }

    const response = await fetch(this._baseUrl + '/api/forge/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        model: options.model,
        max_tokens: options.maxTokens || options.max_tokens,
      }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'AI chat failed');
    }
    const result = await response.json();
    return result.response;
  }
}

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  let deferredValue = undefined;  // For select elements
  let refCallback = null;  // For ref callbacks, set value after children
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
      else if (key.startsWith('on') && typeof value === 'function') {
        // Event delegation: register handler and store ID as data attribute
        // Handler is looked up dynamically at event time, so closures are always fresh
        if (_currentComponent) {
          const eventName = key.slice(2).toLowerCase();
          const handlerId = ++_currentComponent._handlerCounter;
          _currentComponent._handlers.set(handlerId, value);
          el.setAttribute('data-forge-' + eventName, handlerId);
        }
      }
      else if (key === 'className') el.className = String(value);
      // Handle form element properties that need to be set as properties, not attributes
      else if (key === 'value' && (tag === 'input' || tag === 'textarea')) {
        el.value = String(value ?? '');
      }
      else if (key === 'value' && tag === 'select') {
        // Defer setting select value until after options are appended
        deferredValue = String(value ?? '');
      }
      else if (key === 'checked' && tag === 'input') el.checked = Boolean(value);
      else if (key === 'selected' && tag === 'option') el.selected = Boolean(value);
      else if (key === 'ref' && typeof value === 'function') { refCallback = value; }
      else if (typeof value === 'boolean') { if (value) el.setAttribute(key, ''); }
      else el.setAttribute(key, String(value));
    }
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    if (typeof child === 'string' || typeof child === 'number') el.appendChild(document.createTextNode(String(child)));
    else if (child instanceof Node) el.appendChild(child);
  }
  // Set select value after options are appended
  if (deferredValue !== undefined) {
    el.value = deferredValue;
  }
  // Call ref callback with element
  if (refCallback) refCallback(el);
  return el;
}

export const Fragment = 'fragment';

export class ForgeRuntime {
  constructor(componentId, baseUrl = 'https://forge.entrained.ai') {
    this.componentId = componentId;
    this.baseUrl = baseUrl;
  }
}
