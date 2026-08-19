export type SpeechProvider = {
  speak(word: string, languageCode: string): void;
};

const webSpeechProvider: SpeechProvider = {
  speak(word, languageCode) {
    if (!("speechSynthesis" in window)) return;

    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = languageCode;

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }
};

let activeProvider: SpeechProvider = webSpeechProvider;

export function setSpeechProvider(provider: SpeechProvider) {
  activeProvider = provider;
}

export function speakWord(word: string, languageCode: string) {
  activeProvider.speak(word, languageCode);
}
