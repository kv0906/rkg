import type { ParsedComponent } from '../types.js';

let pipeline: any = null;

/**
 * Build a searchable text representation of a component for embedding.
 */
export function buildEmbeddingText(component: ParsedComponent): string {
  const lines: string[] = [];
  lines.push(`Component: ${component.name}`);
  if (component.description) {
    lines.push(`Description: ${component.description}`);
  }
  lines.push(`Layer: ${component.layer}`);
  if (component.props.length > 0) {
    const propsStr = component.props
      .map(p => `${p.name}: ${p.type}`)
      .join(', ');
    lines.push(`Props: ${propsStr}`);
  }
  if (component.hooks.length > 0) {
    lines.push(`Hooks: ${component.hooks.join(', ')}`);
  }
  lines.push(`Has state: ${component.hasState}`);
  return lines.join('\n');
}

/**
 * Generate a 384-dimensional embedding vector for the given text.
 * Uses Xenova/all-MiniLM-L6-v2 (runs locally, no API key required).
 * The model (~22MB) is downloaded and cached on first use.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!pipeline) {
    const { pipeline: createPipeline } = await import('@xenova/transformers');
    pipeline = await createPipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  const output = await pipeline(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data as Float32Array);
}
