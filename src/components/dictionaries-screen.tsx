import { Check, Download, Languages, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { invalidateOfflineDictionaryCache } from "@/lib/dictionary";
import { DICTIONARY_CATALOG } from "@/lib/dictionary-catalog";
import {
  downloadDictionary,
  getDownloadedDictionaryKeys,
  removeDictionary
} from "@/lib/dictionary-downloads";
import { GLASS_PANEL_CLASSNAME } from "@/lib/glass-panel";

const TOAST_DURATION_MS = 5000;

type DownloadState =
  | { status: "idle" }
  | { status: "downloading"; fraction: number };

export function DictionariesScreen() {
  const [downloadedKeys, setDownloadedKeys] = useState<Set<string>>(
    () => new Set()
  );
  const [downloadStates, setDownloadStates] = useState<
    Record<string, DownloadState>
  >({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    getDownloadedDictionaryKeys()
      .then((keys) => {
        if (!cancelled) setDownloadedKeys(keys);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  const showToast = (message: string) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToastMessage(message);
    toastTimer.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimer.current = null;
    }, TOAST_DURATION_MS);
  };

  const dismissToast = () => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = null;
    setToastMessage(null);
  };

  const handleDownload = async (key: string, label: string) => {
    setDownloadStates((current) => ({
      ...current,
      [key]: { fraction: 0, status: "downloading" }
    }));

    try {
      await downloadDictionary(key, (fraction) => {
        setDownloadStates((current) => ({
          ...current,
          [key]: { fraction, status: "downloading" }
        }));
      });
      invalidateOfflineDictionaryCache(key);
      setDownloadedKeys((current) => new Set(current).add(key));
      setDownloadStates((current) => ({ ...current, [key]: { status: "idle" } }));
    } catch (error) {
      setDownloadStates((current) => ({ ...current, [key]: { status: "idle" } }));
      showToast(
        `Couldn't download ${label}: ${
          error instanceof Error ? error.message : "download failed."
        }`
      );
    }
  };

  const handleDelete = async (key: string) => {
    await removeDictionary(key);
    invalidateOfflineDictionaryCache(key);
    setDownloadedKeys((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  };

  return (
    <div className="flex min-h-full items-center px-5 py-8 text-neutral-950 dark:text-neutral-100 sm:px-10 sm:py-12">
      <div className="mx-auto w-full max-w-3xl text-center">
        <fieldset className="mx-auto max-w-md border border-neutral-300 px-6 pb-7 pt-5 dark:border-neutral-700">
          <legend className="mx-auto px-3 text-neutral-500 dark:text-neutral-400">
            <span className="inline-grid h-10 w-10 place-items-center">
              <Languages
                aria-label="Offline dictionaries"
                className="h-7 w-7"
                role="img"
                strokeWidth={1.75}
              />
            </span>
          </legend>

          <p className="mb-5 text-sm text-neutral-600 dark:text-neutral-400">
            Download a dictionary for offline word lookups. Anything not
            downloaded falls back to an online dictionary or translation
            when you're connected.
          </p>

          <div className="grid grid-cols-2 gap-x-3 gap-y-4">
            {DICTIONARY_CATALOG.map((entry) => {
              const isDownloaded = downloadedKeys.has(entry.key);
              const state = downloadStates[entry.key] ?? { status: "idle" as const };

              return (
                <div
                  className="flex items-start justify-between gap-2 text-left"
                  key={entry.key}
                >
                  <div className="min-w-0">
                    <p className="text-sm leading-tight">{entry.label}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
                      {isDownloaded ? (
                        <>
                          <Check className="h-3 w-3 shrink-0" /> Downloaded
                        </>
                      ) : state.status === "downloading" ? (
                        `${Math.round(state.fraction * 100)}%`
                      ) : (
                        `~${Math.round(entry.approxSizeMB)}MB`
                      )}
                    </p>
                  </div>

                  {isDownloaded ? (
                    <button
                      aria-label={`Remove ${entry.label} dictionary`}
                      className="shrink-0 rounded-full p-1 text-neutral-500 outline-none focus-visible:text-neutral-950 dark:text-neutral-400 dark:focus-visible:text-neutral-100"
                      onClick={() => handleDelete(entry.key)}
                      type="button"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : state.status === "downloading" ? (
                    <span
                      aria-label={`Downloading ${entry.label} dictionary`}
                      className="h-4 w-4 shrink-0 animate-pulse rounded-full bg-neutral-300 dark:bg-neutral-600"
                    />
                  ) : (
                    <button
                      aria-label={`Download ${entry.label} dictionary`}
                      className="shrink-0 rounded-full p-1 text-neutral-500 outline-none focus-visible:text-neutral-950 dark:text-neutral-400 dark:focus-visible:text-neutral-100"
                      onClick={() => handleDownload(entry.key, entry.label)}
                      type="button"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>
      </div>

      {toastMessage ? (
        <div
          className="fixed inset-x-0 bottom-8 z-50 flex justify-center px-5"
          onClick={dismissToast}
        >
          <div
            className={`w-full max-w-xs p-4 ${GLASS_PANEL_CLASSNAME}`}
            onClick={(event) => event.stopPropagation()}
            role="alert"
          >
            <p className="text-sm leading-snug text-neutral-800 dark:text-neutral-200">
              {toastMessage}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
