import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { parseSupportedVideoLink, type SupportedVideoLink } from "./video-links";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { isToolUIPart, type UIMessage } from "ai";
import type { AutonomySettings } from "./server";
import type { MouseEvent } from "react";
import type { TokenUsageSummary, WorkspaceFileMetadata } from "./analytics";
import { useSpaceAgentConnection } from "./connection";
import { resolveShareLinks } from "./security/share-links";

const AnalyticsPage = lazy(() => import("./analytics"));

const VSCodeWebPage = lazy(() => import("./ide"));

const DEFAULT_SETTINGS: AutonomySettings = {
  workspaceExecution: "autonomous_sandbox",
  browserResearch: "read_only_auto",
  projectFiles: "selected_workspace",
  selfUpdate: "automatic_after_gates"
};

type AppearancePreferences = {
  theme: "light" | "dark" | "system";
  density: "comfortable" | "compact";
  reduceMotion: boolean;
  codeFont: "JetBrains Mono" | "System Mono";
  lineNumbers: boolean;
};

const DEFAULT_APPEARANCE: AppearancePreferences = {
  theme: "light",
  density: "comfortable",
  reduceMotion: false,
  codeFont: "JetBrains Mono",
  lineNumbers: true
};

/** Read local presentation preferences without allowing malformed storage to break the app. */
function readAppearancePreferences(): AppearancePreferences {
  if (typeof window === "undefined") return DEFAULT_APPEARANCE;

  try {
    const stored = window.localStorage.getItem("space-appearance");
    if (!stored) return DEFAULT_APPEARANCE;
    const value = JSON.parse(stored) as Partial<AppearancePreferences>;

    return {
      theme: value.theme === "dark" || value.theme === "system" ? value.theme : "light",
      density: value.density === "compact" ? "compact" : "comfortable",
      reduceMotion: value.reduceMotion === true,
      codeFont: value.codeFont === "System Mono" ? "System Mono" : "JetBrains Mono",
      lineNumbers: value.lineNumbers !== false
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

const NAV_ITEMS = [
  { href: "/", label: "Chat" },
  { href: "/ide", label: "IDE" },
  { href: "/analytics", label: "Analytics" },
  { href: "/settings", label: "Settings" }
];

type WorkspaceAsset = {
  id: string;
  filename: string;
  mimeType: string;
  contentBase64: string;
  sizeBytes: number;
  prompt: string;
  createdAt: string;
};

type SavedMemory = {
  key: string;
  value: string;
  updatedAt: string;
};

type ConversationSummary = {
  id: string;
  title: string;
  pinned: boolean;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  active: boolean;
};

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function WorkspaceFileAttachment({
  path,
  onReadFile
}: {
  path: string;
  onReadFile: (path: string) => Promise<{ path: string; content: string } | null>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const download = async () => {
    setBusy(true);
    setError("");
    try {
      const file = await onReadFile(path);
      if (!file) throw new Error("File is no longer available.");
      triggerDownload(new Blob([file.content], { type: "text/plain;charset=utf-8" }), path.split("/").at(-1) || "workspace-file.txt");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Download failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="message-attachment">
      <span className="attachment-file-icon">{"</>"}</span>
      <span className="attachment-file-name"><strong>{path.split("/").at(-1)}</strong><small>{path}</small></span>
      <button type="button" onClick={() => void download()} disabled={busy}>{busy ? "Preparing…" : "Download"}</button>
      {error && <small className="attachment-error">{error}</small>}
    </div>
  );
}

function WorkspaceImageAttachment({
  assetId,
  onReadAsset
}: {
  assetId: string;
  onReadAsset: (id: string) => Promise<WorkspaceAsset | null>;
}) {
  const [asset, setAsset] = useState<WorkspaceAsset | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void onReadAsset(assetId).then((result) => {
      if (active) setAsset(result);
    }).catch(() => {
      if (active) setError("Image preview is unavailable.");
    });
    return () => { active = false; };
  }, [assetId, onReadAsset]);
  if (error) return <div className="message-attachment-error">{error}</div>;
  if (!asset) return <div className="message-attachment-loading">Preparing image…</div>;
  const source = "data:" + asset.mimeType + ";base64," + asset.contentBase64;
  return (
    <div className="message-image-attachment">
      <img src={source} alt={asset.filename} loading="lazy" />
      <div><span><strong>{asset.filename}</strong><small>{(asset.sizeBytes / 1024).toFixed(0)} KB · generated in Space</small></span>
        <button type="button" onClick={() => {
          const bytes = Uint8Array.from(atob(asset.contentBase64), (char) => char.charCodeAt(0));
          const buffer = new ArrayBuffer(bytes.byteLength);
          new Uint8Array(buffer).set(bytes);
          triggerDownload(new Blob([buffer], { type: asset.mimeType }), asset.filename);
        }}>Download image</button>
      </div>
    </div>
  );
}

function MessageParts({
  message,
  onReadFile,
  onReadAsset
}: {
  message: UIMessage;
  onReadFile: (path: string) => Promise<{ path: string; content: string } | null>;
  onReadAsset: (id: string) => Promise<WorkspaceAsset | null>;
}) {
  const isUser = message.role === "user";

  return (
    <div className={`message-row ${isUser ? "user" : "assistant"}`}>
      <div className="message-avatar">{isUser ? "Y" : "S"}</div>
      <div className="message-content">
        <div className="message-meta">{isUser ? "You" : "Space"} <span>·</span> {isUser ? "Message" : "Assistant"}</div>
        <div className="message-bubble">
          {message.parts.map((part, index) => {
            if (part.type === "text" && part.text.trim()) {
              return <p key={index}>{part.text}</p>;
            }

            if (isToolUIPart(part)) {
              const toolPart = part as unknown as { type: string; state: string; output?: unknown };
              const output = toolPart.output && typeof toolPart.output === "object"
                ? toolPart.output as Record<string, unknown>
                : null;
              if (toolPart.state === "output-available" && toolPart.type === "tool-writeWorkspaceFile" && typeof output?.path === "string") {
                return <WorkspaceFileAttachment key={index} path={output.path} onReadFile={onReadFile} />;
              }
              if (
                toolPart.state === "output-available" &&
                (toolPart.type === "tool-generateImage" || toolPart.type === "tool-editImage") &&
                typeof output?.assetId === "string"
              ) {
                return <WorkspaceImageAttachment key={index} assetId={output.assetId} onReadAsset={onReadAsset} />;
              }
              return (
                <details className="tool-event" key={index}>
                  <summary><span className="tool-event-dot" />{part.type.replace("tool-", "")}<span className="tool-event-state">{part.state}</span></summary>
                  <pre>{JSON.stringify(part, null, 2)}</pre>
                </details>
              );
            }

            return null;
          })}
        </div>
      </div>
    </div>
  );
}

function FileWriteApproval({
  path,
  content,
  onReadFile,
  onApprove,
  onReject
}: {
  path: string;
  content: string;
  onReadFile: (path: string) => Promise<{ path: string; content: string } | null>;
  onApprove: () => void;
  onReject: () => void;
}) {
  const [previous, setPrevious] = useState<{ path: string; content: string } | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void onReadFile(path).then((file) => {
      if (active) setPrevious(file);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [onReadFile, path]);

  const oldLines = previous?.content.split("\\n") ?? [];
  const newLines = content.split("\\n");
  const changed = oldLines.length !== newLines.length || oldLines.some((line, index) => line !== newLines[index]);
  return (
    <section className="approval-card file-approval-card">
      <div className="approval-heading">
        <div><strong>Review file change</strong><small>{previous ? "Update existing file" : "Create new file"}</small></div>
        <code>{path}</code>
      </div>
      <p>{loading ? "Loading the current file…" : changed ? "Compare the saved version with the proposed content before applying it." : "The proposed content matches the current file."}</p>
      {!loading && (
        <div className="file-diff-grid">
          <div><header>Current</header><pre>{previous?.content ?? "(new file)"}</pre></div>
          <div><header>Proposed</header><pre>{content}</pre></div>
        </div>
      )}
      <div className="approval-actions">
        <button type="button" className="button button-primary" onClick={onApprove} disabled={loading}>Approve and apply</button>
        <button type="button" className="button button-secondary" onClick={onReject}>Reject</button>
      </div>
    </section>
  );
}

function SettingSelect<T extends string>({
  label,
  description,
  value,
  options,
  onChange
}: {
  label: string;
  description: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="setting-row">
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <select value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

type SessionProfile = {
  provider: "github" | "google";
  login: string;
  displayName: string;
  avatarUrl: string | null;
};

function Workspace({ onLogout, profile }: { onLogout: () => void; profile: SessionProfile | null }) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [settings, setSettings] = useState<AutonomySettings>(DEFAULT_SETTINGS);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [appearance, setAppearance] = useState<AppearancePreferences>(readAppearancePreferences);
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches === true
  );
  const [settingsNotice, setSettingsNotice] = useState("");
  const [shareInfo, setShareInfo] = useState<{ url: string; jsonUrl: string; token: string; expiresAt: string; messageCount: number } | null>(null);
  const [shareNotice, setShareNotice] = useState("");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState("default");
  const [conversationQuery, setConversationQuery] = useState("");
  const [conversationNotice, setConversationNotice] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [tokenUsage, setTokenUsage] = useState<TokenUsageSummary | null>(null);
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFileMetadata[]>([]);
  const [savedMemories, setSavedMemories] = useState<SavedMemory[]>([]);
  const [memoriesBusy, setMemoriesBusy] = useState(false);
  const [memoryNotice, setMemoryNotice] = useState("");
  const [pendingImage, setPendingImage] = useState<{ id: string; filename: string; mimeType: string; contentBase64: string } | null>(null);
  const [pendingVideoLinks, setPendingVideoLinks] = useState<SupportedVideoLink[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [pathname, setPathname] = useState(() => typeof window === "undefined" ? "/" : window.location.pathname);
  const endRef = useRef<HTMLDivElement>(null);

  const { agent, connected, connectionIssue, reconnect } = useSpaceAgentConnection();

  const {
    messages,
    sendMessage,
    setMessages,
    addToolApprovalResponse,
    stop,
    status
  } = useAgentChat({ agent });

  const busy = status === "streaming" || status === "submitted";
  const currentPath = NAV_ITEMS.some((item) => item.href === pathname) ? pathname : "/";
  const resolvedTheme = appearance.theme === "system"
    ? (systemPrefersDark ? "dark" : "light")
    : appearance.theme;

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return;
    const onChange = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolvedTheme;
    root.dataset.density = appearance.density;
    root.dataset.reduceMotion = String(appearance.reduceMotion);
    root.dataset.codeFont = appearance.codeFont === "System Mono" ? "system" : "jetbrains";

    try {
      window.localStorage.setItem("space-appearance", JSON.stringify(appearance));
    } catch {
      // Preferences still work for the current session when browser storage is unavailable.
    }
  }, [appearance, resolvedTheme]);

  const navigate = (event: MouseEvent<HTMLAnchorElement>, path: string) => {
    event.preventDefault();
    if (path === pathname) return;
    window.history.pushState({}, "", path);
    setPathname(path);
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const loadSettings = useCallback(async () => {
    try {
      const response = await agent.stub.getAutonomySettings();
      setSettings(response.settings);
    } catch {
      setSettingsNotice("Could not load saved autonomy preferences.");
    }
  }, [agent]);

  useEffect(() => {
    if (connected) void loadSettings();
  }, [connected, loadSettings]);

  const loadConversations = useCallback(async (query = conversationQuery) => {
    try {
      const result = await agent.stub.listConversations(query);
      setConversations(result);
      const active = result.find((item: ConversationSummary) => item.active);
      if (active) setActiveConversationId(active.id);
      setConversationNotice("");
    } catch {
      setConversationNotice("Conversation history could not be loaded. Check the connection and retry.");
    }
  }, [agent, conversationQuery]);

  useEffect(() => {
    if (connected && currentPath === "/") void loadConversations();
  }, [connected, currentPath, loadConversations]);

  useEffect(() => {
    // Save a restored legacy chat after the initial Agent sync; completed turns are also archived server-side.
    if (!connected || busy || messages.length === 0) return;
    void agent.stub.saveActiveConversation(messages).then(() => loadConversations()).catch(() => {
      setConversationNotice("This conversation could not be archived. Its active chat is still available.");
    });
  }, [connected, busy, messages.length, agent, loadConversations]);

  const createChat = async () => {
    if (!connected || busy) return;
    try {
      const result = await agent.stub.createConversation();
      setActiveConversationId(result.id);
      setShareInfo(null);
      setShareNotice("");
      setEditingMessageId(null);
      setDraft("");
      setPendingImage(null);
      setPendingVideoLinks([]);
      setError("");
      await loadConversations();
    } catch (value) {
      setError(value instanceof Error ? value.message : "A new conversation could not be created.");
    }
  };

  const openChat = async (id: string) => {
    if (!connected || busy || id === activeConversationId) return;
    try {
      await agent.stub.saveActiveConversation(messages);
      await agent.stub.activateConversation(id);
      setActiveConversationId(id);
      setShareInfo(null);
      setShareNotice("");
      setEditingMessageId(null);
      setDraft("");
      await loadConversations();
    } catch (value) {
      setError(value instanceof Error ? value.message : "The selected conversation could not be opened.");
    }
  };

  const renameChat = async (conversation: ConversationSummary) => {
    const title = window.prompt("Rename conversation (up to 80 characters):", conversation.title);
    if (title === null || title.trim() === conversation.title) return;
    try {
      await agent.stub.renameConversation({ id: conversation.id, title });
      await loadConversations();
    } catch (value) {
      setConversationNotice(value instanceof Error ? value.message : "Conversation could not be renamed.");
    }
  };

  const toggleChatPin = async (conversation: ConversationSummary) => {
    try {
      await agent.stub.pinConversation({ id: conversation.id, pinned: !conversation.pinned });
      await loadConversations();
    } catch {
      setConversationNotice("Pin status could not be updated.");
    }
  };

  const deleteChat = async (conversation: ConversationSummary) => {
    if (!window.confirm("Delete \"" + conversation.title + "\" and its saved conversation history? This cannot be undone.")) return;
    try {
      const result = await agent.stub.deleteConversation(conversation.id);
      setActiveConversationId(result.activeConversationId);
      setShareInfo(null);
      setShareNotice("");
      setEditingMessageId(null);
      await loadConversations();
    } catch (value) {
      setConversationNotice(value instanceof Error ? value.message : "Conversation could not be deleted.");
    }
  };

  const loadTokenUsage = useCallback(async () => {
    try {
      const summary = await agent.stub.getTokenUsage();
      setTokenUsage(summary);
    } catch {
      // Analytics is optional and must not block the conversation or IDE.
    }
  }, [agent]);

  useEffect(() => {
    if (connected && !busy) void loadTokenUsage();
  }, [connected, busy, loadTokenUsage]);

  const listWorkspaceFiles = useCallback(async () => {
    const files = await agent.stub.listWorkspaceFiles();
    setWorkspaceFiles(files);
    return files;
  }, [agent]);

  const loadSavedMemories = useCallback(async () => {
    setMemoriesBusy(true);
    setMemoryNotice("");
    try {
      setSavedMemories(await agent.stub.listUserMemories());
    } catch {
      setMemoryNotice("Saved memory could not be loaded. Check the connection and retry.");
    } finally {
      setMemoriesBusy(false);
    }
  }, [agent]);

  useEffect(() => {
    if (connected && currentPath === "/settings") void loadSavedMemories();
  }, [connected, currentPath, loadSavedMemories]);

  const deleteSavedMemory = async (key: string) => {
    if (!window.confirm("Delete this saved memory? Space will no longer use it in future replies.")) return;
    try {
      await agent.stub.deleteUserMemory(key);
      setMemoryNotice("Memory deleted.");
      await loadSavedMemories();
    } catch {
      setMemoryNotice("Memory could not be deleted.");
    }
  };

  const clearSavedMemories = async () => {
    if (!savedMemories.length || !window.confirm("Delete all saved memories? This cannot be undone.")) return;
    try {
      const result = await agent.stub.clearUserMemories();
      setSavedMemories([]);
      setMemoryNotice((result.deleted ?? 0) + " memories deleted.");
    } catch {
      setMemoryNotice("Saved memories could not be cleared.");
    }
  };

  const readWorkspaceFile = useCallback((path: string) => agent.stub.readWorkspaceFile(path), [agent]);
  const readWorkspaceAsset = useCallback((id: string) => agent.stub.readWorkspaceAsset(id), [agent]);

  useEffect(() => {
    if (connected && currentPath === "/analytics") void listWorkspaceFiles().catch(() => undefined);
  }, [connected, currentPath, listWorkspaceFiles]);

  useEffect(() => {
    if (currentPath === "/") endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, currentPath]);

  const addVideoLink = () => {
    const raw = window.prompt("Tempel tautan video YouTube, TikTok, Vimeo, atau Dailymotion:");
    if (!raw) return;
    const parsed = parseSupportedVideoLink(raw);
    if (!parsed) {
      setError("Tautan tidak valid atau platform belum didukung. Gunakan tautan HTTPS dari YouTube, TikTok, Vimeo, atau Dailymotion.");
      return;
    }
    setPendingVideoLinks((current) =>
      current.some((item) => item.url === parsed.url) ? current : [...current, parsed].slice(0, 5)
    );
    setError("");
  };

  const send = () => {
    const text = draft.trim();
    if ((!text && !pendingImage && pendingVideoLinks.length === 0) || !connected || busy) return;

    if (editingMessageId) {
      const editIndex = messages.findIndex((message) => message.id === editingMessageId);
      if (editIndex >= 0) {
        // Rewind after the selected user message so the new answer replaces its old branch.
        setMessages(messages.slice(0, editIndex));
      }
      setEditingMessageId(null);
    }

    setDraft("");
    setError("");
    const imageNote = pendingImage
      ? `\n\n[Image attachment: ${pendingImage.filename}; asset ID: ${pendingImage.id}. Use editImage with this asset ID if I ask you to edit the image.]`
      : "";
    const videoNote = pendingVideoLinks.length
      ? "\n\n" + pendingVideoLinks.map((item) =>
          `[Video link attachment: ${item.platform}; URL: ${item.url}. This is a link reference only. Do not claim to have watched or analyzed the media unless a video-analysis tool provides evidence.]`
        ).join("\n")
      : "";
    sendMessage({
      role: "user",
      parts: [{ type: "text", text: text + imageNote + videoNote }]
    });
    setPendingImage(null);
    setPendingVideoLinks([]);
  };

  const editUserMessage = (message: UIMessage) => {
    if (busy || message.role !== "user") return;
    const text = message.parts
      .filter((part) => part.type === "text" && "text" in part)
      .map((part) => String(part.text))
      .join("\n")
      .trim();
    setDraft(text);
    setEditingMessageId(message.id);
    setError("");
    window.setTimeout(() => document.querySelector<HTMLTextAreaElement>(".composer textarea")?.focus(), 0);
  };

  const copyMessage = async (message: UIMessage) => {
    const text = message.parts
      .filter((part) => part.type === "text" && "text" in part)
      .map((part) => String(part.text))
      .join("\n")
      .trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setConversationNotice("Message copied.");
    } catch {
      setError("Clipboard access is unavailable in this browser.");
    }
  };

  const uploadImage = async (file?: File) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setError("File sumber melebihi 8 MB. Pilih gambar yang lebih kecil.");
      return;
    }
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("Gunakan gambar PNG, JPEG, atau WebP.");
      return;
    }
    setUploadBusy(true);
    setError("");
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 510 / bitmap.width, 510 / bitmap.height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image processing is unavailable in this browser.");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not prepare the image.")), "image/webp", 0.84);
      });
      if (blob.size > 1_350_000) throw new Error("Gambar hasil kompresi melebihi 1,35 MB. Pilih gambar lain atau kecilkan resolusinya.");
      const buffer = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (let offset = 0; offset < buffer.length; offset += 0x8000) {
        binary += String.fromCharCode(...buffer.subarray(offset, offset + 0x8000));
      }
      const contentBase64 = btoa(binary);
      const saved = await agent.stub.uploadWorkspaceAsset({
        filename: file.name.replace(/\\.[^.]+$/, "") + ".webp",
        mimeType: "image/webp",
        contentBase64
      });
      setPendingImage({ id: saved.id, filename: saved.filename, mimeType: saved.mimeType, contentBase64 });
    } catch (value) {
      setError(value instanceof Error ? value.message : "Image upload failed.");
    } finally {
      setUploadBusy(false);
    }
  };

  const shareChat = async () => {
    if (!messages.length || busy) return;
    const approved = window.confirm(
      "Buat tautan read-only untuk percakapan ini? Siapa pun yang memiliki tautan dapat membaca teks pesan dan detail tool. Tautan berlaku 7 hari dan dapat dicabut."
    );
    if (!approved) return;

    setShareNotice("Membuat tautan…");
    try {
      const result = await agent.stub.createChatShare();
      // Resolve the relative share route against the active host, including Preview deployments.
      const shareUrls = resolveShareLinks(result, window.location.origin);
      const shareInfo = { ...result, ...shareUrls };
      setShareInfo(shareInfo);
      setShareNotice("Tautan dibuat. Siapa pun yang memiliki tautan dapat membaca snapshot ini selama 7 hari.");
      try {
        await navigator.clipboard.writeText(shareInfo.url);
        setShareNotice("Tautan disalin ke clipboard.");
      } catch {
        // Keep the URL visible so it can be copied manually.
      }
    } catch (shareError) {
      setShareNotice(shareError instanceof Error ? shareError.message : "Tautan tidak dapat dibuat.");
    }
  };

  const revokeShare = async () => {
    if (!shareInfo) return;
    if (!window.confirm("Cabut tautan ini sekarang? Tautan yang sudah dicabut tidak dapat dibuka lagi.")) return;
    try {
      const result = await agent.stub.revokeChatShare(shareInfo.token);
      if (result.revoked) {
        setShareInfo(null);
        setShareNotice("Tautan berhasil dicabut.");
      } else {
        setShareNotice("Tautan ini sudah tidak tersedia.");
      }
    } catch {
      setShareNotice("Tautan tidak dapat dicabut.");
    }
  };

  const copyShare = async () => {
    if (!shareInfo) return;
    try {
      await navigator.clipboard.writeText(shareInfo.url);
      setShareNotice("Tautan disalin ke clipboard.");
    } catch {
      setShareNotice("Clipboard tidak tersedia. Salin URL yang terlihat.");
    }
  };

  const saveSettings = async () => {
    setSettingsBusy(true);
    setSettingsNotice("");
    try {
      const response = await agent.stub.updateAutonomySettings(settings);
      setSettings(response.settings);
      setSettingsNotice("Preferensi berhasil disimpan.");
    } catch {
      setSettingsNotice("Preferensi tidak dapat disimpan. Periksa koneksi lalu coba lagi.");
    } finally {
      setSettingsBusy(false);
    }
  };

  const header = (
    <header className="topbar">
      <a className="brand" href="/" onClick={(event) => navigate(event, "/")} aria-label="Space home">
        <span className="brand-copy"><strong>space</strong><small>AI workspace</small></span>
      </a>
      <button
        type="button"
        className="sidebar-new-chat"
        onClick={() => void createChat()}
        disabled={!connected || busy}
      >
        <span aria-hidden="true">＋</span> New chat
      </button>
      <nav className="primary-nav" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => (
          <a
            key={item.href}
            href={item.href}
            onClick={(event) => navigate(event, item.href)}
            className={currentPath === item.href ? "active" : ""}
            aria-current={currentPath === item.href ? "page" : undefined}
          >
            {item.label}
          </a>
        ))}
      </nav>
      {currentPath === "/" && (
        <details className="conversation-history" open>
          <summary>History <span>{conversations.length}</span></summary>
          <label className="conversation-search">
            <input
              type="search"
              value={conversationQuery}
              onChange={(event) => setConversationQuery(event.target.value)}
              placeholder="Search conversations…"
              aria-label="Search conversations"
            />
          </label>
          {conversationNotice && <p className="conversation-notice" role="status">{conversationNotice}</p>}
          <div className="conversation-list">
            {conversations.map((conversation) => (
              <div className={"conversation-item" + (conversation.id === activeConversationId ? " active" : "")} key={conversation.id}>
                <button
                  className="conversation-open"
                  type="button"
                  onClick={() => void openChat(conversation.id)}
                  disabled={busy}
                  aria-current={conversation.id === activeConversationId ? "page" : undefined}
                  title={conversation.title}
                >
                  <span className="conversation-item-title">{conversation.pinned ? "Pinned · " : ""}{conversation.title}</span>
                  <small>{conversation.messageCount} messages</small>
                </button>
                <div className="conversation-item-actions">
                  <button type="button" onClick={() => void toggleChatPin(conversation)} disabled={busy} aria-label={conversation.pinned ? "Unpin conversation" : "Pin conversation"} title={conversation.pinned ? "Unpin" : "Pin"}>{conversation.pinned ? "Unpin" : "Pin"}</button>
                  <button type="button" onClick={() => void renameChat(conversation)} disabled={busy} aria-label="Rename conversation">Rename</button>
                  <button type="button" onClick={() => void deleteChat(conversation)} disabled={busy} aria-label="Delete conversation">Delete</button>
                </div>
              </div>
            ))}
            {conversations.length === 0 && <p className="conversation-empty">No saved conversations found.</p>}
          </div>
        </details>
      )}
      <div className="topbar-actions">
        <span className={`connection ${connected ? "online" : "offline"}`}>
          <i /> {connected ? "Connected" : connectionIssue?.kind === "reconnecting" ? "Reconnecting" : "Offline"}
        </span>
        <div className="account-profile" title={profile ? profile.login : "Account profile"}>
          {profile?.avatarUrl
            ? <img className="account-avatar" src={profile.avatarUrl} alt="" referrerPolicy="no-referrer" />
            : <span className="account-avatar account-avatar-fallback">{(profile?.displayName || profile?.login || "U").slice(0, 1).toUpperCase()}</span>}
          <span className="account-profile-copy">
            <strong>{profile?.displayName || profile?.login || "Account"}</strong>
            <small>{profile?.provider === "google" ? "Google account" : "GitHub account"}</small>
          </span>
        </div>
        <button className="text-button" type="button" onClick={onLogout}>Sign out</button>
      </div>
    </header>
  );

  const chatPage = (
    <main className="page-container chat-page">
      <div className="page-heading chat-page-heading">
        <div>
          <p className="eyebrow">YOUR PRIVATE WORKSPACE</p>
          <h1>What are we working on?</h1>
          <p>Ask Space to plan, reason, write files, or run a bounded code task.</p>
        </div>
        <div className="chat-heading-actions">
          <button className="button button-secondary" type="button" onClick={() => void shareChat()} disabled={!messages.length || busy}>Share chat</button>
          <button className="button button-quiet" type="button" onClick={() => void createChat()} disabled={!connected || busy}>New chat</button>
        </div>
      </div>

      {shareNotice && (
        <section className="share-panel" role="status">
          <div className="share-panel-copy">
            <strong>Conversation share</strong>
            <span>{shareNotice}</span>
            {shareInfo && <a href={shareInfo.url} target="_blank" rel="noreferrer">{shareInfo.url}</a>}
            {shareInfo && <small>{shareInfo.messageCount} messages · expires {new Date(shareInfo.expiresAt).toLocaleString()}</small>}
          </div>
          {shareInfo && <div className="share-panel-actions">
            <button type="button" onClick={() => void copyShare()}>Copy link</button>
            <a href={shareInfo.jsonUrl} target="_blank" rel="noreferrer">View JSON</a>
            <button type="button" className="danger" onClick={() => void revokeShare()}>Revoke</button>
          </div>}
        </section>
      )}

      <section className="chat-card">
        <div className="chat-card-header">
          <div><span className="chat-status-dot" /> <strong>{conversations.find((item) => item.id === activeConversationId)?.title ?? "Space"}</strong><span>Saved conversation</span></div>
          <small>Persistent history · automatic context summaries</small>
        </div>
        <div className="messages" aria-live="polite">
          {messages.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">S</div>
              <h2>Start with a goal</h2>
              <p>Describe what you want to build, understand, or automate.</p>
              <div className="prompt-suggestions">
                <button type="button" onClick={() => setDraft("Create a small Python project and explain its files.")}>Create a project</button>
                <button type="button" onClick={() => setDraft("Help me understand how this workspace is structured.")}>Explore the workspace</button>
                <button type="button" onClick={() => setDraft("Run a Python snippet that prints 6 * 7.")}>Run a code snippet</button>
              </div>
            </div>
          )}

          {messages.map((message) => (
            <div className="message-group" key={message.id}>
              <MessageParts message={message} onReadFile={readWorkspaceFile} onReadAsset={readWorkspaceAsset} />
              <div className="message-actions">
                {message.role === "user" && (
                  <button type="button" onClick={() => editUserMessage(message)} disabled={busy}>Edit & resend</button>
                )}
                {message.role === "assistant" && (
                  <button type="button" onClick={() => void copyMessage(message)}>Copy</button>
                )}
              </div>
              {message.parts.map((part, index) => {
                if (!isToolUIPart(part) || part.state !== "approval-requested") return null;
                const approvalId =
                  "approval" in part && part.approval && typeof part.approval === "object"
                    ? (part.approval as { id?: string }).id
                    : undefined;
                if (!approvalId) return null;

                const pendingTool = part as unknown as { type: string; input?: unknown };
                const pendingInput = pendingTool.input && typeof pendingTool.input === "object"
                  ? pendingTool.input as Record<string, unknown>
                  : null;
                if (pendingTool.type === "tool-writeWorkspaceFile" && typeof pendingInput?.path === "string" && typeof pendingInput.content === "string") {
                  return (
                    <FileWriteApproval
                      key={`${message.id}-approval-${index}`}
                      path={pendingInput.path}
                      content={pendingInput.content}
                      onReadFile={readWorkspaceFile}
                      onApprove={() => addToolApprovalResponse({ id: approvalId, approved: true })}
                      onReject={() => addToolApprovalResponse({ id: approvalId, approved: false })}
                    />
                  );
                }
                return (
                  <div className="approval-card" key={`${message.id}-approval-${index}`}>
                    <strong>Approval required</strong>
                    <p>Review this requested action before it runs or changes saved project data.</p>
                    <pre>{JSON.stringify(part.input, null, 2)}</pre>
                    <div className="approval-actions">
                      <button type="button" className="button button-primary" onClick={() => addToolApprovalResponse({ id: approvalId, approved: true })}>Approve</button>
                      <button type="button" className="button button-secondary" onClick={() => addToolApprovalResponse({ id: approvalId, approved: false })}>Reject</button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          {busy && <div className="thinking"><span /> Space is working…</div>}
          <div ref={endRef} />
        </div>

        {error && <div className="error-banner" role="status">{error}</div>}

        {editingMessageId && (
          <div className="editing-message-banner">
            <span>Editing a previous message. Sending will replace that message and remove later replies in this conversation.</span>
            <button type="button" onClick={() => { setEditingMessageId(null); setDraft(""); }}>Cancel edit</button>
          </div>
        )}
        <form className="composer" onSubmit={(event) => { event.preventDefault(); send(); }}>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            placeholder="Message Space…"
            rows={3}
            disabled={!connected || busy}
            aria-label="Message Space"
          />
          {pendingImage && (
            <div className="pending-image-attachment">
              <img src={"data:" + pendingImage.mimeType + ";base64," + pendingImage.contentBase64} alt={pendingImage.filename} />
              <span>{pendingImage.filename}</span>
              <button type="button" onClick={() => setPendingImage(null)} aria-label="Remove attached image">×</button>
            </div>
          )}
          {pendingVideoLinks.length > 0 && (
            <div className="pending-video-links" aria-label="Video link attachments">
              {pendingVideoLinks.map((item) => (
                <div className="pending-video-link" key={item.url}>
                  <span className="video-link-icon" aria-hidden="true">▶</span>
                  <span className="video-link-copy">
                    <strong>{item.platform}</strong>
                    <a href={item.url} target="_blank" rel="noreferrer">{item.url}</a>
                  </span>
                  <button type="button" onClick={() => setPendingVideoLinks((current) => current.filter((link) => link.url !== item.url))} aria-label={"Remove " + item.platform + " link"}>×</button>
                </div>
              ))}
            </div>
          )}
          <div className="composer-footer">
            <div className="composer-tools">
              <label className="attach-image-button">
                {uploadBusy ? "Preparing image…" : "＋ Image"}
                <input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploadBusy || busy} onChange={(event) => { void uploadImage(event.target.files?.[0]); event.currentTarget.value = ""; }} />
              </label>
              <button type="button" className="attach-link-button" onClick={addVideoLink} disabled={busy}>＋ Video link</button>
              <span>Enter to send · Shift + Enter for a new line</span>
            </div>
            {busy ? (
              <button type="button" className="button button-primary" onClick={stop}>Stop response</button>
            ) : (
              <button type="submit" className="button button-primary" disabled={(!draft.trim() && !pendingImage && pendingVideoLinks.length === 0) || !connected}>Send message <span>↗</span></button>
            )}
          </div>
        </form>
      </section>
      <p className="page-footnote">Workspace files are private to this Space account. Sandbox runs use temporary, restricted GitHub-hosted containers.</p>
    </main>
  );

  const vscodePage = (
    <Suspense fallback={<main className="page-container"><p>Opening Space IDE…</p></main>}>
      <VSCodeWebPage
        agent={agent}
        connected={connected}
        connectionIssue={connectionIssue}
        onReconnect={reconnect}
        theme={resolvedTheme}
        onThemeChange={(theme) => setAppearance((current) => ({ ...current, theme }))}
        codeFont={appearance.codeFont === "System Mono" ? "system" : "jetbrains"}
        lineNumbers={appearance.lineNumbers}
      />
    </Suspense>
  );

  const settingsPage = (
    <main className="page-container settings-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">PREFERENCES & ACCESS</p>
          <h1>Settings</h1>
          <p>Choose how Space should use the capabilities currently connected to this workspace.</p>
        </div>
        <span className="meta-chip">Owner controls</span>
      </div>

      <section className="surface-card settings-card appearance-settings-card">
        <div className="section-title">
          <div><h2>Appearance</h2><p>Choose how Space looks on this device. These preferences are saved locally.</p></div>
          <span className="meta-chip">This device</span>
        </div>
        <SettingSelect
          label="Theme"
          description="Applies to Chat, IDE, Analytics, Settings, and the task console."
          value={appearance.theme}
          options={[
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
            { value: "system", label: "System" }
          ]}
          onChange={(value) => setAppearance((current) => ({ ...current, theme: value }))}
        />
        <SettingSelect
          label="Interface density"
          description="Controls spacing in navigation, conversation lists, and panels."
          value={appearance.density}
          options={[
            { value: "comfortable", label: "Comfortable" },
            { value: "compact", label: "Compact" }
          ]}
          onChange={(value) => setAppearance((current) => ({ ...current, density: value }))}
        />
        <label className="setting-toggle-row">
          <span><strong>Reduce motion</strong><small>Turns off most transitions and interface animations.</small></span>
          <input
            type="checkbox"
            checked={appearance.reduceMotion}
            onChange={(event) => setAppearance((current) => ({ ...current, reduceMotion: event.target.checked }))}
          />
        </label>
      </section>

      <section className="surface-card settings-card editor-settings-card">
        <div className="section-title"><div><h2>Editor</h2><p>Configure the code editor and terminal appearance.</p></div></div>
        <SettingSelect
          label="Code font"
          description="Used in the editor, terminal, and code blocks."
          value={appearance.codeFont}
          options={[
            { value: "JetBrains Mono", label: "JetBrains Mono" },
            { value: "System Mono", label: "System monospace" }
          ]}
          onChange={(value) => setAppearance((current) => ({ ...current, codeFont: value }))}
        />
        <label className="setting-toggle-row">
          <span><strong>Line numbers</strong><small>Show line numbers in the browser IDE editor.</small></span>
          <input
            type="checkbox"
            checked={appearance.lineNumbers}
            onChange={(event) => setAppearance((current) => ({ ...current, lineNumbers: event.target.checked }))}
          />
        </label>
        <div className="settings-preview">
          <div><span className="eyebrow">PREVIEW</span><strong>const message = "Hello, Space";</strong></div>
          <small>{appearance.codeFont} · {appearance.lineNumbers ? "Line numbers on" : "Line numbers off"}</small>
        </div>
      </section>

      <section className="surface-card settings-card">
        <div className="section-title"><div><h2>Autonomy preferences</h2><p>These choices are saved to the private Space agent. They do not activate tools that have not been implemented.</p></div></div>
        <SettingSelect
          label="Workspace execution"
          description="Run bounded Python and JavaScript snippets on a temporary GitHub-hosted Linux runner in an offline container."
          value={settings.workspaceExecution}
          options={[
            { value: "manual", label: "Ask before each run" },
            { value: "autonomous_sandbox", label: "Autonomous inside sandbox" }
          ]}
          onChange={(value) => setSettings((current) => ({ ...current, workspaceExecution: value }))}
        />
        <SettingSelect
          label="Browser research"
          description="Public-page reading can become automatic when a browser tool is connected. External write actions remain gated."
          value={settings.browserResearch}
          options={[
            { value: "manual", label: "Ask before browsing" },
            { value: "read_only_auto", label: "Automatic read-only research" }
          ]}
          onChange={(value) => setSettings((current) => ({ ...current, browserResearch: value }))}
        />
        <SettingSelect
          label="Project files"
          description="Choose how Space applies file changes. Review mode presents the current and proposed file side by side."
          value={settings.projectFiles}
          options={[
            { value: "ask_before_write", label: "Ask before every write" },
            { value: "review_changes", label: "Review diff before applying" },
            { value: "selected_workspace", label: "Apply inside private workspace" }
          ]}
          onChange={(value) => setSettings((current) => ({ ...current, projectFiles: value }))}
        />
        <SettingSelect
          label="Self-update"
          description="Automatic promotion is limited to low-risk releases that pass every required gate and have a verified rollback."
          value={settings.selfUpdate}
          options={[
            { value: "manual", label: "Manual release only" },
            { value: "automatic_after_gates", label: "Auto-release after all gates pass" }
          ]}
          onChange={(value) => setSettings((current) => ({ ...current, selfUpdate: value }))}
        />
        <div className="settings-footer">
          <span role="status">{settingsNotice}</span>
          <button type="button" className="button button-primary" onClick={() => void saveSettings()} disabled={!connected || settingsBusy}>
            {settingsBusy ? "Saving…" : "Save preferences"}
          </button>
        </div>
      </section>

      <section className="surface-card settings-card memory-settings-card">
        <div className="section-title">
          <div><h2>Saved memory</h2><p>Space can use approved preferences and useful facts in future responses. Memory is only added when you explicitly ask and approve it.</p></div>
          <button type="button" className="button button-secondary" onClick={() => void loadSavedMemories()} disabled={!connected || memoriesBusy}>Refresh</button>
        </div>
        {memoryNotice && <p className="memory-notice" role="status">{memoryNotice}</p>}
        {memoriesBusy ? <p className="memory-empty">Loading saved memory…</p> : savedMemories.length ? (
          <div className="memory-list">
            {savedMemories.map((memory) => (
              <article className="memory-row" key={memory.key}>
                <div>
                  <strong>{memory.key}</strong>
                  <p>{memory.value}</p>
                  <small>Updated {new Date(memory.updatedAt).toLocaleString()}</small>
                </div>
                <button type="button" className="memory-delete-button" onClick={() => void deleteSavedMemory(memory.key)}>Delete</button>
              </article>
            ))}
          </div>
        ) : (
          <p className="memory-empty">No saved memory yet. In chat, say “remember that…” to ask Space to save a non-sensitive fact.</p>
        )}
        <div className="settings-footer">
          <span>Only use memory that is relevant to the current request.</span>
          <button type="button" className="button button-secondary" onClick={() => void clearSavedMemories()} disabled={!savedMemories.length || memoriesBusy}>Clear all memory</button>
        </div>
      </section>

      <section className="surface-card settings-card">
        <div className="section-title"><div><h2>Privacy and permissions</h2><p>Controls that keep the workspace private and prevent unapproved external actions.</p></div></div>
        <div className="policy-row"><span className="policy-icon">01</span><div><strong>Private workspace files</strong><p>Files live in Space's Durable Object storage. They are not automatically synced to GitHub or your device.</p></div></div>
        <div className="policy-row"><span className="policy-icon">02</span><div><strong>External account access</strong><p>Third-party services require their own official OAuth consent. Never share passwords, one-time codes, or private keys.</p></div></div>
        <div className="policy-row"><span className="policy-icon">03</span><div><strong>Protected actions</strong><p>Publishing, sending, spending, destructive changes, and security-setting changes require owner confirmation.</p></div></div>
      </section>
    </main>
  );

  return (
    <div className="app-shell">
      {header}
      {!connected && connectionIssue && (
        <aside className={"connection-banner " + connectionIssue.kind} role="status">
          <div className="connection-banner-copy">
            <strong>{connectionIssue.kind === "unauthenticated" ? "Sign-in required" : connectionIssue.kind === "workspace-unavailable" ? "Private workspace unavailable" : connectionIssue.kind === "websocket-unavailable" ? "Live connection interrupted" : connectionIssue.kind === "network" ? "Cannot reach Space" : "Reconnecting to Space"}</strong>
            <p>{connectionIssue.message}</p>
          </div>
          <button type="button" onClick={() => connectionIssue.kind === "unauthenticated" ? window.location.reload() : reconnect()}>
            {connectionIssue.kind === "unauthenticated" ? "Reload sign-in" : "Reconnect"}
          </button>
        </aside>
      )}
      {currentPath === "/ide" ? vscodePage :
        currentPath === "/analytics" ? (
          <Suspense fallback={<main className="page-container"><p>Loading analytics…</p></main>}>
            <AnalyticsPage usage={tokenUsage} files={workspaceFiles} />
          </Suspense>
        ) :
        currentPath === "/settings" ? settingsPage : chatPage}
    </div>
  );
}

type SessionResponse = {
  authenticated: boolean;
  login: string | null;
  profile: SessionProfile | null;
  githubAvailable: boolean;
  googleAvailable: boolean;
};

export default function App() {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/session", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not verify the current session.");
        return await response.json() as SessionResponse;
      })
      .then((value) => {
        if (active) setSession(value);
      })
      .catch(() => {
        if (active) setSessionError("Could not connect to the private Space service.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const logout = async () => {
    await fetch("/auth/logout", {
      method: "POST",
      credentials: "same-origin"
    });
    setSession({ authenticated: false, login: null, profile: null, githubAvailable: session?.githubAvailable ?? false, googleAvailable: session?.googleAvailable ?? false });
  };

  if (loading) {
    return (
      <main className="auth-shell">
        <section className="auth-card" aria-live="polite">
          <h1>space</h1>
          <p>Checking your private workspace session…</p>
        </section>
      </main>
    );
  }

  if (sessionError) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <h1>space</h1>
          <p role="alert">{sessionError}</p>
          <button type="button" className="button button-primary" onClick={() => window.location.reload()}>Retry</button>
        </section>
      </main>
    );
  }

  if (!session?.authenticated) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <p className="eyebrow">PRIVATE AI WORKSPACE</p>
          <h1>Sign in to Space</h1>
          <p>Only the configured owner account can open this workspace.</p>
          {session?.githubAvailable ? (
            <a className="auth-button" href="/auth/github">Continue with GitHub <span>↗</span></a>
          ) : (
            <p className="auth-provider-note">GitHub sign-in is not configured for this deployment.</p>
          )}
          {session?.googleAvailable ? (
            <a className="auth-button auth-button-google" href="/auth/google">Continue with Google <span>↗</span></a>
          ) : (
            <p className="auth-provider-note">Google sign-in is available after its OAuth credentials and owner email are configured.</p>
          )}
        </section>
      </main>
    );
  }

  return <Workspace onLogout={() => void logout()} profile={session.profile} />;
}
