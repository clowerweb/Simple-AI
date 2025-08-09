import { phonemize } from 'phonemizer';

// TextCleaner maps characters/IPA to integer IDs expected by the Kitten TTS model
export class TextCleaner {
  constructor() {
    const pad = '$';
    const punctuation = ';:,.!?¡¿—…"«»"" ';
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const lettersIpa = "ɑɐɒæɓʙβɔɕçɗɖðʤəɘɚɛɜɝɞɟʄɡɠɢʛɦɧħɥʜɨɪʝɭɬɫɮʟɱɯɰŋɳɲɴøɵɸθœɶʘɹɺɾɻʀʁɽʂʃʈʧʉʊʋⱱʌɣɤʍχʎʏʑʐʒʔʡʕʢǀǁǂǃˈˌːˑʼʴʰʱʲʷˠˤ˞↓↑→↗↘'̩'ᵻ";
    const symbols = [pad, ...Array.from(punctuation), ...Array.from(letters), ...Array.from(lettersIpa)];
    this.wordIndexDictionary = {};
    symbols.forEach((symbol, i) => {
      this.wordIndexDictionary[symbol] = i;
    });
  }
  clean(text) {
    const indexes = [];
    for (const ch of text) {
      if (this.wordIndexDictionary[ch] !== undefined) indexes.push(this.wordIndexDictionary[ch]);
    }
    return indexes;
  }
}

export async function phonemizeText(text, { lang = 'en-us' } = {}) {
  try {
    const res = await phonemize(text, lang, {
      backend: 'espeak',
      preserve_punctuation: true,
      with_stress: false,
    });
    return Array.isArray(res) ? res.join(' ') : res;
  } catch (err) {
    // Fallback simple approximation
    return simplePhonemeApproximation(text);
  }
}

function simplePhonemeApproximation(text) {
  return text
    .toLowerCase()
    .replace(/ph/g, 'f')
    .replace(/ch/g, 'tʃ')
    .replace(/sh/g, 'ʃ')
    .replace(/th/g, 'θ')
    .replace(/ng/g, 'ŋ')
    .replace(/a/g, 'ə')
    .replace(/e/g, 'ɛ')
    .replace(/i/g, 'ɪ')
    .replace(/o/g, 'ɔ')
    .replace(/u/g, 'ʊ');
}

export function buildTokenIdsFromPhonemes(phonemeString) {
  const cleaner = new TextCleaner();
  const ids = cleaner.clean(phonemeString);
  ids.unshift(0);
  ids.push(0);
  return ids;
}


