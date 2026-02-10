import {
  TranslateClient,
  TranslateTextCommand,
} from '@aws-sdk/client-translate';
import { config } from '../config';
import { PIVOT_LANGUAGE } from '../utils/languages';

const client = new TranslateClient({ region: config.aws.region });

/**
 * Translate text between languages using English as the pivot.
 * Source → English → Target
 *
 * Returns { pivotText, translatedText }.
 * pivotText is the English intermediate (useful for logging / secondary display).
 */
export async function pivotTranslate(
  text: string,
  sourceLanguageCode: string,
  targetLanguageCode: string,
): Promise<{ pivotText: string; translatedText: string }> {
  // Same language → no-op
  if (sourceLanguageCode === targetLanguageCode) {
    return { pivotText: text, translatedText: text };
  }

  // Source IS English → translate directly to target
  if (sourceLanguageCode === PIVOT_LANGUAGE) {
    const translated = await translateDirect(text, PIVOT_LANGUAGE, targetLanguageCode);
    return { pivotText: text, translatedText: translated };
  }

  // Target IS English → translate directly to English
  if (targetLanguageCode === PIVOT_LANGUAGE) {
    const translated = await translateDirect(text, sourceLanguageCode, PIVOT_LANGUAGE);
    return { pivotText: translated, translatedText: translated };
  }

  // Otherwise: Source → English → Target (two hops)
  const pivotText = await translateDirect(text, sourceLanguageCode, PIVOT_LANGUAGE);
  const translatedText = await translateDirect(pivotText, PIVOT_LANGUAGE, targetLanguageCode);
  return { pivotText, translatedText };
}

/**
 * Auto-detect source language and translate.
 * Useful for chat messages where we don't know the source language.
 */
export async function autoTranslate(
  text: string,
  targetLanguageCode: string,
): Promise<{ detectedSource: string; pivotText: string; translatedText: string }> {
  // First: auto-detect → English
  const autoResp = await client.send(
    new TranslateTextCommand({
      Text: text,
      SourceLanguageCode: 'auto',
      TargetLanguageCode: PIVOT_LANGUAGE,
    }),
  );
  const detectedSource = autoResp.SourceLanguageCode || 'en';
  const pivotText = autoResp.TranslatedText!;

  // If target is English, we're done
  if (targetLanguageCode === PIVOT_LANGUAGE) {
    return { detectedSource, pivotText, translatedText: pivotText };
  }

  // If source already was the target, return original
  if (detectedSource === targetLanguageCode) {
    return { detectedSource, pivotText, translatedText: text };
  }

  // Second hop: English → Target
  const translatedText = await translateDirect(pivotText, PIVOT_LANGUAGE, targetLanguageCode);
  return { detectedSource, pivotText, translatedText };
}

/** Direct single-hop translation. */
export async function translateDirect(
  text: string,
  source: string,
  target: string,
): Promise<string> {
  if (source === target) return text;
  const resp = await client.send(
    new TranslateTextCommand({
      Text: text,
      SourceLanguageCode: source,
      TargetLanguageCode: target,
    }),
  );
  return resp.TranslatedText!;
}
