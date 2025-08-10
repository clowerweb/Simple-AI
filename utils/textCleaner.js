// Text cleaning utility for TTS
// Strips markdown, emojis, and unwanted symbols for better TTS output

export function cleanTextForTTS(text) {
  if (!text || typeof text !== 'string') return '';
  
  let cleaned = text;
  
  // Remove markdown formatting
  // Remove code blocks (``` or ` wrapped)
  cleaned = cleaned.replace(/```[\s\S]*?```/g, ' code block ');
  cleaned = cleaned.replace(/`([^`]+)`/g, '$1');
  
  // Remove markdown links [text](url) -> text
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  
  // Remove markdown images ![alt](url)
  cleaned = cleaned.replace(/!\[[^\]]*\]\([^)]+\)/g, '');
  
  // Remove markdown headers (# ## ###)
  cleaned = cleaned.replace(/^#+\s*/gm, '');
  
  // Remove markdown emphasis (**bold**, *italic*, __bold__, _italic_)
  cleaned = cleaned.replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1');
  cleaned = cleaned.replace(/_{1,2}([^_]+)_{1,2}/g, '$1');
  
  // Remove markdown strikethrough ~~text~~
  cleaned = cleaned.replace(/~~([^~]+)~~/g, '$1');
  
  // Remove HTML tags
  cleaned = cleaned.replace(/<[^>]+>/g, '');
  
  // Remove emojis (Unicode ranges for emojis)
  cleaned = cleaned.replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '');
  
  // Remove other Unicode symbols and pictographs
  cleaned = cleaned.replace(/[\u{1F900}-\u{1F9FF}]|[\u{1FA70}-\u{1FAFF}]/gu, '');
  
  // Keep only allowed characters: A-Za-z0-9 space -+=!.,?\n
  cleaned = cleaned.replace(/[^A-Za-z0-9 !.,?\n]/g, '');
  
  // Convert newlines to periods for proper TTS pauses
  // Only add period if there isn't already punctuation before the newline
  cleaned = cleaned.replace(/([^.!?])\n+/g, ' ');
  // Handle newlines that are already preceded by punctuation
  cleaned = cleaned.replace(/([.!?])\n+/g, ' ');
  
  // Clean up extra whitespace
  cleaned = cleaned.replace(/\s+/g, ' ');
  cleaned = cleaned.trim();
  
  return cleaned;
}

// Optional: Convert some symbols to words (for future use)
export function convertSymbolsToWords(text) {
  let converted = text;
  
  // Convert & to "and" only if not followed by space
  converted = converted.replace(/&(?!\s)/g, 'and');
  
  // Convert # to "hashtag" only if not followed by space
  converted = converted.replace(/#(?!\s)/g, 'hashtag');
  
  return converted;
}