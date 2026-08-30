import { Check, Download, Languages, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { invalidateOfflineDictionaryCache } from "@/lib/dictionary";
import { DICTIONARY_CATALOG } from "@/lib/dictionary-catalog";
import {
  downloadDictionary,
  getDownloadedDictionaryKeys,
  removeDictionary
} from "@/lib/dictionary-downloads";

type DownloadState =
  | { status: "idle" }
  | { status: "downloading"; fraction: number }
  | { status: "error"; message: string };

export function DictionariesScreen() {
  const [downloadedKeys, setDownloadedKeys] = useState<Set<string>>(
    () => new Set()
  );
  const [downloadStates, setDownloadStates] = useState<
    Record<string, DownloadState>
  >({});

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

  const handleDownload = async (key: string) => {
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
      setDownloadStates((current) => ({
        ...current,
        [key]: {
          message: error instanceof Error ? error.message : "Download failed.",
          status: "error"
        }
      }));
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

          <div className="space-y-3">
            {DICTIONARY_CATALOG.map((entry) => {
              const isDownloaded = downloadedKeys.has(entry.key);
              const state = downloadStates[entry.key] ?? { status: "idle" as const };

              return (
                <div
                  className="flex items-center justify-between gap-3 text-left"
                  key={entry.key}
                >
                  <div className="min-w-0">
                    <p className="truncate text-base leading-tight">
                      {entry.label}
                    </p>
                    <p
                      className={`flex items-center gap-1 text-xs ${
                        state.status === "error"
                          ? "text-red-500 dark:text-red-400"
                          : "text-neutral-500 dark:text-neutral-400"
                      }`}
                    >
                      {isDownloaded ? (
                        <>
                          <Check className="h-3 w-3" /> Downloaded
                        </>
                      ) : state.status === "downloading" ? (
                        `Downloading… ${Math.round(state.fraction * 100)}%`
                      ) : state.status === "error" ? (
                        state.message
                      ) : (
                        `~${Math.round(entry.approxSizeMB)}MB`
                      )}
                    </p>
                  </div>

                  {isDownloaded ? (
                    <button
                      aria-label={`Remove ${entry.label} dictionary`}
                      className="shrink-0 rounded-full p-1.5 text-neutral-500 outline-none focus-visible:text-neutral-950 dark:text-neutral-400 dark:focus-visible:text-neutral-100"
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
                      className="shrink-0 rounded-full p-1.5 text-neutral-500 outline-none focus-visible:text-neutral-950 dark:text-neutral-400 dark:focus-visible:text-neutral-100"
                      onClick={() => handleDownload(entry.key)}
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
    </div>
  );
}
