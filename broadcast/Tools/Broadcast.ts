#!/usr/bin/env bun
/**
 * Broadcast CLI - Multi-Platform Social Media Posting
 *
 * Usage:
 *   bun Tools/Broadcast.ts post --dry-run --content "Hello" --platforms twitter   (from the skill folder)
 *   bun Tools/Broadcast.ts post --yes --content "Hello" --platforms twitter       (after the user confirmed)
 *   bun Tools/Broadcast.ts status
 *   bun Tools/Broadcast.ts auth <platform>
 */

// Re-export the main CLI
import '../src/index';
