/**
 * Type Definition Generator
 *
 * Generates TypeScript .d.ts files from Forge manifests.
 */

import type { ForgeManifest, ComponentDef, PropDef, EventDef, CSSVarDef, PartDef } from '../types';

/**
 * Map Forge prop types to TypeScript types
 */
function mapPropType(type: PropDef['type']): string {
  switch (type) {
    case 'String': return 'string';
    case 'Number': return 'number';
    case 'Boolean': return 'boolean';
    case 'Object': return 'Record<string, unknown>';
    case 'Array': return 'unknown[]';
    default: return 'unknown';
  }
}

/**
 * Generate props interface for a component
 */
function generatePropsInterface(component: ComponentDef): string {
  if (component.props.length === 0) {
    return '';
  }

  const propsName = `${component.name}Props`;
  const propLines = component.props.map(prop => {
    const optional = prop.required ? '' : '?';
    const comment = prop.description ? `  /** ${prop.description} */\n` : '';
    return `${comment}  ${prop.name}${optional}: ${mapPropType(prop.type)};`;
  });

  return `export interface ${propsName} {\n${propLines.join('\n')}\n}`;
}

/**
 * Generate events interface for a component
 */
function generateEventsInterface(component: ComponentDef): string {
  if (!component.events || component.events.length === 0) {
    return '';
  }

  const eventsName = `${component.name}Events`;
  const eventLines = component.events.map(event => {
    const detailType = event.detail_type || 'unknown';
    const comment = event.description ? `  /** ${event.description} */\n` : '';
    return `${comment}  '${event.name}': CustomEvent<${detailType}>;`;
  });

  return `export interface ${eventsName} {\n${eventLines.join('\n')}\n}`;
}

/**
 * Generate CSS variables type
 */
function generateCSSVarsType(cssVars: CSSVarDef[] | undefined): string {
  if (!cssVars || cssVars.length === 0) {
    return '';
  }

  const varLines = cssVars.map(v => {
    const comment = v.description ? `  /** ${v.description} (default: ${v.default}) */\n` : '';
    return `${comment}  '${v.name}'?: string;`;
  });

  return `export interface CSSVariables {\n${varLines.join('\n')}\n}`;
}

/**
 * Generate parts type
 */
function generatePartsType(parts: PartDef[] | undefined): string {
  if (!parts || parts.length === 0) {
    return '';
  }

  const partNames = parts.map(p => `'${p.name}'`).join(' | ');
  return `export type Parts = ${partNames};`;
}

/**
 * Generate component class declaration
 */
function generateComponentClass(component: ComponentDef): string {
  const hasProps = component.props.length > 0;
  const hasEvents = component.events && component.events.length > 0;
  const propsType = hasProps ? `${component.name}Props` : '{}';

  const lines: string[] = [];

  // Class declaration with JSDoc
  lines.push(`/**`);
  lines.push(` * <${component.tag}> WebComponent`);
  lines.push(` */`);
  lines.push(`export declare class ${component.name} extends HTMLElement {`);

  // Props as properties
  if (hasProps) {
    for (const prop of component.props) {
      const comment = prop.description ? `  /** ${prop.description} */\n` : '';
      lines.push(`${comment}  ${prop.name}: ${mapPropType(prop.type)};`);
    }
    lines.push('');
  }

  // Lifecycle methods
  lines.push('  /** Called when component is added to DOM */');
  lines.push('  onMount?(): void | Promise<void>;');
  lines.push('');
  lines.push('  /** Called when props change */');
  lines.push('  onUpdate?(changedProps: string[]): void;');
  lines.push('');
  lines.push('  /** Called when component is removed from DOM */');
  lines.push('  onUnmount?(): void;');
  lines.push('');
  lines.push('  /** Render the component */');
  lines.push('  render(): string | HTMLElement;');
  lines.push('');

  // Utility methods
  lines.push('  /** Emit a custom event */');
  lines.push('  emit(name: string, detail?: unknown): void;');
  lines.push('');
  lines.push('  /** Query shadow DOM */');
  lines.push('  query<T extends Element = Element>(selector: string): T | null;');
  lines.push('');
  lines.push('  /** Query all in shadow DOM */');
  lines.push('  queryAll<T extends Element = Element>(selector: string): NodeListOf<T>;');
  lines.push('');
  lines.push('  /** Trigger re-render */');
  lines.push('  update(): void;');

  lines.push('}');

  return lines.join('\n');
}

/**
 * Generate full .d.ts file from a manifest
 */
export function generateTypeDefs(manifest: ForgeManifest): string {
  const sections: string[] = [];

  // Header
  sections.push('// Auto-generated type definitions for Forge component');
  sections.push(`// Component ID: ${manifest.id}`);
  sections.push(`// Generated: ${new Date().toISOString()}`);
  sections.push('');

  // CSS variables type
  const cssVarsType = generateCSSVarsType(manifest.css_variables);
  if (cssVarsType) {
    sections.push(cssVarsType);
    sections.push('');
  }

  // Parts type
  const partsType = generatePartsType(manifest.parts);
  if (partsType) {
    sections.push(partsType);
    sections.push('');
  }

  // Component definitions
  for (const component of manifest.components) {
    // Props interface
    const propsInterface = generatePropsInterface(component);
    if (propsInterface) {
      sections.push(propsInterface);
      sections.push('');
    }

    // Events interface
    const eventsInterface = generateEventsInterface(component);
    if (eventsInterface) {
      sections.push(eventsInterface);
      sections.push('');
    }

    // Component class
    sections.push(generateComponentClass(component));
    sections.push('');
  }

  // Default export (first exported component)
  const exportedComponent = manifest.components.find(c => c.exported);
  if (exportedComponent) {
    sections.push(`export default ${exportedComponent.name};`);
  }

  return sections.join('\n');
}
