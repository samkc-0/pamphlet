export type SpeechProvider = {
  speak(text: string, languageCode: string): HTMLAudioElement | null;
};

let currentAudio: HTMLAudioElement | null = null;

const googleTranslateTtsProvider: SpeechProvider = {
  speak(text, languageCode) {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    }

    const url = new URL("https://translate.google.com/translate_tts");
    url.searchParams.set("ie", "UTF-8");
    url.searchParams.set("client", "tw-ob");
    url.searchParams.set("tl", languageCode);
    url.searchParams.set("q", text);

    const audio = new Audio();
    audio.setAttribute("referrerpolicy", "no-referrer");
    audio.addEventListener("error", () => {
      console.error("Audio failed to load", url.toString(), audio.error);
    });
    audio.src = url.toString();
    currentAudio = audio;
    audio.play().catch((error: unknown) => {
      console.error("Audio failed to play", url.toString(), error);
    });
    return audio;
  }
};

let activeProvider: SpeechProvider = googleTranslateTtsProvider;

export function setSpeechProvider(provider: SpeechProvider) {
  activeProvider = provider;
}

/**
 * Returns the underlying HTMLAudioElement (or null if the language is
 * unsupported) so callers can listen for play/ended/error themselves - e.g.
 * to highlight text while its audio is playing.
 */
export function speakWord(word: string, languageCode: string) {
  if (languageCode === "und") return null;

  return activeProvider.speak(word, languageCode);
}

export function speakText(text: string, languageCode: string) {
  if (languageCode === "und" || !text.trim()) return null;

  return activeProvider.speak(text, languageCode);
}
