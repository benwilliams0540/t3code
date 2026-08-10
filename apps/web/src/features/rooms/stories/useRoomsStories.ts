import { useCallback, useEffect, useRef, useState } from "react";

import { useRoomsDataSource } from "../dataSource";
import type { RoomsHumanStoriesResponse } from "../dataSource/humanSharedContract";
import { isRoomsLocalClientError } from "../dataSource/localChannelsClient";
import type { RoomsLocalStoriesResponse } from "../dataSource/localStoriesContract";

export function useRoomsStories(roomId: string) {
  const { loadLocalStories, localFeedRefreshGeneration } = useRoomsDataSource();
  const [response, setResponse] = useState<
    RoomsLocalStoriesResponse | RoomsHumanStoriesResponse | null
  >(null);
  const [error, setError] = useState<{ readonly code: string; readonly message: string } | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    const requestGeneration = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const next = await loadLocalStories(roomId);
      if (requestGeneration === generation.current) setResponse(next);
    } catch (cause) {
      if (requestGeneration !== generation.current) return;
      setError(
        isRoomsLocalClientError(cause)
          ? { code: cause.code, message: cause.message }
          : { code: "unexpected_story_load_error", message: "Could not load stories." },
      );
    } finally {
      if (requestGeneration === generation.current) setLoading(false);
    }
  }, [loadLocalStories, roomId]);

  useEffect(() => {
    void refresh();
    return () => {
      generation.current += 1;
    };
  }, [localFeedRefreshGeneration, refresh]);

  return {
    error,
    loading,
    refresh,
    response,
    stories: response?.stories ?? [],
  } as const;
}
