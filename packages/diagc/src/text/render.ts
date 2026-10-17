import { serialize, type ColorMode } from './ansi';
import { ASCII, UNICODE } from './glyphs';
import { paint } from './paint';
import { buildScene, type SceneInput } from './scene';

export interface TextOptions {
  /** plain ASCII in place of box-drawing characters */
  ascii: boolean;
  color: ColorMode;
}

/** A diagram's view as lines of text; none when the view has nothing in it. */
export async function renderToLines(input: SceneInput, options: TextOptions): Promise<string[]> {
  const glyphs = options.ascii ? ASCII : UNICODE;
  const scene = await buildScene(input, glyphs);
  if (scene.layout.boxes.size === 0) return [];
  return serialize(paint(scene, { glyphs }).cells(glyphs), options.color);
}
