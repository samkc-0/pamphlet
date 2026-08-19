export type SpeechProvider = {
  speak(word: string, languageCode: string): void;
};

let currentAudio: HTMLAudioElement | null = null;

const googleTranslateTtsProvider: SpeechProvider = {
  speak(word, languageCode) {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    }

    const url = new URL("https://translate.google.com/translate_tts");
    url.searchParams.set("ie", "UTF-8");
    url.searchParams.set("client", "tw-ob");
    url.searchParams.set("tl", languageCode);
    url.searchParams.set("q", word);

    const audio = new Audio();
    audio.setAttribute("referrerpolicy", "no-referrer");
    audio.addEventListener("error", () => {
      console.error("Word audio failed to load", url.toString(), audio.error);
    });
    audio.src = url.toString();
    currentAudio = audio;
    audio.play().catch((error: unknown) => {
      console.error("Word audio failed to play", url.toString(), error);
    });
  }
};

let activeProvider: SpeechProvider = googleTranslateTtsProvider;

export function setSpeechProvider(provider: SpeechProvider) {
  activeProvider = provider;
}

export function speakWord(word: string, languageCode: string) {
  if (languageCode === "und") return;

  activeProvider.speak(word, languageCode);
}
