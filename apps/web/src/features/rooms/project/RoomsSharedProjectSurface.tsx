import type {
  RoomsProjectChanges,
  RoomsProjectDiff,
  RoomsProjectEntries,
  RoomsProjectFile,
  RoomsSharedProject,
} from "@t3tools/client-runtime/rooms/shared-projects";
import { FileTextIcon, FolderIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "~/components/ui/button";
import { useRoomsDataSource } from "../dataSource";

type Snapshot = {
  projects: readonly RoomsSharedProject[];
  project?: RoomsSharedProject;
  entries?: RoomsProjectEntries;
  changes?: RoomsProjectChanges;
  preview?: RoomsProjectFile | RoomsProjectDiff | undefined;
};

/** Ephemeral reads only: changing source/account/selection invalidates the whole view. */
export function RoomsSharedProjectSurface({ roomId }: { readonly roomId: string }) {
  const {
    captureConnection,
    projectsClientFor,
    isCurrentConnection,
    connectionIdentity,
    connectionGeneration,
  } = useRoomsDataSource();
  const [projectId, setProjectId] = useState("");
  const [directory, setDirectory] = useState("");
  const [tab, setTab] = useState<"files" | "changes">("files");
  const [path, setPath] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const requestKey = JSON.stringify([
    roomId,
    projectId,
    directory,
    path,
    tab,
    refresh,
    connectionIdentity,
    connectionGeneration,
  ]);
  const [record, setRecord] = useState<{ key: string; value: Snapshot } | null>(null);
  const snapshot = record?.key === requestKey ? record.value : null;
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setRecord(null);
    setError(null);
    setLoading(true);
    void (async () => {
      const request = captureConnection();
      const client = projectsClientFor(request);
      const list = await client.list(roomId);
      if (!active || !isCurrentConnection(request)) return;
      const project = list.projects.find((value) => value.id === projectId) ?? list.projects[0];
      if (!project) {
        setRecord({ key: requestKey, value: { projects: [] } });
        return;
      }
      if (project.id !== projectId) {
        setProjectId(project.id);
        setDirectory("");
        setPath(null);
        return;
      }
      const [entries, changes, preview] = await Promise.all([
        client.entries(roomId, project.id, directory),
        client.changes(roomId, project.id),
        path === null
          ? undefined
          : tab === "files"
            ? client.file(roomId, project.id, path)
            : client.diff(roomId, project.id, path),
      ]);
      if (!active || !isCurrentConnection(request)) return;
      if (
        [entries, changes, ...(preview ? [preview] : [])].some(
          (value) => value.project.sharing_revision !== project.sharing_revision,
        )
      )
        throw new Error("Project sharing changed during this read");
      setRecord({
        key: requestKey,
        value: { projects: list.projects, project, entries, changes, preview },
      });
    })()
      .catch(() => {
        if (active) {
          setRecord(null);
          setError(
            "This project could not be read. It may be offline, no longer shared, or changed while loading. Refresh to try again.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    roomId,
    projectId,
    directory,
    path,
    tab,
    refresh,
    connectionIdentity,
    connectionGeneration,
    captureConnection,
    projectsClientFor,
    isCurrentConnection,
    requestKey,
  ]);

  // Renew authorization without retaining old content when a grant/server is unavailable.
  useEffect(() => {
    const timer = window.setInterval(() => setRefresh((value) => value + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const observation = snapshot?.preview?.observation ?? snapshot?.entries?.observation;
  const items =
    tab === "files"
      ? (snapshot?.entries?.entries ?? [])
      : (snapshot?.changes?.changes ?? []).map((change) => ({ ...change, kind: "file" as const }));
  const preview = snapshot?.preview;
  return (
    <section
      className="mx-auto flex h-full min-h-[32rem] w-full max-w-7xl flex-col p-5 sm:p-8"
      data-rooms-project-files=""
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Files &amp; Changes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse the work shared with this room. Refresh to see the latest changes.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRefresh((value) => value + 1)}
          disabled={loading}
        >
          <RefreshCwIcon className={loading ? "size-4 animate-spin" : "size-4"} /> Refresh
        </Button>
      </header>
      {error ? (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm"
        >
          {error}
        </p>
      ) : null}
      {loading ? (
        <p role="status" className="mt-6 text-sm text-muted-foreground">
          Reading shared project…
        </p>
      ) : null}
      {snapshot?.projects.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-border p-8">
          <h2 className="font-semibold">No project shared yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The host owner can share a project with this room. Its current files and changes will
            appear here.
          </p>
        </div>
      ) : null}
      {snapshot?.project ? (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <label className="text-sm font-medium" htmlFor="rooms-shared-project">
              Project
            </label>
            <select
              id="rooms-shared-project"
              value={projectId}
              onChange={(event) => {
                setProjectId(event.target.value);
                setDirectory("");
                setPath(null);
              }}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {snapshot.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">
              {snapshot.project.host_id} · {snapshot.project.checkout_id} · Read only
            </span>
          </div>
          <div className="mt-4 flex gap-2" aria-label="Project view">
            {(["files", "changes"] as const).map((value) => (
              <Button
                key={value}
                variant={tab === value ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={tab === value}
                onClick={() => {
                  setTab(value);
                  setPath(null);
                }}
              >
                {value === "files" ? "Files" : `Changes (${snapshot.changes?.changes.length ?? 0})`}
              </Button>
            ))}
          </div>
          <div className="mt-3 grid min-h-[24rem] flex-1 overflow-hidden rounded-xl border border-border md:grid-cols-[17rem_1fr]">
            <nav
              aria-label="Shared project files"
              className="max-h-[35rem] overflow-auto border-b border-border p-2 md:border-r md:border-b-0"
            >
              {tab === "files" && directory ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDirectory(directory.split("/").slice(0, -1).join("/"));
                    setPath(null);
                  }}
                >
                  ← Parent folder
                </Button>
              ) : null}
              {tab === "files" ? (
                <p className="px-2 py-2 text-xs text-muted-foreground">
                  {directory || snapshot.project.name}
                </p>
              ) : null}
              {items.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">
                  {tab === "changes" ? "No current changes." : "No shared files in this folder."}
                </p>
              ) : null}
              {items.map((entry) => (
                <button
                  type="button"
                  key={entry.path}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted ${path === entry.path ? "bg-muted" : ""}`}
                  onClick={() => {
                    if (entry.kind === "directory") {
                      setDirectory(entry.path);
                      setPath(null);
                    } else setPath(entry.path);
                  }}
                >
                  {entry.kind === "directory" ? (
                    <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="break-all">
                    {tab === "files" ? entry.path.split("/").at(-1) : entry.path}
                  </span>
                </button>
              ))}
              {(tab === "files" ? snapshot.entries?.truncated : snapshot.changes?.truncated) ? (
                <p className="p-3 text-xs text-muted-foreground">
                  Showing the first 500 items. Open a folder to narrow the view.
                </p>
              ) : null}
            </nav>
            <div className="min-w-0 overflow-auto p-4">
              {preview ? (
                <>
                  <h2 className="mb-4 break-all font-mono text-sm font-medium">{preview.path}</h2>
                  {"content" in preview ? (
                    <Content text={preview.content} />
                  ) : (
                    <>
                      {preview.staged ? (
                        <>
                          <h3 className="mb-2 text-xs font-semibold text-muted-foreground">
                            Staged
                          </h3>
                          <Content text={preview.staged} />
                        </>
                      ) : null}
                      {preview.unstaged ? (
                        <>
                          <h3 className="mt-4 mb-2 text-xs font-semibold text-muted-foreground">
                            Unstaged
                          </h3>
                          <Content text={preview.unstaged} />
                        </>
                      ) : null}
                      {preview.untracked !== null ? (
                        <>
                          <h3 className="mt-4 mb-2 text-xs font-semibold text-muted-foreground">
                            New file
                          </h3>
                          <Content text={preview.untracked} />
                        </>
                      ) : null}
                      {!preview.staged && !preview.unstaged && preview.untracked === null ? (
                        <p className="text-sm text-muted-foreground">
                          No text changes for this file.
                        </p>
                      ) : null}
                    </>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {tab === "files"
                    ? "Choose a file to read it."
                    : "Choose a changed file to inspect its diff."}
                </p>
              )}
            </div>
          </div>
          {observation ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Read {new Date(observation.observed_at).toLocaleTimeString()} · Base{" "}
              {observation.base_revision?.slice(0, 8) ?? "uncommitted project"}. Each read reflects
              that moment; files may change between reads.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function Content({ text }: { readonly text: string }) {
  return (
    <pre className="overflow-auto rounded-lg bg-muted/30 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">
      <code>{text || "Empty file"}</code>
    </pre>
  );
}
