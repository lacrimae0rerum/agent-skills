/**
 * OpenAI image judge: the Responses API with OPENAI_API_KEY, else the codex CLI (`codex exec -i`).
 * Payload contract: https://developers.openai.com/api/docs/guides/images-vision
 * The transport lives in Tools/lib/VisionCall.ts; this file keeps the upstream entry point.
 *
 * Adapted from the upstream MIT-licensed tool (see LICENSE.txt).
 */
export { guardVisionRequest, openAiVision, openAiVisionBody, openAiVisionResponseOf, openAiVisionModel, OPENAI_VISION_TIMEOUT_MS, type VisionResponse } from './lib/VisionCall.ts';
