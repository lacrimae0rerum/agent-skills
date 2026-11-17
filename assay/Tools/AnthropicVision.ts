/**
 * Anthropic image judge: the Messages API with ANTHROPIC_API_KEY, the image as an inline base64 block.
 * The transport lives in Tools/lib/VisionCall.ts; this file keeps the entry point.
 *
 * Adapted from MIT-licensed code (see LICENSE.txt).
 */
export { anthropicVision, anthropicVisionModel as anthropicJudgeModel, IMAGE_UNAVAILABLE, ANTHROPIC_CALL_MS } from './lib/VisionCall.ts';
