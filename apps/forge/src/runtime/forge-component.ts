/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

/**
 * ForgeComponent - Client-side WebComponent Base Class
 *
 * Provides the runtime for generated components including:
 * - @Component decorator
 * - Storage APIs (instance/class/global)
 * - Lifecycle hooks
 * - Event emission
 * - Shadow DOM management
 */

// Storage API wrapper
class StorageAPI {
  constructor(
    private baseUrl: string,
    private componentId: string,
    private scope: 'instance' | 'class' | 'global',
    private instanceId?: string
  ) {}

  private url(key?: string): string {
    const base = `${this.baseUrl}/api/forge/${this.componentId}`;
    if (this.scope === 'instance') {
      return key
        ? `${base}/instance/${this.instanceId}/data/${key}`
        : `${base}/instance/${this.instanceId}/data`;
    } else if (this.scope === 'class') {
      return key ? `${base}/class/data/${key}` : `${base}/class/data`;
    } else {
      return key
        ? `${this.baseUrl}/api/forge/global/data/${key}`
        : `${this.baseUrl}/api/forge/global/data`;
    }
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    try {
      const response = await fetch(this.url(key));
      if (!response.ok) return null;
      const data = await response.json() as { value: T };
      return data.value;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    await fetch(this.url(key), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    });
  }

  async delete(key: string): Promise<void> {
    await fetch(this.url(key), { method: 'DELETE' });
  }

  async list(): Promise<string[]> {
    try {
      const response = await fetch(this.url());
      if (!response.ok) return [];
      const data = await response.json() as { keys: string[] };
      return data.keys;
    } catch {
      return [];
    }
  }
}

// Component metadata from decorator
interface ComponentOptions {
  tag: string;
  props?: Record<string, { type: typeof String | typeof Number | typeof Boolean; default?: unknown }>;
  cssVariables?: string[];
  parts?: string[];
}

// Store decorator metadata
const componentMetadata = new WeakMap<Function, ComponentOptions>();

/**
 * @Component decorator
 */
export function Component(options: ComponentOptions) {
  return function <T extends new (...args: unknown[]) => ForgeComponent>(target: T) {
    componentMetadata.set(target, options);

    // Register as custom element
    if (!customElements.get(options.tag)) {
      customElements.define(options.tag, target);
    }

    return target;
  };
}

/**
 * ForgeComponent base class
 */
export abstract class ForgeComponent<P = Record<string, unknown>> extends HTMLElement {
  // Instance ID for storage
  private _instanceId: string;
  private _baseUrl: string;
  private _componentId: string;

  // Storage APIs
  public instance!: StorageAPI;
  public class!: StorageAPI;
  public global!: StorageAPI;

  // Props
  protected _props: P = {} as P;

  get props(): P {
    return this._props;
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });

    // Generate unique instance ID
    this._instanceId = crypto.randomUUID();

    // Determine base URL and component ID from script URL or attribute
    this._baseUrl = this.getAttribute('data-forge-url') || 'https://forge.entrained.ai';
    this._componentId = this.getAttribute('data-forge-id') || this.tagName.toLowerCase();

    // Initialize storage APIs
    this.instance = new StorageAPI(this._baseUrl, this._componentId, 'instance', this._instanceId);
    this.class = new StorageAPI(this._baseUrl, this._componentId, 'class');
    this.global = new StorageAPI(this._baseUrl, this._componentId, 'global');
  }

  /**
   * Initialize props from attributes based on decorator config
   */
  private initProps(): void {
    const metadata = componentMetadata.get(this.constructor);
    if (!metadata?.props) return;

    for (const [name, config] of Object.entries(metadata.props)) {
      const attrValue = this.getAttribute(name);

      if (attrValue !== null) {
        // Parse attribute value based on type
        if (config.type === Number) {
          (this._props as Record<string, unknown>)[name] = parseFloat(attrValue);
        } else if (config.type === Boolean) {
          (this._props as Record<string, unknown>)[name] = attrValue !== 'false';
        } else {
          (this._props as Record<string, unknown>)[name] = attrValue;
        }
      } else if (config.default !== undefined) {
        (this._props as Record<string, unknown>)[name] = config.default;
      }
    }
  }

  /**
   * Watch for attribute changes
   */
  static get observedAttributes(): string[] {
    const metadata = componentMetadata.get(this);
    return metadata?.props ? Object.keys(metadata.props) : [];
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return;

    const metadata = componentMetadata.get(this.constructor);
    const propConfig = metadata?.props?.[name];

    if (propConfig) {
      if (newValue === null) {
        (this._props as Record<string, unknown>)[name] = propConfig.default;
      } else if (propConfig.type === Number) {
        (this._props as Record<string, unknown>)[name] = parseFloat(newValue);
      } else if (propConfig.type === Boolean) {
        (this._props as Record<string, unknown>)[name] = newValue !== 'false';
      } else {
        (this._props as Record<string, unknown>)[name] = newValue;
      }

      // Call lifecycle hook
      this.onUpdate([name]);
    }
  }

  /**
   * Lifecycle: Component added to DOM
   */
  connectedCallback(): void {
    this.initProps();
    this.onMount();
    this.update();
  }

  /**
   * Lifecycle: Component removed from DOM
   */
  disconnectedCallback(): void {
    this.onUnmount();
  }

  /**
   * Override in subclass: Called when component mounts
   */
  async onMount(): Promise<void> {}

  /**
   * Override in subclass: Called when props change
   */
  onUpdate(_changedProps: string[]): void {}

  /**
   * Override in subclass: Called when component unmounts
   */
  onUnmount(): void {}

  /**
   * Override in subclass: Return JSX/HTML for the component
   */
  abstract render(): string | Node;

  /**
   * Trigger a re-render
   */
  update(): void {
    if (!this.shadowRoot) return;

    const metadata = componentMetadata.get(this.constructor);
    const rendered = this.render();

    // Build styles
    let styles = '';
    if (metadata?.cssVariables?.length) {
      styles = `:host { ${metadata.cssVariables.map(v => `${v}: var(${v})`).join('; ')} }`;
    }

    if (typeof rendered === 'string') {
      this.shadowRoot.innerHTML = `<style>${styles}</style>${rendered}`;
    } else {
      this.shadowRoot.innerHTML = `<style>${styles}</style>`;
      this.shadowRoot.appendChild(rendered);
    }
  }

  /**
   * Emit a custom event
   */
  emit(eventName: string, detail?: unknown): void {
    this.dispatchEvent(
      new CustomEvent(eventName, {
        detail,
        bubbles: true,
        composed: true,
      })
    );
  }

  /**
   * Query the shadow DOM
   */
  query<T extends Element = Element>(selector: string): T | null {
    return this.shadowRoot?.querySelector<T>(selector) ?? null;
  }

  /**
   * Query all in shadow DOM
   */
  queryAll<T extends Element = Element>(selector: string): T[] {
    return Array.from(this.shadowRoot?.querySelectorAll<T>(selector) ?? []);
  }

  /**
   * Generate an image from a text prompt
   * @param prompt - Description of the image to generate
   * @param options - Generation options (width, height, transparent, style, preset)
   * @returns URL to the generated image
   */
  async createImage(
    prompt: string,
    options: {
      width?: number;
      height?: number;
      transparent?: boolean;
      style?: 'illustration' | 'photo' | '3d' | 'pixel-art';
      preset?: 'icon' | 'hero' | 'sprite';
    } = {}
  ): Promise<string> {
    const response = await fetch(`${this._baseUrl}/api/forge/assets/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, options }),
    });

    if (!response.ok) {
      const error = await response.json() as { error?: string };
      throw new Error(error.error || 'Image generation failed');
    }

    const result = await response.json() as { url: string };
    return result.url;
  }

  /**
   * Generate speech audio from text
   * @param text - Text to convert to speech
   * @param options - TTS options (voice, speed, format)
   * @returns URL to the generated audio file
   */
  async createSpeech(
    text: string,
    options: {
      voice?: 'alloy' | 'ash' | 'ballad' | 'coral' | 'echo' | 'fable' | 'onyx' | 'nova' | 'sage' | 'shimmer' | 'verse' | 'marin' | 'cedar';
      speed?: number;
      format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';
      instructions?: string;
    } = {}
  ): Promise<string> {
    const response = await fetch(`${this._baseUrl}/api/forge/assets/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, options }),
    });

    if (!response.ok) {
      const error = await response.json() as { error?: string };
      throw new Error(error.error || 'Speech generation failed');
    }

    const result = await response.json() as { url: string };
    return result.url;
  }
}

/**
 * Simple JSX-like helper for creating elements
 */
export function h(
  tag: string,
  attrs?: Record<string, unknown> | null,
  ...children: (string | Node)[]
): HTMLElement {
  const el = document.createElement(tag);

  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'style' && typeof value === 'object') {
        Object.assign(el.style, value);
      } else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
      } else if (key === 'className') {
        el.className = String(value);
      } else if (typeof value === 'boolean') {
        if (value) el.setAttribute(key, '');
      } else {
        el.setAttribute(key, String(value));
      }
    }
  }

  for (const child of children) {
    if (typeof child === 'string') {
      el.appendChild(document.createTextNode(child));
    } else if (child) {
      el.appendChild(child);
    }
  }

  return el;
}

export const Fragment = 'fragment';

/**
 * ForgeRuntime - Initialize the runtime for a component
 */
export class ForgeRuntime {
  constructor(public componentId: string, public baseUrl = 'https://forge.entrained.ai') {}

  /**
   * Load and register a component
   */
  async load(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/forge/${this.componentId}/component.js`);
    if (!response.ok) {
      throw new Error(`Failed to load component: ${response.status}`);
    }
    const code = await response.text();
    // The component code will call customElements.define via the @Component decorator
    new Function('ForgeComponent', 'Component', 'h', 'Fragment', code)(
      ForgeComponent,
      Component,
      h,
      Fragment
    );
  }
}

// Export for browser usage
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).ForgeComponent = ForgeComponent;
  (window as unknown as Record<string, unknown>).Component = Component;
  (window as unknown as Record<string, unknown>).ForgeRuntime = ForgeRuntime;
  (window as unknown as Record<string, unknown>).h = h;
  (window as unknown as Record<string, unknown>).Fragment = Fragment;
}
