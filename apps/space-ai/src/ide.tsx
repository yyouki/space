import { basicSetup, EditorView } from "codemirror";
import { LanguageDescription, defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type KeyboardEvent as ReactKeyboardEvent, type FormEvent } from "react";
import type { SpaceAgentClient, SpaceConnectionIssue } from "./connection";
import "./ide.css";

type WorkspaceEntry = { path: string; language: string; sizeBytes: number; updatedAt: number };
type OpenFile = WorkspaceEntry & { content: string; dirty: boolean };
type CursorPosition = { line: number; column: number };
type ShortcutMap = Record<string, string>;

/**
 * Load only the language support needed by the active file.
 * This prevents every CodeMirror parser from entering the initial IDE bundle.
 */
const editorLanguages: LanguageDescription[] = [
  LanguageDescription.of({
    name: "JavaScript",
    alias: ["js", "mjs", "cjs"],
    extensions: ["js", "mjs", "cjs"],
    load: async () => (await import("@codemirror/lang-javascript")).javascript()
  }),
  LanguageDescription.of({
    name: "TypeScript",
    alias: ["ts", "mts", "cts"],
    extensions: ["ts", "mts", "cts"],
    load: async () => (await import("@codemirror/lang-javascript")).javascript({ typescript: true })
  }),
  LanguageDescription.of({
    name: "JSX",
    extensions: ["jsx"],
    load: async () => (await import("@codemirror/lang-javascript")).javascript({ jsx: true })
  }),
  LanguageDescription.of({
    name: "TSX",
    extensions: ["tsx"],
    load: async () => (await import("@codemirror/lang-javascript")).javascript({ jsx: true, typescript: true })
  }),
  LanguageDescription.of({
    name: "Python",
    alias: ["py"],
    extensions: ["py", "pyw"],
    load: async () => (await import("@codemirror/lang-python")).python()
  }),
  LanguageDescription.of({
    name: "JSON",
    alias: ["jsonc"],
    extensions: ["json", "jsonc"],
    load: async () => (await import("@codemirror/lang-json")).json()
  }),
  LanguageDescription.of({
    name: "HTML",
    alias: ["htm"],
    extensions: ["html", "htm"],
    load: async () => (await import("@codemirror/lang-html")).html()
  }),
  LanguageDescription.of({
    name: "CSS",
    extensions: ["css"],
    load: async () => (await import("@codemirror/lang-css")).css()
  }),
  LanguageDescription.of({
    name: "Markdown",
    alias: ["md"],
    extensions: ["md", "markdown"],
    load: async () => (await import("@codemirror/lang-markdown")).markdown()
  })
];

const DEFAULT_SHORTCUTS: ShortcutMap = {
  save: "Ctrl+S",
  quickOpen: "Ctrl+P",
  commandPalette: "Ctrl+Shift+P",
  toggleSidebar: "Ctrl+B",
  toggleTerminal: "Ctrl+Backtick",
  search: "Ctrl+Shift+F",
  closeTab: "Ctrl+W"
};

const SHORTCUT_LABELS: Record<string, string> = {
  save: "Save active file",
  quickOpen: "Quick open file",
  commandPalette: "Command palette",
  toggleSidebar: "Toggle file sidebar",
  toggleTerminal: "Toggle task console",
  search: "Search workspace",
  closeTab: "Close active tab"
};

function baseName(path: string) {
  return path.split("/").at(-1) || path;
}

function formatBytes(value: number) {
  if (value < 1024) return value + " B";
  if (value < 1024 * 1024) return (value / 1024).toFixed(1) + " KB";
  return (value / (1024 * 1024)).toFixed(2) + " MB";
}

function eventShortcut(event: KeyboardEvent) {
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  let key = event.key;
  if (key === " ") key = "Space";
  else if (key.charCodeAt(0) === 96) key = "Backtick";
  else if (key.length === 1) key = key.toUpperCase();
  else if (key.startsWith("Arrow")) key = key.replace("Arrow", "");
  if (!["Control", "Meta", "Alt", "Shift"].includes(event.key)) parts.push(key);
  return parts.join("+");
}

function CodeEditor({
  path, value, theme, onChange, onCursorChange
}: {
  path: string;
  value: string;
  theme: "dark" | "light";
  onChange: (value: string) => void;
  onCursorChange: (position: CursorPosition) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  const changeRef = useRef(onChange);
  const cursorRef = useRef(onCursorChange);
  valueRef.current = value;
  changeRef.current = onChange;
  cursorRef.current = onCursorChange;

  useEffect(() => {
    let disposed = false;
    let view: EditorView | null = null;

    const mount = async () => {
      let language: Extension = [];
      const description = LanguageDescription.matchFilename(editorLanguages, path);
      if (description) {
        try { language = await description.load(); } catch { language = []; }
      }
      if (disposed || !host.current) return;
      const editorTheme = EditorView.theme({
        "&": { height: "100%", backgroundColor: "var(--ide-editor-bg)", color: "var(--ide-text)" },
        ".cm-scroller": { fontFamily: "var(--ide-code-font)", fontSize: "13px", lineHeight: "1.72", overflow: "auto" },
        ".cm-content": { caretColor: "var(--ide-accent)", padding: "14px 0 36px" },
        ".cm-line": { paddingLeft: "8px", paddingRight: "24px" },
        ".cm-gutters": { backgroundColor: "var(--ide-gutter-bg)", color: "var(--ide-muted)", border: "none" },
        ".cm-activeLineGutter, .cm-activeLine": { backgroundColor: "var(--ide-active-line)" },
        ".cm-cursor": { borderLeftColor: "var(--ide-accent)" },
        ".cm-selectionBackground, ::selection": { backgroundColor: "var(--ide-selection) !important" }
      }, { dark: theme === "dark" });

      view = new EditorView({
        parent: host.current,
        doc: valueRef.current,
        extensions: [
          basicSetup,
          language,
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          editorTheme,
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) changeRef.current(update.state.doc.toString());
            const position = update.state.selection.main.head;
            const line = update.state.doc.lineAt(position);
            cursorRef.current({ line: line.number, column: position - line.from + 1 });
          })
        ]
      });
    };

    void mount();
    return () => {
      disposed = true;
      view?.destroy();
    };
  }, [path, theme]);

  return <div className="ide-editor-host" ref={host} aria-label={"Code editor for " + path} />;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="ide-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="ide-modal" role="dialog" aria-modal="true" aria-label={title}>
        <header><strong>{title}</strong><button type="button" onClick={onClose} aria-label="Close dialog">×</button></header>
        {children}
      </section>
    </div>
  );
}

type SpaceIDEPageProps = {
  agent: SpaceAgentClient;
  connected: boolean;
  connectionIssue: SpaceConnectionIssue | null;
  onReconnect: () => void;
  theme: "dark" | "light";
  onThemeChange: (theme: "dark" | "light") => void;
  codeFont: "system" | "jetbrains";
  lineNumbers: boolean;
};

export default function SpaceIDEPage({
  agent,
  connected,
  connectionIssue,
  onReconnect,
  theme,
  onThemeChange,
  codeFont,
  lineNumbers
}: SpaceIDEPageProps) {
  const [files, setFiles] = useState<WorkspaceEntry[]>([]);
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activePath, setActivePath] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activity, setActivity] = useState<"explorer" | "search" | "source" | "extensions">("explorer");
  const [panel, setPanel] = useState<"terminal" | "problems" | "output">("terminal");
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelHeight, setPanelHeight] = useState(30);
  const [terminalInput, setTerminalInput] = useState("");
  const [terminalLines, setTerminalLines] = useState<string[]>([
    "Space task console · private workspace",
    "Type help to view the supported commands."
  ]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ path: string; language: string; preview: string }>>([]);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickQuery, setQuickQuery] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [shortcutEditing, setShortcutEditing] = useState<string | null>(null);
  const [shortcuts, setShortcuts] = useState<ShortcutMap>(() => {
    try { return { ...DEFAULT_SHORTCUTS, ...JSON.parse(window.localStorage.getItem("space-ide-shortcuts") || "{}") }; }
    catch { return DEFAULT_SHORTCUTS; }
  });
  const [cursor, setCursor] = useState<CursorPosition>({ line: 1, column: 1 });
  const terminalRef = useRef<HTMLInputElement>(null);

  const activeFile = openFiles.find((file) => file.path === activePath) ?? null;
  const appendTerminal = useCallback((line: string) => {
    setTerminalLines((current) => [...current, ...line.split("\n")].slice(-240));
  }, []);

  const refreshFiles = useCallback(async () => {
    const result = await agent.stub.listWorkspaceFiles();
    setFiles(result);
    return result;
  }, [agent]);

  useEffect(() => {
    if (!connected) return;
    let active = true;
    setLoading(true);
    void agent.stub.listWorkspaceFiles().then((result: WorkspaceEntry[]) => {
      if (!active) return;
      setFiles(result);
      if (!result.length) setNotice("Workspace is empty. Create a file to begin.");
    }).catch((value: unknown) => {
      if (active) setError(value instanceof Error ? value.message : "Workspace files could not be loaded.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [agent, connected]);

  useEffect(() => {
    try { window.localStorage.setItem("space-ide-theme", theme); } catch { /* Keep the theme for this session. */ }
  }, [theme]);

  useEffect(() => {
    try { window.localStorage.setItem("space-ide-shortcuts", JSON.stringify(shortcuts)); } catch { /* Keep shortcuts for this session. */ }
  }, [shortcuts]);

  const openFile = useCallback(async (path: string) => {
    const existing = openFiles.find((file) => file.path === path);
    if (existing) { setActivePath(path); return; }
    setBusy(true);
    try {
      const file = await agent.stub.readWorkspaceFile(path);
      if (!file) throw new Error("The selected file no longer exists.");
      setOpenFiles((current) => [...current, { ...file, dirty: false }]);
      setActivePath(path);
      setNotice("");
    } catch (value) {
      setError(value instanceof Error ? value.message : "The file could not be opened.");
    } finally { setBusy(false); }
  }, [agent, openFiles]);

  const updateContent = useCallback((content: string) => {
    setOpenFiles((current) => current.map((file) => file.path === activePath
      ? { ...file, content, sizeBytes: new TextEncoder().encode(content).byteLength, dirty: true }
      : file
    ));
  }, [activePath]);

  const saveFile = useCallback(async (path = activePath) => {
    const file = openFiles.find((item) => item.path === path);
    if (!file) return;
    setBusy(true);
    try {
      const saved = await agent.stub.writeWorkspaceFile(file.path, file.content);
      setOpenFiles((current) => current.map((item) => item.path === path ? { ...item, ...saved, dirty: false } : item));
      await refreshFiles();
      setNotice(file.path + " saved.");
    } catch (value) {
      setError(value instanceof Error ? value.message : "The file could not be saved.");
    } finally { setBusy(false); }
  }, [activePath, agent, openFiles, refreshFiles]);

  const saveAll = useCallback(async () => {
    const dirty = openFiles.filter((file) => file.dirty);
    if (!dirty.length) { setNotice("All open files are saved."); return; }
    setBusy(true);
    try {
      for (const file of dirty) {
        const saved = await agent.stub.writeWorkspaceFile(file.path, file.content);
        setOpenFiles((current) => current.map((item) => item.path === file.path ? { ...item, ...saved, dirty: false } : item));
      }
      await refreshFiles();
      setNotice(dirty.length + " file(s) saved.");
    } catch (value) {
      setError(value instanceof Error ? value.message : "One or more files could not be saved.");
    } finally { setBusy(false); }
  }, [agent, openFiles, refreshFiles]);

  const closeFile = useCallback((path: string) => {
    const file = openFiles.find((item) => item.path === path);
    if (file?.dirty && !window.confirm("Discard unsaved changes in " + path + "?")) return;
    const remaining = openFiles.filter((item) => item.path !== path);
    setOpenFiles(remaining);
    if (activePath === path) setActivePath(remaining.at(-1)?.path || "");
  }, [activePath, openFiles]);

  const createFile = useCallback(async () => {
    const path = window.prompt("New file path (example: src/main.py):");
    if (!path?.trim()) return;
    setBusy(true);
    try {
      const created = await agent.stub.writeWorkspaceFile(path.trim(), "");
      await refreshFiles();
      await openFile(created.path);
      setNotice("Created " + created.path + ".");
    } catch (value) {
      setError(value instanceof Error ? value.message : "The file could not be created.");
    } finally { setBusy(false); }
  }, [agent, openFile, refreshFiles]);

  const deleteFile = useCallback(async (path: string) => {
    if (!window.confirm("Delete " + path + " and its revision history? This cannot be undone.")) return;
    setBusy(true);
    try {
      await agent.stub.deleteWorkspaceFile(path);
      setOpenFiles((current) => current.filter((file) => file.path !== path));
      if (activePath === path) setActivePath("");
      await refreshFiles();
      setNotice(path + " deleted.");
    } catch (value) {
      setError(value instanceof Error ? value.message : "The file could not be deleted.");
    } finally { setBusy(false); }
  }, [activePath, agent, refreshFiles]);

  const runFile = useCallback(async (path = activePath) => {
    if (!path) { setNotice("Open a Python or JavaScript file first."); return; }
    const file = openFiles.find((item) => item.path === path);
    if (file?.dirty) {
      if (!window.confirm("Save changes before running this file?")) return;
      await saveFile(path);
    }
    setPanel("terminal");
    setPanelOpen(true);
    appendTerminal("$ run " + path);
    setBusy(true);
    try {
      const settings = await agent.stub.getAutonomySettings();
      if (settings.settings.workspaceExecution === "manual" && !window.confirm("Approve this bounded offline code run?")) {
        appendTerminal("Run cancelled. No code was executed.");
        return;
      }
      const started = await agent.stub.runWorkspaceFile(path, 10, true) as { taskId?: string; error?: string };
      if (!started.taskId) { appendTerminal(started.error || JSON.stringify(started)); return; }
      appendTerminal("Task queued: " + started.taskId);
      let finalResult: Record<string, unknown> | null = null;
      for (let attempt = 0; attempt < 14; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 750));
        const result = await agent.stub.getWorkspaceRunStatus(started.taskId);
        const status = String((result as { status?: unknown }).status ?? "unknown");
        if (["succeeded", "failed", "cancelled", "timed_out"].includes(status)) {
          finalResult = result as Record<string, unknown>;
          break;
        }
      }
      if (!finalResult) { appendTerminal("Task is still running. Check its status from Chat."); return; }
      appendTerminal("Status: " + String(finalResult.status));
      if (typeof finalResult.stdout === "string" && finalResult.stdout) appendTerminal(finalResult.stdout);
      if (typeof finalResult.stderr === "string" && finalResult.stderr) appendTerminal(finalResult.stderr);
      if (typeof finalResult.error === "string" && finalResult.error) appendTerminal(finalResult.error);
    } catch (value) {
      appendTerminal(value instanceof Error ? value.message : "The task could not be started.");
    } finally { setBusy(false); }
  }, [activePath, agent, appendTerminal, openFiles, saveFile]);

  const executeTerminal = useCallback(async (raw: string) => {
    const input = raw.trim();
    if (!input) return;
    setTerminalInput("");
    const parts = input.split(/\s+/);
    const command = parts[0].toLowerCase();
    const argument = parts.slice(1).join(" ");
    if (command === "clear") { setTerminalLines([]); return; }
    appendTerminal("$ " + input);
    if (command === "help") {
      appendTerminal([
        "Space task-console commands:",
        "  help              Show supported commands",
        "  pwd               Show the private workspace root",
        "  ls                List files",
        "  cat <path>        Print a text file",
        "  open <path>       Open a file in the editor",
        "  run [path]        Run Python or JavaScript in the offline sandbox",
        "  clear             Clear the console"
      ].join("\n"));
      return;
    }
    if (command === "pwd") { appendTerminal("/workspace"); return; }
    if (command === "ls") {
      appendTerminal(files.length ? files.map((file) => file.path).join("\n") : "Workspace is empty.");
      return;
    }
    if (command === "cat" && argument) {
      try {
        const file = await agent.stub.readWorkspaceFile(argument);
        appendTerminal(file ? file.content : "File not found: " + argument);
      } catch (value) { appendTerminal(value instanceof Error ? value.message : "Could not read file."); }
      return;
    }
    if (command === "open" && argument) { await openFile(argument); return; }
    if (command === "run") { await runFile(argument || activePath); return; }
    appendTerminal("Command unavailable. This is a bounded workspace console, not a general shell. Type help.");
  }, [activePath, agent, appendTerminal, files, openFile, runFile]);

  const search = useCallback(async () => {
    if (searchQuery.trim().length < 2) { setSearchResults([]); return; }
    setBusy(true);
    try { setSearchResults(await agent.stub.searchWorkspaceFiles(searchQuery)); }
    catch (value) { setError(value instanceof Error ? value.message : "Search failed."); }
    finally { setBusy(false); }
  }, [agent, searchQuery]);

  const filteredFiles = useMemo(() => {
    const query = quickQuery.trim().toLowerCase();
    return query ? files.filter((file) => file.path.toLowerCase().includes(query)) : files;
  }, [files, quickQuery]);

  const filteredCommands = [
    { id: "newFile", label: "New file", shortcut: "Create a workspace file" },
    { id: "save", label: "Save active file", shortcut: shortcuts.save },
    { id: "saveAll", label: "Save all files", shortcut: "Save modified tabs" },
    { id: "terminal", label: "Focus task console", shortcut: shortcuts.toggleTerminal },
    { id: "explorer", label: "Show Explorer", shortcut: shortcuts.toggleSidebar },
    { id: "search", label: "Search workspace", shortcut: shortcuts.search },
    { id: "shortcuts", label: "Keyboard shortcuts", shortcut: "Customize key bindings" },
    { id: "theme", label: "Toggle theme", shortcut: "Light / dark" }
  ].filter((item) => (item.label + " " + item.shortcut).toLowerCase().includes(paletteQuery.toLowerCase()));

  const runCommand = useCallback(async (id: string) => {
    setPaletteOpen(false);
    setPaletteQuery("");
    if (id === "newFile") await createFile();
    if (id === "save") await saveFile();
    if (id === "saveAll") await saveAll();
    if (id === "terminal") { setPanel("terminal"); setPanelOpen(true); window.setTimeout(() => terminalRef.current?.focus(), 0); }
    if (id === "explorer") { setActivity("explorer"); setSidebarOpen(true); }
    if (id === "search") { setActivity("search"); setSidebarOpen(true); }
    if (id === "shortcuts") setShortcutsOpen(true);
    if (id === "theme") onThemeChange(theme === "dark" ? "light" : "dark");
  }, [createFile, onThemeChange, saveAll, saveFile, theme]);

  const runShortcut = useCallback((id: string) => {
    if (id === "save") void saveFile();
    if (id === "quickOpen") { setQuickOpen(true); setQuickQuery(""); }
    if (id === "commandPalette") { setPaletteOpen(true); setPaletteQuery(""); }
    if (id === "toggleSidebar") setSidebarOpen((current) => !current);
    if (id === "toggleTerminal") { setPanel("terminal"); setPanelOpen((current) => !current); }
    if (id === "search") { setActivity("search"); setSidebarOpen(true); }
    if (id === "closeTab" && activePath) closeFile(activePath);
  }, [activePath, closeFile, saveFile]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (shortcutEditing || paletteOpen || quickOpen || shortcutsOpen) {
        if (event.key === "Escape") {
          setPaletteOpen(false);
          setQuickOpen(false);
          setShortcutsOpen(false);
          setShortcutEditing(null);
        }
        return;
      }
      const shortcut = eventShortcut(event);
      const match = Object.entries(shortcuts).find(([, value]) => value === shortcut);
      if (!match) return;
      event.preventDefault();
      runShortcut(match[0]);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [paletteOpen, quickOpen, runShortcut, shortcutEditing, shortcuts, shortcutsOpen]);

  const captureShortcut = (event: ReactKeyboardEvent, id: string) => {
    event.preventDefault();
    event.stopPropagation();
    const parts: string[] = [];
    if (event.ctrlKey || event.metaKey) parts.push("Ctrl");
    if (event.altKey) parts.push("Alt");
    if (event.shiftKey) parts.push("Shift");
    if (!["Control", "Meta", "Alt", "Shift"].includes(event.key)) {
      let key = event.key;
      if (key === " ") key = "Space";
      else if (key.charCodeAt(0) === 96) key = "Backtick";
      else if (key.length === 1) key = key.toUpperCase();
      parts.push(key);
    }
    if (parts.length < 2) { setNotice("Use a modifier such as Ctrl, Shift, or Alt with a key."); return; }
    setShortcuts((current) => ({ ...current, [id]: parts.join("+") }));
    setShortcutEditing(null);
  };

  const handleTerminalSubmit = (event: FormEvent) => {
    event.preventDefault();
    void executeTerminal(terminalInput);
  };

  const openPath = async (path: string) => {
    setQuickOpen(false);
    setActivity("explorer");
    setSidebarOpen(true);
    await openFile(path);
  };

  return (
    <main
      className="space-ide"
      data-theme={theme}
      data-code-font={codeFont}
      data-line-numbers={lineNumbers ? "true" : "false"}
    >
      <header className="ide-topbar">
        <div className="ide-topbar-brand"><span className="ide-brand-mark">S</span><strong>Space</strong><span className="ide-brand-divider">/</span><span>IDE</span></div>
        <div className="ide-topbar-center"><span className="ide-workspace-chip">Private workspace</span><span className="ide-connection-state"><i className={connected ? "online" : ""} />{connected ? "Connected" : connectionIssue?.kind === "reconnecting" ? "Reconnecting" : "Offline"}</span></div>
        <div className="ide-topbar-actions">
          <button type="button" onClick={() => { setQuickOpen(true); setQuickQuery(""); }} title={"Quick open · " + shortcuts.quickOpen}>⌕ <span>Open file</span></button>
          <button type="button" onClick={() => setShortcutsOpen(true)} title="Keyboard shortcuts">⌨</button>
          <button type="button" onClick={() => onThemeChange(theme === "dark" ? "light" : "dark")} title="Toggle theme">{theme === "dark" ? "☼" : "◐"}</button>
          {!connected && <button type="button" onClick={onReconnect} title="Reconnect workspace">↻ <span>Reconnect</span></button>}
        </div>
      </header>

      <div className="ide-main">
        <aside className="ide-activity-bar" aria-label="Workspace tools">
          <button type="button" className={activity === "explorer" ? "active" : ""} onClick={() => { setActivity("explorer"); setSidebarOpen((value) => !value); }} title="Explorer">▤</button>
          <button type="button" className={activity === "search" ? "active" : ""} onClick={() => { setActivity("search"); setSidebarOpen(true); }} title="Search">⌕</button>
          <button type="button" className={activity === "source" ? "active" : ""} onClick={() => { setActivity("source"); setSidebarOpen(true); }} title="Source control">⑂</button>
          <button type="button" className={activity === "extensions" ? "active" : ""} onClick={() => { setActivity("extensions"); setSidebarOpen(true); }} title="Languages and tools">◇</button>
          <span className="ide-activity-spacer" />
          <button type="button" onClick={() => setShortcutsOpen(true)} title="Settings">⚙</button>
        </aside>

        {sidebarOpen && (
          <aside className="ide-sidebar">
            {activity === "explorer" && <>
              <div className="ide-sidebar-heading"><strong>EXPLORER</strong><div><button type="button" onClick={() => void refreshFiles()} title="Refresh">↻</button><button type="button" onClick={() => void createFile()} title="New file">＋</button></div></div>
              <div className="ide-workspace-title"><span>⌄</span><strong>SPACE WORKSPACE</strong><span className="ide-workspace-count">{files.length}</span></div>
              <div className="ide-tree-scroll">
                {loading ? <p className="ide-sidebar-empty">Loading workspace…</p> : files.length ? files.map((file) => (
                  <div className={"ide-tree-file" + (file.path === activePath ? " active" : "")} key={file.path}>
                    <button type="button" className="ide-tree-row file" style={{ paddingLeft: 10 + (file.path.split("/").length - 1) * 13 }} onClick={() => void openFile(file.path)}>
                      <span className="ide-file-glyph">{baseName(file.path).split(".").at(-1)?.slice(0, 2).toUpperCase() || "F"}</span>
                      <span className="ide-tree-name">{file.path}</span>
                      {openFiles.some((item) => item.path === file.path && item.dirty) && <i className="ide-dirty-dot" />}
                    </button>
                    <button type="button" className="ide-tree-delete" onClick={() => void deleteFile(file.path)} aria-label={"Delete " + file.path}>×</button>
                  </div>
                )) : <p className="ide-sidebar-empty">No files yet. Use + to create one.</p>}
              </div>
              <div className="ide-sidebar-footer"><span>{files.length} files</span><span>{formatBytes(files.reduce((sum, file) => sum + file.sizeBytes, 0))} used</span></div>
            </>}

            {activity === "search" && <>
              <div className="ide-sidebar-heading"><strong>SEARCH</strong></div>
              <div className="ide-search-box"><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void search(); }} placeholder="Search in workspace" /><button type="button" onClick={() => void search()} disabled={busy}>⌕</button></div>
              <div className="ide-tree-scroll">{searchResults.map((result) => <button type="button" className="ide-search-result" key={result.path} onClick={() => void openPath(result.path)}><strong>{result.path}</strong><small>{result.preview}</small></button>)}</div>
            </>}

            {activity === "source" && <>
              <div className="ide-sidebar-heading"><strong>SOURCE CONTROL</strong></div>
              <div className="ide-tool-empty"><span>⑂</span><strong>Git is not connected</strong><p>The private Space workspace is separate from a GitHub repository. Cloning, branches, commits, and pushes require a Git integration.</p></div>
            </>}

            {activity === "extensions" && <>
              <div className="ide-sidebar-heading"><strong>LANGUAGES & TOOLS</strong></div>
              <div className="ide-tool-list">{["JavaScript / TypeScript", "Python", "HTML", "CSS", "JSON", "Markdown", "SQL", "YAML", "Rust", "Go", "Java", "C / C++"].map((name) => <div key={name}><span className="ide-extension-check">✓</span><span>{name}</span><small>Syntax support</small></div>)}</div>
              <p className="ide-tool-note">External VS Code Marketplace extensions and language servers are not loaded in this browser IDE.</p>
            </>}
          </aside>
        )}

        <section className="ide-workbench">
          <div className="ide-tabbar"><div className="ide-tabs">
            {openFiles.map((file) => <div className={"ide-tab" + (file.path === activePath ? " active" : "")} key={file.path}>
              <button type="button" onClick={() => setActivePath(file.path)} title={file.path}><span className="ide-tab-type">{baseName(file.path).split(".").at(-1)?.slice(0, 2).toUpperCase() || "F"}</span>{baseName(file.path)}{file.dirty && <i />}</button>
              <button type="button" className="ide-tab-close" onClick={() => closeFile(file.path)} aria-label={"Close " + file.path}>×</button>
            </div>)}
            {!openFiles.length && <span className="ide-no-tabs">No file open</span>}
          </div><div className="ide-tab-actions"><button type="button" onClick={() => void saveAll()} disabled={!openFiles.some((file) => file.dirty)} title="Save all">▣</button><button type="button" onClick={() => setPanelOpen((value) => !value)} title="Toggle panel">▱</button></div></div>

          {activeFile ? <>
            <div className="ide-breadcrumbs"><span>workspace</span><span>/</span><span>{activeFile.path}</span></div>
            <div className="ide-editor-area"><CodeEditor key={activeFile.path} path={activeFile.path} value={activeFile.content} theme={theme} onChange={updateContent} onCursorChange={setCursor} /></div>
          </> : <div className="ide-welcome">
            <div className="ide-welcome-mark">S</div><h1>Space IDE</h1><p>A focused development workspace, built into Space.</p>
            <div className="ide-welcome-actions"><button type="button" onClick={() => void createFile()}>＋ New file</button><button type="button" onClick={() => { setQuickOpen(true); setQuickQuery(""); }}>Open a file</button><button type="button" onClick={() => { setPanel("terminal"); setPanelOpen(true); }}>Open task console</button></div>
            <div className="ide-welcome-shortcuts"><span><kbd>{shortcuts.commandPalette}</kbd> Command palette</span><span><kbd>{shortcuts.quickOpen}</kbd> Quick open</span><span><kbd>{shortcuts.save}</kbd> Save file</span></div>
          </div>}

          {panelOpen && <section className="ide-bottom-panel" style={{ height: panelHeight + "%" }}>
            <div className="ide-panel-header"><div className="ide-panel-tabs">
              <button type="button" className={panel === "terminal" ? "active" : ""} onClick={() => setPanel("terminal")}>TERMINAL</button>
              <button type="button" className={panel === "problems" ? "active" : ""} onClick={() => setPanel("problems")}>PROBLEMS <span>0</span></button>
              <button type="button" className={panel === "output" ? "active" : ""} onClick={() => setPanel("output")}>OUTPUT</button>
            </div><div className="ide-panel-controls"><label>Height <input type="range" min="18" max="55" value={panelHeight} onChange={(event) => setPanelHeight(Number(event.target.value))} /></label><button type="button" onClick={() => setPanelOpen(false)}>×</button></div></div>
            {panel === "terminal" && <div className="ide-terminal"><div className="ide-terminal-output" aria-live="polite">{terminalLines.map((line, index) => <div key={index}>{line || " "}</div>)}</div><form className="ide-terminal-input" onSubmit={handleTerminalSubmit}><span>›</span><input ref={terminalRef} value={terminalInput} onChange={(event) => setTerminalInput(event.target.value)} placeholder="Type a workspace command…" autoComplete="off" spellCheck={false} /><button type="submit">Run</button></form></div>}
            {panel === "problems" && <div className="ide-panel-empty">Compiler and language-server diagnostics are not connected yet.</div>}
            {panel === "output" && <div className="ide-panel-empty">Build and task output appears in the Terminal panel for the currently connected sandbox runner.</div>}
          </section>}

          <footer className="ide-statusbar"><div><span>◌</span><span>Space workspace</span><span>{connected ? "● Online" : "○ Offline"}</span></div><div><span>Ln {cursor.line}, Col {cursor.column}</span><span>{activeFile?.language || "Plain Text"}</span><span>UTF-8</span><span>Spaces: 2</span></div></footer>
        </section>
      </div>

      {(notice || error) && <div className={"ide-toast" + (error ? " error" : "")} role="status"><span>{error || notice}</span><button type="button" onClick={() => { setNotice(""); setError(""); }}>×</button></div>}
      {!connected && !error && <div className="ide-connection-note">{connectionIssue?.message ?? "Connecting to your private workspace…"}</div>}

      {paletteOpen && <Modal title="Command palette" onClose={() => setPaletteOpen(false)}>
        <input className="ide-modal-search" autoFocus value={paletteQuery} onChange={(event) => setPaletteQuery(event.target.value)} placeholder="Search commands…" />
        <div className="ide-command-list">{filteredCommands.map((item) => <button type="button" key={item.id} onClick={() => void runCommand(item.id)}><span>{item.label}<small>{item.shortcut}</small></span><b>↵</b></button>)}{!filteredCommands.length && <p>No matching commands.</p>}</div>
      </Modal>}

      {quickOpen && <Modal title="Quick open" onClose={() => setQuickOpen(false)}>
        <input className="ide-modal-search" autoFocus value={quickQuery} onChange={(event) => setQuickQuery(event.target.value)} placeholder="Type a file name…" />
        <div className="ide-command-list">{filteredFiles.map((file) => <button type="button" key={file.path} onClick={() => void openPath(file.path)}><span>{baseName(file.path)}<small>{file.path}</small></span><b>{file.language}</b></button>)}{!filteredFiles.length && <p>No matching workspace files.</p>}</div>
      </Modal>}

      {shortcutsOpen && <Modal title="Keyboard shortcuts" onClose={() => { setShortcutsOpen(false); setShortcutEditing(null); }}>
        <div className="ide-shortcuts-body"><p>Choose a shortcut, then press the new key combination. Changes are saved in this browser.</p>
          {Object.entries(SHORTCUT_LABELS).map(([id, label]) => <div className="ide-shortcut-row" key={id}><span>{label}</span><button type="button" className={shortcutEditing === id ? "recording" : ""} onClick={() => setShortcutEditing(id)} onKeyDown={(event) => { if (shortcutEditing === id) captureShortcut(event, id); }}>{shortcutEditing === id ? "Press keys…" : shortcuts[id]}</button></div>)}
          <div className="ide-shortcuts-footer"><button type="button" onClick={() => setShortcuts(DEFAULT_SHORTCUTS)}>Reset defaults</button><span>Use Ctrl or Command, Shift, or Alt with a key.</span></div>
        </div>
      </Modal>}
    </main>
  );
}
