import { availableTransformers } from './transformers';
import { TransformContext } from './transformers/types';

export const transformContent = async (ctx: TransformContext): Promise<string> => {
  let transformed = ctx.content;

  const activeTransformers = ctx.transformers
    .map((name) => availableTransformers.find((transformer) => transformer.name === name))
    .filter((transformer) => !!transformer);
  for (const transformer of activeTransformers) {
    try {
      transformed = await transformer.transform({ ...ctx, content: transformed });
    } catch (error) {
      // An optional typography failure may be tolerated; a security failure may not.
      if (transformer.name === 'sanitizer') throw error;
      console.warn(`Error in transformer ${transformer.name}:`, error);
    }
  }

  return transformed;
};
