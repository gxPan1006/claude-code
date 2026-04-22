// Pure translators between Contract v1 messages and Anthropic SDK's
// ContentBlockParam (what claude2's QueryEngine.submitMessage accepts).
//
// NO claude2-internal imports here — these are pure functions that can be
// unit-tested without any QueryEngine or AppState scaffolding.

import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'

import type {
  ContentBlock,
  SystemNotice,
  UserMessage,
} from '../contract/v1/index.js'

export class UnsupportedContentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedContentError'
  }
}

/**
 * Translate one Contract v1 ContentBlock into an Anthropic ContentBlockParam.
 *
 * Supported:
 *   - text  → TextBlockParam
 *   - image → ImageBlockParam (base64 or path — path is read lazily by caller)
 *
 * Not yet supported (throws UnsupportedContentError):
 *   - audio — no native Anthropic primitive; callers should provide `transcript`
 *     and the adapter will convert to a text block (handled by translateContent).
 *   - file  — only inlined if path points to a PDF; otherwise read as text.
 *     For now: throw — caller decides how to handle.
 */
export function translateContentBlock(
  block: ContentBlock,
): ContentBlockParam {
  switch (block.type) {
    case 'text':
      return { type: 'text', text: block.text }

    case 'image': {
      if (block.source.kind === 'base64') {
        return {
          type: 'image',
          source: {
            type: 'base64',
            media_type: block.mediaType as
              | 'image/jpeg'
              | 'image/png'
              | 'image/gif'
              | 'image/webp',
            data: block.source.data,
          },
        }
      }
      // path case — caller must have already read + base64-encoded it; we
      // don't touch the filesystem in a pure translator.
      throw new UnsupportedContentError(
        'image with source.kind=path must be pre-loaded into base64 before translation',
      )
    }

    case 'audio':
      if (block.transcript) {
        return {
          type: 'text',
          text: `[audio transcript] ${block.transcript}`,
        }
      }
      throw new UnsupportedContentError(
        'audio block without transcript is not yet supported by claude2 adapter',
      )

    case 'file':
      throw new UnsupportedContentError(
        `file block (${block.mediaType}, name=${block.name}) is not yet supported — adapter caller must pre-process into text/image/document`,
      )
  }
}

/**
 * Translate the content array of a UserMessage into the shape expected by
 * QueryEngine.submitMessage (which accepts either a plain string or
 * ContentBlockParam[]).
 *
 * Optimisation: a single text block becomes a plain string (shorter API
 * payload, matches claude2's own REPL behaviour).
 */
export function userMessageToPrompt(
  msg: UserMessage,
): string | ContentBlockParam[] {
  if (msg.content.length === 1 && msg.content[0]?.type === 'text') {
    return msg.content[0].text
  }
  return msg.content.map(translateContentBlock)
}

/**
 * Translate a SystemNotice (produced by the external events framework) into
 * a prompt string. claude2 has no first-class "system message injection"
 * primitive for mid-session pushes, so we prefix the content with a tag that
 * downstream context assembly can recognise.
 */
export function systemNoticeToPrompt(notice: SystemNotice): string {
  const textParts: string[] = []
  for (const block of notice.content) {
    if (block.type === 'text') {
      textParts.push(block.text)
    } else if (block.type === 'audio' && block.transcript) {
      textParts.push(`[audio transcript] ${block.transcript}`)
    }
    // Other block types silently dropped — system notices should be text.
  }
  const body = textParts.join('\n').trim()
  return `[system notice from ${notice.source}]\n${body}`
}
