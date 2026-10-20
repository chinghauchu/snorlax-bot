import {
  ClipboardEvent,
  DragEvent,
  FormEvent,
  Fragment,
  KeyboardEvent,
  MouseEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ApiError,
  SEED_AGENT_ID,
  SEED_CHANNEL_ID,
  createAgent,
  createChannel,
  createPlugin,
  createRoutine,
  createSkill,
  deleteAgent,
  deleteMemory,
  deletePlugin,
  deleteUserMemory,
  deleteRoutine,
  deleteSkill,
  getMemory,
  getUserMemory,
  getSkill,
  listAgents,
  listMessages,
  listPluginCatalog,
  listPlugins,
  listRoutines,
  listSkills,
  patchAgent,
  patchRoutine,
  patchSkill,
  resolveMediaUrl,
  sendMessage,
  speakText,
  transcribeAudio,
  uploadAttachment,
  fetchAttachmentBlob,
  startPluginAuth,
  waitUntilPluginConnected,
  openComputerSession,
  closeComputerSession,
  type StreamHandlers,
} from "./api";
import {
  displayBody,
  fromLabel,
  isHandoffRoot,
  isToolLine,
  jumpChannelName,
  repliesLabel,
  visibleJump,
} from "./handoff";
import {
  canDeleteAgent,
  canEditChannel,
  canToggleSharedProject,
  channelMembers,
  displayInitials,
  EMPTY_ROUTINES,
  WEBHOOK_COPY_FEEDBACK_MS,
  ADD_ROUTINE_TITLE,
  CRON_PLACEHOLDER,
  CRON_HINT,
  NO_SKILLS_YET,
  canSubmitRoutine,
  canSubmitSkill,
  fallbackRosterSelection,
  infoPaneKind,
  nextRosterSelection,
  pluginKindConnected,
  routineMutedLine,
  routineRemoveConfirm,
  skillRemoveConfirm,
  memoryRemoveConfirm,
  isMemoryToolLine,
  EDIT_SKILL_TITLE,
  ADD_SKILL_TITLE,
  EMPTY_MEMORY,
  SHARED_PROJECT_HINT,
  showsWebhookCopy,
  visiblePaneRoutines,
  webhookCopyText,
  SLACK_CHANNEL_PLACEHOLDER,
  GITHUB_REPO_PLACEHOLDER,
  SLACK_HINT,
  GITHUB_HINT,
} from "./infoPane";
import {
  filterCandidates,
  insertMention,
  isTranscriptVisible,
  isUserSender,
  mentionIdsInText,
  mentionTrigger,
  pickedChipNames,
  senderKey,
  splitMentions,
} from "./mentions";
import {
  composerSkillAgentId,
  filterSkills,
  insertSkill,
  skillPopupOpen,
  skillTrigger,
} from "./skillsPicker";
import {
  composerEnterSends,
  isComposerComposing,
  isComposerPasteChord,
  rosterRefreshTool,
} from "./composerKeys";
import { COMPOSER_MAX_PX, composerFrame } from "./composerGrow";
import {
  arrowUpRecalls,
  escapeClearsRecall,
  latestUserMessageText,
  recallArmedAfterEdit,
} from "./recallDraft";
import {
  QUOTE_LABEL,
  QUOTE_ROOT_VALUE,
  appendQuoteToDraft,
  quoteButtonOrigin,
  quoteRootAttr,
  quoteableText,
} from "./quoteSelection";
import {
  quoteSelectionBlocked,
  selectionToQuote,
} from "./quoteSelectionKey";
import { backspaceRemovesLastChip, withoutLastChip } from "./backspaceChip";
import { adjacentChatId, chatNavDirection } from "./chatNav";
import {
  appendDraftAtEnd,
  focusComposerChordBlocked,
  focusInsideCard,
  isFocusComposerChord,
  typeToFocusBlocked,
  typeToFocusCharacter,
} from "./focusComposerKey";
import {
  copyLastReplyBlocked,
  isCopyLastReplyChord,
  lastAssistantReply,
} from "./copyLastReply";
import {
  nextTranscriptScrollTop,
  prefersJumpToLatest,
  transcriptScrollAction,
  transcriptScrollBlocked,
} from "./transcriptScroll";
import {
  isNewChatChord,
  newChatBlocked,
  overlayTextFieldOwnsNewChat,
} from "./newChatKey";
import {
  chatIdAtJumpSlot,
  chatJumpBlocked,
  chatJumpSlot,
  overlayTextFieldOwnsChatJump,
  visibleJumpIds,
} from "./chatJump";
import {
  archiveOpenChatBlocked,
  isArchiveOpenChatChord,
  overlayTextFieldOwnsArchiveOpenChat,
} from "./archiveOpenChat";
import {
  isUnarchiveOpenChatChord,
  overlayTextFieldOwnsUnarchiveOpenChat,
  unarchiveOpenChatBlocked,
  unarchiveOpenChatShouldRun,
} from "./unarchiveOpenChat";
import {
  chatHistoryBlocked,
  chatHistoryDirection,
  chatHistoryShouldMove,
  noteChatOpenClosed,
  overlayTextFieldOwnsChatHistory,
  recordChatOpen,
  seedChatOpenHistory,
  stepChatOpenHistory,
} from "./chatOpenHistory";
import {
  applyTranscriptTextStep,
  browserTranscriptTextStorage,
  overlayTextFieldOwnsTranscriptText,
  readTranscriptTextScale,
  transcriptScaleFactor,
  transcriptTextBlocked,
  transcriptTextShouldApply,
  transcriptTextStep,
  writeTranscriptTextScale,
} from "./transcriptTextScale";
import {
  composerTextOwnsUserJump,
  isUserJumpMessage,
  overlayTextFieldOwnsUserJump,
  pickUserJumpId,
  userJumpContentTop,
  userJumpHighlightMs,
  userJumpScrollTop,
  userJumpView,
  userMessageJumpBlocked,
  userMessageJumpDirection,
  userMessageJumpShouldMove,
} from "./userMessageJump";
import {
  QUOTE_JUMP_ACTION,
  QuoteJumps,
  browserQuoteJumpStorage,
  isQuoteJumpChord,
  overlayTextFieldOwnsQuoteJump,
  pickQuoteJumpMessageId,
  primaryQuoteSource,
  quoteJumpBlocked,
  quoteJumpBubbleProps,
  quoteJumpParts,
  quoteJumpRowSelector,
  quoteJumpShouldMove,
  quoteJumpTargetSelector,
} from "./quoteJump";
import {
  clearComposerDraftBlocked,
  composerDraftAlreadyEmpty,
  isClearComposerDraftChord,
  overlayTextFieldOwnsClearComposerDraft,
} from "./clearComposerDraft";
import {
  isPinOpenChatChord,
  overlayTextFieldOwnsPinOpenChat,
  pinOpenChatBlocked,
  pinOpenChatShouldToggle,
} from "./pinOpenChat";
import {
  isMuteOpenChatChord,
  muteOpenChatBlocked,
  muteOpenChatShouldToggle,
  overlayTextFieldOwnsMuteOpenChat,
} from "./muteOpenChat";
import {
  isMarkOpenChatChord,
  markOpenChatBlocked,
  markOpenChatShouldApply,
  overlayTextFieldOwnsMarkOpenChat,
} from "./markOpenChat";
import {
  isRenameOpenChatChord,
  overlayTextFieldOwnsRenameOpenChat,
  renameOpenChatBlocked,
  renameOpenChatShouldStart,
} from "./renameOpenChat";
import {
  deleteConfirmAction,
  deleteOpenChatBlocked,
  deleteOpenChatShouldRun,
  isDeleteOpenChatChord,
  nextOpenChatAfterDelete,
  overlayTextFieldOwnsDeleteOpenChat,
} from "./deleteOpenChat";
import {
  copyTranscriptBlocked,
  copyTranscriptShouldRun,
  isCopyTranscriptChord,
  overlayTextFieldOwnsCopyTranscript,
  transcriptPlainText,
} from "./copyTranscript";
import {
  isToolTraceGroupsChord,
  overlayTextFieldOwnsToolTraceGroups,
  toolTraceGroupsBlocked,
  toolTraceGroupsShouldToggle,
} from "./toolTraceGroups";
import {
  chatListFilterKeyBlocked,
  chatListFilterShouldToggle,
  isChatListFilterChord,
  overlayTextFieldOwnsChatListFilter,
} from "./chatListFilterKey";
import {
  archiveListBlocked,
  archiveListShouldToggle,
  isArchiveListChord,
  nextArchiveListOpen,
  overlayTextFieldOwnsArchiveList,
} from "./archiveListKey";
import {
  isNextUnreadChord,
  nextUnreadBlocked,
  nextUnreadChatId,
  nextUnreadShouldOpen,
  overlayTextFieldOwnsNextUnread,
} from "./nextUnreadChat";
import {
  isPreviousUnreadChord,
  overlayTextFieldOwnsPreviousUnread,
  previousUnreadBlocked,
  previousUnreadChatId,
  previousUnreadShouldOpen,
} from "./previousUnreadChat";
import {
  isRegenerateLastReplyChord,
  overlayTextFieldOwnsRegenerateLastReply,
  regenerateLastReplyAllowed,
  regenerateLastReplyBlocked,
  regenerateLastReplyShouldRun,
} from "./regenerateLastReply";
import {
  focusInsideRosterRow,
  focusSidebarBlocked,
  focusSidebarShouldMove,
  isFocusSidebarChord,
  overlayTextFieldOwnsFocusSidebar,
  rosterRowIdFromTarget,
  sidebarFocusTargetId,
  sidebarListArrowDirection,
} from "./focusSidebarList";
import {
  isMarkAllReadChord,
  markAllReadIsNoOp,
  markAllReadKeyBlocked,
  markAllReadShouldClear,
  overlayTextFieldOwnsMarkAllRead,
} from "./markAllReadKey";
import {
  loadInitialRuntimeUrl,
  normalizeRuntimeUrl,
} from "./runtimeUrl";
import {
  WAITING_DOT,
  WAITING_LABEL,
  hasAssistantToken,
  isEmptyAssistantReply,
  showWaitingLine,
} from "./waiting";
import { showStreamingCaret } from "./streamingCaret";
import { ComputerPane, ComputerSeamButton } from "./ComputerPane";
import {
  COMPUTER_OPEN_KEY,
  loadComputerOpen,
  storeComputerOpen,
} from "./workspaceTree";
import { AgentComputer } from "./AgentComputer";
import { ComputerTakeover } from "./ComputerTakeover";
import { composerInert } from "./computerSession";
import { WidgetCard } from "./WidgetCard";
import { ApproveCard } from "./ApproveCard";
import { ConnectCard } from "./ConnectCard";
import { HttpsText, MarkdownBody } from "./MarkdownBody";
import { LinkStatusPill } from "./linkStatusPill";
import { FindQueryProvider, FindText, useFindQuery } from "./FindText";
import {
  FIND_CLOSE_LABEL,
  FIND_INPUT_LABEL,
  FIND_NEXT_LABEL,
  FIND_PLACEHOLDER,
  FIND_PREV_LABEL,
  escapeClosesFind,
  findCountLabel,
  findHits,
  isFindChord,
  stepFindIndex,
  transcriptFindRows,
} from "./chatFind";
import {
  SWITCH_EMPTY_LABEL,
  SWITCH_INPUT_LABEL,
  SWITCH_PLACEHOLDER,
  clampSwitchIndex,
  escapeClosesSwitcher,
  filterChats,
  isSwitchChord,
  stepSwitchIndex,
} from "./chatSwitcher";
import {
  CHAT_SHORTCUTS,
  SHORTCUTS_TITLE,
  escapeClosesShortcuts,
  focusIsTextField,
  isShortcutsChord,
  isShortcutsQuestion,
} from "./chatShortcuts";
import { copyText } from "./markdown";
import { extractFootnotes, footnoteFindTexts } from "./markdownFootnote";
import { resolveReferenceLinks } from "./markdownReferenceLink";
import { shouldRenderMarkdown } from "./midStreamPlaintext";
import {
  assistantBubbleWide,
  splitAssistantBubbles,
} from "./assistantBubbles";
import { LongMessageBody } from "./LongMessageBody";
import { bubbleTimeLabel } from "./bubbleTime";
import { dayGroups, daySeparatorLabels } from "./daySeparator";
import {
  anchorOffsetForId,
  anchorScrollTop,
  captureReadingPlace,
  readingNearBottom,
  readingPlaceKey,
  readingRestore,
  readingRestoreDecision,
  readingTailGrew,
  stickForReadingRestore,
  topVisibleAnchor,
  type ReadingPlace,
  type TargetedScrollKind,
} from "./readingPlace";
import {
  COPY_CONTROL_LABEL,
  copiedFeedbackLabel,
  dropLastAssistantTurn,
  lastCompletedLeftMessageIndex,
  MESSAGE_COPY_FEEDBACK_MS,
  regeneratePostBody,
  showAssistantCopy,
  showAssistantRegenerate,
  showUserCopy,
  userCopyPending,
} from "./messageActions";
import {
  JUMP_CHIP_HIDDEN,
  JUMP_TO_LATEST_LABEL,
  NEAR_BOTTOM_PX,
  STICK_ARMED,
  assistantBubbleSignature,
  escapeJumpsToLatest,
  isNearBottom,
  jumpChipAppear,
  jumpChipDismiss,
  jumpChipFadeMs,
  jumpChipShown,
  onAssistantActivity,
  onJumpToLatest,
  onSendOrRegenerate,
  onUserScroll,
  shouldFollowStream,
  type JumpChipPaint,
  type StickState,
} from "./stickToBottom";
import {
  absorbServerUser,
  composerSendHint,
  insertOptimistic,
  isHttpSendFailure,
  optimisticUserMessage,
  reconcileOptimistic,
  shouldBlockSend,
} from "./optimisticSend";
import {
  FAILED_SEND_COULDNT,
  FAILED_SEND_REMOVE,
  FAILED_SEND_RETRY,
  dismissFailedSend,
  failedSendsForChat,
  isPreReplyStreamFailure,
  markFailedSend,
  orphanUserId,
  paintFailedSends,
  replyStarted,
  retryBlocked,
  type FailedSend,
} from "./failedSend";
import {
  STOP_LABEL,
  escapeStopsGenerating,
  isAbortError,
  keepPartialOnStop,
  shouldFocusComposerAfterAbort,
  shouldFocusComposerOnSettle,
  shouldOfferStop,
  shouldRefetchAfterStop,
} from "./stopGenerating";
import { sendMutedWhileGenerating } from "./sendMuted";
import {
  canQueueFollowUp,
  dequeueFollowUp,
  dropQueuedFollowUps,
  editQueuedFollowUp,
  enqueueFollowUp,
  enterQueuesFollowUp,
  queuedItems,
  queuedSendKey,
  removeQueuedFollowUp,
  requeueFollowUp,
  restoreAfterQueuedFailure,
  shouldFlushQueue,
  type QueuedItem,
  type QueuedSendMap,
} from "./queuedSend";
import {
  ChatDrafts,
  browserDraftStorage,
  type ChatDraftKey,
} from "./chatDrafts";
import {
  ChatUnread,
  MARK_ALL_READ_LABEL,
  anyChatUnread,
  browserUnreadStorage,
  isFinishedAssistantReply,
  replyMarksUnread,
  rowShowsUnreadDot,
  unreadActionLabel,
  windowIsFocused,
} from "./chatUnread";
import { applyUnreadChrome, unreadChrome } from "./unreadOutside";
import {
  ChatLastSeen,
  NEW_MESSAGES_LABEL,
  anchorsNewMessages,
  browserLastSeenStorage,
  clearNewMessages,
  freshNewMessagesPlace,
  lastSeenKey,
  placeNewMessages,
  type NewMessagesPlace,
} from "./newMessages";
import {
  TOOL_STACK_CHEVRON,
  collapsedToolsLabel,
  compactToolStacks,
  hidePersistedTool,
  liveToolPaint,
  showStackHeader,
  stackCollapsed,
  stackForMessageIndex,
  toggleAllToolTraceGroups,
  toggleExpanded,
} from "./compactToolTraces";
import { catalogInstallBody, isConnect, isPendingConnect, parsePluginArgs, pluginStatusLabel } from "./connect";
import { isApprove, isPendingApprove } from "./approve";
import { isPendingWidget, isWidget } from "./widget";
import { openOsBrowser } from "./openUrl";
import type {
  Agent,
  ChatMessage,
  ImageIn,
  Plugin,
  PluginCatalogEntry,
  Routine,
  Session,
  Skill,
  ThemePref,
} from "./types";
import {
  attachmentClientError,
  composerPasteFromClipboard,
  formatAttachmentSize,
  userRightAttachments,
  withPastedName,
  type PendingAttachment,
} from "./attachments";
import {
  IMAGE_LIGHTBOX_CLOSE,
  LIGHTBOX_HIDDEN,
  escapeClosesLightbox,
  isLightboxImage,
  lightboxAppear,
  lightboxDismiss,
  lightboxFadeMs,
  lightboxLabel,
  lightboxShown,
  type ImageLightboxTarget,
  type LightboxPaint,
} from "./imageLightbox";
import {
  applyFinishedPreview,
  previewOwnsMessages,
  rememberChatPreview,
  retainChatPreviews,
  snapshotChatPreview,
} from "./lastMessagePreview";
import { chatRowPreview } from "./chatDraftPreview";
import {
  TYPING_HINT,
  activeGeneratingChat,
  chatListLine,
  showGeneratingDots,
} from "./chatGenerating";
import {
  CHAT_LIST_TIME_TICK_MS,
  applyFinishedActivity,
  chatListTimeLabel,
  rememberChatActivity,
  retainChatActivity,
} from "./chatListTime";
import {
  FILTER_ALL,
  FILTER_ALL_LABEL,
  FILTER_GROUP_LABEL,
  FILTER_UNREAD,
  FILTER_UNREAD_LABEL,
  UNREAD_EMPTY_LABEL,
  browserFilterStorage,
  chatVisibleInFilter,
  nextChatListFilter,
  readChatListFilter,
  showUnreadEmpty,
  writeChatListFilter,
  type ChatListFilter,
} from "./chatListFilter";
import {
  PIN_LABEL,
  PINNED_GROUP_LABEL,
  UNPIN_LABEL,
  browserPinStorage,
  groupPinnedChats,
  isChatPinned,
  pinActionLabel,
  readChatPins,
  retainChatPins,
  toggleChatPin,
  writeChatPins,
} from "./chatPins";
import {
  MUTE_LABEL,
  MUTED_GLYPH_LABEL,
  UNMUTE_LABEL,
  audibleUnreadIds,
  browserMuteStorage,
  isChatMuted,
  muteActionLabel,
  paintsUnreadAccent,
  readChatMutes,
  replyMayMarkUnread,
  retainChatMutes,
  toggleChatMute,
  writeChatMutes,
} from "./chatMute";
import {
  CHATS_SECTION_LABEL,
  rosterSectionHeaders,
} from "./chatSections";
import {
  RENAME_FIELD_LABEL,
  RENAME_LABEL,
  browserNameStorage,
  chatDisplayName,
  CHAT_NAME_MAX,
  clearChatName,
  commitChatName,
  readChatNames,
  retainChatNames,
  writeChatNames,
  type ChatNameMap,
} from "./chatNames";
import {
  ARCHIVE_LABEL,
  UNARCHIVE_LABEL,
  archivedSectionLabel,
  archiveChat,
  browserArchiveStorage,
  isChatArchived,
  readChatArchives,
  retainChatArchives,
  selectionAfterArchive,
  unarchiveChat,
  writeChatArchives,
} from "./chatArchive";
import {
  DROP_FILES_LABEL,
  dragCarriesFiles,
  escapeClearsFileDrop,
} from "./chatDrop";
import {
  ERR_TRANSCRIBE,
  HINT_MIC_OFF,
  HINT_NO_SPEECH,
  audioFileName,
  composerDictationHint,
  dictationBusy,
  dictationCancelable,
  dictationLabel,
  dictationPressed,
  insertTranscript,
  pickRecorderMime,
  type DictationState,
} from "./dictation";
import { speakLabel, spokenText } from "./speak";

const URL_KEY = "snorlax.runtimeUrl";
const TOKEN_KEY = "snorlax.token";
const THEME_KEY = "snorlax.theme";
const ACCENT_KEY = "snorlax.accent";

// Placeholder hints Spark LAN for a remote phone. Loopback is valid and persisted.
const URL_PLACEHOLDER = "http://" + "<" + "spark-lan" + ">" + ":8787";
const MISSING_CREDS =
  "Paste the Runtime URL and token in Settings to start.";
const PLACEHOLDER_CHANNEL: Agent = {
  id: SEED_CHANNEL_ID,
  name: "Snorlax-Bot",
  title: "",
  description: "",
  avatar: null,
  kind: "channel",
  memberIds: [SEED_AGENT_ID],
  sharedProject: false,
  createdAt: "",
  updatedAt: "",
};
const PLACEHOLDER_SEED: Agent = {
  id: SEED_AGENT_ID,
  name: "Snorlax",
  title: "Assistant",
  description: "",
  avatar: null,
  kind: "agent",
  memberIds: [],
  sharedProject: false,
  createdAt: "",
  updatedAt: "",
};
const DEFAULT_ACCENT = "#6d8bff";
const ACCENT_SWATCHES = [
  "#6d8bff",
  "#8b7cff",
  "#3dd6c6",
  "#f5a524",
  "#ff6b6b",
  "#f2f2f3",
];

type ContextMenu = { x: number; y: number; agent: Agent };

function envUrl(): string {
  return (import.meta.env.SNORLAX_URL || import.meta.env.VITE_SNORLAX_URL || "").trim();
}

function envToken(): string {
  return (
    import.meta.env.SNORLAX_TOKEN ||
    import.meta.env.VITE_SNORLAX_TOKEN ||
    ""
  ).trim();
}

function PinGlyph() {
  return (
    <svg
      className="pin-glyph"
      viewBox="0 0 12 12"
      width="12"
      height="12"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M4.1 1.1h3.8l-.7 3.1 1.7 1.7H3.1l1.7-1.7-.7-3.1Zm1.3 5.1h1.2v4.6H5.4V6.2Z"
      />
    </svg>
  );
}

function ArchiveGlyph() {
  return (
    <svg
      className="archive-glyph"
      viewBox="0 0 12 12"
      width="12"
      height="12"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M1.2 1.6h9.6v2.1H1.2V1.6Zm1 3h7.6v5.6H2.2V4.6Zm2.1 1.3h3.4v1.2H4.3V5.9Z"
      />
    </svg>
  );
}

function RenameGlyph() {
  return (
    <svg
      className="rename-glyph"
      viewBox="0 0 12 12"
      width="12"
      height="12"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M8.4 1.2 10.8 3.6 4.4 10.1 1.2 10.8 1.9 7.6 8.4 1.2Zm0 1.7L3.1 8.2l-.3 1.1 1.1-.3 5.3-5.3-1-1Z"
      />
    </svg>
  );
}

function MuteGlyph() {
  return (
    <svg
      className="mute-glyph"
      viewBox="0 0 12 12"
      width="12"
      height="12"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M6 1.1a2.5 2.5 0 0 0-2.5 2.5v1.2c0 .5-.2.9-.5 1.3L2.2 7.1h7.6L9 6.1c-.3-.4-.5-.8-.5-1.3V3.6A2.5 2.5 0 0 0 6 1.1ZM5.1 8.8a.9.9 0 0 0 1.8 0H5.1Z"
      />
      <path
        d="M1.8 1.8 10.2 10.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function initialUrl(): string {
  return loadInitialRuntimeUrl(localStorage.getItem(URL_KEY) ?? "", envUrl());
}

function initialToken(): string {
  return (localStorage.getItem(TOKEN_KEY) ?? "").trim() || envToken();
}

function resolveTheme(pref: ThemePref): "light" | "dark" {
  if (pref !== "system") return pref;
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function applyChrome(pref: ThemePref, accent: string) {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(pref);
  root.style.setProperty("--accent", accent);
}

function rosterSubtitle(agent: Agent): string {
  return agent.kind === "channel" ? "Channel" : agent.title;
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) return `${err.code}: ${err.message}`;
  if (err instanceof TypeError) {
    return "Cannot reach the runtime. Check the Runtime URL in Settings.";
  }
  return err instanceof Error ? err.message : "Unknown error";
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

function AgentRoutineRow({
  routine,
  onToggle,
  onRemove,
}: {
  routine: Routine;
  onToggle: (routine: Routine, enabled: boolean) => void;
  onRemove: (routine: Routine) => void;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    };
  }, []);
  async function onCopy() {
    await copyText(webhookCopyText(routine));
    setCopied(true);
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setCopied(false);
      timer.current = null;
    }, WEBHOOK_COPY_FEEDBACK_MS);
  }
  return (
    <div
      className={routine.enabled ? "info-routine" : "info-routine paused"}
    >
      <div className="info-routine-copy">
        <p className="info-routine-name">{routine.name}</p>
        <p className="info-routine-meta">{routineMutedLine(routine)}</p>
      </div>
      {showsWebhookCopy(routine) ? (
        <button
          type="button"
          className="info-routine-hook-copy"
          aria-label={`Copy webhook URL for ${routine.name}`}
          onClick={() => void onCopy()}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      ) : null}
      <button
        type="button"
        className="info-routine-remove"
        aria-label={`Remove ${routine.name}`}
        onClick={() => onRemove(routine)}
      >
        Remove
      </button>
      <label className="info-routine-switch">
        <input
          type="checkbox"
          role="switch"
          checked={routine.enabled}
          aria-label={
            routine.enabled
              ? `Pause ${routine.name}`
              : `Enable ${routine.name}`
          }
          onChange={(e) => onToggle(routine, e.target.checked)}
        />
      </label>
    </div>
  );
}

function BubbleStamp({ label }: { label: string | null }) {
  if (!label) return null;
  return <span className="bubble-time">{label}</span>;
}

function quoteRootOf(node: Node | null): Element | null {
  const el = node instanceof Element ? node : node?.parentElement ?? null;
  return el?.closest(`[data-quote="${QUOTE_ROOT_VALUE}"]`) ?? null;
}

/** Selection inside one quotable message, or null. Empty selections are null. */
function readQuoteOffer(): {
  text: string;
  top: number;
  left: number;
  messageId: string;
} | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null;
  }
  const text = quoteableText(selection.toString());
  if (!text) return null;
  const anchor = quoteRootOf(selection.anchorNode);
  const focus = quoteRootOf(selection.focusNode);
  if (!anchor || anchor !== focus) return null;
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  const origin = quoteButtonOrigin(
    { top: rect.top, left: rect.left, bottom: rect.bottom },
    { width: window.innerWidth, height: window.innerHeight },
  );
  const messageId = anchor.getAttribute("data-quote-id") ?? "";
  return { text, top: origin.top, left: origin.left, messageId };
}

/**
 * v0.94: muted Quote control just above the selection. No animation.
 * mousedown does not collapse the selection before the click quotes it.
 */
function QuoteSelectionButton({
  disabled,
  onQuote,
}: {
  disabled?: boolean;
  onQuote: (selection: string) => void;
}) {
  const [offer, setOffer] = useState<{
    text: string;
    top: number;
    left: number;
    messageId: string;
  } | null>(null);
  useEffect(() => {
    const update = () => setOffer(readQuoteOffer());
    document.addEventListener("selectionchange", update);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      document.removeEventListener("selectionchange", update);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, []);
  if (disabled || !offer) return null;
  return (
    <button
      type="button"
      className="quote-selection"
      style={{ top: offer.top, left: offer.left }}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onQuote(offer.text)}
    >
      {QUOTE_LABEL}
    </button>
  );
}

function MessageActions({
  content,
  speaking,
  showRegenerate,
  disabled,
  shortcutCopied,
  onSpeak,
  onRegenerate,
}: {
  content: string;
  speaking: boolean;
  showRegenerate: boolean;
  disabled?: boolean;
  /** v1.00: the keyboard shortcut flashed Copied on this message. */
  shortcutCopied?: boolean;
  onSpeak: () => void;
  onRegenerate: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    };
  }, []);
  async function onCopy() {
    await copyText(content);
    setCopied(true);
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setCopied(false);
      timer.current = null;
    }, MESSAGE_COPY_FEEDBACK_MS);
  }
  const speakName = speakLabel(speaking);
  const copiedLabel = copiedFeedbackLabel(Boolean(copied || shortcutCopied));
  return (
    <div className="message-actions">
      <span className="message-copy">
        <button type="button" className="message-action" onClick={() => void onCopy()}>
          {COPY_CONTROL_LABEL}
        </button>
        {copiedLabel ? (
          <span className="message-copied" aria-live="polite">
            {copiedLabel}
          </span>
        ) : null}
      </span>
      <button
        type="button"
        className={`message-action${speaking ? " is-speaking" : ""}`}
        aria-label={speakName}
        aria-pressed={speaking}
        onClick={onSpeak}
      >
        {speakName}
      </button>
      {showRegenerate ? (
        <button
          type="button"
          className="message-action"
          disabled={disabled}
          onClick={onRegenerate}
        >
          Regenerate
        </button>
      ) : null}
    </div>
  );
}

function UserMessageCopy({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    };
  }, []);
  async function onCopy() {
    await copyText(content);
    setCopied(true);
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setCopied(false);
      timer.current = null;
    }, MESSAGE_COPY_FEEDBACK_MS);
  }
  const copiedLabel = copiedFeedbackLabel(copied);
  return (
    <div className={`message-actions user-copy${copied ? " is-copied" : ""}`}>
      <span className="message-copy">
        <button
          type="button"
          className="message-action"
          onClick={() => void onCopy()}
        >
          {COPY_CONTROL_LABEL}
        </button>
        {copiedLabel ? (
          <span className="message-copied" aria-live="polite">
            {copiedLabel}
          </span>
        ) : null}
      </span>
    </div>
  );
}

function AgentSkillRow({
  skill,
  onEdit,
  onRemove,
}: {
  skill: Skill;
  onEdit: (skill: Skill) => void;
  onRemove: (skill: Skill) => void;
}) {
  return (
    <div className="info-skill">
      <p className="info-skill-name">{skill.name}</p>
      <button
        type="button"
        className="info-skill-edit"
        aria-label={`Edit ${skill.name}`}
        onClick={() => onEdit(skill)}
      >
        Edit
      </button>
      <button
        type="button"
        className="info-skill-remove"
        aria-label={`Remove ${skill.name}`}
        onClick={() => onRemove(skill)}
      >
        Remove
      </button>
    </div>
  );
}

function AgentMemoryRow({
  fact,
  onRemove,
}: {
  fact: string;
  onRemove: (fact: string) => void;
}) {
  return (
    <div className="info-memory-row">
      <p className="info-memory-fact" title={fact}>
        {fact}
      </p>
      <button
        type="button"
        className="info-memory-remove"
        aria-label={`Remove ${fact}`}
        onClick={() => onRemove(fact)}
      >
        Remove
      </button>
    </div>
  );
}

function SettingsMemoryRow({
  fact,
  onRemove,
}: {
  fact: string;
  onRemove: (fact: string) => void;
}) {
  return (
    <div className="settings-memory-row">
      <p className="settings-memory-fact" title={fact}>
        {fact}
      </p>
      <button
        type="button"
        className="settings-memory-remove"
        aria-label={`Remove ${fact}`}
        onClick={() => onRemove(fact)}
      >
        Remove
      </button>
    </div>
  );
}

function NewMessagesDivider({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <p className="new-messages" role="separator">
      {NEW_MESSAGES_LABEL}
    </p>
  );
}

export function App() {
  const [urlInput, setUrlInput] = useState(initialUrl);
  const [tokenInput, setTokenInput] = useState(initialToken);
  const [session, setSession] = useState<Session | null>(() => {
    const baseUrl = initialUrl();
    const token = initialToken();
    return baseUrl && token ? { baseUrl, token } : null;
  });
  const [themePref, setThemePref] = useState<ThemePref>(
    () => (localStorage.getItem(THEME_KEY) as ThemePref) || "system",
  );
  const [transcriptTextPercent, setTranscriptTextPercent] = useState(() =>
    readTranscriptTextScale(browserTranscriptTextStorage()),
  );
  const [userJumpHighlightId, setUserJumpHighlightId] = useState<string | null>(null);
  const userJumpHighlightGen = useRef(0);
  const [quoteJumpHighlightId, setQuoteJumpHighlightId] = useState<string | null>(null);
  const quoteJumpHighlightGen = useRef(0);
  const [quoteJumpEpoch, setQuoteJumpEpoch] = useState(0);
  const [accent, setAccent] = useState(
    () => localStorage.getItem(ACCENT_KEY) || DEFAULT_ACCENT,
  );
  const [showToken, setShowToken] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileEditing, setProfileEditing] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Agent | null>(null);
  const pendingDeleteRef = useRef<Agent | null>(null);
  pendingDeleteRef.current = pendingDelete;
  /** Chord confirm uses the Alt+Up/Down next row. Sidebar confirm does not. */
  const deleteConfirmFromChord = useRef(false);
  const confirmDeleteRef = useRef<() => void>(() => {});
  const cancelDeleteRef = useRef<() => void>(() => {});
  /** Next Alt+Up/Down row for a chord confirm. Assigned after the roster lists exist. */
  const chordDeleteNextRef = useRef<(id: string) => string | null>(() => null);
  /** The confirm key is swallowed until keyup so a hold cannot confirm again. */
  const blockKeyUntilUp = useRef<string | null>(null);

  const [agents, setAgents] = useState<Agent[]>([PLACEHOLDER_CHANNEL, PLACEHOLDER_SEED]);
  const [activeId, setActiveId] = useState<string | null>(SEED_CHANNEL_ID);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [unreadIds, setUnreadIds] = useState<Set<string>>(() => new Set());
  const chatUnread = useRef(new ChatUnread(browserUnreadStorage()));
  const [replyUnreadIds, setReplyUnreadIds] = useState<Set<string>>(() =>
    audibleUnreadIds(
      chatUnread.current.snapshot(),
      readChatMutes(browserMuteStorage()),
    ),
  );
  // v0.88: All shows every chat. Unread keeps rows that paint the accent dot.
  const [chatListFilter, setChatListFilter] = useState<ChatListFilter>(() =>
    readChatListFilter(browserFilterStorage()),
  );
  function chooseChatListFilter(next: ChatListFilter) {
    setChatListFilter(next);
    writeChatListFilter(browserFilterStorage(), next);
  }
  // v0.89: pinned chats stay at the top, in the order they were pinned.
  const [pinnedChatIds, setPinnedChatIds] = useState<string[]>(() =>
    readChatPins(browserPinStorage()),
  );
  // v1.02: muted chats stay in the list. Replies do not mark them unread.
  const [mutedChatIds, setMutedChatIds] = useState<string[]>(() =>
    readChatMutes(browserMuteStorage()),
  );
  const mutedChatIdsRef = useRef(mutedChatIds);
  mutedChatIdsRef.current = mutedChatIds;
  function onTogglePin(id: string) {
    setContextMenu(null);
    setPinnedChatIds((current) => {
      const next = toggleChatPin(current, id);
      writeChatPins(browserPinStorage(), next);
      return next;
    });
  }
  // v0.90: manual unread uses the same persisted reply-unread set.
  // Mark as read also drops a channel handoff dot. Pins stay put.
  function onToggleRead(id: string) {
    setContextMenu(null);
    if (!id) return;
    if (rowShowsUnreadDot(id, replyUnreadIds, unreadIds)) {
      const cleared = chatUnread.current.clear(id);
      setUnreadIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (cleared) publishReplyUnread();
      return;
    }
    if (!replyMayMarkUnread(isChatMuted(mutedChatIdsRef.current, id))) return;
    if (!chatUnread.current.mark(id)) return;
    publishReplyUnread();
  }
  // v1.01: one control clears every unread dot. Archived chats in
  // the persisted set are cleared too and stay archived. Channel
  // handoff dots leave so the Unread filter can show its empty state.
  // Pins, names, and the All / Unread choice stay. No new storage key.
  function onMarkAllRead() {
    const cleared = chatUnread.current.clearAll();
    setUnreadIds((prev) => (prev.size === 0 ? prev : new Set<string>()));
    if (cleared) publishReplyUnread();
  }
  function retainPins(keep: ReadonlySet<string>) {
    setPinnedChatIds((current) => {
      const next = retainChatPins(current, keep);
      if (
        next.length === current.length &&
        next.every((id, index) => id === current[index])
      ) {
        return current;
      }
      writeChatPins(browserPinStorage(), next);
      return next;
    });
  }
  function retainMutes(keep: ReadonlySet<string>) {
    setMutedChatIds((current) => {
      const next = retainChatMutes(current, keep);
      if (
        next.length === current.length &&
        next.every((id, index) => id === current[index])
      ) {
        return current;
      }
      writeChatMutes(browserMuteStorage(), next);
      mutedChatIdsRef.current = next;
      return next;
    });
  }
  // v1.02: Mute clears the current dot. Later replies do not mark it.
  // Unmute does not invent a dot. Opening the chat still works.
  function onToggleMute(id: string) {
    setContextMenu(null);
    if (!id) return;
    const muting = !isChatMuted(mutedChatIdsRef.current, id);
    const next = toggleChatMute(mutedChatIdsRef.current, id);
    mutedChatIdsRef.current = next;
    writeChatMutes(browserMuteStorage(), next);
    setMutedChatIds(next);
    if (muting) {
      chatUnread.current.clear(id);
      setUnreadIds((prev) => {
        if (!prev.has(id)) return prev;
        const cleared = new Set(prev);
        cleared.delete(id);
        return cleared;
      });
    }
    publishReplyUnread();
  }
  // v0.96: archived chats leave the main list. The pin id stays.
  const [archivedChatIds, setArchivedChatIds] = useState<string[]>(() =>
    readChatArchives(browserArchiveStorage()),
  );
  const [archiveOpen, setArchiveOpen] = useState(false);
  useEffect(() => {
    if (!activeId || !isChatArchived(archivedChatIds, activeId)) return;
    setArchiveOpen((open) => (open ? open : true));
  }, [activeId, archivedChatIds]);
  function retainArchives(keep: ReadonlySet<string>) {
    setArchivedChatIds((current) => {
      const next = retainChatArchives(current, keep);
      if (
        next.length === current.length &&
        next.every((id, index) => id === current[index])
      ) {
        return current;
      }
      writeChatArchives(browserArchiveStorage(), next);
      return next;
    });
  }
  // v0.95: a local display name overlays the server name. Ids stay put.
  const [chatNames, setChatNames] = useState<ChatNameMap>(() =>
    readChatNames(browserNameStorage()),
  );
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const renamingIdRef = useRef<string | null>(null);
  const renameCancelRef = useRef<string | null>(null);
  const renameDraftRef = useRef("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  function retainNames(keep: ReadonlySet<string>) {
    setChatNames((current) => {
      const next = retainChatNames(current, keep);
      if (next === current) return current;
      writeChatNames(browserNameStorage(), next);
      return next;
    });
  }
  function beginRename(agent: Agent) {
    setContextMenu(null);
    renameCancelRef.current = null;
    const label = chatDisplayName(chatNames, agent.id, agent.name);
    renameDraftRef.current = label;
    renamingIdRef.current = agent.id;
    setRenameDraft(label);
    setRenamingId(agent.id);
  }
  function visibleName(agent: { id: string; name: string }) {
    return chatDisplayName(chatNames, agent.id, agent.name);
  }
  useEffect(() => {
    if (!renamingId) return;
    const el = renameInputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [renamingId]);
  // v0.77: title and dock / taskbar badge follow the unread-dot set.
  useEffect(() => {
    void applyUnreadChrome(unreadChrome(replyUnreadIds));
  }, [replyUnreadIds]);
  const windowFocusedRef = useRef(true);
  /** v0.76: last seen message id per chat. localStorage. */
  const chatLastSeen = useRef(new ChatLastSeen(browserLastSeenStorage()));
  const newMessagesPlace = useRef<NewMessagesPlace>(freshNewMessagesPlace());
  const watchingNewMessages = useRef(false);
  const dividerEpoch = useRef(0);
  const dividerReadyEpoch = useRef(0);
  const [dividerTick, setDividerTick] = useState(0);
  const [dividerAnchorId, setDividerAnchorId] = useState<string | null>(null);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [createChannelOpen, setCreateChannelOpen] = useState(false);
  const [channelNameDraft, setChannelNameDraft] = useState("New channel");
  const [channelMemberDraft, setChannelMemberDraft] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  /** v0.80: last preview line per chat, from transcripts already in memory. */
  const [chatPreviews, setChatPreviews] = useState<Record<string, string>>({});
  /** v0.83: latest-message createdAt per chat, already in memory. */
  const [chatActivity, setChatActivity] = useState<Record<string, string>>({});
  const [activityNow, setActivityNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => {
      setActivityNow(new Date());
    }, CHAT_LIST_TIME_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);
  /** False while a chat switch is waiting on its transcript, so the previous rows are not written onto the next chat. */
  const previewLive = useRef(false);
  useEffect(() => {
    if (!previewLive.current) return;
    if (!activeId || !snapshotChatPreview(threadId)) return;
    if (!previewOwnsMessages(activeId, messages)) return;
    setChatPreviews((prev) => rememberChatPreview(prev, activeId, messages));
    setChatActivity((prev) => rememberChatActivity(prev, activeId, messages));
  }, [activeId, threadId, messages]);
  useEffect(() => {
    const ids = new Set(agents.map((agent) => agent.id));
    setChatPreviews((prev) => retainChatPreviews(prev, ids));
    setChatActivity((prev) => retainChatActivity(prev, ids));
  }, [agents]);
  const [failedSends, setFailedSends] = useState<FailedSend<ChatMessage>[]>([]);
  const failedSendsRef = useRef(failedSends);
  failedSendsRef.current = failedSends;
  const hiddenOrphans = useRef(new Set<string>());
  /** v0.74: session reading place per chat. Not persisted. */
  const readingPlaces = useRef(new Map<string, ReadingPlace>());
  const pendingRestore = useRef<{
    key: string;
    gen: number;
    targeted: number;
  } | null>(null);
  /**
   * v1.30: bumped when find, a quote jump, a sent-message jump,
   * Home, End, Send, Regenerate, or Jump scrolls on purpose.
   * A reading-place restore scheduled earlier yields.
   */
  const targetedScroll = useRef(0);
  const targetedScrollKind = useRef<TargetedScrollKind>("message");
  const transcriptGenRef = useRef(0);
  const [transcriptGen, setTranscriptGen] = useState(0);
  const [toolTraces, setToolTraces] = useState<
    { id: string; summary: string; senderId?: string; senderName?: string }[]
  >([]);
  const [expandedToolStacks, setExpandedToolStacks] = useState<Set<string>>(
    () => new Set(),
  );
  const chatDrafts = useRef(new ChatDrafts(browserDraftStorage()));
  const quoteJumps = useRef(new QuoteJumps(browserQuoteJumpStorage()));
  const convoRef = useRef<{ agentId: string | null; threadId: string | null }>({
    agentId: SEED_CHANNEL_ID,
    threadId: null,
  });
  const [draft, setDraft] = useState(() =>
    chatDrafts.current.get(SEED_CHANNEL_ID, null),
  );
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const typeIntoComposerRef = useRef<(character: string) => void>(() => {});
  /** v0.68: composer text came from recalling the latest user message. */
  const [recallArmed, setRecallArmed] = useState(false);
  const [dictation, setDictation] = useState<DictationState>("idle");
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const speakAudio = useRef<HTMLAudioElement | null>(null);
  const speakObjectUrl = useRef<string | null>(null);
  const speakEpoch = useRef(0);
  const [pendingAttachments, setPendingAttachments] = useState<
    PendingAttachment[]
  >([]);
  const pendingAttachmentsRef = useRef(pendingAttachments);
  pendingAttachmentsRef.current = pendingAttachments;
  const [attachError, setAttachError] = useState<string | null>(null);
  const [attachInFlight, setAttachInFlight] = useState(0);
  const [dropTarget, setDropTarget] = useState(false);
  const dropTargetRef = useRef(false);
  const dropHoldRef = useRef(false);
  dropTargetRef.current = dropTarget;
  const [busy, setBusy] = useState(false);
  /** v1.28: per-chat follow-ups held while a reply is in flight. Session only. */
  const [queuedMap, setQueuedMap] = useState<QueuedSendMap>(() => new Map());
  const queuedRef = useRef(queuedMap);
  queuedRef.current = queuedMap;
  /** v0.93: chat whose client-started assistant reply is still in flight. */
  const [generatingChatId, setGeneratingChatId] = useState<string | null>(null);
  const inFlight = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [composerSkills, setComposerSkills] = useState<Skill[]>([]);
  const [skillOpen, setSkillOpen] = useState(false);
  const [skillQuery, setSkillQuery] = useState("");
  const [skillIndex, setSkillIndex] = useState(0);
  const pickedMentions = useRef(new Map<string, string>());
  const lastExtraChannelId = useRef<string | null>(null);
  const pendingCaret = useRef<number | null>(null);
  /** v1.26: the key handler sits later in the component than this function. */
  const quoteKeyRef = useRef<(selection: string) => void>(() => {});
  const highlightRef = useRef<HTMLDivElement>(null);

  const [profileName, setProfileName] = useState("");
  const [profileTitle, setProfileTitle] = useState("");
  const [profileDescription, setProfileDescription] = useState("");
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null);
  const [profileMemberIds, setProfileMemberIds] = useState<string[]>([]);
  const [profileSharedProject, setProfileSharedProject] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [routineSkills, setRoutineSkills] = useState<Skill[]>([]);
  const [routineAddOpen, setRoutineAddOpen] = useState(false);
  const [routineAddName, setRoutineAddName] = useState("");
  const [routineAddSkill, setRoutineAddSkill] = useState("");
  const [routineAddMode, setRoutineAddMode] = useState<
    "schedule" | "webhook" | "slack" | "github"
  >("schedule");
  const [routineAddCron, setRoutineAddCron] = useState("");
  const [routineAddChannel, setRoutineAddChannel] = useState("");
  const [routineAddRepo, setRoutineAddRepo] = useState("");
  const [routineAddSaving, setRoutineAddSaving] = useState(false);
  const [pendingRoutineRemove, setPendingRoutineRemove] =
    useState<Routine | null>(null);
  const [pendingSkillRemove, setPendingSkillRemove] = useState<Skill | null>(
    null,
  );
  const [memories, setMemories] = useState<string[]>([]);
  const [userMemories, setUserMemories] = useState<string[]>([]);
  const [pendingMemoryRemove, setPendingMemoryRemove] = useState<string | null>(
    null,
  );
  const [pendingUserMemoryRemove, setPendingUserMemoryRemove] = useState<
    string | null
  >(null);
  const [skillEditOpen, setSkillEditOpen] = useState(false);
  const [skillEditId, setSkillEditId] = useState("");
  const [skillEditName, setSkillEditName] = useState("");
  const [skillEditBody, setSkillEditBody] = useState("");
  const [skillEditSaving, setSkillEditSaving] = useState(false);
  const [skillAddOpen, setSkillAddOpen] = useState(false);
  const [skillAddName, setSkillAddName] = useState("");
  const [skillAddBody, setSkillAddBody] = useState("");
  const [skillAddSaving, setSkillAddSaving] = useState(false);
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [pluginCatalog, setPluginCatalog] = useState<PluginCatalogEntry[]>([]);
  const [pluginAddOpen, setPluginAddOpen] = useState(false);
  const [pluginAddName, setPluginAddName] = useState("");
  const [pluginAddMode, setPluginAddMode] = useState<"stdio" | "url">("stdio");
  const [pluginAddCommand, setPluginAddCommand] = useState("");
  const [pluginAddArgs, setPluginAddArgs] = useState("");
  const [pluginAddUrl, setPluginAddUrl] = useState("");
  const [pluginAddSaving, setPluginAddSaving] = useState(false);
  const [catalogAddingId, setCatalogAddingId] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<Plugin | null>(null);
  const [computerOpen, setComputerOpen] = useState(() =>
    loadComputerOpen(localStorage.getItem(COMPUTER_OPEN_KEY)),
  );
  const [workspaceTick, setWorkspaceTick] = useState(0);
  const [takeoverId, setTakeoverId] = useState<string | null>(null);
  const [takeoverSessionId, setTakeoverSessionId] = useState<string | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findIndex, setFindIndex] = useState(0);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [switchQuery, setSwitchQuery] = useState("");
  const [switchIndex, setSwitchIndex] = useState(0);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [shortcutCopiedId, setShortcutCopiedId] = useState<string | null>(null);
  const shortcutCopyTimer = useRef<number | null>(null);
  const [transcriptCopiedId, setTranscriptCopiedId] = useState<string | null>(null);
  const transcriptCopyTimer = useRef<number | null>(null);
  const copyLastReplyRef = useRef<() => void>(() => {});
  const copyTranscriptRef = useRef<() => void>(() => {});
  const toggleToolTracesRef = useRef<() => void>(() => {});
  const toggleChatListFilterRef = useRef<() => void>(() => {});
  const toggleArchiveListRef = useRef<() => void>(() => {});
  const regenerateLastReplyRef = useRef<() => void>(() => {});
  const markAllReadRef = useRef<() => void>(() => {});
  const createFromShortcutRef = useRef<() => void>(() => {});
  const archiveOpenChatRef = useRef<() => void>(() => {});
  const unarchiveOpenChatRef = useRef<() => void>(() => {});
  const openChatHistoryRef = useRef<(direction: "back" | "forward") => void>(() => {});
  const rosterIdsRef = useRef(new Set<string>());
  rosterIdsRef.current = new Set(agents.map((agent) => agent.id));
  const chatOpenHistoryRef = useRef(seedChatOpenHistory(SEED_CHANNEL_ID));
  const clearComposerDraftRef = useRef<() => void>(() => {});
  const pinOpenChatRef = useRef<() => void>(() => {});
  const muteOpenChatRef = useRef<() => void>(() => {});
  const markOpenChatRef = useRef<() => void>(() => {});
  const renameOpenChatRef = useRef<() => void>(() => {});
  const deleteOpenChatRef = useRef<() => void>(() => {});
  const deleteRosterBusy = useRef(false);
  useEffect(() => {
    return () => {
      if (shortcutCopyTimer.current != null) {
        window.clearTimeout(shortcutCopyTimer.current);
      }
      if (transcriptCopyTimer.current != null) {
        window.clearTimeout(transcriptCopyTimer.current);
      }
    };
  }, []);

  const scroller = useRef<HTMLDivElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const switchInputRef = useRef<HTMLInputElement>(null);
  const shortcutsRef = useRef<HTMLDivElement>(null);
  const shortcutsReturnFocus = useRef<HTMLElement | null>(null);
  const stickRef = useRef<StickState>(STICK_ARMED);
  const lastAssistantSig = useRef("");
  const [showJump, setShowJump] = useState(false);
  const [jumpPaint, setJumpPaint] = useState<JumpChipPaint>(JUMP_CHIP_HIDDEN);
  const [lightboxTarget, setLightboxTarget] = useState<ImageLightboxTarget | null>(
    null,
  );
  const [lightboxFrame, setLightboxFrame] = useState<ImageLightboxTarget | null>(
    null,
  );
  const [lightboxPaint, setLightboxPaint] = useState<LightboxPaint>(LIGHTBOX_HIDDEN);
  const lightboxTargetRef = useRef<ImageLightboxTarget | null>(null);
  const lightboxReturnRef = useRef<HTMLElement | null>(null);
  const lightboxCloseRef = useRef<HTMLButtonElement>(null);
  const lightboxWasOpen = useRef(false);
  lightboxTargetRef.current = lightboxTarget;
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const composerRootRef = useRef<HTMLElement>(null);
  const skillTypeaheadRef = useRef<HTMLUListElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const avatarFileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const credsReady = session !== null;
  const takeoverOpen = composerInert(Boolean(takeoverId));
  const pluginAddReady =
    pluginAddName.trim() !== "" &&
    (pluginAddMode === "stdio"
      ? pluginAddCommand.trim() !== ""
      : pluginAddUrl.trim() !== "");
  const slackListenerOn = pluginKindConnected(plugins, "slack");
  const githubListenerOn = pluginKindConnected(plugins, "github");
  const routineAddKind =
    (routineAddMode === "slack" && !slackListenerOn) ||
    (routineAddMode === "github" && !githubListenerOn)
      ? "schedule"
      : routineAddMode;
  const routineAddReady = canSubmitRoutine({
    name: routineAddName,
    skill: routineAddSkill,
    mode: routineAddKind,
    schedule: routineAddCron,
    channel: routineAddChannel,
    repo: routineAddRepo,
  });
  const skillEditReady = canSubmitSkill({
    name: skillEditName,
    body: skillEditBody,
  });
  const skillAddReady = canSubmitSkill({
    name: skillAddName,
    body: skillAddBody,
  });

  function commitSession(url = urlInput, token = tokenInput) {
    const baseUrl = normalizeRuntimeUrl(url);
    const tok = token.trim();
    localStorage.setItem(URL_KEY, baseUrl);
    localStorage.setItem(TOKEN_KEY, tok);
    const next = baseUrl && tok ? { baseUrl, token: tok } : null;
    setSession((prev) => {
      if (prev?.baseUrl === next?.baseUrl && prev?.token === next?.token) {
        return prev;
      }
      return next;
    });
  }

  function closeSettings() {
    commitSession();
    setSettingsOpen(false);
    setPluginAddOpen(false);
    setPendingRemove(null);
    setPendingUserMemoryRemove(null);
  }
  const active = useMemo(
    () => agents.find((a) => a.id === activeId) ?? null,
    [agents, activeId],
  );
  const activeLabel = active ? visibleName(active) : "";
  const profileOpenRef = useRef(profileOpen);
  profileOpenRef.current = profileOpen;
  const settingsOpenRef = useRef(settingsOpen);
  settingsOpenRef.current = settingsOpen;
  const activeRef = useRef(active);
  activeRef.current = active;
  const mentionCandidates = useMemo(() => {
    const people = agents
      .filter((a) => a.kind !== "channel")
      .map((a) => ({ id: a.id, name: a.name, avatar: a.avatar }));
    return filterCandidates(
      people,
      mentionQuery,
      active?.kind === "channel",
    );
  }, [agents, mentionQuery, active]);
  const skillAgentId = useMemo(
    () => composerSkillAgentId(active),
    [active],
  );
  const skillCandidates = useMemo(
    () => filterSkills(composerSkills, skillQuery),
    [composerSkills, skillQuery],
  );
  const skillMenuOpen =
    skillOpen &&
    skillPopupOpen(composerSkills, skillQuery, active) &&
    !mentionOpen;

  function syncMentionTrigger(value: string, caret: number) {
    const trigger = mentionTrigger(value, caret);
    if (!trigger) {
      setMentionOpen(false);
      return;
    }
    setSkillOpen(false);
    setMentionQuery(trigger.query);
    setMentionIndex(0);
    setMentionOpen(true);
  }

  function syncSkillTrigger(value: string, caret: number) {
    if (active?.kind === "channel") {
      setSkillOpen(false);
      return;
    }
    if (mentionTrigger(value, caret)) {
      setSkillOpen(false);
      return;
    }
    const trigger = skillTrigger(value, caret);
    if (!trigger) {
      setSkillOpen(false);
      return;
    }
    setSkillQuery(trigger.query);
    setSkillIndex(0);
    setSkillOpen(true);
  }

  function syncComposerTriggers(value: string, caret: number) {
    syncMentionTrigger(value, caret);
    syncSkillTrigger(value, caret);
  }

  function pickMention(candidate: { id: string; name: string }) {
    const el = composerRef.current;
    const caret = el?.selectionStart ?? draft.length;
    const next = insertMention(draft, caret, candidate.name);
    pickedMentions.current.set(candidate.name.toLowerCase(), candidate.id);
    pendingCaret.current = next.caret;
    setDraft(next.text);
    setMentionOpen(false);
  }

  function pickSkill(candidate: { id: string; name: string }) {
    const el = composerRef.current;
    const caret = el?.selectionStart ?? draft.length;
    const next = insertSkill(draft, caret, candidate.name);
    pendingCaret.current = next.caret;
    setDraft(next.text);
    setSkillOpen(false);
  }

  function canDelete(agent: Agent) {
    return canDeleteAgent(agent);
  }
  const fieldDisabled = !credsReady || takeoverOpen;
  const composerDisabled = fieldDisabled || busy;
  const attaching = attachInFlight > 0;
  const sendBlocked = shouldBlockSend({ busy, attaching });
  const queueNow = canQueueFollowUp({
    busy,
    text: draft,
    chipCount: pendingAttachments.length,
    attachError: Boolean(attachError),
    takeoverOpen,
    hasChat: Boolean(active),
  });
  const openQueued = active
    ? queuedItems(queuedMap, queuedSendKey(active.id, threadId))
    : [];

  useEffect(() => {
    applyChrome(themePref, accent);
    localStorage.setItem(THEME_KEY, themePref);
    localStorage.setItem(ACCENT_KEY, accent);
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyChrome(themePref, accent);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [themePref, accent]);

  useEffect(() => {
    localStorage.setItem(URL_KEY, normalizeRuntimeUrl(urlInput));
    localStorage.setItem(TOKEN_KEY, tokenInput.trim());
  }, [urlInput, tokenInput]);

  useEffect(() => {
    localStorage.setItem(COMPUTER_OPEN_KEY, storeComputerOpen(computerOpen));
  }, [computerOpen]);

  useEffect(() => {
    writeTranscriptTextScale(browserTranscriptTextStorage(), transcriptTextPercent);
  }, [transcriptTextPercent]);

  useLayoutEffect(() => {
    const node = composerRef.current;
    const caret = pendingCaret.current;
    if (caret != null && node) {
      pendingCaret.current = null;
      node.focus();
      node.setSelectionRange(caret, caret);
    }
    // v0.84: fit after type, paste, recall, dictation, and draft restore.
    resizeComposer(draft.length === 0);
  }, [draft]);

  useEffect(() => {
    const el = composerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      const next = el.clientWidth;
      if (next === width) return;
      width = next;
      resizeComposer(draftRef.current.length === 0);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (!dictationCancelable(dictation)) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      cancelDictation();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dictation]);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (
        !escapeClosesLightbox({
          open: lightboxTargetRef.current != null,
          composing: isComposerComposing(event),
        })
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setLightboxTarget(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (!escapeClearsFileDrop(dropTargetRef.current)) return;
      dropHoldRef.current = true;
      setDropTarget(false);
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    const onDragEnd = () => {
      dropHoldRef.current = false;
      setDropTarget(false);
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("dragend", onDragEnd);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("dragend", onDragEnd);
    };
  }, []);

  const applyStick = useCallback((next: StickState) => {
    stickRef.current = next;
    setShowJump(next.showJump);
  }, []);

  const snapStick = useCallback(() => {
    targetedScroll.current += 1;
    targetedScrollKind.current = "bottom";
    applyStick(onSendOrRegenerate());
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [applyStick]);

  const captureOpenReadingPlace = useCallback(() => {
    if (pendingRestore.current) return;
    const here = convoRef.current;
    if (!here.agentId) return;
    const el = scroller.current;
    const near = readingNearBottom(
      el
        ? {
            scrollTop: el.scrollTop,
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight,
          }
        : null,
    );
    const viewportTop = el ? el.getBoundingClientRect().top : 0;
    const rows = el
      ? [...el.querySelectorAll<HTMLElement>("[data-reading-id]")].map(
          (node) => {
            const box = node.getBoundingClientRect();
            return {
              id: node.dataset.readingId ?? "",
              top: box.top,
              bottom: box.bottom,
            };
          },
        )
      : [];
    const tail = messagesRef.current.at(-1)?.id ?? null;
    const anchorId = near ? null : topVisibleAnchor(rows, viewportTop);
    readingPlaces.current.set(
      readingPlaceKey(here.agentId, here.threadId),
      captureReadingPlace({
        nearBottom: near,
        anchorId,
        anchorOffset: anchorOffsetForId(rows, anchorId, viewportTop),
        tailId: tail,
      }),
    );
  }, []);

  const onTranscriptScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    applyStick(
      onUserScroll(
        stickRef.current,
        isNearBottom(
          {
            scrollTop: el.scrollTop,
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight,
          },
          NEAR_BOTTOM_PX,
        ),
      ),
    );
    captureOpenReadingPlace();
  }, [applyStick, captureOpenReadingPlace]);

  const focusComposer = useCallback(() => {
    requestAnimationFrame(() => composerRef.current?.focus());
  }, []);

  const placeCaretAtEnd = useCallback(() => {
    requestAnimationFrame(() => {
      const node = composerRef.current;
      if (!node) return;
      const end = node.value.length;
      node.setSelectionRange(end, end);
      resizeComposer(node.value.length === 0);
    });
  }, []);

  /** Save the open draft and show the draft for the conversation being opened. */
  const moveComposer = useCallback(
    (nextId: string | null, nextThread: string | null) => {
      captureOpenReadingPlace();
      const from = convoRef.current;
      const text = draftRef.current;
      const fromKey =
        from.agentId === null
          ? null
          : { agentId: from.agentId, threadId: from.threadId };
      let nextText = "";
      if (nextId) {
        nextText = chatDrafts.current.swap(fromKey, text, {
          agentId: nextId,
          threadId: nextThread,
        });
      } else if (fromKey) {
        chatDrafts.current.set(fromKey.agentId, fromKey.threadId, text);
      }
      convoRef.current = { agentId: nextId, threadId: nextThread };
      draftRef.current = nextText;
      setDraft(nextText);
      setRecallArmed(false);
      setMentionOpen(false);
      setSkillOpen(false);
      placeCaretAtEnd();
    },
    [captureOpenReadingPlace, placeCaretAtEnd],
  );

  // v0.69: the open chat's unsent text is part of the persisted map.
  useEffect(() => {
    const here = convoRef.current;
    if (!here.agentId) return;
    chatDrafts.current.set(here.agentId, here.threadId, draft);
    if (draft.length === 0) {
      quoteJumps.current.clearPending(here.agentId, here.threadId);
    }
  }, [draft]);

  function publishReplyUnread() {
    setReplyUnreadIds(
      audibleUnreadIds(chatUnread.current.snapshot(), mutedChatIdsRef.current),
    );
  }

  /** v0.70: a finished assistant reply the user is not looking at. */
  function noteReplyUnread(chatId: string) {
    if (!replyMayMarkUnread(isChatMuted(mutedChatIdsRef.current, chatId))) {
      return;
    }
    if (
      !replyMarksUnread({
        chatId,
        openChatId: convoRef.current.agentId,
        focused: windowFocusedRef.current,
      })
    ) {
      return;
    }
    if (!chatUnread.current.mark(chatId)) return;
    publishReplyUnread();
  }

  function clearReplyUnread(chatId: string | null) {
    if (!chatId) return;
    if (!chatUnread.current.clear(chatId)) return;
    publishReplyUnread();
  }

  useEffect(() => {
    const syncFocus = () => {
      const focused = windowIsFocused(document);
      const was = windowFocusedRef.current;
      windowFocusedRef.current = focused;
      if (!focused) {
        watchingNewMessages.current = false;
        return;
      }
      clearReplyUnread(convoRef.current.agentId);
      if (!was) {
        watchingNewMessages.current = false;
        setDividerTick((n) => n + 1);
      }
    };
    syncFocus();
    window.addEventListener("focus", syncFocus);
    window.addEventListener("blur", syncFocus);
    document.addEventListener("visibilitychange", syncFocus);
    return () => {
      window.removeEventListener("focus", syncFocus);
      window.removeEventListener("blur", syncFocus);
      document.removeEventListener("visibilitychange", syncFocus);
    };
  }, []);

  const beginNewMessagesLoad = useCallback(
    (id: string | null, thread: string | null) => {
      const epoch = dividerEpoch.current + 1;
      dividerEpoch.current = epoch;
      watchingNewMessages.current = false;
      newMessagesPlace.current = {
        key: id ? lastSeenKey(id, thread) : null,
        placed: false,
        anchorId: null,
      };
      setDividerAnchorId(null);
      return epoch;
    },
    [],
  );

  const finishNewMessagesLoad = useCallback((epoch: number) => {
    if (dividerEpoch.current !== epoch) return;
    dividerReadyEpoch.current = epoch;
    setDividerTick(epoch);
  }, []);

  useLayoutEffect(() => {
    const id = convoRef.current.agentId;
    if (!id) {
      setDividerAnchorId((prev) => (prev === null ? prev : null));
      return;
    }
    if (dividerReadyEpoch.current !== dividerEpoch.current) return;
    if (!windowFocusedRef.current) {
      watchingNewMessages.current = false;
      return;
    }
    const thread = convoRef.current.threadId;
    if (!watchingNewMessages.current) {
      const here = activeRef.current;
      const rows = messagesRef.current.map((message) => ({
        id: message.id,
        anchor: anchorsNewMessages({
          role: message.role,
          senderId: message.senderId,
          kind: message.kind,
          content: message.content,
          attachments: message.attachments,
          visible: here ? isTranscriptVisible(message, here) : true,
        }),
      }));
      const next = placeNewMessages({
        place: newMessagesPlace.current,
        key: lastSeenKey(id, thread),
        rows,
        lastSeenId: chatLastSeen.current.get(id, thread),
        returning: true,
      });
      newMessagesPlace.current = next;
      setDividerAnchorId((prev) =>
        prev === next.anchorId ? prev : next.anchorId,
      );
      watchingNewMessages.current = true;
    }
    const tail = messagesRef.current.at(-1)?.id;
    if (tail) chatLastSeen.current.see(id, thread, tail);
  }, [messages, dividerTick, activeId, threadId]);

  const onJumpLatest = useCallback(() => {
    targetedScroll.current += 1;
    targetedScrollKind.current = "bottom";
    applyStick(onJumpToLatest());
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
    if (shouldFocusComposerAfterAbort()) {
      focusComposer();
    }
  }, [applyStick, focusComposer]);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (showJump) {
      setJumpPaint(jumpChipAppear(reduce));
      if (reduce) return;
      const frame = requestAnimationFrame(() => {
        setJumpPaint(jumpChipShown());
      });
      return () => cancelAnimationFrame(frame);
    }
    setJumpPaint(jumpChipDismiss(reduce));
    const ms = jumpChipFadeMs(reduce);
    if (ms === 0) return;
    const timer = window.setTimeout(() => {
      setJumpPaint(JUMP_CHIP_HIDDEN);
    }, ms);
    return () => window.clearTimeout(timer);
  }, [showJump]);

  const restoreLightboxFocus = useCallback(() => {
    const back = lightboxReturnRef.current;
    lightboxReturnRef.current = null;
    if (back?.isConnected) {
      back.focus({ preventScroll: true });
      return;
    }
    focusComposer();
  }, [focusComposer]);

  const openImageLightbox = useCallback(
    (target: ImageLightboxTarget, trigger: HTMLElement) => {
      lightboxReturnRef.current = trigger;
      setLightboxTarget(target);
    },
    [],
  );

  const closeImageLightbox = useCallback(() => {
    setLightboxTarget(null);
  }, []);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (lightboxTarget) {
      lightboxWasOpen.current = true;
      setLightboxFrame(lightboxTarget);
      setLightboxPaint(lightboxAppear(reduce));
      if (reduce) return;
      const frame = requestAnimationFrame(() => {
        setLightboxPaint(lightboxShown());
      });
      return () => cancelAnimationFrame(frame);
    }
    if (!lightboxWasOpen.current) return;
    setLightboxPaint(lightboxDismiss(reduce));
    const ms = lightboxFadeMs(reduce);
    if (ms === 0) {
      lightboxWasOpen.current = false;
      setLightboxFrame(null);
      setLightboxPaint(LIGHTBOX_HIDDEN);
      restoreLightboxFocus();
      return;
    }
    const timer = window.setTimeout(() => {
      lightboxWasOpen.current = false;
      setLightboxFrame(null);
      setLightboxPaint(LIGHTBOX_HIDDEN);
      restoreLightboxFocus();
    }, ms);
    return () => window.clearTimeout(timer);
  }, [lightboxTarget, restoreLightboxFocus]);

  useEffect(() => {
    if (!lightboxPaint.shown || !lightboxTarget) return;
    lightboxCloseRef.current?.focus({ preventScroll: true });
  }, [lightboxPaint.shown, lightboxTarget]);

  useEffect(() => {
    setLightboxTarget(null);
  }, [activeId, threadId]);

  useLayoutEffect(() => {
    const key = activeId ? readingPlaceKey(activeId, threadId) : null;
    const pending = pendingRestore.current;
    if (pending && pending.key === key) return;
    applyStick(onSendOrRegenerate());
    lastAssistantSig.current = "";
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activeId, threadId, applyStick]);

  useLayoutEffect(() => {
    const here = convoRef.current;
    const key = here.agentId
      ? readingPlaceKey(here.agentId, here.threadId)
      : null;
    const pending = pendingRestore.current;
    const visible = active
      ? messages.filter((message) => isTranscriptVisible(message, active))
      : messages;
    if (pending && key && pending.key === key) {
      if (pending.gen !== transcriptGen) return;
      const decision = readingRestoreDecision(
        pending.targeted,
        targetedScroll.current,
        targetedScrollKind.current,
      );
      if (decision !== "place") {
        pendingRestore.current = null;
        const el = scroller.current;
        if (decision === "bottom" && el) {
          el.scrollTop = el.scrollHeight;
          applyStick(onJumpToLatest());
        } else         if (decision === "top" && el) {
          el.scrollTop = 0;
          applyStick(
            onUserScroll(
              stickRef.current,
              isNearBottom({
                scrollTop: 0,
                scrollHeight: el.scrollHeight,
                clientHeight: el.clientHeight,
              }),
            ),
          );
        }
        lastAssistantSig.current = assistantBubbleSignature(visible);
        return;
      }
      pendingRestore.current = null;
      const el = scroller.current;
      const ids = el
        ? [...el.querySelectorAll<HTMLElement>("[data-reading-id]")]
            .map((node) => node.dataset.readingId ?? "")
            .filter((id) => id.length > 0)
        : [];
      const saved = readingPlaces.current.get(key) ?? null;
      const mode = readingRestore(saved, ids);
      const tail = messagesRef.current.at(-1)?.id ?? null;
      const grew = mode === "anchor" && readingTailGrew(saved, tail);
      applyStick(stickForReadingRestore(mode, grew));
      if (el) {
        const anchorId = mode === "anchor" ? saved?.anchorId : null;
        const node = anchorId
          ? el.querySelector<HTMLElement>(
              `[data-reading-id="${CSS.escape(anchorId)}"]`,
            )
          : null;
        if (node) {
          const box = node.getBoundingClientRect();
          el.scrollTop = anchorScrollTop(
            box.top,
            el.getBoundingClientRect().top,
            el.scrollTop,
            saved?.anchorOffset ?? 0,
            box.height,
          );
        } else {
          el.scrollTop = el.scrollHeight;
        }
      }
      lastAssistantSig.current = assistantBubbleSignature(visible);
      return;
    }
    const el = scroller.current;
    if (el && shouldFollowStream(stickRef.current)) {
      el.scrollTop = el.scrollHeight;
    }
    const next = assistantBubbleSignature(visible);
    const updated = onAssistantActivity(
      stickRef.current,
      lastAssistantSig.current,
      next,
    );
    lastAssistantSig.current = next;
    applyStick(updated);
  }, [messages, busy, toolTraces, active, applyStick, transcriptGen]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const target = event.target;
      if (
        target instanceof Element &&
        (target.closest(".menu") || target.closest(".create-wrap"))
      ) {
        return;
      }
      setContextMenu(null);
      setCreateMenuOpen(false);
      if (
        !(
          target instanceof Element &&
          (target.closest(".typeahead") ||
            target.closest(".composer-field"))
        )
      ) {
        setSkillOpen(false);
      }
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setContextMenu(null);
      setPendingDelete(null);
      setProfileOpen(false);
      setProfileEditing(false);
      setCreateMenuOpen(false);
      setCreateChannelOpen(false);
      if (settingsOpen) closeSettings();
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [settingsOpen, urlInput, tokenInput]);

  const loadRoster = useCallback(
    async (next: Session) => {
      setLoadError(null);
      try {
        const roster = await listAgents(next);
        setAgents(roster);
        const rosterIds = new Set(roster.map((row) => row.id));
        retainPins(rosterIds);
        retainMutes(rosterIds);
        retainArchives(rosterIds);
        retainNames(rosterIds);
        const preferred = fallbackRosterSelection(roster);
        chatOpenHistoryRef.current = seedChatOpenHistory(preferred);
        moveComposer(preferred, null);
        previewLive.current = false;
        setActiveId(preferred);
        setThreadId(null);
        const epoch = beginNewMessagesLoad(preferred, null);
        if (preferred) {
          const listed = await listMessages(next, preferred);
          previewLive.current = true;
          setMessages(commitTranscript(listed, preferred, null));
          focusComposer();
          placeCaretAtEnd();
        } else {
          setMessages([]);
        }
        finishNewMessagesLoad(epoch);
      } catch (err) {
        setAgents([]);
        chatOpenHistoryRef.current = seedChatOpenHistory(null);
        moveComposer(null, null);
        previewLive.current = false;
        setActiveId(null);
        setThreadId(null);
        const epoch = beginNewMessagesLoad(null, null);
        setMessages([]);
        finishNewMessagesLoad(epoch);
        setLoadError(describeError(err));
      }
    },
    [
      beginNewMessagesLoad,
      finishNewMessagesLoad,
      focusComposer,
      moveComposer,
      placeCaretAtEnd,
    ],
  );

  useEffect(() => {
    if (!session) {
      watchingNewMessages.current = false;
      newMessagesPlace.current = freshNewMessagesPlace();
      setDividerAnchorId(null);
      setAgents([PLACEHOLDER_CHANNEL, PLACEHOLDER_SEED]);
      chatOpenHistoryRef.current = seedChatOpenHistory(SEED_CHANNEL_ID);
      moveComposer(SEED_CHANNEL_ID, null);
      setActiveId(SEED_CHANNEL_ID);
      setThreadId(null);
      failedSendsRef.current = [];
      setFailedSends([]);
      hiddenOrphans.current = new Set();
      setMessages([]);
      setLoadError(null);
      return;
    }
    void loadRoster(session);
  }, [session, loadRoster, moveComposer]);

  useEffect(() => {
    if (!session || !skillAgentId) {
      setComposerSkills([]);
      setSkillOpen(false);
      return;
    }
    let cancelled = false;
    void listSkills(session, skillAgentId)
      .then((rows) => {
        if (!cancelled) setComposerSkills(rows);
      })
      .catch(() => {
        if (!cancelled) setComposerSkills([]);
      });
    return () => {
      cancelled = true;
    };
  }, [session, skillAgentId]);

  useEffect(() => {
    if (!session) {
      setPlugins([]);
      setPluginCatalog([]);
      return;
    }
    let cancelled = false;
    void Promise.all([listPlugins(session), listPluginCatalog(session)])
      .then(([rows, catalog]) => {
        if (!cancelled) {
          setPlugins(rows);
          setPluginCatalog(catalog);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPlugins([]);
          setPluginCatalog([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session, settingsOpen]);

  useEffect(() => {
    if (!session) {
      setUserMemories([]);
      return;
    }
    if (!settingsOpen) return;
    let cancelled = false;
    void getUserMemory(session)
      .then((facts) => {
        if (!cancelled) setUserMemories(facts);
      })
      .catch(() => {
        if (!cancelled) setUserMemories([]);
      });
    return () => {
      cancelled = true;
    };
  }, [session, settingsOpen]);

  function focusSidebarRow(id: string) {
    if (!id) return;
    const row = document.querySelector(
      `[data-roster-id="${CSS.escape(id)}"] .row-hit`,
    );
    if (!(row instanceof HTMLElement)) return;
    row.focus();
    row.scrollIntoView({ block: "nearest" });
  }

  async function loadConversation(
    id: string,
    thread: string | null,
    focusAfter: "composer" | "sidebar" = "composer",
    historyMode: "record" | "restore" = "record",
  ) {
    if (historyMode === "record") {
      chatOpenHistoryRef.current = recordChatOpen(chatOpenHistoryRef.current, id);
    }
    moveComposer(id, thread);
    previewLive.current = false;
    const epoch = beginNewMessagesLoad(id, thread);
    const gen = transcriptGenRef.current + 1;
    transcriptGenRef.current = gen;
    pendingRestore.current = {
      key: readingPlaceKey(id, thread),
      gen,
      targeted: targetedScroll.current,
    };
    setFindOpen(false);
    setFindQuery("");
    setFindIndex(0);
    clearReplyUnread(id);
    setActiveId(id);
    setThreadId(thread);
    setExpandedToolStacks(new Set());
    setComposerError(null);
    setAttachError(null);
    setPendingAttachments((prev) => {
      for (const row of prev) {
        if (row.previewUrl) URL.revokeObjectURL(row.previewUrl);
      }
      return [];
    });
    setProfileOpen(false);
    setProfileEditing(false);
    const agent = agents.find((a) => a.id === id);
    if (agent?.kind === "channel") {
      if (agent.id !== SEED_CHANNEL_ID) {
        lastExtraChannelId.current = agent.id;
      }
      setUnreadIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
    let rows: ChatMessage[] = [];
    if (!session) {
      if (transcriptGenRef.current !== gen) return;
      previewLive.current = snapshotChatPreview(thread);
      setMessages(commitTranscript(rows, id, thread));
      setTranscriptGen(gen);
      finishNewMessagesLoad(epoch);
      return;
    }
    try {
      rows = await listMessages(
        session,
        id,
        thread ? { threadId: thread } : undefined,
      );
    } catch (err) {
      rows = [];
      setComposerError(describeError(err));
    }
    if (transcriptGenRef.current !== gen) return;
    previewLive.current = snapshotChatPreview(thread);
    setMessages(commitTranscript(rows, id, thread));
    setTranscriptGen(gen);
    finishNewMessagesLoad(epoch);
    if (focusAfter === "sidebar") {
      // The row re-renders with the new selection. Focus after that paint
      // so the keyboard stays in the list.
      requestAnimationFrame(() => focusSidebarRow(id));
      return;
    }
    focusComposer();
    placeCaretAtEnd();
  }

  async function selectAgent(id: string) {
    await loadConversation(id, null);
  }

  async function openJump(channelId: string, nextThread: string) {
    if (!agents.some((row) => row.id === channelId && row.kind === "channel")) {
      return;
    }
    setUnreadIds((prev) => {
      if (!prev.has(channelId)) return prev;
      const next = new Set(prev);
      next.delete(channelId);
      return next;
    });
    await loadConversation(channelId, nextThread);
  }

  async function onCreate() {
    if (!session) return;
    try {
      const agent = await createAgent(session, "New agent");
      setAgents((prev) => [...prev, agent]);
      chatOpenHistoryRef.current = recordChatOpen(chatOpenHistoryRef.current, agent.id);
      moveComposer(agent.id, null);
      setActiveId(agent.id);
      setThreadId(null);
      setMessages([]);
      setComposerError(null);
      setProfileOpen(false);
      setProfileEditing(false);
      focusComposer();
      placeCaretAtEnd();
    } catch (err) {
      setLoadError(describeError(err));
    }
  }

  async function onCreateChannel() {
    if (!session) return;
    const name = channelNameDraft.trim();
    if (!name || channelMemberDraft.length === 0) return;
    try {
      const channel = await createChannel(session, name, channelMemberDraft);
      setAgents((prev) => {
        const without = prev.filter((a) => a.id !== channel.id);
        const channels = without.filter((a) => a.kind === "channel");
        const people = without.filter((a) => a.kind !== "channel");
        return [...channels, channel, ...people].filter(
          (row, index, all) => all.findIndex((a) => a.id === row.id) === index,
        );
      });
      setCreateChannelOpen(false);
      setCreateMenuOpen(false);
      setChannelNameDraft("New channel");
      setChannelMemberDraft([]);
      chatOpenHistoryRef.current = recordChatOpen(chatOpenHistoryRef.current, channel.id);
      moveComposer(channel.id, null);
      setActiveId(channel.id);
      setThreadId(null);
      setMessages([]);
      setComposerError(null);
      setProfileOpen(false);
      setProfileEditing(false);
      focusComposer();
      placeCaretAtEnd();
    } catch (err) {
      setLoadError(describeError(err));
    }
  }

  function openInfo() {
    if (!active) return;
    beginInfo(active);
  }

  async function loadRoutines(agent: Agent) {
    if (!session || agent.kind === "channel") {
      setRoutines([]);
      return;
    }
    try {
      setRoutines(await listRoutines(session, agent.id));
    } catch {
      setRoutines([]);
    }
  }

  function beginInfo(agent: Agent) {
    setProfileName(agent.name);
    setProfileTitle(agent.title);
    setProfileDescription(agent.description);
    setProfileAvatar(agent.avatar);
    setProfileMemberIds([...agent.memberIds]);
    setProfileSharedProject(Boolean(agent.sharedProject));
    setProfileEditing(false);
    setProfileOpen(true);
    void loadRoutines(agent);
    if (agent.kind === "channel") {
      setRoutineSkills([]);
      setMemories([]);
    } else {
      void loadSkills(agent.id);
      void loadMemory(agent.id);
    }
  }

  async function toggleRoutine(routine: Routine, enabled: boolean) {
    if (!session || !active) return;
    try {
      const updated = await patchRoutine(session, active.id, routine.id, {
        enabled,
      });
      setRoutines((prev) =>
        prev.map((row) => (row.id === updated.id ? updated : row)),
      );
    } catch (err) {
      setComposerError(describeError(err));
    }
  }

  async function loadSkills(agentId: string) {
    if (!session) {
      setRoutineSkills([]);
      return;
    }
    try {
      setRoutineSkills(await listSkills(session, agentId));
    } catch {
      setRoutineSkills([]);
    }
  }

  async function loadMemory(agentId: string) {
    if (!session) {
      setMemories([]);
      return;
    }
    try {
      setMemories(await getMemory(session, agentId));
    } catch {
      setMemories([]);
    }
  }

  function refreshOpenMemory(text: string) {
    const agent = activeRef.current;
    if (!profileOpenRef.current || !agent || agent.kind === "channel") return;
    if (!isMemoryToolLine(text)) return;
    void loadMemory(agent.id);
  }

  async function loadUserMemory() {
    if (!session) {
      setUserMemories([]);
      return;
    }
    try {
      setUserMemories(await getUserMemory(session));
    } catch {
      setUserMemories([]);
    }
  }

  /** Open Settings only. Any Remembered / Forgot — GET /v1/memory is
   * user-only, so an agent-scope write is a no-op list. Do not
   * special-case user scope. */
  function refreshOpenUserMemory(text: string) {
    if (!settingsOpenRef.current) return;
    if (!isMemoryToolLine(text)) return;
    void loadUserMemory();
  }

  function openRoutineAdd() {
    if (!active || active.kind === "channel") return;
    setRoutineAddName("");
    setRoutineAddSkill("");
    setRoutineAddMode("schedule");
    setRoutineAddCron("");
    setRoutineAddChannel("");
    setRoutineAddRepo("");
    setRoutineAddOpen(true);
    void loadSkills(active.id);
  }

  async function saveRoutineAdd() {
    if (!session || !active || routineAddSaving || !routineAddReady) return;
    setRoutineAddSaving(true);
    try {
      const created = await createRoutine(
        session,
        active.id,
        routineAddKind === "webhook"
          ? {
              name: routineAddName.trim(),
              skill: routineAddSkill,
              trigger: { type: "webhook" },
            }
          : routineAddKind === "slack"
            ? {
                name: routineAddName.trim(),
                skill: routineAddSkill,
                trigger: {
                  type: "slack",
                  channel: routineAddChannel.trim(),
                },
              }
            : routineAddKind === "github"
              ? {
                  name: routineAddName.trim(),
                  skill: routineAddSkill,
                  trigger: { type: "github", repo: routineAddRepo.trim() },
                }
              : {
                  name: routineAddName.trim(),
                  skill: routineAddSkill,
                  schedule: routineAddCron.trim(),
                },
      );
      setRoutines((prev) => [...prev, created]);
      setRoutineAddOpen(false);
    } catch (err) {
      setComposerError(describeError(err));
    } finally {
      setRoutineAddSaving(false);
    }
  }

  async function confirmRoutineRemove() {
    if (!session || !active || !pendingRoutineRemove) return;
    const id = pendingRoutineRemove.id;
    setPendingRoutineRemove(null);
    try {
      await deleteRoutine(session, active.id, id);
      setRoutines((prev) => prev.filter((row) => row.id !== id));
    } catch (err) {
      setComposerError(describeError(err));
    }
  }

  function openSkillAdd() {
    if (!active || active.kind === "channel") return;
    setSkillAddName("");
    setSkillAddBody("");
    setSkillAddOpen(true);
  }

  async function saveSkillAdd() {
    if (!session || !active || skillAddSaving || !skillAddReady) return;
    setSkillAddSaving(true);
    try {
      const created = await createSkill(session, active.id, {
        name: skillAddName.trim(),
        body: skillAddBody.trim(),
      });
      setRoutineSkills((prev) => {
        const next = prev.filter((row) => row.id !== created.id);
        return [...next, created];
      });
      if (skillAgentId === active.id) {
        setComposerSkills((prev) => {
          const next = prev.filter((row) => row.id !== created.id);
          return [...next, created];
        });
      }
      setSkillAddOpen(false);
    } catch (err) {
      setComposerError(describeError(err));
    } finally {
      setSkillAddSaving(false);
    }
  }

  async function openSkillEdit(skill: Skill) {
    if (!session || !active || active.kind === "channel") return;
    try {
      const row = await getSkill(session, active.id, skill.id);
      setSkillEditId(row.id);
      setSkillEditName(row.name);
      setSkillEditBody(row.body);
      setSkillEditOpen(true);
    } catch (err) {
      setComposerError(describeError(err));
    }
  }

  async function saveSkillEdit() {
    if (
      !session ||
      !active ||
      !skillEditId ||
      skillEditSaving ||
      !skillEditReady
    ) {
      return;
    }
    setSkillEditSaving(true);
    try {
      const updated = await patchSkill(session, active.id, skillEditId, {
        name: skillEditName.trim(),
        body: skillEditBody.trim(),
      });
      setRoutineSkills((prev) => {
        const next = prev.map((row) =>
          row.id === skillEditId
            ? { id: updated.id, name: updated.name }
            : row,
        );
        if (!next.some((row) => row.id === updated.id)) {
          return [...next.filter((row) => row.id !== skillEditId), {
            id: updated.id,
            name: updated.name,
          }];
        }
        return next;
      });
      setSkillEditOpen(false);
    } catch (err) {
      setComposerError(describeError(err));
    } finally {
      setSkillEditSaving(false);
    }
  }

  async function confirmSkillRemove() {
    if (!session || !active || !pendingSkillRemove) return;
    const id = pendingSkillRemove.id;
    setPendingSkillRemove(null);
    try {
      await deleteSkill(session, active.id, id);
      setRoutineSkills((prev) => prev.filter((row) => row.id !== id));
    } catch (err) {
      setComposerError(describeError(err));
    }
  }

  async function confirmMemoryRemove() {
    if (!session || !active || !pendingMemoryRemove) return;
    const fact = pendingMemoryRemove;
    setPendingMemoryRemove(null);
    try {
      await deleteMemory(session, active.id, fact);
      setMemories((prev) => prev.filter((row) => row !== fact));
    } catch (err) {
      setComposerError(describeError(err));
    }
  }

  async function confirmUserMemoryRemove() {
    if (!session || !pendingUserMemoryRemove) return;
    const fact = pendingUserMemoryRemove;
    setPendingUserMemoryRemove(null);
    try {
      await deleteUserMemory(session, fact);
      setUserMemories((prev) => prev.filter((row) => row !== fact));
    } catch (err) {
      setComposerError(describeError(err));
    }
  }

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "i"
      ) {
        event.preventDefault();
        if (!active) return;
        beginInfo(active);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, session]);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (!isFindChord(event)) return;
      if (!active || takeoverOpen || settingsOpen || profileOpen) return;
      event.preventDefault();
      setFindOpen(true);
      requestAnimationFrame(() => {
        findInputRef.current?.focus();
        findInputRef.current?.select();
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, takeoverOpen, settingsOpen, profileOpen]);

  const switcherBlocked =
    takeoverOpen ||
    settingsOpen ||
    profileOpen ||
    createChannelOpen ||
    skillEditOpen ||
    skillAddOpen ||
    pluginAddOpen ||
    routineAddOpen ||
    pendingDelete != null ||
    dictationCancelable(dictation);

  const shortcutsBlocked = switcherBlocked;

  const closeShortcuts = useCallback(() => {
    setShortcutsOpen(false);
    const back = shortcutsReturnFocus.current;
    shortcutsReturnFocus.current = null;
    if (back?.isConnected) back.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (!isSwitchChord(event)) return;
      if (isComposerComposing(event)) return;
      if (switcherBlocked) return;
      event.preventDefault();
      if (!switchOpen) {
        setSwitchQuery("");
        const idx = agents.findIndex((agent) => agent.id === activeId);
        setSwitchIndex(idx >= 0 ? idx : 0);
        setSwitchOpen(true);
      } else {
        switchInputRef.current?.focus();
        switchInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [switcherBlocked, switchOpen, agents, activeId]);

  useEffect(() => {
    const onShortcutsChord = (event: globalThis.KeyboardEvent) => {
      if (isComposerComposing(event)) return;
      const chord = isShortcutsChord(event);
      const question = isShortcutsQuestion(event, event.target);
      if (!chord && !question) return;
      if (shortcutsBlocked) return;
      event.preventDefault();
      if (shortcutsOpen) {
        closeShortcuts();
        return;
      }
      const activeEl = document.activeElement;
      shortcutsReturnFocus.current =
        activeEl instanceof HTMLElement ? activeEl : null;
      setShortcutsOpen(true);
    };
    window.addEventListener("keydown", onShortcutsChord);
    return () => window.removeEventListener("keydown", onShortcutsChord);
  }, [shortcutsBlocked, shortcutsOpen, closeShortcuts]);

  useEffect(() => {
    if (!shortcutsOpen) return;
    const frame = requestAnimationFrame(() => {
      shortcutsRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [shortcutsOpen]);

  useEffect(() => {
    setFindOpen(false);
    setFindQuery("");
    setFindIndex(0);
  }, [activeId, threadId]);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!session || !active) return;
    setProfileSaving(true);
    try {
      const updated =
        infoPaneKind(active) === "channel"
          ? await patchAgent(session, active.id, {
              name: profileName.trim() || active.name,
              memberIds: profileMemberIds,
              sharedProject: profileSharedProject,
            })
          : await patchAgent(session, active.id, {
              name: profileName.trim() || active.name,
              title: profileTitle,
              description: profileDescription,
              avatar: profileAvatar,
            });
      setAgents((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      if (updated.name !== active.name) {
        setChatNames((current) => {
          const next = clearChatName(current, updated.id);
          if (next === current) return current;
          writeChatNames(browserNameStorage(), next);
          return next;
        });
      }
      setProfileName(updated.name);
      setProfileTitle(updated.title);
      setProfileDescription(updated.description);
      setProfileAvatar(updated.avatar);
      setProfileMemberIds([...updated.memberIds]);
      setProfileSharedProject(Boolean(updated.sharedProject));
      setProfileEditing(false);
    } catch (err) {
      setComposerError(describeError(err));
    } finally {
      setProfileSaving(false);
    }
  }

  async function setSharedProject(on: boolean) {
    if (!session || !active || !canToggleSharedProject(active)) return;
    setProfileSharedProject(on);
    try {
      const updated = await patchAgent(session, active.id, {
        sharedProject: on,
      });
      setAgents((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      setProfileSharedProject(Boolean(updated.sharedProject));
    } catch (err) {
      setProfileSharedProject(Boolean(active.sharedProject));
      setComposerError(describeError(err));
    }
  }

  function cancelDelete() {
    deleteConfirmFromChord.current = false;
    setPendingDelete(null);
    focusComposer();
  }

  async function confirmDelete() {
    if (!session || !pendingDelete) return;
    const doomed = pendingDelete;
    const fromChord = deleteConfirmFromChord.current;
    deleteConfirmFromChord.current = false;
    setPendingDelete(null);
    if (fromChord) {
      const nextOpen = chordDeleteNextRef.current(doomed.id);
      await deleteRosterChat(doomed, nextOpen);
    } else {
      await deleteRosterChat(doomed);
    }
  }

  confirmDeleteRef.current = () => {
    void confirmDelete();
  };
  cancelDeleteRef.current = () => {
    cancelDelete();
  };

  useEffect(() => {
    const onDeleteConfirmKey = (event: globalThis.KeyboardEvent) => {
      const held = blockKeyUntilUp.current;
      if (held && event.key === held) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }
      if (!pendingDeleteRef.current) return;
      const action = deleteConfirmAction({
        key: event.key,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        repeat: event.repeat,
        isComposing: event.isComposing,
      });
      if (action == null) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (action === "swallow") return;
      if (action === "confirm") {
        blockKeyUntilUp.current = event.key;
        confirmDeleteRef.current();
        return;
      }
      if (action === "cancel") {
        blockKeyUntilUp.current = event.key;
        cancelDeleteRef.current();
      }
    };
    const onDeleteConfirmKeyUp = (event: globalThis.KeyboardEvent) => {
      if (blockKeyUntilUp.current === event.key) {
        blockKeyUntilUp.current = null;
      }
    };
    window.addEventListener("keydown", onDeleteConfirmKey, true);
    window.addEventListener("keyup", onDeleteConfirmKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onDeleteConfirmKey, true);
      window.removeEventListener("keyup", onDeleteConfirmKeyUp, true);
    };
  }, []);

  // Sidebar confirm omits explicitNext and keeps the roster fallback.
  // The keyboard chord passes the next Alt+Up/Down row, or null for
  // the empty state, and still uses this same DELETE plus cleanup.
  // A removal already in flight does not start another.
  async function deleteRosterChat(
    doomed: Agent,
    explicitNext?: string | null,
  ) {
    if (!session || deleteRosterBusy.current) return;
    deleteRosterBusy.current = true;
    try {
      await deleteAgent(session, doomed.id);
      const roster = agents
        .filter((a) => a.id !== doomed.id)
        .map((a) =>
          a.kind === "channel"
            ? {
                ...a,
                memberIds: a.memberIds.filter((id) => id !== doomed.id),
              }
            : a,
        );
      setAgents(roster);
      if (lastExtraChannelId.current === doomed.id) {
        lastExtraChannelId.current = null;
      }
      setUnreadIds((prev) => {
        const keep = new Set(roster.map((row) => row.id));
        return new Set([...prev].filter((id) => keep.has(id)));
      });
      const rosterIds = new Set(roster.map((row) => row.id));
      chatUnread.current.retain(rosterIds);
      chatLastSeen.current.retain(rosterIds);
      retainPins(rosterIds);
      retainMutes(rosterIds);
      retainArchives(rosterIds);
      retainNames(rosterIds);
      if (activeId === doomed.id) {
        const next =
          explicitNext !== undefined
            ? explicitNext && roster.some((row) => row.id === explicitNext)
              ? explicitNext
              : null
            : nextRosterSelection(roster, doomed.id, activeId);
        if (next) {
          chatUnread.current.clear(next);
          chatOpenHistoryRef.current = recordChatOpen(chatOpenHistoryRef.current, next);
        } else {
          chatOpenHistoryRef.current = noteChatOpenClosed(chatOpenHistoryRef.current);
        }
        moveComposer(next, null);
        previewLive.current = false;
        setActiveId(next);
        setThreadId(null);
        setProfileOpen(false);
        setProfileEditing(false);
        publishReplyUnread();
        const epoch = beginNewMessagesLoad(next, null);
        try {
          const keptFailed = failedSendsRef.current.filter(
            (row) => row.agentId !== doomed.id,
          );
          failedSendsRef.current = keptFailed;
          setFailedSends(keptFailed);
          const listed = next ? await listMessages(session, next) : [];
          previewLive.current = Boolean(next);
          setMessages(next ? commitTranscript(listed, next, null) : []);
        } finally {
          finishNewMessagesLoad(epoch);
        }
      } else {
        publishReplyUnread();
      }
    } catch (err) {
      setLoadError(describeError(err));
    } finally {
      deleteRosterBusy.current = false;
    }
  }

  function commitTranscript(
    listed: ChatMessage[],
    agentId: string | null,
    thread: string | null,
  ): ChatMessage[] {
    if (!agentId) return listed;
    return paintFailedSends(
      listed,
      failedSendsForChat(failedSendsRef.current, agentId, thread),
      hiddenOrphans.current,
    );
  }

  function rememberFailedSend(
    message: ChatMessage,
    origin: { agentId: string; threadId: string | null },
    content: string,
    attachmentIds: string[],
    mentionIds: string[],
    orphanServerId: string | null,
  ) {
    if (orphanServerId) hiddenOrphans.current.add(orphanServerId);
    const next = markFailedSend(failedSendsRef.current, {
      id: message.id,
      agentId: origin.agentId,
      threadId: origin.threadId,
      content,
      attachmentIds,
      mentionIds,
      message,
      orphanServerId,
    });
    failedSendsRef.current = next;
    setFailedSends(next);
    const here = convoRef.current;
    if (
      here.agentId === origin.agentId &&
      here.threadId === origin.threadId &&
      !messagesRef.current.some((row) => row.id === message.id)
    ) {
      setMessages((prev) =>
        prev.some((row) => row.id === message.id) ? prev : [...prev, message],
      );
    }
  }

  function releasePendingPreviews(rows: PendingAttachment[] | undefined) {
    if (!rows) return;
    for (const row of rows) {
      if (row.previewUrl) URL.revokeObjectURL(row.previewUrl);
    }
  }

  async function lookupOrphanUser(
    agentId: string,
    thread: string | null,
    beforeIds: ReadonlySet<string>,
    content: string,
  ): Promise<string | null> {
    if (!session) return null;
    try {
      const listed = await listMessages(
        session,
        agentId,
        thread ? { threadId: thread } : undefined,
      );
      return orphanUserId(beforeIds, listed, content, (row) =>
        isUserSender(row.senderId, row.role),
      );
    } catch {
      return null;
    }
  }

  async function submitTurn(opts: {
    content: string;
    images?: ImageIn[];
    localImages?: ChatMessage["images"];
    attachments?: ChatMessage["attachments"];
    mentionIds?: string[];
    optimisticUser?: boolean;
    reuseOptimisticId?: string;
    restoreAttachments?: PendingAttachment[];
    draftOrigin?: ChatDraftKey;
    /** v1.28: this turn is a queued follow-up, not a fresh composer send. */
    fromQueue?: boolean;
    fromQueueQuotes?: { text: string; sourceId: string }[];
    streamAgentId?: string;
    streamThreadId?: string | null;
    streamKind?: string;
    extra?: {
      widgetReply?: { id: string; values?: string[]; dismissed?: boolean };
      connectReply?: { id?: string; dismissed?: boolean };
      approveReply?: { id: string; approved?: boolean; dismissed?: boolean };
      attachmentIds?: string[];
      regenerate?: boolean;
    };
    holdBusy?: boolean;
  }) {
    if (!session || !active) {
      if (opts.holdBusy) {
        inFlight.current = false;
        setBusy(false);
      }
      return;
    }
    if (!opts.holdBusy) {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
    }
    const content = opts.content;
    const streamChatId = opts.streamAgentId ?? active.id;
    const streamKind = opts.streamKind ?? active.kind;
    const streamThread =
      opts.streamThreadId !== undefined
        ? opts.streamThreadId
        : active.kind === "channel"
          ? threadId
          : null;
    setGeneratingChatId(
      activeGeneratingChat({ busy: true, chatId: streamChatId }),
    );
    const images = opts.images ?? [];
    const localImages = opts.localImages ?? [];
    const mentionIds = opts.mentionIds ?? [];
    const extra = opts.extra;
    let openedPluginId: string | null = null;
    let userMsg: ChatMessage | null = null;
    let sawReply = false;
    let streamError: string | null = null;
    const beforeIds = new Set(messagesRef.current.map((row) => row.id));
    const originAgent = opts.draftOrigin?.agentId ?? streamChatId;
    const originThread = opts.draftOrigin
      ? opts.draftOrigin.threadId
      : streamThread;
    let queueFailed = false;
    const showsStream = () =>
      convoRef.current.agentId === originAgent &&
      (convoRef.current.threadId ?? null) === (originThread ?? null);
    const setStreamMessages = (
      update: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]),
    ) => {
      if (!showsStream()) return;
      setMessages(update);
    };
    const attachmentIds =
      extra?.attachmentIds ??
      (opts.attachments ?? []).map((row) => row.id);
    const ac = new AbortController();
    abortRef.current = ac;
    if (opts.optimisticUser) {
      userMsg = optimisticUserMessage({
        id: opts.reuseOptimisticId,
        agentId: streamChatId,
        content,
        images: localImages,
        attachments: opts.attachments ?? [],
      });
      setStreamMessages((prev) => {
        if (prev.some((row) => row.id === userMsg!.id)) {
          return prev.map((row) => (row.id === userMsg!.id ? userMsg! : row));
        }
        return insertOptimistic(prev, userMsg!);
      });
    }
    if (showsStream()) setToolTraces([]);
    const handlers: StreamHandlers = {
      onDelta(messageId, delta, sender) {
        if (replyStarted({ delta })) sawReply = true;
        if (streamKind === "channel" && !streamThread) return;
        setStreamMessages((prev) => {
          const existing = prev.find((m) => m.id === messageId);
          if (!existing) {
            if (!delta) return prev;
            return [
              ...prev,
              {
                id: messageId,
                agentId: streamChatId,
                role: "assistant",
                content: delta,
                images: [],
                attachments: [],
                createdAt: new Date().toISOString(),
                senderId: sender?.senderId || active.id,
                senderName: sender?.senderName || active.name,
                senderAvatar: sender?.senderAvatar ?? active.avatar,
                hop: 0,
                mentions: [],
              },
            ];
          }
          return prev.map((m) =>
            m.id === messageId ? { ...m, content: m.content + delta } : m,
          );
        });
      },
      onDone(message) {
        if (
          message &&
          replyStarted({
            isUser: isUserSender(message.senderId, message.role),
            isTool: isToolLine(message),
            isCard:
              message.kind === "widget" ||
              message.kind === "connect" ||
              message.kind === "approve",
            content: message.content,
          })
        ) {
          sawReply = true;
        }
        if (message && isFinishedAssistantReply(message)) {
          noteReplyUnread(streamChatId);
        }
        if (
          message &&
          streamKind === "channel" &&
          !streamThread &&
          message.replyTo
        ) {
          return;
        }
        if (message && snapshotChatPreview(originThread)) {
          setChatPreviews((prev) =>
            applyFinishedPreview(prev, streamChatId, message),
          );
          setChatActivity((prev) =>
            applyFinishedActivity(prev, streamChatId, message.createdAt),
          );
        }
        if (message) {
          if (isEmptyAssistantReply(message)) {
            setStreamMessages((prev) => prev.filter((m) => m.id !== message.id));
            return;
          }
          if (isToolLine(message)) {
            if (showsStream()) {
              setToolTraces((prev) =>
                prev.filter((trace) => trace.id !== message.id),
              );
            }
            refreshOpenMemory(message.content);
            refreshOpenUserMemory(message.content);
          }
          setStreamMessages((prev) => {
            if (isUserSender(message.senderId, message.role)) {
              return absorbServerUser(prev, message);
            }
            const without = prev.filter((m) => m.id !== message.id);
            return [...without, message];
          });
          setWorkspaceTick((n) => n + 1);
        }
      },
      onError(code, message) {
        if (userMsg && !sawReply) {
          streamError = message || code;
          return;
        }
        if (showsStream()) setComposerError(`${code}: ${message}`);
      },
      onTool(trace) {
        if (replyStarted({ isTool: true })) sawReply = true;
        if (streamKind === "channel" && !streamThread) return;
        if (!showsStream()) {
          if (typeof trace.ok === "boolean") {
            setWorkspaceTick((n) => n + 1);
            if (rosterRefreshTool(trace.name) && session) {
              void listAgents(session).then(setAgents).catch(() => {});
            }
          }
          return;
        }
        setToolTraces((prev) => {
          const without = prev.filter((item) => item.id !== trace.id);
          return [...without, { id: trace.id, summary: trace.summary, senderId: trace.senderId, senderName: trace.senderName }];
        });
        if (typeof trace.ok === "boolean") {
          setWorkspaceTick((n) => n + 1);
          if (rosterRefreshTool(trace.name) && session) {
            void listAgents(session).then(setAgents).catch(() => {});
          }
          refreshOpenMemory(trace.summary);
          refreshOpenUserMemory(trace.summary);
        }
      },
      onConnectUrl(url, pluginId) {
        openedPluginId = pluginId;
        void openOsBrowser(url);
      },
    };
    const dropQueuedBubble = (orphan: string | null) => {
      queueFailed = true;
      if (orphan) hiddenOrphans.current.add(orphan);
      if (userMsg) {
        setStreamMessages((prev) => prev.filter((row) => row.id !== userMsg!.id));
      }
      releasePendingPreviews(opts.restoreAttachments);
    };
    try {
      await sendMessage(
        session,
        streamChatId,
        content,
        images,
        handlers,
        mentionIds,
        streamKind === "channel" && streamThread ? streamThread : undefined,
        streamKind === "channel" ? undefined : lastExtraChannelId.current,
        extra,
        ac.signal,
      );
      if (
        userMsg &&
        isPreReplyStreamFailure({ sawReply, error: streamError })
      ) {
        const orphan = await lookupOrphanUser(
          originAgent,
          originThread,
          beforeIds,
          content,
        );
        if (opts.fromQueue) {
          dropQueuedBubble(orphan);
          return;
        }
        rememberFailedSend(
          userMsg,
          { agentId: originAgent, threadId: originThread },
          content,
          attachmentIds,
          mentionIds,
          orphan,
        );
        releasePendingPreviews(opts.restoreAttachments);
        return;
      }
      if (openedPluginId) {
        await waitUntilPluginConnected(session, openedPluginId);
        await refreshPlugins();
      }
      const listed = await listMessages(
        session,
        streamChatId,
        streamKind === "channel" && streamThread
          ? { threadId: streamThread }
          : undefined,
      );
      const viewThread = streamKind === "channel" ? streamThread : null;
      if (showsStream()) {
        setStreamMessages(
          commitTranscript(
            userMsg ? reconcileOptimistic([], userMsg.id, listed) : listed,
            streamChatId,
            viewThread,
          ),
        );
        setToolTraces([]);
      }
      if (streamKind !== "channel") {
        const channelId = listed
          .map((message) => visibleJump(message, agents)?.channelId)
          .find((id): id is string => Boolean(id));
        if (
          channelId &&
          replyMayMarkUnread(isChatMuted(mutedChatIdsRef.current, channelId))
        ) {
          setUnreadIds((prev) => new Set(prev).add(channelId));
        }
      }
      if (showsStream()) pickedMentions.current.clear();
      releasePendingPreviews(opts.restoreAttachments);
    } catch (err) {
      if (isAbortError(err) || ac.signal.aborted) {
        if (!shouldRefetchAfterStop()) {
          setStreamMessages((prev) => keepPartialOnStop(prev));
        }
        return;
      }
      if (userMsg) {
        const status = err instanceof ApiError ? err.status : 0;
        if (status === 0 || isHttpSendFailure(status)) {
          let orphan: string | null = null;
          if (status === 0 || status >= 500) {
            orphan = await lookupOrphanUser(
              originAgent,
              originThread,
              beforeIds,
              content,
            );
          }
          if (opts.fromQueue) {
            dropQueuedBubble(orphan);
            return;
          }
          rememberFailedSend(
            userMsg,
            { agentId: originAgent, threadId: originThread },
            content,
            attachmentIds,
            mentionIds,
            orphan,
          );
          releasePendingPreviews(opts.restoreAttachments);
        } else if (opts.fromQueue) {
          dropQueuedBubble(null);
          if (showsStream()) setComposerError(describeError(err));
        } else {
          setComposerError(describeError(err));
        }
      } else if (opts.fromQueue) {
        dropQueuedBubble(null);
        if (
          showsStream() &&
          err instanceof ApiError &&
          (err.status === 422 || err.status === 409)
        ) {
          setComposerError(err.message);
        } else if (showsStream()) {
          setComposerError(describeError(err));
        }
      } else if (
        err instanceof ApiError &&
        (err.status === 422 || err.status === 409)
      ) {
        setComposerError(err.message);
      } else {
        setComposerError(describeError(err));
      }
      if (extra?.regenerate && session && showsStream()) {
        try {
          const listed = await listMessages(
            session,
            streamChatId,
            streamKind === "channel" && streamThread
              ? { threadId: streamThread }
              : undefined,
          );
          const viewThread = streamKind === "channel" ? streamThread : null;
          setStreamMessages(commitTranscript(listed, streamChatId, viewThread));
        } catch {
          /* keep local transcript */
        }
      }
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      inFlight.current = false;
      setBusy(false);
      setGeneratingChatId(
        activeGeneratingChat({ busy: false, chatId: streamChatId }),
      );
      if (shouldFocusComposerOnSettle() && showsStream()) {
        focusComposer();
      }
      const flushKey = queuedSendKey(originAgent, originThread);
      if (opts.fromQueue && queueFailed) {
        const dropped = dropQueuedFollowUps(queuedRef.current, flushKey);
        queuedRef.current = dropped.map;
        setQueuedMap(dropped.map);
        const open = showsStream();
        const composerText = open
          ? draftRef.current
          : chatDrafts.current.get(originAgent, originThread);
        const restored = restoreAfterQueuedFailure({
          failedText: content,
          remaining: dropped.remaining,
          composerText,
        });
        chatDrafts.current.set(originAgent, originThread, restored);
        quoteJumps.current.restorePending(originAgent, originThread, [
          ...(opts.fromQueueQuotes ?? []),
          ...dropped.remaining.flatMap((row) => row.quotes),
        ]);
        if (open) {
          draftRef.current = restored;
          setDraft(restored);
          setRecallArmed(false);
          setQuoteJumpEpoch((epoch) => epoch + 1);
        }
      } else if (
        shouldFlushQueue({
          fromQueue: Boolean(opts.fromQueue),
          failed: queueFailed,
        })
      ) {
        const next = dequeueFollowUp(queuedRef.current, flushKey);
        queuedRef.current = next.map;
        setQueuedMap(next.map);
        if (next.item) {
          const item = next.item;
          const kind = streamKind;
          queueMicrotask(() => {
            void sendQueuedFollowUp(item, originAgent, originThread, kind);
          });
        }
      }
    }
  }

  function dismissFailed(id: string) {
    const row = failedSendsRef.current.find((item) => item.id === id);
    if (row?.orphanServerId) hiddenOrphans.current.add(row.orphanServerId);
    const next = dismissFailedSend(failedSendsRef.current, id);
    failedSendsRef.current = next;
    setFailedSends(next);
    setMessages((prev) => prev.filter((item) => item.id !== id));
  }

  async function retryFailedSend(id: string) {
    if (!session || !active || inFlight.current || retryBlocked(busy) || sendBlocked) {
      return;
    }
    const row = failedSendsRef.current.find((item) => item.id === id);
    if (!row) return;
    if (row.agentId !== active.id || row.threadId !== threadId) return;
    if (row.orphanServerId) hiddenOrphans.current.add(row.orphanServerId);
    const next = dismissFailedSend(failedSendsRef.current, id);
    failedSendsRef.current = next;
    setFailedSends(next);
    inFlight.current = true;
    setBusy(true);
    newMessagesPlace.current = clearNewMessages(newMessagesPlace.current);
    watchingNewMessages.current = true;
    setDividerAnchorId(null);
    snapStick();
    focusComposer();
    await submitTurn({
      content: row.content,
      attachments: row.message.attachments,
      mentionIds: row.mentionIds,
      optimisticUser: true,
      reuseOptimisticId: row.id,
      draftOrigin: { agentId: row.agentId, threadId: row.threadId },
      extra: {
        attachmentIds: row.attachmentIds.length
          ? row.attachmentIds
          : undefined,
      },
      holdBusy: true,
    });
  }

  function onStopGenerating() {
    abortRef.current?.abort();
    if (shouldFocusComposerAfterAbort()) {
      focusComposer();
    }
  }

  function closeFind() {
    setFindOpen(false);
    setFindQuery("");
    setFindIndex(0);
  }

  function closeSwitcher() {
    setSwitchOpen(false);
    setSwitchQuery("");
    setSwitchIndex(0);
    focusComposer();
  }

  function pickSwitcher(id: string) {
    closeSwitcher();
    if (id !== activeId) void selectAgent(id);
  }

  function transcriptRows() {
    return active
      ? messages.filter((message) => isTranscriptVisible(message, active))
      : messages;
  }

  /** v0.68: put the latest user message in the composer, caret at the end. */
  function fillRecalledDraft(text: string) {
    pendingCaret.current = text.length;
    draftRef.current = text;
    setDraft(text);
    setRecallArmed(true);
    syncComposerTriggers(text, text.length);
    if (active) {
      quoteJumps.current.clearPending(active.id, threadId);
      setQuoteJumpEpoch((epoch) => epoch + 1);
    }
  }

  /** v0.94: quote the selection into this chat's draft. Does not send. */
  function quoteIntoComposer(selection: string) {
    if (takeoverOpen) return;
    const next = appendQuoteToDraft(draftRef.current, selection);
    if (!next) return;
    pendingCaret.current = next.caret;
    draftRef.current = next.text;
    setDraft(next.text);
    setRecallArmed((armed) => recallArmedAfterEdit(next.text, armed));
    syncComposerTriggers(next.text, next.caret);
    const sourceId = readQuoteOffer()?.messageId ?? "";
    if (sourceId && active) {
      quoteJumps.current.note(active.id, threadId, selection, sourceId);
      setQuoteJumpEpoch((epoch) => epoch + 1);
    }
    window.getSelection()?.removeAllRanges();
  }
  quoteKeyRef.current = quoteIntoComposer;

  /** Escape, or a later empty field, leaves the composer empty. */
  function clearRecalledDraft() {
    pendingCaret.current = 0;
    draftRef.current = "";
    setDraft("");
    setRecallArmed(false);
    syncComposerTriggers("", 0);
    if (active) {
      quoteJumps.current.clearPending(active.id, threadId);
      setQuoteJumpEpoch((epoch) => epoch + 1);
    }
  }

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (
        escapeClosesSwitcher({
          open: switchOpen,
          composing: isComposerComposing(event),
        })
      ) {
        event.preventDefault();
        closeSwitcher();
        return;
      }
      if (mentionOpen || skillOpen) return;
      if (takeoverOpen) return;
      if (dictationCancelable(dictation)) return;
      if (
        escapeClosesFind({
          open: findOpen,
          composing: isComposerComposing(event),
        })
      ) {
        event.preventDefault();
        closeFind();
        return;
      }
      if (
        escapeStopsGenerating({
          busy,
          composing: isComposerComposing(event),
          pendingWidget: messages.some(isPendingWidget),
          pendingApprove: messages.some(isPendingApprove),
          pendingConnect: messages.some(isPendingConnect),
        })
      ) {
        event.preventDefault();
        onStopGenerating();
        return;
      }
      if (
        escapeClearsRecall({
          armed: recallArmed,
          composing: isComposerComposing(event),
          busy,
          pendingWidget: messages.some(isPendingWidget),
          pendingApprove: messages.some(isPendingApprove),
          pendingConnect: messages.some(isPendingConnect),
        })
      ) {
        event.preventDefault();
        clearRecalledDraft();
        return;
      }
      if (
        escapeJumpsToLatest({
          showJump,
          busy,
          composing: isComposerComposing(event),
          pendingWidget: messages.some(isPendingWidget),
          pendingApprove: messages.some(isPendingApprove),
          pendingConnect: messages.some(isPendingConnect),
        })
      ) {
        event.preventDefault();
        onJumpLatest();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    busy,
    messages,
    mentionOpen,
    skillOpen,
    takeoverOpen,
    dictation,
    showJump,
    onJumpLatest,
    recallArmed,
    findOpen,
    switchOpen,
  ]);

  useEffect(() => {
    if (!shortcutsOpen) return;
    const onShortcutsEsc = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (
        !escapeClosesShortcuts({
          open: true,
          composing: isComposerComposing(event),
        })
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      closeShortcuts();
    };
    window.addEventListener("keydown", onShortcutsEsc, true);
    return () => window.removeEventListener("keydown", onShortcutsEsc, true);
  }, [shortcutsOpen, closeShortcuts]);

  async function onSend() {
    if (!session || !active || inFlight.current || sendBlocked) return;
    const content = draft.trim();
    const chips = pendingAttachments;
    if (!content && chips.length === 0) return;
    if (attachError) return;
    const origin: ChatDraftKey = {
      agentId: active.id,
      threadId,
    };
    inFlight.current = true;
    setBusy(true);
    newMessagesPlace.current = clearNewMessages(newMessagesPlace.current);
    watchingNewMessages.current = true;
    setDividerAnchorId(null);
    snapStick();
    focusComposer();
    quoteJumps.current.commit(origin.agentId, origin.threadId, content);
    setQuoteJumpEpoch((epoch) => epoch + 1);
    chatDrafts.current.clear(origin.agentId, origin.threadId);
    draftRef.current = "";
    setDraft("");
    setRecallArmed(false);
    setComposerError(null);
    setAttachError(null);
    setPendingAttachments([]);
    resizeComposer(true);
    await submitTurn({
      content,
      attachments: chips.map(({ id, kind, name, url, size }) => ({
        id,
        kind,
        name,
        url,
        size,
      })),
      mentionIds: mentionIdsInText(content, pickedMentions.current),
      optimisticUser: true,
      restoreAttachments: chips,
      draftOrigin: origin,
      extra: { attachmentIds: chips.map((row) => row.id) },
      holdBusy: true,
    });
  }

  async function answerWidget(id: string, values: string[]) {
    setComposerError(null);
    await submitTurn({
      content: "",
      extra: { widgetReply: { id, values } },
    });
  }

  async function dismissWidget(id: string) {
    setComposerError(null);
    await submitTurn({
      content: "",
      extra: { widgetReply: { id, dismissed: true } },
    });
  }

  async function answerApprove(id: string) {
    setComposerError(null);
    await submitTurn({
      content: "",
      extra: { approveReply: { id, approved: true } },
    });
  }

  async function denyApprove(id: string) {
    setComposerError(null);
    await submitTurn({
      content: "",
      extra: { approveReply: { id, dismissed: true } },
    });
  }

  function publishQueued(next: QueuedSendMap) {
    queuedRef.current = next;
    setQueuedMap(next);
  }

  /** v1.28: hold the composer text until the in-flight reply settles. */
  function queueFollowUp() {
    if (!active) return;
    const text = draftRef.current;
    if (
      !canQueueFollowUp({
        busy: true,
        text,
        chipCount: pendingAttachmentsRef.current.length,
        attachError: Boolean(attachError),
        takeoverOpen,
        hasChat: true,
      })
    ) {
      return;
    }
    const quotes = quoteJumps.current.takePending(active.id, threadId);
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `q-${Date.now()}`;
    publishQueued(
      enqueueFollowUp(
        queuedRef.current,
        queuedSendKey(active.id, threadId),
        text,
        id,
        mentionIdsInText(text, pickedMentions.current),
        quotes,
      ),
    );
    chatDrafts.current.clear(active.id, threadId);
    draftRef.current = "";
    setDraft("");
    setRecallArmed(false);
    setQuoteJumpEpoch((epoch) => epoch + 1);
    resizeComposer(true);
    focusComposer();
  }

  function editQueuedItem(id: string, text: string) {
    if (!active) return;
    publishQueued(
      editQueuedFollowUp(
        queuedRef.current,
        queuedSendKey(active.id, threadId),
        id,
        text,
      ),
    );
  }

  function removeQueuedItem(id: string) {
    if (!active) return;
    publishQueued(
      removeQueuedFollowUp(
        queuedRef.current,
        queuedSendKey(active.id, threadId),
        id,
      ),
    );
  }

  async function sendQueuedFollowUp(
    item: QueuedItem,
    agentId: string,
    thread: string | null,
    kind: string,
  ) {
    if (!session || inFlight.current) {
      publishQueued(
        requeueFollowUp(
          queuedRef.current,
          queuedSendKey(agentId, thread),
          item,
        ),
      );
      return;
    }
    const open =
      convoRef.current.agentId === agentId &&
      (convoRef.current.threadId ?? null) === (thread ?? null);
    inFlight.current = true;
    setBusy(true);
    if (open) {
      newMessagesPlace.current = clearNewMessages(newMessagesPlace.current);
      watchingNewMessages.current = true;
      setDividerAnchorId(null);
      snapStick();
      focusComposer();
    }
    quoteJumps.current.commitOwned(agentId, thread, item.text, item.quotes);
    if (open) setQuoteJumpEpoch((epoch) => epoch + 1);
    setComposerError(null);
    await submitTurn({
      content: item.text,
      mentionIds: item.mentionIds,
      optimisticUser: true,
      draftOrigin: { agentId, threadId: thread },
      fromQueue: true,
      fromQueueQuotes: item.quotes,
      streamAgentId: agentId,
      streamThreadId: thread,
      streamKind: kind,
      holdBusy: true,
    });
  }

  function stopSpeaking() {
    speakEpoch.current += 1;
    const audio = speakAudio.current;
    speakAudio.current = null;
    if (audio) {
      audio.onended = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    if (speakObjectUrl.current) {
      URL.revokeObjectURL(speakObjectUrl.current);
      speakObjectUrl.current = null;
    }
    setSpeakingId(null);
  }

  async function toggleSpeak(messageId: string, content: string) {
    // User tap only. Do not start playback from SSE, message done, or history load.
    if (speakingId === messageId) {
      stopSpeaking();
      return;
    }
    stopSpeaking();
    if (!session) return;
    const text = spokenText(content);
    const epoch = speakEpoch.current;
    try {
      const blob = await speakText(session, text);
      if (epoch !== speakEpoch.current) return;
      const url = URL.createObjectURL(blob);
      speakObjectUrl.current = url;
      const audio = new Audio(url);
      speakAudio.current = audio;
      audio.onended = () => {
        if (speakEpoch.current === epoch) stopSpeaking();
      };
      setSpeakingId(messageId);
      await audio.play();
    } catch (err) {
      if (epoch === speakEpoch.current) {
        stopSpeaking();
        setComposerError(describeError(err));
      }
    }
  }

  useEffect(() => {
    stopSpeaking();
    return () => {
      speakEpoch.current += 1;
      const audio = speakAudio.current;
      speakAudio.current = null;
      if (audio) {
        audio.onended = null;
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }
      if (speakObjectUrl.current) {
        URL.revokeObjectURL(speakObjectUrl.current);
        speakObjectUrl.current = null;
      }
    };
  }, [activeId, threadId]);

  async function onRegenerate() {
    if (!session || !active || busy || active.kind === "channel") return;
    snapStick();
    setComposerError(null);
    setMessages((prev) => dropLastAssistantTurn(prev));
    await submitTurn({
      content: "",
      extra: regeneratePostBody(),
    });
  }

  async function refreshPlugins(next: Session | null = session) {
    if (!next) {
      setPlugins([]);
      setPluginCatalog([]);
      return;
    }
    try {
      const [rows, catalog] = await Promise.all([
        listPlugins(next),
        listPluginCatalog(next),
      ]);
      setPlugins(rows);
      setPluginCatalog(catalog);
    } catch {
      setPlugins([]);
      setPluginCatalog([]);
    }
  }

  async function connectPlugin(pluginId: string): Promise<boolean> {
    if (!session) return false;
    try {
      const started = await startPluginAuth(session, pluginId);
      await openOsBrowser(started.authorizationUrl);
      const ok = await waitUntilPluginConnected(session, pluginId);
      await refreshPlugins();
      return ok;
    } catch (err) {
      setComposerError(describeError(err));
      return false;
    }
  }

  async function addCatalogPlugin(entry: PluginCatalogEntry) {
    if (!session || catalogAddingId) return;
    setCatalogAddingId(entry.id);
    try {
      await createPlugin(session, catalogInstallBody(entry));
      await refreshPlugins();
    } catch (err) {
      setComposerError(describeError(err));
    } finally {
      setCatalogAddingId(null);
    }
  }

  function openPluginAdd() {
    setPluginAddName("");
    setPluginAddMode("stdio");
    setPluginAddCommand("");
    setPluginAddArgs("");
    setPluginAddUrl("");
    setPluginAddOpen(true);
  }

  async function savePluginAdd() {
    if (!session || pluginAddSaving || !pluginAddReady) return;
    setPluginAddSaving(true);
    try {
      if (pluginAddMode === "stdio") {
        await createPlugin(session, {
          name: pluginAddName.trim(),
          transport: "stdio",
          command: pluginAddCommand.trim(),
          args: parsePluginArgs(pluginAddArgs),
        });
      } else {
        await createPlugin(session, {
          name: pluginAddName.trim(),
          transport: "url",
          url: pluginAddUrl.trim(),
        });
      }
      setPluginAddOpen(false);
      await refreshPlugins();
    } catch (err) {
      setComposerError(describeError(err));
    } finally {
      setPluginAddSaving(false);
    }
  }

  async function confirmRemove() {
    if (!session || !pendingRemove) return;
    const id = pendingRemove.id;
    setPendingRemove(null);
    try {
      await deletePlugin(session, id);
      await refreshPlugins();
    } catch (err) {
      setComposerError(describeError(err));
    }
  }

  async function answerConnect(id: string, _pluginId: string) {
    setComposerError(null);
    await submitTurn({
      content: "",
      extra: { connectReply: { id } },
    });
  }

  async function dismissConnect(id: string) {
    setComposerError(null);
    await submitTurn({
      content: "",
      extra: { connectReply: { id, dismissed: true } },
    });
  }

  async function openTakeover() {
    if (!session || !active || active.kind === "channel") return;
    try {
      const opened = await openComputerSession(session, active.id);
      setTakeoverId(active.id);
      setTakeoverSessionId(opened.sessionId);
    } catch (err) {
      setComposerError(describeError(err));
    }
  }

  async function closeTakeover() {
    const id = takeoverId;
    const sess = takeoverSessionId;
    setTakeoverId(null);
    setTakeoverSessionId(null);
    if (session && id) {
      try {
        await closeComputerSession(session, id, sess ?? undefined);
      } catch {
        /* already closed */
      }
    }
  }

  useEffect(() => {
    if (takeoverId && active?.id !== takeoverId) {
      void closeTakeover();
    }
  }, [active?.id, takeoverId]);

  function onComposerKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (takeoverOpen) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (isComposerComposing(event)) {
      return;
    }
    if (mentionOpen && mentionCandidates.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setMentionIndex((i) => (i + 1) % mentionCandidates.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setMentionIndex(
          (i) => (i - 1 + mentionCandidates.length) % mentionCandidates.length,
        );
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        pickMention(mentionCandidates[mentionIndex] ?? mentionCandidates[0]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMentionOpen(false);
        return;
      }
    }
    if (skillMenuOpen && skillCandidates.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSkillIndex((i) => (i + 1) % skillCandidates.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSkillIndex(
          (i) => (i - 1 + skillCandidates.length) % skillCandidates.length,
        );
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        pickSkill(skillCandidates[skillIndex] ?? skillCandidates[0]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setSkillOpen(false);
        return;
      }
    }
    if (event.key === "Escape" && dictationCancelable(dictation)) {
      event.preventDefault();
      cancelDictation();
      return;
    }
    if (
      arrowUpRecalls({
        key: event.key,
        composerText: draft,
        composing: isComposerComposing(event),
        altKey: event.altKey,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
      })
    ) {
      const text = latestUserMessageText(transcriptRows());
      if (text != null) {
        event.preventDefault();
        fillRecalledDraft(text);
      }
      return;
    }
    if (
      event.key === "Escape" &&
      escapeClearsRecall({
        armed: recallArmed,
        composing: isComposerComposing(event),
        busy,
        pendingWidget: messages.some(isPendingWidget),
        pendingApprove: messages.some(isPendingApprove),
        pendingConnect: messages.some(isPendingConnect),
      })
    ) {
      event.preventDefault();
      event.stopPropagation();
      clearRecalledDraft();
      return;
    }
    // v0.87: empty composer + plain Backspace removes the last chip.
    // Text, IME, and chords stay with the field. No chips: do nothing.
    if (
      backspaceRemovesLastChip({
        key: event.key,
        composerText: event.currentTarget.value,
        chipCount: pendingAttachments.length,
        composing: isComposerComposing(event),
        altKey: event.altKey,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
      })
    ) {
      event.preventDefault();
      removeLastPendingChip();
      return;
    }
    if (sendMutedWhileGenerating(busy)) {
      if (
        enterQueuesFollowUp(event, {
          busy,
          text: event.currentTarget.value,
          chipCount: pendingAttachments.length,
          attachError: Boolean(attachError),
          takeoverOpen,
          hasChat: Boolean(active),
        })
      ) {
        event.preventDefault();
        queueFollowUp();
      }
      return;
    }
    if (composerEnterSends(event)) {
      event.preventDefault();
      void onSend();
    }
  }

  function insertDraftAtCaret(text: string) {
    const el = composerRef.current;
    const current = draft;
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? start;
    const next = current.slice(0, start) + text + current.slice(end);
    pendingCaret.current = start + text.length;
    setDraft(next);
    syncComposerTriggers(next, start + text.length);
  }

  function stopDictationTracks() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function discardRecorder() {
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      if (recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          /* already stopped */
        }
      }
    }
    recorderRef.current = null;
    chunksRef.current = [];
    stopDictationTracks();
  }

  function cancelDictation() {
    if (!dictationCancelable(dictation)) return;
    discardRecorder();
    setDictation("idle");
  }

  async function finishDictation(mimeType: string) {
    setDictation("processing");
    stopDictationTracks();
    const blob = new Blob(chunksRef.current, {
      type: mimeType || "audio/webm",
    });
    chunksRef.current = [];
    recorderRef.current = null;
    if (!session || blob.size === 0) {
      setDictation("idle");
      if (blob.size === 0) setComposerError(HINT_NO_SPEECH);
      return;
    }
    try {
      const { text } = await transcribeAudio(
        session,
        blob,
        audioFileName(blob.type || mimeType),
      );
      const el = composerRef.current;
      const current = el?.value ?? draft;
      const caret = el?.selectionStart ?? current.length;
      const next = insertTranscript(current, caret, text);
      pendingCaret.current = next.caret;
      setDraft(next.text);
      syncComposerTriggers(next.text, next.caret);
      composerRef.current?.focus();
    } catch (caught) {
      const message =
        caught instanceof ApiError ? caught.message : ERR_TRANSCRIBE;
      setComposerError(message === "No speech detected." ? HINT_NO_SPEECH : message);
    } finally {
      setDictation("idle");
    }
  }

  async function startDictation() {
    if (!session || composerDisabled) return;
    setComposerError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickRecorderMime((type) =>
        typeof MediaRecorder !== "undefined" &&
        typeof MediaRecorder.isTypeSupported === "function"
          ? MediaRecorder.isTypeSupported(type)
          : false,
      );
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        void finishDictation(recorder.mimeType);
      };
      recorderRef.current = recorder;
      recorder.start();
      setDictation("recording");
    } catch {
      stopDictationTracks();
      setComposerError(HINT_MIC_OFF);
      setDictation("idle");
    }
  }

  function onMicClick() {
    if (dictation === "processing") return;
    if (dictation === "recording") {
      recorderRef.current?.stop();
      return;
    }
    void startDictation();
  }

  async function applyPastedFiles(files: File[], text: string) {
    if (text) insertDraftAtCaret(text);
    for (const file of files) {
      await addPendingFile(withPastedName(file));
    }
  }

  async function onComposerPaste(event: ClipboardEvent<HTMLElement>) {
    if (composerDisabled || takeoverOpen) return;
    const result = composerPasteFromClipboard(event.clipboardData);
    if (!result.intercept) return;
    event.preventDefault();
    await applyPastedFiles(result.files, result.text);
  }

  async function pasteFromNavigatorClipboard() {
    if (composerDisabled || takeoverOpen) return;
    if (!navigator.clipboard?.read) return;
    try {
      const items = await navigator.clipboard.read();
      const files: File[] = [];
      let text = "";
      for (const item of items) {
        for (const type of item.types) {
          if (type === "text/plain") {
            const blob = await item.getType(type);
            text += await blob.text();
            continue;
          }
          if (type === "text/html") continue;
          const blob = await item.getType(type);
          const mime = blob.type || type;
          files.push(
            withPastedName(new File([blob], "", { type: mime })),
          );
        }
      }
      const result = composerPasteFromClipboard({
        files,
        getData: (kind) => (kind === "text/plain" ? text : ""),
      });
      if (!result.intercept) {
        if (text) insertDraftAtCaret(text);
        return;
      }
      await applyPastedFiles(result.files, result.text);
    } catch {
      /* paste permission or empty clipboard */
    }
  }

  function onComposerBarKey(event: KeyboardEvent<HTMLElement>) {
    if (!isComposerPasteChord(event)) return;
    if (event.target === composerRef.current) return;
    event.preventDefault();
    void pasteFromNavigatorClipboard();
  }

  function resizeComposer(reset = false) {
    const el = composerRef.current;
    if (!el) return;
    const empty = reset || el.value.length === 0;
    // Measure against the stylesheet line, not a leftover inline height.
    el.style.overflowY = "hidden";
    el.style.height = "";
    const frame = composerFrame({
      restingHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
      empty,
      maxPx: COMPOSER_MAX_PX,
    });
    const field = el.parentElement;
    if (frame.height == null) {
      el.style.height = "";
      el.style.overflowY = "hidden";
      field?.classList.remove("is-scrolling");
    } else {
      el.style.height = `${frame.height}px`;
      el.style.overflowY = frame.scroll ? "auto" : "hidden";
      field?.classList.toggle("is-scrolling", frame.scroll);
    }
    syncComposerScroll();
  }

  async function addPendingFile(file: File) {
    if (!session || !active) return;
    const err = attachmentClientError(file);
    if (err) {
      setAttachError(err);
      return;
    }
    setAttachError(null);
    setAttachInFlight((n) => n + 1);
    try {
      const row = await uploadAttachment(session, active.id, file);
      const previewUrl =
        row.kind === "image" || row.kind === "video"
          ? URL.createObjectURL(file)
          : undefined;
      setPendingAttachments((prev) => [...prev, { ...row, previewUrl }]);
    } catch (caught) {
      setAttachError(
        caught instanceof ApiError ? caught.message : describeError(caught),
      );
    } finally {
      setAttachInFlight((n) => Math.max(0, n - 1));
    }
  }

  async function onPickFile(file: File | undefined) {
    if (!file) return;
    await addPendingFile(file);
    if (fileRef.current) fileRef.current.value = "";
  }

  function onChatDragOver(event: DragEvent<HTMLElement>) {
    if (!dragCarriesFiles(event.dataTransfer?.types)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (dropHoldRef.current) return;
    if (!session || !active) return;
    setDropTarget(true);
  }

  function onChatDragLeave(event: DragEvent<HTMLElement>) {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    dropHoldRef.current = false;
    setDropTarget(false);
  }

  async function onChatDrop(event: DragEvent<HTMLElement>) {
    dropHoldRef.current = false;
    setDropTarget(false);
    if (!dragCarriesFiles(event.dataTransfer?.types)) return;
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files);
    for (const file of files) {
      await addPendingFile(file);
    }
  }

  async function openAttachedFile(row: {
    name: string;
    url: string;
  }) {
    if (!session) return;
    try {
      const blob = await fetchAttachmentBlob(session, row.url);
      const href = URL.createObjectURL(blob);
      window.open(href, "_blank", "noopener");
    } catch (caught) {
      setComposerError(
        caught instanceof ApiError ? caught.message : describeError(caught),
      );
    }
  }

  function removePending(id: string) {
    setPendingAttachments((prev) => {
      const found = prev.find((row) => row.id === id);
      if (found?.previewUrl) URL.revokeObjectURL(found.previewUrl);
      return prev.filter((row) => row.id !== id);
    });
    setAttachError(null);
  }

  /** v0.87: one chip, the last one. Focus stays in the composer. */
  function removeLastPendingChip() {
    setPendingAttachments((prev) => {
      const next = withoutLastChip(prev);
      if (next.length === prev.length) return prev;
      const removed = prev[prev.length - 1];
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return [...next];
    });
    setAttachError(null);
    composerRef.current?.focus();
  }

  async function onPickAvatar(file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) return;
    setProfileAvatar(await fileToDataUrl(file));
    if (avatarFileRef.current) avatarFileRef.current.value = "";
  }

  function onAgentContext(event: MouseEvent, agent: Agent) {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY, agent });
  }

  function syncComposerScroll() {
    const field = composerRef.current;
    const overlay = highlightRef.current;
    if (!field || !overlay) return;
    // The textarea is inline-block, so the field is a few pixels taller
    // than the control. Pin the highlight to the control or the caret
    // drifts at the bottom of a scrolled draft.
    overlay.style.height = `${field.offsetHeight}px`;
    overlay.style.bottom = "auto";
    overlay.scrollTop = field.scrollTop;
    overlay.scrollLeft = field.scrollLeft;
  }

  const composerChipNames = pickedChipNames(pickedMentions.current);
  const visibleMessages = active
    ? messages.filter((message) => isTranscriptVisible(message, active))
    : messages;
  const lastUserIdx = visibleMessages.reduce(
    (found, message, index) =>
      isUserSender(message.senderId, message.role) ? index : found,
    -1,
  );
  const liveTraces = toolTraces.filter(
    (trace) =>
      !visibleMessages.some(
        (message) => isToolLine(message) && message.id === trace.id,
      ),
  );
  const liveAssistantIdx = visibleMessages.findIndex(
    (message, index) =>
      index > lastUserIdx &&
      message.role === "assistant" &&
      !isHandoffRoot(message) &&
      !isToolLine(message) &&
      !isWidget(message) &&
      !isConnect(message) &&
      !isApprove(message),
  );
  const showStandaloneTraces =
    liveTraces.length > 0 && liveAssistantIdx < 0;
  const dictationHint = composerDictationHint(dictation, composerError);
  const statusHint = dictationHint ?? composerSendHint(composerError);
  const toolThisTurn = visibleMessages.some(
    (message, index) => index > lastUserIdx && isToolLine(message),
  );
  const liveAssistant = liveAssistantIdx >= 0
    ? visibleMessages[liveAssistantIdx]
    : undefined;
  const showWaiting = showWaitingLine({
    busy,
    hasFirstToken: hasAssistantToken(liveAssistant),
    hasLiveTool: liveTraces.length > 0 || toolThisTurn,
    hasError: Boolean(composerError),
  });
  const lastLeftIdx = lastCompletedLeftMessageIndex(visibleMessages, {
    busy,
    liveAssistantIdx,
  });
  const liveToolItems = liveTraces.map((trace) => ({
    id: trace.id,
    summary: trace.summary,
  }));
  const toolStacks = compactToolStacks({
    messages: visibleMessages.map((message) => ({
      id: message.id,
      kind: message.kind,
      content: message.content,
    })),
    liveTraces: liveToolItems,
    liveAt: liveTraces.length
      ? showStandaloneTraces
        ? visibleMessages.length
        : liveAssistantIdx
      : null,
  });
  const livePaint = liveToolPaint(
    toolStacks,
    liveToolItems,
    expandedToolStacks,
  );
  const showLiveChrome =
    livePaint.header != null || livePaint.lines.length > 0;
  const dayLabels = daySeparatorLabels(
    visibleMessages.map((message, index) => {
      const toolStack = stackForMessageIndex(toolStacks, index);
      const collapsed = toolStack
        ? stackCollapsed(
            expandedToolStacks,
            toolStack.id,
            toolStack.items.length,
          )
        : false;
      return {
        createdAt: message.createdAt,
        hidden: hidePersistedTool(toolStack, index, collapsed),
      };
    }),
  );
  const findQueryShown = findOpen ? findQuery : "";
  const findRows = transcriptFindRows([
    ...visibleMessages.map((message, index) => {
      const toolStack = stackForMessageIndex(toolStacks, index);
      const collapsed = toolStack
        ? stackCollapsed(
            expandedToolStacks,
            toolStack.id,
            toolStack.items.length,
          )
        : false;
      const hidden = hidePersistedTool(toolStack, index, collapsed);
      const completed = !(busy && index === liveAssistantIdx);
      const body = displayBody(message.content, message.senderName);
      const handoff = isHandoffRoot(message);
      const tool = isToolLine(message);
      const user = isUserSender(message.senderId, message.role);
      const skip =
        !handoff &&
        (isWidget(message) || isApprove(message) || isConnect(message));
      let texts: string[] = [];
      if (tool) texts = [message.content ?? ""];
      else if (handoff) texts = [message.userAsk || message.content || ""];
      else if (user) texts = [body];
      else if (!skip) {
        const linked = resolveReferenceLinks(body, completed);
        const footnoted = extractFootnotes(linked, completed);
        const bubbles = footnoted.notes.length
          ? splitAssistantBubbles(footnoted.text, completed)
          : splitAssistantBubbles(linked, completed);
        texts = footnoteFindTexts(bubbles, footnoted.notes);
      }
      return {
        id: message.id,
        texts,
        hidden,
        skip,
        single: tool || handoff || user,
      };
    }),
    ...livePaint.lines.map((trace) => ({
      id: `live:${trace.id}`,
      texts: [trace.summary],
      single: true,
    })),
  ]);
  const findHitList = findHits(findRows, findQueryShown);
  const findHitKey = findHitList
    .map((hit) => `${hit.rowId}:${hit.start}:${hit.end}`)
    .join("|");
  const findSafeIndex =
    findHitList.length === 0
      ? -1
      : Math.min(findIndex, findHitList.length - 1);
  const activeFindHit =
    findSafeIndex >= 0 ? findHitList[findSafeIndex] : null;

  function rangeFor(rowId: string) {
    if (!activeFindHit || activeFindHit.rowId !== rowId) return null;
    return { start: activeFindHit.start, end: activeFindHit.end };
  }

  function findRowActive(rowId: string) {
    return activeFindHit?.rowId === rowId ? "true" : undefined;
  }

  useEffect(() => {
    if (!findOpen) return;
    const frame = requestAnimationFrame(() => {
      findInputRef.current?.focus();
      findInputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [findOpen]);

  useEffect(() => {
    if (!findOpen) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Enter") return;
      if (isComposerComposing(event)) return;
      const target = event.target;
      if (target instanceof HTMLTextAreaElement) return;
      if (
        target instanceof HTMLInputElement &&
        target !== findInputRef.current
      ) {
        return;
      }
      event.preventDefault();
      setFindIndex((current) => {
        const total = findHitList.length;
        const base = total === 0 ? -1 : Math.min(current, total - 1);
        return stepFindIndex(base, total, event.shiftKey ? -1 : 1);
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [findOpen, findHitKey, findHitList]);

  useLayoutEffect(() => {
    if (!findOpen || !activeFindHit) return;
    const root = scroller.current;
    if (!root) return;
    const mark = root.querySelector("mark.find-hit.active");
    const row = root.querySelector(
      `[data-find-row="${CSS.escape(activeFindHit.rowId)}"]`,
    );
    const target = mark ?? row;
    if (!target) return;
    targetedScroll.current += 1;
    targetedScrollKind.current = "message";
    target.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [
    findOpen,
    findSafeIndex,
    activeFindHit?.rowId,
    activeFindHit?.start,
    findQueryShown,
  ]);

  const switchHits = filterChats(
    agents.map((agent) => ({
      id: agent.id,
      name: chatDisplayName(chatNames, agent.id, agent.name),
    })),
    switchOpen ? switchQuery : "",
  );
  const rosterAgents = agents.filter(
    (agent) =>
      !isChatArchived(archivedChatIds, agent.id) &&
      chatVisibleInFilter(
        chatListFilter,
        paintsUnreadAccent(
          isChatMuted(mutedChatIds, agent.id),
          unreadIds.has(agent.id) || replyUnreadIds.has(agent.id),
        ),
      ),
  );
  const { pinned: pinnedAgents, rest: restAgents } = groupPinnedChats(
    rosterAgents,
    pinnedChatIds,
    (agent) => agent.id,
  );
  const rosterHeaders = rosterSectionHeaders(
    pinnedAgents.length,
    restAgents.length,
  );
  const archivedAgents = agents.filter((agent) =>
    isChatArchived(archivedChatIds, agent.id),
  );
  const unreadRosterCount = agents.filter(
    (agent) =>
      !isChatArchived(archivedChatIds, agent.id) &&
      paintsUnreadAccent(
        isChatMuted(mutedChatIds, agent.id),
        unreadIds.has(agent.id) || replyUnreadIds.has(agent.id),
      ),
  ).length;
  const switchSafeIndex = clampSwitchIndex(switchIndex, switchHits.length);
  const activeSwitch =
    switchSafeIndex >= 0 ? switchHits[switchSafeIndex] : null;

  useEffect(() => {
    if (!switchOpen) return;
    const frame = requestAnimationFrame(() => {
      switchInputRef.current?.focus();
      switchInputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [switchOpen]);

  useEffect(() => {
    if (!switchOpen) return;
    const onSwitcherKey = (event: globalThis.KeyboardEvent) => {
      if (isComposerComposing(event)) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        setSwitchIndex((current) =>
          stepSwitchIndex(
            clampSwitchIndex(current, switchHits.length),
            switchHits.length,
            direction,
          ),
        );
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        const row =
          switchHits[clampSwitchIndex(switchIndex, switchHits.length)];
        if (row) {
          closeSwitcher();
          if (row.id !== activeId) void selectAgent(row.id);
        }
      }
    };
    window.addEventListener("keydown", onSwitcherKey, true);
    return () => window.removeEventListener("keydown", onSwitcherKey, true);
  }, [switchOpen, switchIndex, switchHits, activeId]);

  const visibleChatKey = [...pinnedAgents, ...restAgents]
    .map((agent) => agent.id)
    .join("\u0000");
  // v1.05: same painted rows as Alt+Up/Down, plus the archive section
  // while it is expanded. Section headers are not rows. Cmd/Ctrl-9
  // is the last of this list.
  const jumpChatIds = visibleJumpIds({
    mainIds: [...pinnedAgents, ...restAgents].map((agent) => agent.id),
    archivedIds: archivedAgents.map((agent) => agent.id),
    archiveListShowing: archiveOpen,
  });
  const jumpChatKey = jumpChatIds.join("\u0000");
  const selectAgentRef = useRef(selectAgent);
  selectAgentRef.current = selectAgent;

  useEffect(() => {
    const ids = visibleChatKey ? visibleChatKey.split("\u0000") : [];
    const onChatNav = (event: globalThis.KeyboardEvent) => {
      const direction = chatNavDirection({
        key: event.key,
        altKey: event.altKey,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        composing: isComposerComposing(event),
        findOpen,
        switchOpen,
        blocked:
          shortcutsOpen ||
          mentionOpen ||
          skillMenuOpen ||
          switcherBlocked ||
          lightboxTarget != null ||
          renamingId != null,
      });
      if (direction == null) return;
      event.preventDefault();
      event.stopPropagation();
      const next = adjacentChatId(ids, activeId, direction);
      if (!next) return;
      void selectAgentRef.current(next);
    };
    window.addEventListener("keydown", onChatNav, true);
    return () => window.removeEventListener("keydown", onChatNav, true);
  }, [
    visibleChatKey,
    activeId,
    findOpen,
    switchOpen,
    shortcutsOpen,
    mentionOpen,
    skillMenuOpen,
    switcherBlocked,
    lightboxTarget,
    renamingId,
  ]);

  // v0.99: a printable character outside a text field lands at the end
  // of this chat's draft. Cmd/Ctrl-L focuses and inserts nothing.
  // v1.26: the same chord quotes a transcript selection when one
  // quotable message owns it, then focuses the composer.
  typeIntoComposerRef.current = (character: string) => {
    const next = appendDraftAtEnd(draftRef.current, character);
    pendingCaret.current = next.caret;
    draftRef.current = next.text;
    setDraft(next.text);
    setRecallArmed((armed) => recallArmedAfterEdit(next.text, armed));
    syncComposerTriggers(next.text, next.caret);
  };

  useEffect(() => {
    const onFocusComposerKey = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const gate = {
        chatOpen: active != null,
        editable: !fieldDisabled,
        composing: isComposerComposing(event),
        inTextField: focusIsTextField(event.target),
        inCard: focusInsideCard(event.target),
        findOpen,
        switchOpen,
        shortcutsOpen,
        renaming: renamingId != null,
        lightboxOpen: lightboxTarget != null,
        menuOpen: contextMenu != null,
        blocked: switcherBlocked || mentionOpen || skillMenuOpen,
      };
      if (
        isFocusComposerChord({
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          repeat: event.repeat,
        })
      ) {
        if (focusComposerChordBlocked(gate) || quoteSelectionBlocked(gate)) return;
        const quoted = selectionToQuote({
          inTextField: gate.inTextField,
          selection: readQuoteOffer()?.text ?? null,
        });
        event.preventDefault();
        event.stopPropagation();
        if (quoted) {
          quoteKeyRef.current(quoted);
          return;
        }
        if (!gate.inTextField) {
          placeCaretAtEnd();
        }
        return;
      }
      if (typeToFocusBlocked(gate)) return;
      const character = typeToFocusCharacter({
        key: event.key,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        composing: isComposerComposing(event),
        reserved: isShortcutsQuestion(event, event.target),
      });
      if (character == null) return;
      event.preventDefault();
      event.stopPropagation();
      typeIntoComposerRef.current(character);
    };
    window.addEventListener("keydown", onFocusComposerKey, true);
    return () => window.removeEventListener("keydown", onFocusComposerKey, true);
  }, [
    active,
    fieldDisabled,
    findOpen,
    switchOpen,
    shortcutsOpen,
    renamingId,
    lightboxTarget,
    contextMenu,
    switcherBlocked,
    mentionOpen,
    skillMenuOpen,
    placeCaretAtEnd,
  ]);

  // v1.00: Cmd/Ctrl-Shift-C copies the latest completed assistant reply.
  // A streaming reply is skipped. The composer may stay focused.
  copyLastReplyRef.current = () => {
    const reply = lastAssistantReply(visibleMessages, {
      busy,
      liveAssistantIdx,
    });
    if (!reply?.content) return;
    void copyText(reply.content);
    setShortcutCopiedId(reply.id);
    if (shortcutCopyTimer.current != null) {
      window.clearTimeout(shortcutCopyTimer.current);
    }
    const copiedId = reply.id;
    shortcutCopyTimer.current = window.setTimeout(() => {
      setShortcutCopiedId((current) => (current === copiedId ? null : current));
      shortcutCopyTimer.current = null;
    }, MESSAGE_COPY_FEEDBACK_MS);
  };

  useEffect(() => {
    const onCopyLastReply = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (
        !isCopyLastReplyChord({
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          repeat: event.repeat,
        })
      ) {
        return;
      }
      const gate = {
        chatOpen: active != null,
        composing: isComposerComposing(event),
        inCard: focusInsideCard(event.target),
        findOpen,
        switchOpen,
        shortcutsOpen,
        renaming: renamingId != null,
        lightboxOpen: lightboxTarget != null,
        menuOpen: contextMenu != null,
        blocked: switcherBlocked || mentionOpen || skillMenuOpen,
      };
      if (copyLastReplyBlocked(gate)) return;
      event.preventDefault();
      event.stopPropagation();
      copyLastReplyRef.current();
    };
    window.addEventListener("keydown", onCopyLastReply, true);
    return () => {
      window.removeEventListener("keydown", onCopyLastReply, true);
    };
  }, [
    active,
    findOpen,
    switchOpen,
    shortcutsOpen,
    renamingId,
    lightboxTarget,
    contextMenu,
    switcherBlocked,
    mentionOpen,
    skillMenuOpen,
  ]);

  // v1.03: PageUp / PageDown scroll the loaded transcript one viewport.
  // Cmd/Ctrl-End uses Jump to latest so stick-to-bottom re-arms.
  // Cmd/Ctrl-Home jumps to the oldest loaded messages. Text fields,
  // find, the switcher, shortcuts, rename, the lightbox, and cards
  // keep the keys. The offset change is instant.
  useEffect(() => {
    const onTranscriptScrollKey = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const action = transcriptScrollAction({
        key: event.key,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
      });
      if (!action) return;
      const gate = {
        chatOpen: active != null,
        composing: isComposerComposing(event),
        inTextField: focusIsTextField(event.target),
        inCard: focusInsideCard(event.target),
        findOpen,
        switchOpen,
        shortcutsOpen,
        renaming: renamingId != null,
        lightboxOpen: lightboxTarget != null,
        menuOpen: contextMenu != null,
        blocked: switcherBlocked || mentionOpen || skillMenuOpen,
      };
      if (transcriptScrollBlocked(gate)) return;
      event.preventDefault();
      event.stopPropagation();
      if (prefersJumpToLatest(action)) {
        onJumpLatest();
        return;
      }
      if (action === "top") {
        targetedScroll.current += 1;
        targetedScrollKind.current = "top";
      }
      const el = scroller.current;
      if (!el) return;
      const box = {
        scrollTop: el.scrollTop,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      };
      const nextTop = nextTranscriptScrollTop(box, action);
      el.scrollTop = nextTop;
      applyStick(
        onUserScroll(
          stickRef.current,
          isNearBottom({ ...box, scrollTop: nextTop }, NEAR_BOTTOM_PX),
        ),
      );
      captureOpenReadingPlace();
    };
    window.addEventListener("keydown", onTranscriptScrollKey, true);
    return () => {
      window.removeEventListener("keydown", onTranscriptScrollKey, true);
    };
  }, [
    active,
    findOpen,
    switchOpen,
    shortcutsOpen,
    renamingId,
    lightboxTarget,
    contextMenu,
    switcherBlocked,
    mentionOpen,
    skillMenuOpen,
    onJumpLatest,
    applyStick,
    captureOpenReadingPlace,
  ]);

  // v1.04: Cmd/Ctrl-N runs the same New agent path as the sidebar
  // Create menu. The composer does not own the chord. A modal or
  // overlay text field does. IME keeps it. Focus lands in the composer.
  createFromShortcutRef.current = () => {
    setCreateMenuOpen(false);
    void onCreate();
  };

  useEffect(() => {
    const onNewChatKey = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (
        !isNewChatChord({
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          repeat: event.repeat,
        })
      ) {
        return;
      }
      const gate = {
        ready: session !== null,
        composing: isComposerComposing(event),
        overlayTextField: overlayTextFieldOwnsNewChat(
          focusIsTextField(event.target),
          event.target === composerRef.current,
        ),
        inCard: focusInsideCard(event.target),
        findOpen,
        switchOpen,
        shortcutsOpen,
        renaming: renamingId != null,
        lightboxOpen: lightboxTarget != null,
        menuOpen: contextMenu != null,
        blocked: switcherBlocked || mentionOpen || skillMenuOpen,
      };
      if (newChatBlocked(gate)) return;
      event.preventDefault();
      event.stopPropagation();
      createFromShortcutRef.current();
    };
    window.addEventListener("keydown", onNewChatKey, true);
    return () => {
      window.removeEventListener("keydown", onNewChatKey, true);
    };
  }, [
    session,
    findOpen,
    switchOpen,
    shortcutsOpen,
    renamingId,
    lightboxTarget,
    contextMenu,
    switcherBlocked,
    mentionOpen,
    skillMenuOpen,
  ]);

  // v1.05: Cmd/Ctrl-1..8 opens that visible chat. Cmd/Ctrl-9 opens
  // the last one. The composer does not own the chord. Opening is
  // the sidebar row click, so that chat's draft and reading place
  // come back and the composer is focused. A missing slot does nothing.
  useEffect(() => {
    const ids = jumpChatKey ? jumpChatKey.split("\u0000") : [];
    const onJumpChatKey = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const slot = chatJumpSlot({
        key: event.key,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        repeat: event.repeat,
      });
      if (slot == null) return;
      const gate = {
        composing: isComposerComposing(event),
        overlayTextField: overlayTextFieldOwnsChatJump(
          focusIsTextField(event.target),
          event.target === composerRef.current,
        ),
        inCard: focusInsideCard(event.target),
        findOpen,
        switchOpen,
        shortcutsOpen,
        renaming: renamingId != null,
        lightboxOpen: lightboxTarget != null,
        menuOpen: contextMenu != null,
        blocked: switcherBlocked || mentionOpen || skillMenuOpen,
      };
      if (chatJumpBlocked(gate)) return;
      event.preventDefault();
      event.stopPropagation();
      const id = chatIdAtJumpSlot(ids, slot);
      if (!id) return;
      void selectAgentRef.current(id);
    };
    window.addEventListener("keydown", onJumpChatKey, true);
    return () => {
      window.removeEventListener("keydown", onJumpChatKey, true);
    };
  }, [
    jumpChatKey,
    findOpen,
    switchOpen,
    shortcutsOpen,
    renamingId,
    lightboxTarget,
    contextMenu,
    switcherBlocked,
    mentionOpen,
    skillMenuOpen,
  ]);

  // v1.06: Cmd/Ctrl-Shift-A archives the open chat through the sidebar
  // Archive action. The composer does not own the chord. A modal or
  // overlay text field does. IME keeps it. Nothing is archived when
  // no chat is open. The next visible chat, or the empty state, is
  // the same path the sidebar already uses.
  archiveOpenChatRef.current = () => {
    const id = active?.id;
    if (!id) return;
    onArchive(id);
  };

  useEffect(() => {
    const onArchiveOpenChat = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (
        !isArchiveOpenChatChord({
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          repeat: event.repeat,
        })
      ) {
        return;
      }
      const gate = {
        chatOpen: active != null,
        composing: isComposerComposing(event),
        overlayTextField: overlayTextFieldOwnsArchiveOpenChat(
          focusIsTextField(event.target),
          event.target === composerRef.current,
        ),
        inCard: focusInsideCard(event.target),
        findOpen,
        switchOpen,
        shortcutsOpen,
        renaming: renamingId != null,
        lightboxOpen: lightboxTarget != null,
        menuOpen: contextMenu != null,
        blocked: switcherBlocked || mentionOpen || skillMenuOpen,
      };
      if (archiveOpenChatBlocked(gate)) return;
      event.preventDefault();
      event.stopPropagation();
      archiveOpenChatRef.current();
    };
    window.addEventListener("keydown", onArchiveOpenChat, true);
    return () => {
      window.removeEventListener("keydown", onArchiveOpenChat, true);
    };
  }, [
    active,
    findOpen,
    switchOpen,
    shortcutsOpen,
    renamingId,
    lightboxTarget,
    contextMenu,
    switcherBlocked,
    mentionOpen,
    skillMenuOpen,
  ]);

  // v1.07: Cmd/Ctrl-Shift-Backspace clears the open chat's composer
  // draft (text and pending chips) without sending. The composer does
  // not own the chord. A modal or overlay text field does. IME keeps
  // it. An already empty composer is a no-op. Nothing is cleared when
  // no chat is open. Plain Backspace still removes the last chip.
  clearComposerDraftRef.current = () => {
    if (!active) return;
    const hadText = draftRef.current.length > 0;
    if (
      composerDraftAlreadyEmpty(
        draftRef.current,
        pendingAttachmentsRef.current.length,
      )
    ) {
      return;
    }
    draftRef.current = "";
    pendingAttachmentsRef.current = [];
    const here = convoRef.current;
    if (here.agentId) {
      chatDrafts.current.clear(here.agentId, here.threadId);
      quoteJumps.current.clearPending(here.agentId, here.threadId);
      setQuoteJumpEpoch((epoch) => epoch + 1);
    }
    // Only move the caret when the text actually changes. A chips-only
    // clear leaves the empty field's caret alone, so the next keystroke
    // is not pulled back to 0.
    if (hadText && document.activeElement === composerRef.current) {
      pendingCaret.current = 0;
    }
    setDraft("");
    setRecallArmed(false);
    syncComposerTriggers("", 0);
    setAttachError(null);
    setPendingAttachments((prev) => {
      for (const row of prev) {
        if (row.previewUrl) URL.revokeObjectURL(row.previewUrl);
      }
      return [];
    });
  };

  useEffect(() => {
    const onClearComposerDraft = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (
        !isClearComposerDraftChord({
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          repeat: event.repeat,
        })
      ) {
        return;
      }
      const gate = {
        chatOpen: active != null,
        composing: isComposerComposing(event),
        overlayTextField: overlayTextFieldOwnsClearComposerDraft(
          focusIsTextField(event.target),
          event.target === composerRef.current,
        ),
        inCard: focusInsideCard(event.target),
        findOpen,
        switchOpen,
        shortcutsOpen,
        renaming: renamingId != null,
        lightboxOpen: lightboxTarget != null,
        menuOpen: contextMenu != null,
        blocked: switcherBlocked || mentionOpen || skillMenuOpen,
      };
      if (clearComposerDraftBlocked(gate)) return;
      event.preventDefault();
      event.stopPropagation();
      clearComposerDraftRef.current();
    };
    window.addEventListener("keydown", onClearComposerDraft, true);
    return () => {
      window.removeEventListener("keydown", onClearComposerDraft, true);
    };
  }, [
    active,
    findOpen,
    switchOpen,
    shortcutsOpen,
    renamingId,
    lightboxTarget,
    contextMenu,
    switcherBlocked,
    mentionOpen,
    skillMenuOpen,
  ]);

  // v1.08: Cmd/Ctrl-Shift-P pins or unpins the open chat through the
  // sidebar Pin action. The composer does not own the chord and the
  // letter is not inserted. A modal or overlay text field does. IME
  // keeps it. A key repeat does not flap Pin / Unpin. Nothing changes
  // when no chat is open. Order and persistence are that same path.
  pinOpenChatRef.current = () => {
    const id = active?.id;
    if (!id) return;
    onTogglePin(id);
  };

  useEffect(() => {
    const onPinOpenChat = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (
        !isPinOpenChatChord({
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          repeat: event.repeat,
        })
      ) {
        return;
      }
      const gate = {
        chatOpen: active != null,
        composing: isComposerComposing(event),
        overlayTextField: overlayTextFieldOwnsPinOpenChat(
          focusIsTextField(event.target),
          event.target === composerRef.current,
        ),
        inCard: focusInsideCard(event.target),
        findOpen,
        switchOpen,
        shortcutsOpen,
        renaming: renamingId != null,
        lightboxOpen: lightboxTarget != null,
        menuOpen: contextMenu != null,
        blocked: switcherBlocked || mentionOpen || skillMenuOpen,
      };
      if (pinOpenChatBlocked(gate)) return;
      event.preventDefault();
      event.stopPropagation();
      if (!pinOpenChatShouldToggle({ repeat: event.repeat })) return;
      pinOpenChatRef.current();
    };
    window.addEventListener("keydown", onPinOpenChat, true);
    return () => {
      window.removeEventListener("keydown", onPinOpenChat, true);
    };
  }, [
    active,
    findOpen,
    switchOpen,
    shortcutsOpen,
    renamingId,
    lightboxTarget,
    contextMenu,
    switcherBlocked,
    mentionOpen,
    skillMenuOpen,
  ]);

  // v1.09: Cmd/Ctrl-Shift-M mutes or unmutes the open chat through the
  // sidebar Mute action. The composer does not own the chord and the
  // letter is not inserted. A modal or overlay text field does. IME
  // keeps it. A key repeat does not flap Mute / Unmute. Nothing changes
  // when no chat is open. Persistence and unread clearing are that path.
  muteOpenChatRef.current = () => {
    const id = active?.id;
    if (!id) return;
    onToggleMute(id);
  };

  useEffect(() => {
    const onMuteOpenChat = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (
        !isMuteOpenChatChord({
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          repeat: event.repeat,
        })
      ) {
        return;
      }
      const gate = {
        chatOpen: active != null,
        composing: isComposerComposing(event),
        overlayTextField: overlayTextFieldOwnsMuteOpenChat(
          focusIsTextField(event.target),
          event.target === composerRef.current,
        ),
        inCard: focusInsideCard(event.target),
        findOpen,
        switchOpen,
        shortcutsOpen,
        renaming: renamingId != null,
        lightboxOpen: lightboxTarget != null,
        menuOpen: contextMenu != null,
        blocked: switcherBlocked || mentionOpen || skillMenuOpen,
      };
      if (muteOpenChatBlocked(gate)) return;
      event.preventDefault();
      event.stopPropagation();
      if (!muteOpenChatShouldToggle({ repeat: event.repeat })) return;
      muteOpenChatRef.current();
    };
    window.addEventListener("keydown", onMuteOpenChat, true);
    return () => {
      window.removeEventListener("keydown", onMuteOpenChat, true);
    };
  }, [
    active,
    findOpen,
    switchOpen,
    shortcutsOpen,
    renamingId,
    lightboxTarget,
    contextMenu,
    switcherBlocked,
    mentionOpen,
    skillMenuOpen,
  ]);

  // v1.10: Cmd/Ctrl-Shift-U marks the open chat unread through the
  // sidebar Mark as unread action. A chat that already shows the
  // unread dot is marked read, which is that same menu item. The
  // composer does not own the chord and the letter is not inserted.
  // A modal or overlay text field does. IME keeps it. A key repeat
  // does not flap the mark. Nothing changes when no chat is open.
  // Persistence, the accent dot, and the unread count are that path.
  markOpenChatRef.current = () => {
    const id = active?.id;
    if (!id) return;
    onToggleRead(id);
  };

  useEffect(() => {
    const onMarkOpenChat = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (
        !isMarkOpenChatChord({
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          repeat: event.repeat,
        })
      ) {
        return;
      }
      const gate = {
        chatOpen: active != null,
        composing: isComposerComposing(event),
        overlayTextField: overlayTextFieldOwnsMarkOpenChat(
          focusIsTextField(event.target),
          event.target === composerRef.current,
        ),
        inCard: focusInsideCard(event.target),
        findOpen,
        switchOpen,
        shortcutsOpen,
        renaming: renamingId != null,
        lightboxOpen: lightboxTarget != null,
        menuOpen: contextMenu != null,
        blocked: switcherBlocked || mentionOpen || skillMenuOpen,
      };
      if (markOpenChatBlocked(gate)) return;
      event.preventDefault();
      event.stopPropagation();
      if (!markOpenChatShouldApply({ repeat: event.repeat })) return;
      markOpenChatRef.current();
    };
    window.addEventListener("keydown", onMarkOpenChat, true);
    return () => {
      window.removeEventListener("keydown", onMarkOpenChat, true);
    };
  }, [
    active,
    findOpen,
    switchOpen,
    shortcutsOpen,
    renamingId,
    lightboxTarget,
    contextMenu,
    switcherBlocked,
    mentionOpen,
    skillMenuOpen,
  ]);


  // v1.11: Cmd/Ctrl-Shift-R starts rename on the open chat through the
  // sidebar Rename action. The composer does not own the chord and the
  // letter is not inserted. A modal or overlay text field does. IME
  // keeps it. A key repeat does not start a second rename. If a rename
  // is already in progress, this does not flap. Nothing changes when
  // no chat is open. Enter, blur, and Escape stay on that inline field.
  renameOpenChatRef.current = () => {
    const agent = active;
    if (!agent || renamingIdRef.current != null) return;
    if (isChatArchived(archivedChatIds, agent.id)) {
      if (!archiveOpen) setArchiveOpen(true);
    } else if (
      !pinnedAgents.some((row) => row.id === agent.id) &&
      !restAgents.some((row) => row.id === agent.id)
    ) {
      chooseChatListFilter(FILTER_ALL);
    }
    beginRename(agent);
  };

  useEffect(() => {
    const onRenameOpenChat = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (
        !isRenameOpenChatChord({
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          repeat: event.repeat,
        })
      ) {
        return;
      }
      const gate = {
        chatOpen: active != null,
        composing: isComposerComposing(event),
        overlayTextField: overlayTextFieldOwnsRenameOpenChat(
          focusIsTextField(event.target),
          event.target === composerRef.current,
        ),
        inCard: focusInsideCard(event.target),
        findOpen,
        switchOpen,
        shortcutsOpen,
        renaming: renamingId != null,
        lightboxOpen: lightboxTarget != null,
        menuOpen: contextMenu != null,
        blocked: switcherBlocked || mentionOpen || skillMenuOpen,
      };
      if (renameOpenChatBlocked(gate)) return;
      event.preventDefault();
      event.stopPropagation();
      if (!renameOpenChatShouldStart({ repeat: event.repeat }, renamingId != null)) {
        return;
      }
      renameOpenChatRef.current();
    };
    window.addEventListener("keydown", onRenameOpenChat, true);
    return () => {
      window.removeEventListener("keydown", onRenameOpenChat, true);
    };
  }, [
    active,
    findOpen,
    switchOpen,
    shortcutsOpen,
    renamingId,
    lightboxTarget,
    contextMenu,
    switcherBlocked,
    mentionOpen,
    skillMenuOpen,
  ]);

  // v1.12: Cmd/Ctrl-Shift-D opens the sidebar Delete confirm. It does
  // not delete on the chord. Enter or Delete confirms and then runs
  // the existing removal. Esc or Cancel aborts and focus returns to
  // the composer. A key repeat never confirms. The composer does not
  // own the chord and the letter is not inserted. IME keeps it.
  // Nothing is deleted when no chat is open. After confirm, the next
  // visible chat, or the empty state, follows Alt+Up/Down order.
  chordDeleteNextRef.current = (id: string) => {
    const visibleIds = [...pinnedAgents, ...restAgents].map((row) => row.id);
    return nextOpenChatAfterDelete(visibleIds, id);
  };
  deleteOpenChatRef.current = () => {
    const agent = active;
    if (!agent || !session) return;
    deleteConfirmFromChord.current = true;
    setPendingDelete(agent);
  };

  // v1.13: Cmd/Ctrl-Shift-E copies the loaded transcript. kind=message
  // bodies only, in order. Chrome rows are skipped. Nothing useful
  // leaves the clipboard alone. Copied sits beside the chat name.
  copyTranscriptRef.current = () => {
    if (!active) return;
    const text = transcriptPlainText(visibleMessages);
    if (!text) return;
    void copyText(text);
    const copiedId = active.id;
    setTranscriptCopiedId(copiedId);
    if (transcriptCopyTimer.current != null) {
      window.clearTimeout(transcriptCopyTimer.current);
    }
    transcriptCopyTimer.current = window.setTimeout(() => {
      setTranscriptCopiedId((current) => (current === copiedId ? null : current));
      transcriptCopyTimer.current = null;
    }, MESSAGE_COPY_FEEDBACK_MS);
  };

  // v1.14: Cmd/Ctrl-Shift-G toggles every compact tool-trace group.
  // If any group is expanded, collapse all. If every group is collapsed,
  // expand all. A single tool line is not a group. No groups is a no-op.
  toggleToolTracesRef.current = () => {
    if (!active) return;
    setExpandedToolStacks((prev) => toggleAllToolTraceGroups(prev, toolStacks) ?? prev);
  };

  // v1.16: Cmd/Ctrl-Shift-H toggles the sidebar Archived list. The
  // same flag the Archived (n) control writes. Opening needs at least
  // one archived chat. Closing always returns to the main list. A
  // chat does not have to be open.
  toggleArchiveListRef.current = () => {
    setArchiveOpen((open) => nextArchiveListOpen(open, archivedAgents.length));
  };

  useEffect(() => {
    const onDeleteOpenChat = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (
        !isDeleteOpenChatChord({
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          repeat: event.repeat,
        })
      ) {
        return;
      }
      const gate = {
        chatOpen: active != null,
        composing: isComposerComposing(event),
        overlayTextField: overlayTextFieldOwnsDeleteOpenChat(
          focusIsTextField(event.target),
          event.target === composerRef.current,
        ),
        inCard: focusInsideCard(event.target),
        findOpen,
        switchOpen,
        shortcutsOpen,
        renaming: renamingId != null,
        lightboxOpen: lightboxTarget != null,
        menuOpen: contextMenu != null,
        blocked: switcherBlocked || mentionOpen || skillMenuOpen,
      };
      if (deleteOpenChatBlocked(gate)) return;
      event.preventDefault();
      event.stopPropagation();
      if (!deleteOpenChatShouldRun({ repeat: event.repeat })) return;
      deleteOpenChatRef.current();
    };
    window.addEventListener("keydown", onDeleteOpenChat, true);
    return () => {
      window.removeEventListener("keydown", onDeleteOpenChat, true);
    };
  }, [
    active,
    findOpen,
    switchOpen,
    shortcutsOpen,
    renamingId,
    lightboxTarget,
    contextMenu,
    switcherBlocked,
    mentionOpen,
    skillMenuOpen,
  ]);

  // v1.13: Cmd/Ctrl-Shift-E copies the open chat's loaded transcript.
  // The composer does not own the chord and the letter is not inserted.
  // A key repeat is swallowed and does not copy again. IME keeps it.
  // Nothing is copied when no chat is open or nothing useful is loaded.
  useEffect(() => {
    const onCopyTranscript = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (
        !isCopyTranscriptChord({
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          repeat: event.repeat,
        })
      ) {
        return;
      }
      const gate = {
        chatOpen: active != null,
        composing: isComposerComposing(event),
        overlayTextField: overlayTextFieldOwnsCopyTranscript(
          focusIsTextField(event.target),
          event.target === composerRef.current,
        ),
        inCard: focusInsideCard(event.target),
        findOpen,
        switchOpen,
        shortcutsOpen,
        renaming: renamingId != null,
        lightboxOpen: lightboxTarget != null,
        menuOpen: contextMenu != null,
        blocked: switcherBlocked || mentionOpen || skillMenuOpen,
      };
      if (copyTranscriptBlocked(gate)) return;
      event.preventDefault();
      event.stopPropagation();
      if (!copyTranscriptShouldRun({ repeat: event.repeat })) return;
      copyTranscriptRef.current();
    };
    window.addEventListener("keydown", onCopyTranscript, true);
    return () => {
      window.removeEventListener("keydown", onCopyTranscript, true);
    };
  }, [
    active,
    findOpen,
    switchOpen,
    shortcutsOpen,
    renamingId,
    lightboxTarget,
    contextMenu,
    switcherBlocked,
    mentionOpen,
    skillMenuOpen,
  ]);

  // v1.14: Cmd/Ctrl-Shift-G collapses or expands every tool-trace group.
  // The composer does not own the chord and the letter is not inserted.
  // A key repeat is swallowed and does not flap. IME keeps it. Nothing
  // changes when no chat is open or there is no group.
  useEffect(() => {
    const onToggleToolTraces = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (
        !isToolTraceGroupsChord({
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          repeat: event.repeat,
        })
      ) {
        return;
      }
      const gate = {
        chatOpen: active != null,
        composing: isComposerComposing(event),
        overlayTextField: overlayTextFieldOwnsToolTraceGroups(
          focusIsTextField(event.target),
          event.target === composerRef.current,
        ),
        inCard: focusInsideCard(event.target),
        findOpen,
        switchOpen,
        shortcutsOpen,
        renaming: renamingId != null,
        lightboxOpen: lightboxTarget != null,
        menuOpen: contextMenu != null,
        blocked: switcherBlocked || mentionOpen || skillMenuOpen,
      };
      if (toolTraceGroupsBlocked(gate)) return;
      event.preventDefault();
      event.stopPropagation();
      if (!toolTraceGroupsShouldToggle({ repeat: event.repeat })) return;
      toggleToolTracesRef.current();
    };
    window.addEventListener("keydown", onToggleToolTraces, true);
    return () => {
      window.removeEventListener("keydown", onToggleToolTraces, true);
    };
  }, [
    active,
    findOpen,
    switchOpen,
    shortcutsOpen,
    renamingId,
    lightboxTarget,
    contextMenu,
    switcherBlocked,
    mentionOpen,
    skillMenuOpen,
  ]);

  // v1.15: Cmd/Ctrl-Shift-F toggles the sidebar All / Unread control.
  // The same choice as clicking All or Unread, including persistence.
  // The composer does not own the chord and the letter is not inserted.
  // A key repeat is swallowed and does not flap. IME keeps it. The
  // empty state still toggles, because the sidebar control does.
  toggleChatListFilterRef.current = () => {
    chooseChatListFilter(nextChatListFilter(chatListFilter));
  };

  useEffect(() => {
    const onToggleChatListFilter = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (
        !isChatListFilterChord({
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          repeat: event.repeat,
        })
      ) {
        return;
      }
      const gate = {
        composing: isComposerComposing(event),
        overlayTextField: overlayTextFieldOwnsChatListFilter(
          focusIsTextField(event.target),
          event.target === composerRef.current,
        ),
        inCard: focusInsideCard(event.target),
        findOpen,
        switchOpen,
        shortcutsOpen,
        renaming: renamingId != null,
        lightboxOpen: lightboxTarget != null,
        menuOpen: contextMenu != null,
        blocked: switcherBlocked || mentionOpen || skillMenuOpen,
      };
      if (chatListFilterKeyBlocked(gate)) return;
      event.preventDefault();
      event.stopPropagation();
      if (!chatListFilterShouldToggle({ repeat: event.repeat })) return;
      toggleChatListFilterRef.current();
    };
    window.addEventListener("keydown", onToggleChatListFilter, true);
    return () => {
      window.removeEventListener("keydown", onToggleChatListFilter, true);
    };
  }, [
    findOpen,
    switchOpen,
    shortcutsOpen,
    renamingId,
    lightboxTarget,
    contextMenu,
    switcherBlocked,
    mentionOpen,
    skillMenuOpen,
  ]);

  // v1.16: Cmd/Ctrl-Shift-H opens or closes the Archived list. The
  // composer does not own the chord and the letter is not inserted.
  // A key repeat is swallowed and does not flap. IME keeps it. The
  // chord still runs when no chat is open, same as the sidebar control.
  useEffect(() => {
    const onToggleArchiveList = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (
        !isArchiveListChord({
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          repeat: event.repeat,
        })
      ) {
        return;
      }
      const gate = {
        composing: isComposerComposing(event),
        overlayTextField: overlayTextFieldOwnsArchiveList(
          focusIsTextField(event.target),
          event.target === composerRef.current,
        ),
        inCard: focusInsideCard(event.target),
        findOpen,
        switchOpen,
        shortcutsOpen,
        renaming: renamingId != null,
        lightboxOpen: lightboxTarget != null,
        menuOpen: contextMenu != null,
        blocked: switcherBlocked || mentionOpen || skillMenuOpen,
      };
      if (archiveListBlocked(gate)) return;
      event.preventDefault();
      event.stopPropagation();
      if (!archiveListShouldToggle({ repeat: event.repeat })) return;
      toggleArchiveListRef.current();
    };
    window.addEventListener("keydown", onToggleArchiveList, true);
    return () => {
      window.removeEventListener("keydown", onToggleArchiveList, true);
    };
  }, [
    findOpen,
    switchOpen,
    shortcutsOpen,
    renamingId,
    lightboxTarget,
    contextMenu,
    switcherBlocked,
    mentionOpen,
    skillMenuOpen,
  ]);

  // v1.17: Cmd/Ctrl-Shift-J opens the next unread chat after the one
  // that is open, in the same visible order as Alt+Up/Down and
  // Cmd/Ctrl-1..9, wrapping. Opening is the sidebar row click, so
  // that chat's draft and reading place come back and the composer
  // is focused. No unread row leaves the open chat put. The composer
  // does not own the chord and j is not inserted. A key repeat is
  // swallowed and does not jump again.
  useEffect(() => {
    const ids = jumpChatKey ? jumpChatKey.split("\u0000") : [];
    const onNextUnread = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (
        !isNextUnreadChord({
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          repeat: event.repeat,
        })
      ) {
        return;
      }
      const gate = {
        composing: isComposerComposing(event),
        overlayTextField: overlayTextFieldOwnsNextUnread(
          focusIsTextField(event.target),
          event.target === composerRef.current,
        ),
        inCard: focusInsideCard(event.target),
        findOpen,
        switchOpen,
        shortcutsOpen,
        renaming: renamingId != null,
        lightboxOpen: lightboxTarget != null,
        menuOpen: contextMenu != null,
        blocked: switcherBlocked || mentionOpen || skillMenuOpen,
      };
      if (nextUnreadBlocked(gate)) return;
      event.preventDefault();
      event.stopPropagation();
      if (!nextUnreadShouldOpen({ repeat: event.repeat })) return;
      const unread = new Set(
        ids.filter((id) =>
          paintsUnreadAccent(
            isChatMuted(mutedChatIds, id),
            unreadIds.has(id) || replyUnreadIds.has(id),
          ),
        ),
      );
      const next = nextUnreadChatId(ids, activeId, unread);
      if (!next) return;
      void selectAgentRef.current(next);
    };
    window.addEventListener("keydown", onNextUnread, true);
    return () => {
      window.removeEventListener("keydown", onNextUnread, true);
    };
  }, [
    jumpChatKey,
    activeId,
    mutedChatIds,
    unreadIds,
    replyUnreadIds,
    findOpen,
    switchOpen,
    shortcutsOpen,
    renamingId,
    lightboxTarget,
    contextMenu,
    switcherBlocked,
    mentionOpen,
    skillMenuOpen,
  ]);

  // v1.21: Cmd/Ctrl-Shift-K opens the previous unread chat before the
  // one that is open, in the same visible order as Alt+Up/Down and
  // Cmd/Ctrl-1..9, wrapping. Opening is the sidebar row click, so
  // that chat's draft and reading place come back and the composer
  // is focused. No unread row leaves the open chat put. The composer
  // does not own the chord and k is not inserted. A key repeat is
  // swallowed and does not jump again. Cmd/Ctrl-K without Shift stays
  // the quick switcher.
  useEffect(() => {
    const ids = jumpChatKey ? jumpChatKey.split("\u0000") : [];
    const onPreviousUnread = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (
        !isPreviousUnreadChord({
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          repeat: event.repeat,
        })
      ) {
        return;
      }
      const gate = {
        composing: isComposerComposing(event),
        overlayTextField: overlayTextFieldOwnsPreviousUnread(
          focusIsTextField(event.target),
          event.target === composerRef.current,
        ),
        inCard: focusInsideCard(event.target),
        findOpen,
        switchOpen,
        shortcutsOpen,
        renaming: renamingId != null,
        lightboxOpen: lightboxTarget != null,
        menuOpen: contextMenu != null,
        blocked: switcherBlocked || mentionOpen || skillMenuOpen,
      };
      if (previousUnreadBlocked(gate)) return;
      event.preventDefault();
      event.stopPropagation();
      if (!previousUnreadShouldOpen({ repeat: event.repeat })) return;
      const unread = new Set(
        ids.filter((id) =>
          paintsUnreadAccent(
            isChatMuted(mutedChatIds, id),
            unreadIds.has(id) || replyUnreadIds.has(id),
          ),
        ),
      );
      const previous = previousUnreadChatId(ids, activeId, unread);
      if (!previous) return;
      void selectAgentRef.current(previous);
    };
    window.addEventListener("keydown", onPreviousUnread, true);
    return () => {
      window.removeEventListener("keydown", onPreviousUnread, true);
    };
  }, [
    jumpChatKey,
    activeId,
    mutedChatIds,
    unreadIds,
    replyUnreadIds,
    findOpen,
    switchOpen,
    shortcutsOpen,
    renamingId,
    lightboxTarget,
    contextMenu,
    switcherBlocked,
    mentionOpen,
    skillMenuOpen,
  ]);

  // v1.22: Cmd/Ctrl-Shift-B unarchives the open chat through the sidebar
  // Unarchive action when that chat is archived. The row leaves the
  // Archived list and returns to the main list. The open chat stays
  // open. The composer does not own the chord and b is not inserted.
  // A key repeat is swallowed and does not unarchive again. IME keeps
  // it. Nothing changes when no chat is open or the chat is not archived.
  // Cmd/Ctrl-Shift-A still only archives.
  unarchiveOpenChatRef.current = () => {
    const id = active?.id;
    if (!id || !isChatArchived(archivedChatIds, id)) return;
    onUnarchive(id);
  };

  useEffect(() => {
    const onUnarchiveOpenChat = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (
        !isUnarchiveOpenChatChord({
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          repeat: event.repeat,
        })
      ) {
        return;
      }
      const gate = {
        chatOpen: active != null,
        composing: isComposerComposing(event),
        overlayTextField: overlayTextFieldOwnsUnarchiveOpenChat(
          focusIsTextField(event.target),
          event.target === composerRef.current,
        ),
        inCard: focusInsideCard(event.target),
        findOpen,
        switchOpen,
        shortcutsOpen,
        renaming: renamingId != null,
        lightboxOpen: lightboxTarget != null,
        menuOpen: contextMenu != null,
        blocked: switcherBlocked || mentionOpen || skillMenuOpen,
      };
      if (unarchiveOpenChatBlocked(gate)) return;
      event.preventDefault();
      event.stopPropagation();
      if (
        !unarchiveOpenChatShouldRun({
          repeat: event.repeat,
          archived: active != null && isChatArchived(archivedChatIds, active.id),
        })
      ) {
        return;
      }
      unarchiveOpenChatRef.current();
    };
    window.addEventListener("keydown", onUnarchiveOpenChat, true);
    return () => {
      window.removeEventListener("keydown", onUnarchiveOpenChat, true);
    };
  }, [
    active,
    archivedChatIds,
    findOpen,
    switchOpen,
    shortcutsOpen,
    renamingId,
    lightboxTarget,
    contextMenu,
    switcherBlocked,
    mentionOpen,
    skillMenuOpen,
  ]);

  // v1.23: Cmd/Ctrl-[ steps back through this window's chat-open
  // history. Cmd/Ctrl-] steps forward. Opening a chat pushes.
  // Going back and then opening a different chat truncates the
  // forward entries. Deleted chats are skipped. Archived chats stay
  // valid. Either end is a no-op. The composer does not own the
  // chord and the bracket is not inserted. A key repeat is swallowed
  // and does not step again. IME keeps it.
  openChatHistoryRef.current = (direction) => {
    const stepped = stepChatOpenHistory(
      chatOpenHistoryRef.current,
      direction,
      (id) => rosterIdsRef.current.has(id),
    );
    chatOpenHistoryRef.current = stepped.history;
    if (!stepped.id) return;
    void loadConversation(stepped.id, null, "composer", "restore");
  };

  useEffect(() => {
    const onChatHistory = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const direction = chatHistoryDirection({
        key: event.key,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        repeat: event.repeat,
      });
      if (!direction) return;
      const gate = {
        composing: isComposerComposing(event),
        overlayTextField: overlayTextFieldOwnsChatHistory(
          focusIsTextField(event.target),
          event.target === composerRef.current,
        ),
        inCard: focusInsideCard(event.target),
        findOpen,
        switchOpen,
        shortcutsOpen,
        renaming: renamingId != null,
        lightboxOpen: lightboxTarget != null,
        menuOpen: contextMenu != null,
        blocked: switcherBlocked || mentionOpen || skillMenuOpen,
      };
      if (chatHistoryBlocked(gate)) return;
      event.preventDefault();
      event.stopPropagation();
      if (!chatHistoryShouldMove({ repeat: event.repeat })) return;
      openChatHistoryRef.current(direction);
    };
    window.addEventListener("keydown", onChatHistory, true);
    return () => {
      window.removeEventListener("keydown", onChatHistory, true);
    };
  }, [
    findOpen,
    switchOpen,
    shortcutsOpen,
    renamingId,
    lightboxTarget,
    contextMenu,
    switcherBlocked,
    mentionOpen,
    skillMenuOpen,
  ]);

  // v1.24: Cmd/Ctrl-= and Cmd/Ctrl-+ step the transcript text larger.
  // Cmd/Ctrl-- steps smaller. Cmd/Ctrl-0 resets to 100%. Bubbles,
  // code, and tool traces share the scale. The composer does not
  // own the chord and the character is not inserted. A key repeat
  // is swallowed and does not step again. IME keeps it. The ends
  // stay clamped. The choice persists in local storage.
  useEffect(() => {
    const onTranscriptText = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const step = transcriptTextStep({
        key: event.key,
        code: event.code,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        repeat: event.repeat,
      });
      if (!step) return;
      const gate = {
        composing: isComposerComposing(event),
        overlayTextField: overlayTextFieldOwnsTranscriptText(
          focusIsTextField(event.target),
          event.target === composerRef.current,
        ),
        inCard: focusInsideCard(event.target),
        findOpen,
        switchOpen,
        shortcutsOpen,
        renaming: renamingId != null,
        lightboxOpen: lightboxTarget != null,
        menuOpen: contextMenu != null,
        blocked: switcherBlocked || mentionOpen || skillMenuOpen,
      };
      if (transcriptTextBlocked(gate)) return;
      event.preventDefault();
      event.stopPropagation();
      if (!transcriptTextShouldApply({ repeat: event.repeat })) return;
      setTranscriptTextPercent((current) => applyTranscriptTextStep(current, step));
    };
    window.addEventListener("keydown", onTranscriptText, true);
    return () => {
      window.removeEventListener("keydown", onTranscriptText, true);
    };
  }, [
    findOpen,
    switchOpen,
    shortcutsOpen,
    renamingId,
    lightboxTarget,
    contextMenu,
    switcherBlocked,
    mentionOpen,
    skillMenuOpen,
  ]);

  // v1.25: Cmd/Ctrl-Shift-Up / Cmd/Ctrl-Shift-Down jump to the previous
  // or next message you sent in the loaded transcript. The target
  // sits under the sticky day header and gets a brief outline.
  // Either end stays put. An empty composer does not own the chord.
  // A composer that already has text keeps selecting. A key repeat
  // is swallowed and does not jump again. IME keeps the key.
  // Stick-to-bottom and the reading place follow the same scroll path
  // as Page Up / Page Down. Collapsed long messages stay collapsed.
  useEffect(() => {
    const onUserMessageJump = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const direction = userMessageJumpDirection({
        key: event.key,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        repeat: event.repeat,
      });
      if (!direction) return;
      const composer = composerRef.current;
      const gate = {
        chatOpen: active != null,
        composing: isComposerComposing(event),
        overlayTextField: overlayTextFieldOwnsUserJump(
          focusIsTextField(event.target),
          event.target === composer,
        ),
        composerHasText: composerTextOwnsUserJump(
          event.target === composer,
          composer?.value ?? "",
        ),
        inCard: focusInsideCard(event.target),
        findOpen,
        switchOpen,
        shortcutsOpen,
        renaming: renamingId != null,
        lightboxOpen: lightboxTarget != null,
        menuOpen: contextMenu != null,
        blocked: switcherBlocked || mentionOpen || skillMenuOpen,
      };
      if (userMessageJumpBlocked(gate)) return;
      event.preventDefault();
      event.stopPropagation();
      if (!userMessageJumpShouldMove({ repeat: event.repeat })) return;
      const el = scroller.current;
      if (!el) return;
      const day = el.querySelector<HTMLElement>(".day-separator");
      const stickyInset = day ? day.getBoundingClientRect().height : 0;
      const scrollerTop = el.getBoundingClientRect().top;
      const rows = [...el.querySelectorAll<HTMLElement>("[data-user-jump]")].map(
        (node) => ({
          id: node.dataset.userJump ?? "",
          top: userJumpContentTop(
            node.getBoundingClientRect().top,
            scrollerTop,
            el.scrollTop,
          ),
        }),
      );
      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
      const targetId = pickUserJumpId(
        rows,
        direction,
        userJumpView({
          scrollTop: el.scrollTop,
          stickyInset,
          maxScroll,
        }),
      );
      if (!targetId) return;
      const target = rows.find((row) => row.id === targetId);
      if (!target || target.top == null) return;
      const nextTop = userJumpScrollTop(target.top, stickyInset, maxScroll);
      targetedScroll.current += 1;
      targetedScrollKind.current = "message";
      el.scrollTop = nextTop;
      const box = {
        scrollTop: nextTop,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      };
      applyStick(
        onUserScroll(stickRef.current, isNearBottom(box, NEAR_BOTTOM_PX)),
      );
      captureOpenReadingPlace();
      const token = userJumpHighlightGen.current + 1;
      userJumpHighlightGen.current = token;
      setUserJumpHighlightId(targetId);
      const ms = userJumpHighlightMs(
        window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      );
      window.setTimeout(() => {
        if (userJumpHighlightGen.current === token) setUserJumpHighlightId(null);
      }, ms);
    };
    window.addEventListener("keydown", onUserMessageJump, true);
    return () => {
      window.removeEventListener("keydown", onUserMessageJump, true);
    };
  }, [
    active,
    findOpen,
    switchOpen,
    shortcutsOpen,
    renamingId,
    lightboxTarget,
    contextMenu,
    switcherBlocked,
    mentionOpen,
    skillMenuOpen,
    applyStick,
    captureOpenReadingPlace,
  ]);

  // v1.27: scroll a quoted message under the sticky day header.
  // The same path as a transcript page: stick-to-bottom and the
  // reading place follow the offset. Collapsed long messages stay
  // collapsed. Reduce Motion keeps the outline and skips the fade.
  const jumpToQuotedMessage = useCallback(
    (sourceId: string) => {
      const el = scroller.current;
      if (!el || !sourceId) return;
      const target = el.querySelector<HTMLElement>(
        quoteJumpTargetSelector(CSS.escape(sourceId)),
      );
      if (!target) return;
      const day = el.querySelector<HTMLElement>(".day-separator");
      const stickyInset = day ? day.getBoundingClientRect().height : 0;
      const scrollerTop = el.getBoundingClientRect().top;
      const top = userJumpContentTop(
        target.getBoundingClientRect().top,
        scrollerTop,
        el.scrollTop,
      );
      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
      const nextTop = userJumpScrollTop(top, stickyInset, maxScroll);
      targetedScroll.current += 1;
      targetedScrollKind.current = "message";
      el.scrollTop = nextTop;
      const box = {
        scrollTop: nextTop,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      };
      applyStick(
        onUserScroll(stickRef.current, isNearBottom(box, NEAR_BOTTOM_PX)),
      );
      captureOpenReadingPlace();
      const token = quoteJumpHighlightGen.current + 1;
      quoteJumpHighlightGen.current = token;
      setQuoteJumpHighlightId(sourceId);
      const ms = userJumpHighlightMs(
        window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      );
      window.setTimeout(() => {
        if (quoteJumpHighlightGen.current === token) setQuoteJumpHighlightId(null);
      }, ms);
    },
    [applyStick, captureOpenReadingPlace],
  );

  // v1.27: Cmd/Ctrl-' jumps to the message quoted by the quote nearest
  // the reading line. The composer may keep its text. The apostrophe
  // is not inserted. A key repeat is swallowed and does not jump again.
  // IME keeps the key. Find, the switcher, and the other overlays keep it.
  useEffect(() => {
    const onQuoteJump = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (
        !isQuoteJumpChord({
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          repeat: event.repeat,
        })
      ) {
        return;
      }
      const composer = composerRef.current;
      const gate = {
        chatOpen: active != null,
        composing: isComposerComposing(event),
        overlayTextField: overlayTextFieldOwnsQuoteJump(
          focusIsTextField(event.target),
          event.target === composer,
        ),
        inCard: focusInsideCard(event.target),
        findOpen,
        switchOpen,
        shortcutsOpen,
        renaming: renamingId != null,
        lightboxOpen: lightboxTarget != null,
        menuOpen: contextMenu != null,
        blocked: switcherBlocked || mentionOpen || skillMenuOpen,
      };
      if (quoteJumpBlocked(gate)) return;
      event.preventDefault();
      event.stopPropagation();
      if (!quoteJumpShouldMove({ repeat: event.repeat })) return;
      const el = scroller.current;
      if (!el || !active) return;
      const day = el.querySelector<HTMLElement>(".day-separator");
      const stickyInset = day ? day.getBoundingClientRect().height : 0;
      const scrollerTop = el.getBoundingClientRect().top;
      const rows = [...el.querySelectorAll<HTMLElement>(quoteJumpRowSelector())].map(
        (node) => ({
          id: node.dataset.quoteJump ?? "",
          top: userJumpContentTop(
            node.getBoundingClientRect().top,
            scrollerTop,
            el.scrollTop,
          ),
        }),
      );
      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
      const messageId = pickQuoteJumpMessageId(
        rows,
        userJumpView({
          scrollTop: el.scrollTop,
          stickyInset,
          maxScroll,
        }),
      );
      if (!messageId) return;
      const message = messagesRef.current.find((row) => row.id === messageId);
      if (!message) return;
      const loaded = new Set(messagesRef.current.map((row) => row.id));
      const sourceId = primaryQuoteSource(
        quoteJumps.current.targets(active.id, threadId, message.content, loaded),
      );
      if (!sourceId) return;
      jumpToQuotedMessage(sourceId);
    };
    window.addEventListener("keydown", onQuoteJump, true);
    return () => {
      window.removeEventListener("keydown", onQuoteJump, true);
    };
  }, [
    active,
    threadId,
    findOpen,
    switchOpen,
    shortcutsOpen,
    renamingId,
    lightboxTarget,
    contextMenu,
    switcherBlocked,
    mentionOpen,
    skillMenuOpen,
    jumpToQuotedMessage,
  ]);

  // v1.18: Cmd/Ctrl-Shift-Y regenerates the latest completed LEFT
  // through the same path as the Regenerate hover control. The
  // composer does not own the chord and the letter is not inserted.
  // A key repeat is swallowed and does not regenerate again. IME
  // keeps it. Nothing is sent when no chat is open, the chat is a
  // channel, a reply is still streaming, or Regenerate would not show.
  regenerateLastReplyRef.current = () => {
    if (
      !regenerateLastReplyAllowed({
        chatOpen: active != null,
        isChannel: active?.kind === "channel",
        streaming: busy,
        messages: visibleMessages,
        liveAssistantIdx,
      })
    ) {
      return;
    }
    void onRegenerate();
  };

  useEffect(() => {
    const onRegenerateLastReply = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (
        !isRegenerateLastReplyChord({
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          repeat: event.repeat,
        })
      ) {
        return;
      }
      const gate = {
        chatOpen: active != null,
        composing: isComposerComposing(event),
        overlayTextField: overlayTextFieldOwnsRegenerateLastReply(
          focusIsTextField(event.target),
          event.target === composerRef.current,
        ),
        inCard: focusInsideCard(event.target),
        findOpen,
        switchOpen,
        shortcutsOpen,
        renaming: renamingId != null,
        lightboxOpen: lightboxTarget != null,
        menuOpen: contextMenu != null,
        blocked: switcherBlocked || mentionOpen || skillMenuOpen,
      };
      if (regenerateLastReplyBlocked(gate)) return;
      event.preventDefault();
      event.stopPropagation();
      if (!regenerateLastReplyShouldRun({ repeat: event.repeat })) return;
      regenerateLastReplyRef.current();
    };
    window.addEventListener("keydown", onRegenerateLastReply, true);
    return () => {
      window.removeEventListener("keydown", onRegenerateLastReply, true);
    };
  }, [
    active,
    findOpen,
    switchOpen,
    shortcutsOpen,
    renamingId,
    lightboxTarget,
    contextMenu,
    switcherBlocked,
    mentionOpen,
    skillMenuOpen,
  ]);

  // v1.19: Cmd/Ctrl-Shift-S moves focus into the sidebar chat list.
  // The open chat's row is preferred when it is visible. Otherwise
  // the first visible row. The composer does not own the chord and
  // the letter is not inserted. A key repeat is swallowed and does
  // not move focus again. IME keeps it. A row that already has focus
  // keeps the key. Nothing moves when the visible list is empty.
  useEffect(() => {
    const onFocusSidebar = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (
        !isFocusSidebarChord({
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          repeat: event.repeat,
        })
      ) {
        return;
      }
      const gate = {
        chatOpen: active != null,
        inSidebarRow: focusInsideRosterRow(event.target),
        composing: isComposerComposing(event),
        overlayTextField: overlayTextFieldOwnsFocusSidebar(
          focusIsTextField(event.target),
          event.target === composerRef.current,
        ),
        inCard: focusInsideCard(event.target),
        findOpen,
        switchOpen,
        shortcutsOpen,
        renaming: renamingId != null,
        lightboxOpen: lightboxTarget != null,
        menuOpen: contextMenu != null,
        blocked: switcherBlocked || mentionOpen || skillMenuOpen,
      };
      if (focusSidebarBlocked(gate)) return;
      event.preventDefault();
      event.stopPropagation();
      if (!focusSidebarShouldMove({ repeat: event.repeat })) return;
      const ids = jumpChatKey ? jumpChatKey.split("\u0000") : [];
      const target = sidebarFocusTargetId(ids, activeId);
      if (!target) return;
      focusSidebarRow(target);
    };
    window.addEventListener("keydown", onFocusSidebar, true);
    return () => {
      window.removeEventListener("keydown", onFocusSidebar, true);
    };
  }, [
    active,
    activeId,
    jumpChatKey,
    findOpen,
    switchOpen,
    shortcutsOpen,
    renamingId,
    lightboxTarget,
    contextMenu,
    switcherBlocked,
    mentionOpen,
    skillMenuOpen,
  ]);

  // v1.20: Cmd/Ctrl-Shift-O marks every chat read through the same
  // path as the sidebar Mark all as read control, including archived
  // chats and channel handoff dots. Nothing unread is a no-op. The
  // composer does not own the chord and the letter is not inserted.
  // A key repeat is swallowed and does not clear again. IME keeps it.
  // The empty state still clears, because the sidebar control does.
  markAllReadRef.current = () => {
    if (markAllReadIsNoOp(replyUnreadIds, unreadIds)) return;
    onMarkAllRead();
  };

  useEffect(() => {
    const onMarkAllReadKey = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (
        !isMarkAllReadChord({
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          repeat: event.repeat,
        })
      ) {
        return;
      }
      const gate = {
        composing: isComposerComposing(event),
        overlayTextField: overlayTextFieldOwnsMarkAllRead(
          focusIsTextField(event.target),
          event.target === composerRef.current,
        ),
        inCard: focusInsideCard(event.target),
        findOpen,
        switchOpen,
        shortcutsOpen,
        renaming: renamingId != null,
        lightboxOpen: lightboxTarget != null,
        menuOpen: contextMenu != null,
        blocked: switcherBlocked || mentionOpen || skillMenuOpen,
      };
      if (markAllReadKeyBlocked(gate)) return;
      event.preventDefault();
      event.stopPropagation();
      if (!markAllReadShouldClear({ repeat: event.repeat })) return;
      markAllReadRef.current();
    };
    window.addEventListener("keydown", onMarkAllReadKey, true);
    return () => {
      window.removeEventListener("keydown", onMarkAllReadKey, true);
    };
  }, [
    findOpen,
    switchOpen,
    shortcutsOpen,
    renamingId,
    lightboxTarget,
    contextMenu,
    switcherBlocked,
    mentionOpen,
    skillMenuOpen,
  ]);

  // v1.19: once a sidebar row has focus, plain Up / Down walks the
  // visible order and leaves focus on the new row. Alt+Up/Down stays
  // the existing chord and still focuses the composer. The ends stay
  // put. Rename and any other text field inside the row keep arrows.
  const loadSidebarChatRef = useRef<(id: string) => void>(() => {});
  loadSidebarChatRef.current = (id: string) => {
    void loadConversation(id, null, "sidebar");
  };
  useEffect(() => {
    const onSidebarListArrow = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const direction = sidebarListArrowDirection({
        key: event.key,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        composing: isComposerComposing(event),
      });
      if (direction == null) return;
      if (!focusInsideRosterRow(event.target)) return;
      if (focusIsTextField(event.target)) return;
      if (findOpen || switchOpen || shortcutsOpen || renamingId != null) return;
      if (lightboxTarget != null || contextMenu != null) return;
      if (switcherBlocked || mentionOpen || skillMenuOpen) return;
      const current = rosterRowIdFromTarget(event.target);
      if (!current) return;
      event.preventDefault();
      event.stopPropagation();
      const ids = jumpChatKey ? jumpChatKey.split("\u0000") : [];
      const next = adjacentChatId(ids, current, direction);
      if (!next) return;
      loadSidebarChatRef.current(next);
    };
    window.addEventListener("keydown", onSidebarListArrow, true);
    return () => {
      window.removeEventListener("keydown", onSidebarListArrow, true);
    };
  }, [
    jumpChatKey,
    findOpen,
    switchOpen,
    shortcutsOpen,
    renamingId,
    lightboxTarget,
    contextMenu,
    switcherBlocked,
    mentionOpen,
    skillMenuOpen,
  ]);

  useLayoutEffect(() => {
    if (!switchOpen || !activeSwitch) return;
    const row = document.querySelector(
      `[data-switch-id="${CSS.escape(activeSwitch.id)}"]`,
    );
    row?.scrollIntoView({ block: "nearest" });
  }, [switchOpen, switchSafeIndex, activeSwitch?.id, switchQuery]);

  function leaveToEmptyChat() {
    chatOpenHistoryRef.current = noteChatOpenClosed(chatOpenHistoryRef.current);
    moveComposer(null, null);
    previewLive.current = false;
    setFindOpen(false);
    setFindQuery("");
    setFindIndex(0);
    setActiveId(null);
    setThreadId(null);
    setProfileOpen(false);
    setProfileEditing(false);
    setExpandedToolStacks(new Set());
    setComposerError(null);
    setAttachError(null);
    setPendingAttachments((prev) => {
      for (const row of prev) {
        if (row.previewUrl) URL.revokeObjectURL(row.previewUrl);
      }
      return [];
    });
    setMessages([]);
  }

  // v0.96: archive removes the row now. The open chat moves to the
  // next visible row (Alt+Down order) or the empty state.
  function onArchive(id: string) {
    setContextMenu(null);
    if (!id || isChatArchived(archivedChatIds, id)) return;
    if (renamingIdRef.current === id) {
      renamingIdRef.current = null;
      renameCancelRef.current = id;
      setRenamingId(null);
    }
    const visibleIds = [...pinnedAgents, ...restAgents].map((agent) => agent.id);
    const nextOpen = selectionAfterArchive(visibleIds, activeId, id);
    setArchivedChatIds((current) => {
      const next = archiveChat(current, id);
      writeChatArchives(browserArchiveStorage(), next);
      return next;
    });
    if (activeId !== id) return;
    if (nextOpen) {
      void selectAgent(nextOpen);
      return;
    }
    leaveToEmptyChat();
  }

  function onUnarchive(id: string) {
    setContextMenu(null);
    if (!id) return;
    setArchivedChatIds((current) => {
      const next = unarchiveChat(current, id);
      if (
        next.length === current.length &&
        next.every((row, index) => row === current[index])
      ) {
        return current;
      }
      writeChatArchives(browserArchiveStorage(), next);
      return next;
    });
  }

  function renderChatRow(agent: Agent, archivedRow: boolean) {
  const preview = chatPreviews[agent.id];
  const base = chatRowPreview({
    chatId: agent.id,
    openChatId: activeId,
    draft: chatDrafts.current.get(agent.id, null),
    lastMessage: preview,
  });
  const generating = showGeneratingDots(generatingChatId === agent.id);
  const shown = chatListLine({
    preview: base,
    generating,
    chatId: agent.id,
  });
  const stamp = chatActivity[agent.id];
  const timeLabel =
    !generating && stamp
      ? chatListTimeLabel(stamp, activityNow)
      : null;
  const pinned = !archivedRow && isChatPinned(pinnedChatIds, agent.id);
  const muted = isChatMuted(mutedChatIds, agent.id);
  const label = visibleName(agent);
  const renaming = renamingId === agent.id;
  const rowBody = (
    <>
        <Avatar
          src={agent.avatar}
          name={label}
          size={28}
          session={session}
        />
        <span className="row-copy">
          {renaming ? (
            <input
              ref={renameInputRef}
              className="row-name-input"
              aria-label={RENAME_FIELD_LABEL}
              value={renameDraft}
              maxLength={CHAT_NAME_MAX}
              spellCheck={false}
              onChange={(event) => {
                renameDraftRef.current = event.target.value;
                setRenameDraft(event.target.value);
              }}
              onKeyDown={(event) => {
                if (isComposerComposing(event)) return;
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  renameCancelRef.current = agent.id;
                  if (renamingIdRef.current === agent.id) {
                    renamingIdRef.current = null;
                  }
                  setRenamingId(null);
                  return;
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
              onBlur={() => {
                if (renameCancelRef.current === agent.id) {
                  renameCancelRef.current = null;
                  return;
                }
                const draft = renameDraftRef.current;
                if (renamingIdRef.current === agent.id) {
                  renamingIdRef.current = null;
                  setRenamingId(null);
                }
                setChatNames((current) => {
                  const next = commitChatName(
                    current,
                    agent.id,
                    draft,
                    agent.name,
                  );
                  if (next === current) return current;
                  writeChatNames(browserNameStorage(), next);
                  return next;
                });
              }}
              onClick={(event) => event.stopPropagation()}
            />
          ) : (
            <span className="row-name">{label}</span>
          )}
          {rosterSubtitle(agent) ? (
            <span className="row-title">{rosterSubtitle(agent)}</span>
          ) : null}
          {shown || timeLabel || generating ? (
            <span className="row-meta">
              {shown ? (
                <span
                  className="row-preview"
                  aria-hidden={
                    shown.kind === "typing" ? true : undefined
                  }
                >
                  {shown.kind === "draft" ? (
                    <>
                      <span className="row-draft-prefix">
                        {shown.prefix}{" "}
                      </span>
                      {shown.text}
                    </>
                  ) : shown.kind === "typing" ? (
                    <span className="row-typing">{shown.text}</span>
                  ) : (
                    shown.text
                  )}
                </span>
              ) : null}
              {generating ? (
                <span
                  className="row-generating waiting-dots"
                  role="status"
                  aria-label={TYPING_HINT}
                >
                  <span>{WAITING_DOT}</span>
                  <span>{WAITING_DOT}</span>
                  <span>{WAITING_DOT}</span>
                </span>
              ) : timeLabel && stamp ? (
                <time className="row-time" dateTime={stamp}>
                  {timeLabel}
                </time>
              ) : null}
            </span>
          ) : null}
        </span>
        {paintsUnreadAccent(
          muted,
          unreadIds.has(agent.id) || replyUnreadIds.has(agent.id),
        ) ? (
          <span className="unread-dot" aria-label="Unread" />
        ) : muted ? (
          <span className="row-muted-mark" aria-label={MUTED_GLYPH_LABEL}>
            <MuteGlyph />
          </span>
        ) : null}
    </>
  );
  return (
  <li key={agent.id}>
    <div
      className={
        "row" +
        (agent.id === activeId ? " selected" : "") +
        (pinned ? " pinned" : "") +
        (muted ? " muted" : "") +
        (renaming ? " renaming" : "")
      }
      data-roster-row=""
      data-roster-id={agent.id}
      onContextMenu={(e) => onAgentContext(e, agent)}
    >
      {renaming ? (
        <div className="row-hit">{rowBody}</div>
      ) : (
        <button
          type="button"
          className="row-hit"
          onClick={() => void selectAgent(agent.id)}
        >
          {rowBody}
        </button>
      )}
      <button
        type="button"
        className={muted ? "row-mute muted" : "row-mute"}
        aria-label={muted ? UNMUTE_LABEL : MUTE_LABEL}
        aria-pressed={muted}
        onClick={() => onToggleMute(agent.id)}
      >
        <MuteGlyph />
      </button>
      <button
        type="button"
        className="row-rename"
        aria-label={RENAME_LABEL}
        onClick={() => beginRename(agent)}
      >
        <RenameGlyph />
      </button>
      {archivedRow ? (
        <button
          type="button"
          className="row-unarchive"
          aria-label={UNARCHIVE_LABEL}
          onClick={() => onUnarchive(agent.id)}
        >
          <ArchiveGlyph />
        </button>
      ) : (
        <button
          type="button"
          className={pinned ? "row-pin pinned" : "row-pin"}
          aria-label={pinned ? UNPIN_LABEL : PIN_LABEL}
          aria-pressed={pinned}
          onClick={() => onTogglePin(agent.id)}
        >
          <PinGlyph />
        </button>
      )}
    </div>
  </li>
  );
  }


  return (
    <div className={computerOpen ? "app computer-open" : "app computer-collapsed"}>
      <aside className="sidebar">
        <header className="sidebar-head">
          <span className="wordmark">Snorlax-Bot</span>
          <div className="create-wrap">
            <button
              type="button"
              className="icon-btn"
              aria-label="Create"
              disabled={!credsReady}
              onClick={() => setCreateMenuOpen((open) => !open)}
            >
              +
            </button>
            {createMenuOpen ? (
              <div className="menu create-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setCreateMenuOpen(false);
                    void onCreate();
                  }}
                >
                  New agent
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setCreateMenuOpen(false);
                    setChannelNameDraft("New channel");
                    setChannelMemberDraft(
                      agents
                        .filter((a) => a.kind !== "channel")
                        .map((a) => a.id),
                    );
                    setCreateChannelOpen(true);
                  }}
                >
                  New channel
                </button>
              </div>
            ) : null}
          </div>
        </header>
        <div className="roster-filter" role="group" aria-label={FILTER_GROUP_LABEL}>
          <button
            type="button"
            aria-pressed={chatListFilter !== FILTER_UNREAD}
            onClick={() => chooseChatListFilter(FILTER_ALL)}
          >
            {FILTER_ALL_LABEL}
          </button>
          <button
            type="button"
            aria-pressed={chatListFilter === FILTER_UNREAD}
            onClick={() => chooseChatListFilter(FILTER_UNREAD)}
          >
            {FILTER_UNREAD_LABEL}
          </button>
        </div>
        {anyChatUnread(replyUnreadIds, unreadIds) ? (
          <div className="roster-mark-all">
            <button type="button" onClick={onMarkAllRead}>
              {MARK_ALL_READ_LABEL}
            </button>
          </div>
        ) : null}
        <ul className="roster">
          {showUnreadEmpty(chatListFilter, unreadRosterCount) ? (
            <li className="roster-empty">{UNREAD_EMPTY_LABEL}</li>
          ) : null}
          {rosterHeaders.includes("pinned") ? (
            <li className="roster-group">{PINNED_GROUP_LABEL}</li>
          ) : null}
          {pinnedAgents.map((agent) => renderChatRow(agent, false))}
          {rosterHeaders.includes("chats") ? (
            <li className="roster-group">{CHATS_SECTION_LABEL}</li>
          ) : null}
          {restAgents.map((agent) => renderChatRow(agent, false))}
        </ul>
        {archivedAgents.length > 0 ? (
          <div className="roster-archive">
            <button
              type="button"
              className="roster-archive-toggle"
              aria-expanded={archiveOpen}
              aria-label={archivedSectionLabel(archivedAgents.length)}
              onClick={() => setArchiveOpen((open) => !open)}
            >
              {archivedSectionLabel(archivedAgents.length)}
            </button>
            {archiveOpen ? (
              <ul className="roster-archive-list">
                {archivedAgents.map((agent) => renderChatRow(agent, true))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <button
          type="button"
          className="account"
          onClick={() => setSettingsOpen(true)}
        >
          <Avatar src={null} name="Local" size={22} session={null} />
          <span>Local</span>
        </button>
      </aside>

      <main
        className="chat"
        onDragEnter={onChatDragOver}
        onDragOver={onChatDragOver}
        onDragLeave={onChatDragLeave}
        onDrop={(event) => void onChatDrop(event)}
      >
        <header className="chat-head">
          {active ? (
            <>
              {active.kind === "channel" && threadId ? (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Back to timeline"
                  onClick={() => void loadConversation(active.id, null)}
                >
                  ←
                </button>
              ) : null}
              <button type="button" className="chat-who" onClick={openInfo}>
                <Avatar
                  src={active.avatar}
                  name={activeLabel}
                  size={24}
                  session={session}
                />
                <span>{activeLabel}</span>
                {copiedFeedbackLabel(transcriptCopiedId === active.id) ? (
                  <span className="message-copied" aria-live="polite">
                    {copiedFeedbackLabel(transcriptCopiedId === active.id)}
                  </span>
                ) : null}
              </button>
            </>
          ) : (
            <span className="chat-who muted">Snorlax-Bot</span>
          )}
          {!computerOpen ? (
            <ComputerSeamButton
              open={false}
              onClick={() => setComputerOpen(true)}
            />
          ) : null}
        </header>

        <div className="transcript-col">
        {findOpen ? (
          <div className="find-bar-wrap">
            <div className="find-bar" role="search">
              <input
                ref={findInputRef}
                aria-label={FIND_INPUT_LABEL}
                placeholder={FIND_PLACEHOLDER}
                value={findQuery}
                onChange={(event) => {
                  setFindQuery(event.target.value);
                  setFindIndex(0);
                }}
              />
              <span className="find-count" aria-live="polite">
                {findCountLabel(findSafeIndex, findHitList.length)}
              </span>
              <button
                type="button"
                className="find-nav"
                aria-label={FIND_PREV_LABEL}
                onClick={() =>
                  setFindIndex((current) => {
                    const total = findHitList.length;
                    const base =
                      total === 0 ? -1 : Math.min(current, total - 1);
                    return stepFindIndex(base, total, -1);
                  })
                }
              >
                ↑
              </button>
              <button
                type="button"
                className="find-nav"
                aria-label={FIND_NEXT_LABEL}
                onClick={() =>
                  setFindIndex((current) => {
                    const total = findHitList.length;
                    const base =
                      total === 0 ? -1 : Math.min(current, total - 1);
                    return stepFindIndex(base, total, 1);
                  })
                }
              >
                ↓
              </button>
              <button
                type="button"
                className="find-nav"
                aria-label={FIND_CLOSE_LABEL}
                onClick={closeFind}
              >
                ×
              </button>
            </div>
          </div>
        ) : null}
        <div
          className="transcript"
          ref={scroller}
          data-transcript-scale={transcriptTextPercent}
          style={{ ["--transcript-scale" as string]: transcriptScaleFactor(transcriptTextPercent) }}
          onScroll={onTranscriptScroll}
        >
          <FindQueryProvider query={findQueryShown}>
          <div className="transcript-inner">
            {!credsReady ? (
              <p className="transcript-line">{MISSING_CREDS}</p>
            ) : loadError ? (
              <p className="transcript-line error">{loadError}</p>
            ) : (
              dayGroups(dayLabels).map((group) => (
                <section
                  className="day-group"
                  key={visibleMessages[group.start]?.id ?? group.start}
                  data-day-label={group.label ?? undefined}
                >
                {visibleMessages.slice(group.start, group.end).map((message, offset) => {
                const index = group.start + offset;
                const toolStack = stackForMessageIndex(toolStacks, index);
                const toolStackIsCollapsed = toolStack
                  ? stackCollapsed(
                      expandedToolStacks,
                      toolStack.id,
                      toolStack.items.length,
                    )
                  : false;
                if (
                  hidePersistedTool(
                    toolStack,
                    index,
                    toolStackIsCollapsed,
                  )
                ) {
                  return null;
                }
                const dayLabel = dayLabels[index];
                const prev = visibleMessages[index - 1];
                const mine = isUserSender(message.senderId, message.role);
                const sameSender =
                  prev != null &&
                  !message.routineName &&
                  senderKey(prev.senderId, prev.role) ===
                    senderKey(message.senderId, message.role);
                const knownNames = [
                  ...agents.filter((a) => a.kind !== "channel").map((a) => a.name),
                  "everyone",
                ];
                const jump = visibleJump(message, agents);
                const completed = !(busy && index === liveAssistantIdx);
                const bubbleStamp = bubbleTimeLabel(
                  message.createdAt,
                  !completed,
                );
                const replyBody = displayBody(
                  message.content,
                  message.senderName,
                );
                const linked = resolveReferenceLinks(replyBody, completed);
                const footnoted = extractFootnotes(linked, completed);
                const leftBubbles = footnoted.notes.length
                  ? splitAssistantBubbles(footnoted.text, completed)
                  : splitAssistantBubbles(linked, completed);
                const quoteLoadedIds = new Set(messages.map((row) => row.id));
                const quoteTargets =
                  quoteJumpEpoch >= 0 && active && mine
                    ? quoteJumps.current.targets(
                        active.id,
                        threadId,
                        message.content,
                        quoteLoadedIds,
                      )
                    : [];
                const quoteParts =
                  quoteTargets.length > 0 && findRowActive(message.id) !== "true"
                    ? quoteJumpParts(message.content, quoteTargets)
                    : null;
                const viewingChannel = active?.kind === "channel";
                const timelineHandoff =
                  viewingChannel && !threadId && isHandoffRoot(message);
                const threadRoot =
                  viewingChannel &&
                  threadId &&
                  isHandoffRoot(message) &&
                  !message.replyTo;
                if (timelineHandoff && active) {
                  return (
                    <Fragment key={message.id}>
                    {dayLabel ? (
                      <>
                        <span
                          className="day-reading-anchor"
                          data-reading-id={`day:${message.id}`}
                          aria-hidden="true"
                        />
                        <p
                          className="day-separator"
                          role="heading"
                          aria-level={2}
                        >
                          {dayLabel}
                        </p>
                      </>
                    ) : null}
                    <NewMessagesDivider show={message.id === dividerAnchorId} />
                    <button
                      type="button"
                      className="handoff-row"
                      data-reading-id={message.id}
                      onClick={() => void openJump(active.id, message.id)}
                    >
                      <Avatar
                        src={
                          message.senderAvatar ??
                          agents.find((a) => a.id === message.senderId)?.avatar ??
                          null
                        }
                        name={message.senderName || "Agent"}
                        size={20}
                        session={session}
                      />
                      <span className="handoff-copy">
                        <span className="handoff-name">
                          {message.senderName || "Agent"}
                        </span>
                        <span className="handoff-from">
                          {fromLabel(message.senderName || "Agent")}
                        </span>
                        <span
                          className="handoff-ask"
                          data-find-row={message.id}
                          data-find-active-row={findRowActive(message.id)}
                        >
                          <FindText
                            text={message.userAsk || message.content}
                            active={rangeFor(message.id)}
                          />
                        </span>
                        <span className="handoff-replies">
                          {repliesLabel(message.replyCount ?? 0)}
                        </span>
                      </span>
                    </button>
                    </Fragment>
                  );
                }
                return (
                  <Fragment key={message.id}>
                  {dayLabel ? (
                    <>
                      <span
                        className="day-reading-anchor"
                        data-reading-id={`day:${message.id}`}
                        aria-hidden="true"
                      />
                      <p
                        className="day-separator"
                        role="heading"
                        aria-level={2}
                      >
                        {dayLabel}
                      </p>
                    </>
                  ) : null}
                  <NewMessagesDivider show={message.id === dividerAnchorId} />
                  <article
                    className={`turn ${mine ? "right" : "left"}${sameSender && !threadRoot ? " same-sender" : " new-sender"}`}
                    data-reading-id={message.id}
                  >
                    {!mine && !sameSender ? (
                      <div className="sender-row">
                        <Avatar
                          src={
                            message.senderAvatar ??
                            agents.find((a) => a.id === message.senderId)?.avatar ??
                            null
                          }
                          name={message.senderName || "Agent"}
                          size={20}
                          session={session}
                        />
                        <span className="sender-meta">
                          <span className="sender-name">
                            {message.senderName || "Agent"}
                          </span>
                          {message.routineName ? (
                            <span className="routine-kicker">
                              {message.routineName}
                            </span>
                          ) : null}
                        </span>
                      </div>
                    ) : null}
                    {!mine && index === liveAssistantIdx && showLiveChrome
                      ? (
                          <>
                            {livePaint.header ? (
                              <ToolStackHeader
                                count={livePaint.header.items.length}
                                expanded={expandedToolStacks.has(
                                  livePaint.header.id,
                                )}
                                onToggle={() =>
                                  setExpandedToolStacks((prev) =>
                                    toggleExpanded(prev, livePaint.header!.id),
                                  )
                                }
                              />
                            ) : null}
                            {livePaint.lines.map((trace) => (
                              <p
                                key={trace.id}
                                className="tool-trace"
                                data-find-row={`live:${trace.id}`}
                                data-find-active-row={findRowActive(
                                  `live:${trace.id}`,
                                )}
                              >
                                <FindText
                                  text={trace.summary}
                                  active={rangeFor(`live:${trace.id}`)}
                                />
                              </p>
                            ))}
                          </>
                        )
                      : null}
                    {threadRoot ? (
                      <div className="handoff-card">
                        <p className="handoff-from">
                          {fromLabel(message.senderName || "Agent")}
                        </p>
                        <pre
                          className="handoff-card-ask"
                          data-find-row={message.id}
                          data-find-active-row={findRowActive(message.id)}
                        >
                          <FindText
                            text={message.userAsk || message.content}
                            active={rangeFor(message.id)}
                          />
                        </pre>
                        {message.brief ? (
                          <details className="handoff-context">
                            <summary>Context</summary>
                            <pre>{message.brief}</pre>
                          </details>
                        ) : null}
                      </div>
                    ) : isToolLine(message) ? (
                      <>
                        {showStackHeader(toolStack, index) && toolStack ? (
                          <ToolStackHeader
                            count={toolStack.items.length}
                            expanded={!toolStackIsCollapsed}
                            onToggle={() =>
                              setExpandedToolStacks((prev) =>
                                toggleExpanded(prev, toolStack.id),
                              )
                            }
                          />
                        ) : null}
                        {toolStackIsCollapsed &&
                        showStackHeader(toolStack, index) ? null : (
                          <p
                            className="tool-trace"
                            data-find-row={message.id}
                            data-find-active-row={findRowActive(message.id)}
                          >
                            <FindText
                              text={message.content}
                              active={rangeFor(message.id)}
                            />
                          </p>
                        )}
                      </>
                    ) : isWidget(message) && message.widget ? (
                      <WidgetCard
                        messageId={message.id}
                        widget={message.widget}
                        status={message.widgetStatus}
                        values={message.widgetValues}
                        disabled={busy}
                        onReply={(id, values) => void answerWidget(id, values)}
                        onDismiss={(id) => void dismissWidget(id)}
                      />
                    ) : isConnect(message) && message.connect ? (
                      <ConnectCard
                        messageId={message.id}
                        card={message.connect}
                        status={message.connectStatus}
                        disabled={busy}
                        onConnect={(id, pluginId) => void answerConnect(id, pluginId)}
                        onDismiss={(id) => void dismissConnect(id)}
                      />
                    ) : isApprove(message) && message.approve ? (
                      <ApproveCard
                        messageId={message.id}
                        card={message.approve}
                        status={message.approveStatus}
                        disabled={busy}
                        onApprove={(id) => void answerApprove(id)}
                        onDeny={(id) => void denyApprove(id)}
                      />
                    ) : mine ? (
                      <>
                      <div
                        className="bubble user"
                        data-user-jump={
                          isUserJumpMessage(message) ? message.id : undefined
                        }
                        data-user-jump-highlight={
                          userJumpHighlightId === message.id ? "true" : undefined
                        }
                        data-quote-jump={
                          quoteTargets.length > 0 ? message.id : undefined
                        }
                        data-quote-jump-target={message.id}
                        data-quote-jump-highlight={
                          quoteJumpHighlightId === message.id ? "true" : undefined
                        }
                        data-failed={
                          failedSends.some((row) => row.id === message.id)
                            ? "true"
                            : undefined
                        }
                        data-find-row={message.id}
                        data-find-active-row={findRowActive(message.id)}
                        tabIndex={bubbleStamp ? 0 : undefined}
                      >
                        <BubbleStamp label={bubbleStamp} />
                        <MessageAttachmentChrome
                          message={message}
                          session={session}
                          onOpenFile={openAttachedFile}
                          onOpenImage={openImageLightbox}
                        />
                        {message.content ? (
                          quoteParts ? (
                            <div className="user-quote-text">
                              {quoteParts.map((part, partIndex) =>
                                part.kind === "quote" ? (
                                  <button
                                    key={`${message.id}-quote-${partIndex}`}
                                    type="button"
                                    className="quote-jump"
                                    aria-label={QUOTE_JUMP_ACTION}
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => jumpToQuotedMessage(part.sourceId)}
                                  >
                                    {part.text}
                                  </button>
                                ) : (
                                  <pre key={`${message.id}-text-${partIndex}`}>
                                    <span
                                      data-quote={quoteRootAttr({
                                        kind: message.kind,
                                        fromUser: true,
                                        completed: true,
                                      })}
                                      data-quote-id={message.id}
                                    >
                                      <MentionText
                                        text={part.text}
                                        knownNames={knownNames}
                                        links
                                      />
                                    </span>
                                  </pre>
                                ),
                              )}
                            </div>
                          ) : (
                          <pre>
                            <span
                              data-quote={quoteRootAttr({
                                kind: message.kind,
                                fromUser: true,
                                completed: true,
                              })}
                              data-quote-id={message.id}
                            >
                            <MentionText
                              text={displayBody(
                                message.content,
                                message.senderName,
                              )}
                              knownNames={knownNames}
                              links
                              activeRange={rangeFor(message.id)}
                            />
                            </span>
                          </pre>
                          )
                        ) : null}
                      </div>
                      {showUserCopy({
                        message,
                        pending: userCopyPending({
                          id: message.id,
                          busy,
                          failed: failedSends.some((row) => row.id === message.id),
                        }),
                      }) ? (
                        <UserMessageCopy content={message.content} />
                      ) : null}
                    </>
                    ) : (
                      <div className="assistant-md">
                        <MessageAttachmentChrome
                          message={message}
                          session={session}
                          onOpenFile={openAttachedFile}
                          onOpenImage={openImageLightbox}
                        />
                        {leftBubbles.length ? (
                          <div className="assistant-bubbles">
                            {leftBubbles.map((part, bubbleIdx) => {
                              const showCaret =
                                bubbleIdx === leftBubbles.length - 1 &&
                                showStreamingCaret({
                                  busy,
                                  completed,
                                  hasFirstToken:
                                    (message.content ?? "").length > 0,
                                  kind: message.kind,
                                  isUser: mine,
                                });
                              const bubbleRowId = `${message.id}:${bubbleIdx}`;
                              return (
                                <div
                                  key={`${message.id}-${bubbleIdx}`}
                                  className={
                                    assistantBubbleWide(part, completed)
                                      ? "bubble agent wide"
                                      : "bubble agent"
                                  }
                                  {...quoteJumpBubbleProps(message.id, quoteJumpHighlightId)}
                                  data-find-row={bubbleRowId}
                                  data-find-active-row={findRowActive(bubbleRowId)}
                                  tabIndex={bubbleStamp ? 0 : undefined}
                                >
                                  <BubbleStamp label={bubbleStamp} />
                                  <LongMessageBody
                                    completed={completed}
                                    text={part} quoteId={message.id}
                                    quote={quoteRootAttr({ kind: message.kind, fromUser: false, completed })}
                                    activeFind={
                                      findRowActive(bubbleRowId) === "true"
                                    }
                                  >
                                    {shouldRenderMarkdown({ completed }) ? (
                                      <MarkdownBody
                                        text={part}
                                        knownNames={knownNames}
                                        completed={completed}
                                        wrapScope={bubbleRowId}
                                        footnoteScope={message.id}
                                        footnotes={bubbleIdx===leftBubbles.length-1?footnoted.notes:[]}
                                      />
                                    ) : (
                                      <pre className="assistant-plain">
                                        <HttpsText
                                          text={part}
                                          active={rangeFor(bubbleRowId)}
                                          streaming
                                        />
                                        {showCaret ? (
                                          <span
                                            className="streaming-caret"
                                            aria-hidden="true"
                                          />
                                        ) : null}
                                      </pre>
                                    )}
                                  </LongMessageBody>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                        {showAssistantCopy({
                          message,
                          completed,
                        }) ? (
                          <MessageActions
                            content={message.content}
                            speaking={speakingId === message.id}
                            showRegenerate={showAssistantRegenerate({
                              message,
                              completed,
                              isLatest: index === lastLeftIdx,
                              isChannel: active?.kind === "channel",
                              streaming: busy,
                            })}
                            disabled={busy}
                            shortcutCopied={shortcutCopiedId === message.id}
                            onSpeak={() => void toggleSpeak(message.id, message.content)}
                            onRegenerate={() => void onRegenerate()}
                          />
                        ) : null}
                      </div>
                    )}
                    {mine && failedSends.some((row) => row.id === message.id) ? (
                      <p className="failed-send" role="status">
                        <span>{FAILED_SEND_COULDNT}</span>
                        <span aria-hidden="true"> · </span>
                        <button
                          type="button"
                          className="failed-send-retry"
                          disabled={retryBlocked(busy)}
                          onClick={() => void retryFailedSend(message.id)}
                        >
                          {FAILED_SEND_RETRY}
                        </button>
                        <span aria-hidden="true"> · </span>
                        <button
                          type="button"
                          className="failed-send-remove"
                          aria-label={FAILED_SEND_REMOVE}
                          onClick={() => dismissFailed(message.id)}
                        >
                          {FAILED_SEND_REMOVE}
                        </button>
                      </p>
                    ) : null}
                    {mine && jump ? (
                      <button
                        type="button"
                        className="jump-line"
                        onClick={() => void openJump(jump.channelId, jump.threadId)}
                      >
                        Also in{" "}
                        <span className="jump-name">
                          {jumpChannelName(jump.channelId, agents)}
                        </span>
                      </button>
                    ) : null}
                  </article>
                  </Fragment>
                );
              })}
                </section>
              ))
            )}
            {showStandaloneTraces && showLiveChrome ? (
              <article className="turn left new-sender">
                <div className="sender-row">
                  <Avatar
                    src={
                      agents.find(
                        (a) =>
                          a.id ===
                          (liveTraces[0]?.senderId || active?.id),
                      )?.avatar ??
                      active?.avatar ??
                      null
                    }
                    name={
                      liveTraces[0]?.senderName || active?.name || "Agent"
                    }
                    size={20}
                    session={session}
                  />
                  <span className="sender-name">
                    {liveTraces[0]?.senderName || active?.name || "Agent"}
                  </span>
                </div>
                {livePaint.header ? (
                  <ToolStackHeader
                    count={livePaint.header.items.length}
                    expanded={expandedToolStacks.has(livePaint.header.id)}
                    onToggle={() =>
                      setExpandedToolStacks((prev) =>
                        toggleExpanded(prev, livePaint.header!.id),
                      )
                    }
                  />
                ) : null}
                {livePaint.lines.map((trace) => (
                  <p
                    key={trace.id}
                    className="tool-trace"
                    data-find-row={`live:${trace.id}`}
                    data-find-active-row={findRowActive(`live:${trace.id}`)}
                  >
                    <FindText
                      text={trace.summary}
                      active={rangeFor(`live:${trace.id}`)}
                    />
                  </p>
                ))}
              </article>
            ) : null}
            {showWaiting ? (
              <article
                className="turn left new-sender"
                aria-live="polite"
                aria-label={WAITING_LABEL}
              >
                <div className="sender-row">
                  <Avatar
                    src={active?.avatar ?? null}
                    name={active?.name || "Agent"}
                    size={20}
                    session={session}
                  />
                  <span className="sender-name">
                    {active?.name || "Agent"}
                  </span>
                </div>
                <p className="waiting" role="status">
                  <span className="waiting-dots">
                    <span>{WAITING_DOT}</span>
                    <span>{WAITING_DOT}</span>
                    <span>{WAITING_DOT}</span>
                  </span>
                </p>
              </article>
            ) : null}
          </div>
          </FindQueryProvider>
        </div>
        {(shouldOfferStop(busy) || showJump || jumpPaint.mounted) ? (
          <div className="transcript-chips">
            {shouldOfferStop(busy) ? (
              <button
                type="button"
                className="stop-generating"
                onClick={onStopGenerating}
              >
                {STOP_LABEL}
              </button>
            ) : null}
            {showJump || jumpPaint.mounted ? (
              <button
                type="button"
                className="jump-latest"
                data-shown={jumpPaint.shown ? "true" : "false"}
                onClick={onJumpLatest}
              >
                {JUMP_TO_LATEST_LABEL}
              </button>
            ) : null}
          </div>
        ) : null}
        <LinkStatusPill />
        </div>

        <footer
          ref={composerRootRef}
          tabIndex={-1}
          className="composer"
          aria-hidden={takeoverOpen || undefined}
          onPaste={(event) => void onComposerPaste(event)}
          onKeyDown={onComposerBarKey}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              composerRootRef.current?.focus();
            }
          }}
        >
          {pendingAttachments.length ? (
            <div className="pending-chips">
              {pendingAttachments.map((row) =>
                row.kind === "image" ? (
                  <div key={row.id} className="pending-thumb">
                    <img src={row.previewUrl} alt={row.name} />
                    <button
                      type="button"
                      className="pending-x"
                      aria-label={`Remove ${row.name}`}
                      onClick={() => removePending(row.id)}
                    >
                      ×
                    </button>
                  </div>
                ) : row.kind === "video" ? (
                  <PendingVideoThumb
                    key={row.id}
                    row={row}
                    onRemove={() => removePending(row.id)}
                  />
                ) : (
                  <div key={row.id} className="pending-file">
                    <span className="pending-file-name">{row.name}</span>
                    <span className="pending-file-size">
                      {formatAttachmentSize(row.size)}
                    </span>
                    <button
                      type="button"
                      className="pending-x"
                      aria-label={`Remove ${row.name}`}
                      onClick={() => removePending(row.id)}
                    >
                      ×
                    </button>
                  </div>
                ),
              )}
            </div>
          ) : null}
          {attachError ? <p className="attach-error">{attachError}</p> : null}
          {skillMenuOpen ? (
            <ul className="typeahead skills" role="listbox" ref={skillTypeaheadRef}>
              {skillCandidates.map((candidate, index) => (
                <li key={candidate.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === skillIndex}
                    className={index === skillIndex ? "on" : ""}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pickSkill(candidate);
                    }}
                  >
                    <span>{candidate.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : mentionOpen && mentionCandidates.length > 0 ? (
            <ul className="typeahead" role="listbox">
              {mentionCandidates.map((candidate, index) => (
                <li key={candidate.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === mentionIndex}
                    className={index === mentionIndex ? "on" : ""}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pickMention(candidate);
                    }}
                  >
                    <Avatar
                      src={candidate.avatar}
                      name={candidate.name}
                      size={20}
                      session={session}
                    />
                    <span>{candidate.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {openQueued.length > 0 ? (
            <ul className="queued-follow-ups" aria-label="Queued messages">
              {openQueued.map((item) => (
                <li key={item.id} className="queued-follow-up">
                  <span className="queued-label">Queued</span>
                  <input
                    className="queued-text"
                    aria-label="Queued message"
                    value={item.text}
                    onChange={(event) => editQueuedItem(item.id, event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        event.stopPropagation();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="queued-remove"
                    aria-label="Remove queued message"
                    onClick={() => removeQueuedItem(item.id)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="composer-bar">
            <button
              type="button"
              className="icon-btn"
              aria-label="Attach file"
              disabled={composerDisabled}
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip />
            </button>
            <input
              ref={fileRef}
              type="file"
              hidden
              onChange={(e) => void onPickFile(e.target.files?.[0])}
            />
            <div className="composer-field">
              <div className="composer-highlight" aria-hidden ref={highlightRef}>
                <MentionText
                  text={draft}
                  knownNames={composerChipNames}
                  chips
                />
              </div>
              <textarea
                ref={composerRef}
                value={draft}
                rows={1}
                disabled={fieldDisabled}
                readOnly={takeoverOpen}
                tabIndex={takeoverOpen ? -1 : undefined}
                placeholder={
                  active ? `Message ${activeLabel}` : "Message"
                }
                onChange={(e) => {
                  const value = e.target.value;
                  draftRef.current = value;
                  setDraft(value);
                  setRecallArmed((armed) => recallArmedAfterEdit(value, armed));
                  syncComposerTriggers(value, e.target.selectionStart);
                  resizeComposer();
                  syncComposerScroll();
                }}
                onScroll={syncComposerScroll}
                onKeyUp={(e) =>
                  syncComposerTriggers(
                    e.currentTarget.value,
                    e.currentTarget.selectionStart,
                  )
                }
                onClick={(e) =>
                  syncComposerTriggers(
                    e.currentTarget.value,
                    e.currentTarget.selectionStart,
                  )
                }
                onKeyDown={onComposerKey}
              />
            </div>
            <button
              type="button"
              className={`icon-btn dictation${dictation === "recording" ? " recording" : ""}${dictation === "processing" ? " processing" : ""}`}
              aria-label={dictationLabel(dictation)}
              aria-pressed={dictationPressed(dictation)}
              aria-busy={dictationBusy(dictation) || undefined}
              disabled={composerDisabled || dictation === "processing"}
              onClick={() => onMicClick()}
            >
              <MicIcon />
              {dictation === "recording" ? (
                <span className="dictation-dot" aria-hidden />
              ) : null}
            </button>
            <button
              type="button"
              className="send"
              aria-label="Send"
              disabled={
                queueNow
                  ? false
                  : sendMutedWhileGenerating(busy) ||
                    composerDisabled ||
                    sendBlocked ||
                    !active ||
                    Boolean(attachError) ||
                    (!draft.trim() && pendingAttachments.length === 0)
              }
              onClick={() => {
                if (queueNow) queueFollowUp();
                else void onSend();
              }}
            >
              <SendIcon />
            </button>
          </div>
          {statusHint ? (
            <p className="composer-hint" role="status">
              {statusHint}
            </p>
          ) : composerError ? (
            <p className="error under">{composerError}</p>
          ) : null}
        </footer>

        {profileOpen && active ? (
        <aside
          className="profile"
          role="dialog"
          aria-label={
            infoPaneKind(active) === "channel" ? "Channel" : "Agent"
          }
        >
          <header>
            <h2>
              {infoPaneKind(active) === "channel" ? "Channel" : "Agent"}
            </h2>
            <div className="profile-actions">
              {(infoPaneKind(active) === "agent" || canEditChannel(active)) &&
              !profileEditing ? (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Edit"
                  onClick={() => setProfileEditing(true)}
                >
                  <GearIcon />
                </button>
              ) : null}
              <button
                type="button"
                className="icon-btn"
                aria-label="Close"
                onClick={() => {
                  setProfileOpen(false);
                  setProfileEditing(false);
                }}
              >
                ×
              </button>
            </div>
          </header>
          {infoPaneKind(active) === "channel" ? (
            profileEditing && canEditChannel(active) ? (
              <form className="profile-form" onSubmit={saveProfile}>
                <label>
                  Name
                  <input
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                  />
                </label>
                <MemberPicker
                  agents={agents}
                  selectedIds={profileMemberIds}
                  session={session}
                  onToggle={(id) =>
                    setProfileMemberIds((prev) =>
                      prev.includes(id)
                        ? prev.filter((item) => item !== id)
                        : [...prev, id],
                    )
                  }
                />
                <label className="shared-project">
                  <input
                    type="checkbox"
                    checked={profileSharedProject}
                    onChange={(e) => setProfileSharedProject(e.target.checked)}
                  />
                  <span>
                    <strong>Shared project</strong>
                    <span className="shared-project-hint">
                      {SHARED_PROJECT_HINT}
                    </span>
                  </span>
                </label>
                <button type="submit" className="primary" disabled={profileSaving}>
                  Save
                </button>
              </form>
            ) : (
            <div>
              <div className="info-identity">
                <p className="info-name">{active.name}</p>
                <p className="info-muted">Channel</p>
              </div>
              {canToggleSharedProject(active) ? (
                <label className="shared-project">
                  <input
                    type="checkbox"
                    checked={profileSharedProject}
                    onChange={(e) => void setSharedProject(e.target.checked)}
                  />
                  <span>
                    <strong>Shared project</strong>
                    <span className="shared-project-hint">
                      {SHARED_PROJECT_HINT}
                    </span>
                  </span>
                </label>
              ) : null}
              <div className="info-members">
                {channelMembers(active.memberIds, agents).map((member) => (
                  <div className="info-member" key={member.id}>
                    <Avatar
                      src={member.avatar}
                      name={member.name}
                      size={28}
                      session={session}
                    />
                    <span className="info-member-copy">
                      <strong>{member.name}</strong>
                      {member.title ? <span>{member.title}</span> : null}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            )
          ) : profileEditing ? (
            <form className="profile-form" onSubmit={saveProfile}>
              <button
                type="button"
                className="avatar-edit"
                onClick={() => avatarFileRef.current?.click()}
              >
                <Avatar
                  src={profileAvatar}
                  name={profileName || active.name}
                  size={72}
                  session={session}
                />
                <span>Change</span>
              </button>
              {profileAvatar ? (
                <button
                  type="button"
                  className="text-btn"
                  onClick={() => setProfileAvatar(null)}
                >
                  Remove avatar
                </button>
              ) : null}
              <input
                ref={avatarFileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => void onPickAvatar(e.target.files?.[0])}
              />
              <label>
                Name
                <input
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                />
              </label>
              <label>
                Title
                <input
                  value={profileTitle}
                  onChange={(e) => setProfileTitle(e.target.value)}
                />
              </label>
              <label>
                Description
                <textarea
                  rows={4}
                  value={profileDescription}
                  onChange={(e) => setProfileDescription(e.target.value)}
                />
              </label>
              <button type="submit" className="primary" disabled={profileSaving}>
                Save
              </button>
            </form>
          ) : (
            <>
            <div className="info-identity">
              <Avatar
                src={active.avatar}
                name={active.name}
                size={72}
                session={session}
              />
              <p className="info-name">{active.name}</p>
              {active.title ? (
                <p className="info-muted">{active.title}</p>
              ) : null}
              {active.description ? (
                <p className="info-muted">{active.description}</p>
              ) : null}
            </div>
            <AgentComputer
              session={session}
              agentId={active.id}
              open={profileOpen && !profileEditing}
              onOpen={() => void openTakeover()}
            />
            <section className="info-routines" aria-label="Routines">
              <div className="info-routines-head">
                <p className="info-routines-header">Routines</p>
                <button
                  type="button"
                  className="info-routine-add"
                  onClick={openRoutineAdd}
                  disabled={!session}
                >
                  Add
                </button>
              </div>
              {visiblePaneRoutines(routines, plugins).length === 0 ? (
                <p className="info-routine-empty">{EMPTY_ROUTINES}</p>
              ) : (
                visiblePaneRoutines(routines, plugins).map((routine) => (
                  <AgentRoutineRow
                    key={routine.id}
                    routine={routine}
                    onToggle={(row, enabled) => void toggleRoutine(row, enabled)}
                    onRemove={(row) => setPendingRoutineRemove(row)}
                  />
                ))
              )}
            </section>
            <section className="info-skills" aria-label="Skills">
              <div className="info-skills-head">
                <p className="info-skills-header">Skills</p>
                <button
                  type="button"
                  className="info-skill-add"
                  onClick={openSkillAdd}
                  disabled={!session}
                >
                  Add
                </button>
              </div>
              {routineSkills.length === 0 ? (
                <p className="info-skill-empty">{NO_SKILLS_YET}</p>
              ) : (
                routineSkills.map((skill) => (
                  <AgentSkillRow
                    key={skill.id}
                    skill={skill}
                    onEdit={(row) => void openSkillEdit(row)}
                    onRemove={(row) => setPendingSkillRemove(row)}
                  />
                ))
              )}
            </section>
            <section className="info-memory" aria-label="Memory">
              <div className="info-memory-head">
                <p className="info-memory-header">Memory</p>
              </div>
              {memories.length === 0 ? (
                <p className="info-memory-empty">{EMPTY_MEMORY}</p>
              ) : (
                memories.map((fact) => (
                  <AgentMemoryRow
                    key={fact}
                    fact={fact}
                    onRemove={(row) => setPendingMemoryRemove(row)}
                  />
                ))
              )}
            </section>
            </>
          )}
        </aside>
      ) : null}
      {takeoverOpen && session && active && takeoverId === active.id ? (
        <ComputerTakeover
          session={session}
          agent={active}
          avatar={
            <Avatar
              src={active.avatar}
              name={active.name}
              size={24}
              session={session}
            />
          }
          onDone={() => void closeTakeover()}
        />
      ) : null}
        {dropTarget ? (
          <div className="chat-drop-overlay" role="status">
            {DROP_FILES_LABEL}
          </div>
        ) : null}
        <QuoteSelectionButton
          disabled={takeoverOpen}
          onQuote={quoteIntoComposer}
        />
      </main>

      <ComputerPane
        key={active?.id ?? "none"}
        session={session}
        conversation={active}
        refreshKey={workspaceTick}
        onCollapse={() => setComputerOpen(false)}
      />

      {settingsOpen ? (
        <div className="modal-backdrop" onClick={closeSettings}>
          <div
            className="modal"
            role="dialog"
            aria-label="Settings"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <div>
                <h2>Settings</h2>
                <p className="section-label">General</p>
              </div>
              <button
                type="button"
                className="icon-btn"
                aria-label="Close"
                onClick={closeSettings}
              >
                ×
              </button>
            </header>
            <div className="settings">
              <fieldset>
                <legend>Theme</legend>
                <div className="segmented" role="radiogroup" aria-label="Theme">
                  {(["system", "light", "dark"] as ThemePref[]).map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={themePref === value}
                      className={themePref === value ? "on" : ""}
                      onClick={() => setThemePref(value)}
                    >
                      {value[0].toUpperCase() + value.slice(1)}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend>Accent</legend>
                <div className="swatches">
                  {ACCENT_SWATCHES.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={accent === color ? "swatch on" : "swatch"}
                      style={{ background: color }}
                      aria-label={`Accent ${color}`}
                      onClick={() => setAccent(color)}
                    />
                  ))}
                  <input
                    type="color"
                    className="swatch-custom"
                    value={accent}
                    aria-label="Custom accent"
                    onChange={(e) => setAccent(e.target.value)}
                  />
                </div>
              </fieldset>
              <label>
                Runtime URL
                <input
                  value={urlInput}
                  placeholder={URL_PLACEHOLDER}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(e) => setUrlInput(e.target.value)}
                />
                <span className="section-label">
                  Mac-local: http://127.0.0.1:8787 or http://localhost:8787.
                  Spark: LAN hostname. Never the model port.
                </span>
              </label>
              <label>
                Token
                <span className="password-row">
                  <input
                    type={showToken ? "text" : "password"}
                    value={tokenInput}
                    spellCheck={false}
                    autoComplete="off"
                    onChange={(e) => setTokenInput(e.target.value)}
                  />
                  <button
                    type="button"
                    className="text-btn"
                    onClick={() => setShowToken((v) => !v)}
                  >
                    {showToken ? "Hide" : "Show"}
                  </button>
                </span>
              </label>
              <section className="settings-memory" aria-label="Memory">
                <div className="settings-memory-head">
                  <p className="settings-memory-header">Memory</p>
                </div>
                {userMemories.length === 0 ? (
                  <p className="settings-memory-empty">{EMPTY_MEMORY}</p>
                ) : (
                  userMemories.map((fact) => (
                    <SettingsMemoryRow
                      key={fact}
                      fact={fact}
                      onRemove={(row) => setPendingUserMemoryRemove(row)}
                    />
                  ))
                )}
              </section>
              <section className="settings-plugins" aria-label="Plugins">
                <div className="settings-plugins-head">
                  <p className="settings-plugins-header">Plugins</p>
                  <button
                    type="button"
                    className="plugin-add"
                    onClick={openPluginAdd}
                    disabled={!session}
                  >
                    Add
                  </button>
                </div>
                {plugins.length === 0 ? (
                  <p className="plugins-empty">No plugins yet.</p>
                ) : (
                  plugins.map((plugin) => (
                    <div key={plugin.id} className="plugin-row">
                      <span className="plugin-name">{plugin.name}</span>
                      <span className="plugin-status">
                        {pluginStatusLabel(plugin.status)}
                      </span>
                      {plugin.status === "needsAuth" ? (
                        <button
                          type="button"
                          className="plugin-connect"
                          onClick={() => void connectPlugin(plugin.id)}
                        >
                          Connect
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="plugin-remove"
                        onClick={() => setPendingRemove(plugin)}
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )}
                {pluginCatalog.length > 0 ? (
                  <section className="settings-catalog" aria-label="Catalog">
                    <p className="settings-catalog-header">Catalog</p>
                    {pluginCatalog.map((entry) => (
                      <div key={entry.id} className="catalog-row">
                        <span className="catalog-name">{entry.name}</span>
                        <button
                          type="button"
                          className="catalog-add"
                          disabled={!session || catalogAddingId === entry.id}
                          onClick={() => void addCatalogPlugin(entry)}
                        >
                          Add
                        </button>
                      </div>
                    ))}
                  </section>
                ) : null}
              </section>
            </div>
          </div>
        </div>
      ) : null}

      {contextMenu ? (
        <div
          className="menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => beginRename(contextMenu.agent)}
          >
            {RENAME_LABEL}
          </button>
          {isChatArchived(archivedChatIds, contextMenu.agent.id) ? (
            <button
              type="button"
              role="menuitem"
              aria-label={UNARCHIVE_LABEL}
              onClick={() => onUnarchive(contextMenu.agent.id)}
            >
              {UNARCHIVE_LABEL}
            </button>
          ) : (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => onTogglePin(contextMenu.agent.id)}
              >
                {pinActionLabel(isChatPinned(pinnedChatIds, contextMenu.agent.id))}
              </button>
              <button
                type="button"
                role="menuitem"
                aria-label={ARCHIVE_LABEL}
                onClick={() => onArchive(contextMenu.agent.id)}
              >
                {ARCHIVE_LABEL}
              </button>
            </>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => onToggleMute(contextMenu.agent.id)}
          >
            {muteActionLabel(isChatMuted(mutedChatIds, contextMenu.agent.id))}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => onToggleRead(contextMenu.agent.id)}
          >
            {unreadActionLabel(
              rowShowsUnreadDot(
                contextMenu.agent.id,
                replyUnreadIds,
                unreadIds,
              ),
            )}
          </button>
          {credsReady && canDelete(contextMenu.agent) ? (
            <button
              type="button"
              role="menuitem"
              className="danger"
              onClick={() => {
                deleteConfirmFromChord.current = false;
                setPendingDelete(contextMenu.agent);
                setContextMenu(null);
              }}
            >
              Delete…
            </button>
          ) : null}
        </div>
      ) : null}

      {pendingDelete ? (
        <div className="modal-backdrop" onClick={() => cancelDelete()}>
          <div
            className="modal confirm"
            role="dialog"
            aria-label="Confirm delete"
            onClick={(e) => e.stopPropagation()}
          >
            <p>
              Delete {visibleName(pendingDelete)}? This removes the{" "}
              {pendingDelete.kind === "channel" ? "channel" : "agent"} and its
              chat.
            </p>
            <div className="confirm-actions">
              <button type="button" onClick={() => cancelDelete()}>
                Cancel
              </button>
              <button
                type="button"
                className="danger-fill"
                onClick={() => void confirmDelete()}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingRemove ? (
        <div
          className="modal-backdrop plugin-sheet"
          onClick={() => setPendingRemove(null)}
        >
          <div
            className="modal confirm"
            role="dialog"
            aria-label="Confirm remove"
            onClick={(e) => e.stopPropagation()}
          >
            <p>Remove {pendingRemove.name}? This disconnects it.</p>
            <div className="confirm-actions">
              <button type="button" onClick={() => setPendingRemove(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="danger-fill"
                onClick={() => void confirmRemove()}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pluginAddOpen ? (
        <div
          className="modal-backdrop plugin-sheet"
          onClick={() => setPluginAddOpen(false)}
        >
          <div
            className="modal plugin-add-sheet"
            role="dialog"
            aria-label="Add plugin"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <h2>Add plugin</h2>
              <button
                type="button"
                className="icon-btn"
                aria-label="Close"
                onClick={() => setPluginAddOpen(false)}
              >
                ×
              </button>
            </header>
            <div className="profile-form">
              <label>
                Name
                <input
                  className="plugin-add-name"
                  value={pluginAddName}
                  autoFocus
                  onChange={(e) => setPluginAddName(e.target.value)}
                />
              </label>
              <fieldset>
                <legend>Transport</legend>
                <div
                  className="segmented"
                  role="radiogroup"
                  aria-label="Plugin transport"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={pluginAddMode === "stdio"}
                    className={pluginAddMode === "stdio" ? "on" : ""}
                    onClick={() => setPluginAddMode("stdio")}
                  >
                    stdio
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={pluginAddMode === "url"}
                    className={pluginAddMode === "url" ? "on" : ""}
                    onClick={() => setPluginAddMode("url")}
                  >
                    URL
                  </button>
                </div>
              </fieldset>
              {pluginAddMode === "stdio" ? (
                <>
                  <label>
                    Command
                    <input
                      value={pluginAddCommand}
                      spellCheck={false}
                      autoComplete="off"
                      placeholder="npx"
                      onChange={(e) => setPluginAddCommand(e.target.value)}
                    />
                  </label>
                  <label>
                    Arguments
                    <input
                      value={pluginAddArgs}
                      spellCheck={false}
                      autoComplete="off"
                      placeholder="-y package"
                      onChange={(e) => setPluginAddArgs(e.target.value)}
                    />
                  </label>
                </>
              ) : (
                <label>
                  Server URL
                  <input
                    value={pluginAddUrl}
                    spellCheck={false}
                    autoComplete="off"
                    placeholder="https://"
                    onChange={(e) => setPluginAddUrl(e.target.value)}
                  />
                </label>
              )}
              <div className="confirm-actions">
                <button
                  type="button"
                  className="primary plugin-add-primary"
                  disabled={pluginAddSaving || !session || !pluginAddReady}
                  onClick={() => void savePluginAdd()}
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {pendingRoutineRemove ? (
        <div
          className="modal-backdrop plugin-sheet"
          onClick={() => setPendingRoutineRemove(null)}
        >
          <div
            className="modal confirm"
            role="dialog"
            aria-label="Confirm remove routine"
            onClick={(e) => e.stopPropagation()}
          >
            <p>{routineRemoveConfirm(pendingRoutineRemove.name)}</p>
            <div className="confirm-actions">
              <button
                type="button"
                onClick={() => setPendingRoutineRemove(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="danger-fill"
                onClick={() => void confirmRoutineRemove()}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {routineAddOpen ? (
        <div
          className="modal-backdrop plugin-sheet"
          onClick={() => setRoutineAddOpen(false)}
        >
          <div
            className="modal plugin-add-sheet routine-add-sheet"
            role="dialog"
            aria-label={ADD_ROUTINE_TITLE}
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <h2>{ADD_ROUTINE_TITLE}</h2>
              <button
                type="button"
                className="icon-btn"
                aria-label="Close"
                onClick={() => setRoutineAddOpen(false)}
              >
                ×
              </button>
            </header>
            <div className="profile-form">
              <label>
                Name
                <input
                  className="routine-add-name"
                  value={routineAddName}
                  autoFocus
                  onChange={(e) => setRoutineAddName(e.target.value)}
                />
              </label>
              <label>
                Skill
                {routineSkills.length === 0 ? (
                  <p className="routine-skill-empty">{NO_SKILLS_YET}</p>
                ) : (
                  <div
                    className="routine-skill-list"
                    role="listbox"
                    aria-label="Skill"
                  >
                    {routineSkills.map((row) => (
                      <button
                        key={row.id}
                        type="button"
                        role="option"
                        aria-selected={routineAddSkill === row.id}
                        className={
                          routineAddSkill === row.id
                            ? "routine-skill-row on"
                            : "routine-skill-row"
                        }
                        onClick={() => setRoutineAddSkill(row.id)}
                      >
                        {row.name}
                      </button>
                    ))}
                  </div>
                )}
              </label>
              <fieldset>
                <legend>When</legend>
                <div
                  className="segmented routine-add-segmented"
                  role="radiogroup"
                  aria-label="Routine trigger"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={routineAddKind === "schedule"}
                    className={routineAddKind === "schedule" ? "on" : ""}
                    onClick={() => setRoutineAddMode("schedule")}
                  >
                    Schedule
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={routineAddKind === "webhook"}
                    className={routineAddKind === "webhook" ? "on" : ""}
                    onClick={() => setRoutineAddMode("webhook")}
                  >
                    Webhook
                  </button>
                  {slackListenerOn ? (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={routineAddKind === "slack"}
                      className={routineAddKind === "slack" ? "on" : ""}
                      onClick={() => setRoutineAddMode("slack")}
                    >
                      Slack
                    </button>
                  ) : null}
                  {githubListenerOn ? (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={routineAddKind === "github"}
                      className={routineAddKind === "github" ? "on" : ""}
                      onClick={() => setRoutineAddMode("github")}
                    >
                      GitHub
                    </button>
                  ) : null}
                </div>
              </fieldset>
              {routineAddKind === "schedule" ? (
                <label>
                  Cron
                  <input
                    className="routine-add-cron"
                    value={routineAddCron}
                    spellCheck={false}
                    autoComplete="off"
                    placeholder={CRON_PLACEHOLDER}
                    onChange={(e) => setRoutineAddCron(e.target.value)}
                  />
                  <p className="routine-add-hint">{CRON_HINT}</p>
                </label>
              ) : null}
              {routineAddKind === "slack" ? (
                <label>
                  Channel
                  <input
                    className="routine-add-channel"
                    value={routineAddChannel}
                    spellCheck={false}
                    autoComplete="off"
                    placeholder={SLACK_CHANNEL_PLACEHOLDER}
                    onChange={(e) => setRoutineAddChannel(e.target.value)}
                  />
                  <p className="routine-add-hint">{SLACK_HINT}</p>
                </label>
              ) : null}
              {routineAddKind === "github" ? (
                <label>
                  Repo
                  <input
                    className="routine-add-repo"
                    value={routineAddRepo}
                    spellCheck={false}
                    autoComplete="off"
                    placeholder={GITHUB_REPO_PLACEHOLDER}
                    onChange={(e) => setRoutineAddRepo(e.target.value)}
                  />
                  <p className="routine-add-hint">{GITHUB_HINT}</p>
                </label>
              ) : null}
              <div className="confirm-actions">
                <button
                  type="button"
                  className="primary routine-add-primary"
                  disabled={routineAddSaving || !session || !routineAddReady}
                  onClick={() => void saveRoutineAdd()}
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {pendingSkillRemove ? (
        <div
          className="modal-backdrop plugin-sheet"
          onClick={() => setPendingSkillRemove(null)}
        >
          <div
            className="modal confirm"
            role="dialog"
            aria-label="Confirm remove skill"
            onClick={(e) => e.stopPropagation()}
          >
            <p>{skillRemoveConfirm(pendingSkillRemove.name)}</p>
            <div className="confirm-actions">
              <button
                type="button"
                onClick={() => setPendingSkillRemove(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="danger-fill"
                onClick={() => void confirmSkillRemove()}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingMemoryRemove ? (
        <div
          className="modal-backdrop plugin-sheet"
          onClick={() => setPendingMemoryRemove(null)}
        >
          <div
            className="modal confirm"
            role="dialog"
            aria-label="Confirm remove memory"
            onClick={(e) => e.stopPropagation()}
          >
            <p>{memoryRemoveConfirm()}</p>
            <div className="confirm-actions">
              <button
                type="button"
                onClick={() => setPendingMemoryRemove(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="danger-fill"
                onClick={() => void confirmMemoryRemove()}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingUserMemoryRemove ? (
        <div
          className="modal-backdrop plugin-sheet"
          onClick={() => setPendingUserMemoryRemove(null)}
        >
          <div
            className="modal confirm"
            role="dialog"
            aria-label="Confirm remove memory"
            onClick={(e) => e.stopPropagation()}
          >
            <p>{memoryRemoveConfirm()}</p>
            <div className="confirm-actions">
              <button
                type="button"
                onClick={() => setPendingUserMemoryRemove(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="danger-fill"
                onClick={() => void confirmUserMemoryRemove()}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {skillEditOpen ? (
        <div
          className="modal-backdrop plugin-sheet"
          onClick={() => setSkillEditOpen(false)}
        >
          <div
            className="modal plugin-add-sheet skill-edit-sheet"
            role="dialog"
            aria-label={EDIT_SKILL_TITLE}
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <h2>{EDIT_SKILL_TITLE}</h2>
              <button
                type="button"
                className="icon-btn"
                aria-label="Close"
                onClick={() => setSkillEditOpen(false)}
              >
                ×
              </button>
            </header>
            <div className="profile-form">
              <label>
                Name
                <input
                  className="skill-edit-name"
                  value={skillEditName}
                  autoFocus
                  onChange={(e) => setSkillEditName(e.target.value)}
                />
              </label>
              <label>
                Body
                <textarea
                  className="skill-edit-body"
                  value={skillEditBody}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(e) => setSkillEditBody(e.target.value)}
                />
              </label>
              <div className="confirm-actions">
                <button
                  type="button"
                  className="primary skill-edit-save"
                  disabled={skillEditSaving || !session || !skillEditReady}
                  onClick={() => void saveSkillEdit()}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {skillAddOpen ? (
        <div
          className="modal-backdrop plugin-sheet"
          onClick={() => setSkillAddOpen(false)}
        >
          <div
            className="modal plugin-add-sheet skill-edit-sheet skill-add-sheet"
            role="dialog"
            aria-label={ADD_SKILL_TITLE}
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <h2>{ADD_SKILL_TITLE}</h2>
              <button
                type="button"
                className="icon-btn"
                aria-label="Close"
                onClick={() => setSkillAddOpen(false)}
              >
                ×
              </button>
            </header>
            <div className="profile-form">
              <label>
                Name
                <input
                  className="skill-add-name"
                  value={skillAddName}
                  autoFocus
                  onChange={(e) => setSkillAddName(e.target.value)}
                />
              </label>
              <label>
                Body
                <textarea
                  className="skill-add-body"
                  value={skillAddBody}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(e) => setSkillAddBody(e.target.value)}
                />
              </label>
              <div className="confirm-actions">
                <button
                  type="button"
                  className="primary skill-edit-save skill-add-save"
                  disabled={skillAddSaving || !session || !skillAddReady}
                  onClick={() => void saveSkillAdd()}
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {createChannelOpen ? (
        <div
          className="modal-backdrop"
          onClick={() => setCreateChannelOpen(false)}
        >
          <div
            className="modal channel-create"
            role="dialog"
            aria-label="New channel"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <h2>New channel</h2>
              <button
                type="button"
                className="icon-btn"
                aria-label="Close"
                onClick={() => setCreateChannelOpen(false)}
              >
                ×
              </button>
            </header>
            <div className="profile-form">
              <label>
                Name
                <input
                  value={channelNameDraft}
                  autoFocus
                  onChange={(e) => setChannelNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void onCreateChannel();
                    }
                  }}
                />
              </label>
              <MemberPicker
                agents={agents}
                selectedIds={channelMemberDraft}
                session={session}
                onToggle={(id) =>
                  setChannelMemberDraft((prev) =>
                    prev.includes(id)
                      ? prev.filter((item) => item !== id)
                      : [...prev, id],
                  )
                }
              />
              <div className="confirm-actions">
                <button
                  type="button"
                  onClick={() => setCreateChannelOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={!channelNameDraft.trim() || channelMemberDraft.length === 0}
                  onClick={() => void onCreateChannel()}
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {lightboxPaint.mounted && lightboxFrame ? (
        <div
          className="image-lightbox-backdrop"
          data-shown={lightboxPaint.shown ? "true" : "false"}
          onMouseDown={() => closeImageLightbox()}
          onKeyDown={(event) => {
            if (event.key !== "Tab") return;
            event.preventDefault();
            lightboxCloseRef.current?.focus({ preventScroll: true });
          }}
        >
          <div
            className="image-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label={lightboxLabel(lightboxFrame.name)}
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              ref={lightboxCloseRef}
              type="button"
              className="image-lightbox-close"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={() => closeImageLightbox()}
            >
              {IMAGE_LIGHTBOX_CLOSE}
            </button>
            <AuthedImg
              className="image-lightbox-image"
              src={lightboxFrame.url}
              session={session}
              alt={lightboxLabel(lightboxFrame.name)}
            />
          </div>
        </div>
      ) : null}
      {shortcutsOpen ? (
        <div
          className="shortcuts-backdrop"
          onMouseDown={() => closeShortcuts()}
        >
          <div
            ref={shortcutsRef}
            className="shortcuts-overlay"
            role="dialog"
            aria-modal="true"
            aria-label={SHORTCUTS_TITLE}
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2>{SHORTCUTS_TITLE}</h2>
            <ul className="shortcuts-list">
              {CHAT_SHORTCUTS.map((row) => (
                <li key={row.id} className="shortcuts-row">
                  <span className="shortcuts-action">{row.action}</span>
                  <span className="shortcuts-keys">{row.keys}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
      {switchOpen ? (
        <div
          className="switch-backdrop"
          onMouseDown={() => closeSwitcher()}
        >
          <div
            className="switch-overlay"
            role="dialog"
            aria-label={SWITCH_INPUT_LABEL}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <input
              ref={switchInputRef}
              role="combobox"
              aria-label={SWITCH_INPUT_LABEL}
              aria-expanded="true"
              aria-controls="chat-switch-list"
              aria-autocomplete="list"
              aria-activedescendant={
                activeSwitch ? `chat-switch-${activeSwitch.id}` : undefined
              }
              placeholder={SWITCH_PLACEHOLDER}
              value={switchQuery}
              onChange={(event) => {
                setSwitchQuery(event.target.value);
                setSwitchIndex(0);
              }}
            />
            <ul
              id="chat-switch-list"
              className="switch-list"
              role="listbox"
              aria-label={SWITCH_INPUT_LABEL}
            >
              {switchHits.length === 0 ? (
                <li className="switch-empty">{SWITCH_EMPTY_LABEL}</li>
              ) : (
                switchHits.map((chat, index) => {
                  const agent = agents.find((row) => row.id === chat.id);
                  const active = index === switchSafeIndex;
                  return (
                    <li key={chat.id} role="presentation">
                      <button
                        type="button"
                        id={`chat-switch-${chat.id}`}
                        data-switch-id={chat.id}
                        role="option"
                        aria-selected={active}
                        className={active ? "switch-option active" : "switch-option"}
                        onClick={() => pickSwitcher(chat.id)}
                      >
                        <span className="switch-name">{chat.name}</span>
                        {agent && rosterSubtitle(agent) ? (
                          <span className="switch-kind">{rosterSubtitle(agent)}</span>
                        ) : null}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MemberPicker({
  agents,
  selectedIds,
  session,
  onToggle,
}: {
  agents: Agent[];
  selectedIds: string[];
  session: Session | null;
  onToggle: (id: string) => void;
}) {
  const people = agents.filter((row) => row.kind !== "channel");
  return (
    <div className="member-pick" role="group" aria-label="Members">
      {people.map((agent) => {
        const checked = selectedIds.includes(agent.id);
        return (
          <label className="member-pick-row" key={agent.id}>
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onToggle(agent.id)}
            />
            <Avatar
              src={agent.avatar}
              name={agent.name}
              size={28}
              session={session}
            />
            <span className="info-member-copy">
              <strong>{agent.name}</strong>
              {agent.title ? <span>{agent.title}</span> : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}

function MentionText({
  text,
  knownNames,
  chips = false,
  links = false,
  activeRange = null,
}: {
  text: string;
  knownNames: string[];
  chips?: boolean;
  links?: boolean;
  activeRange?: { start: number; end: number } | null;
}) {
  const findQuery = useFindQuery();
  if (links) {
    return (
      <HttpsText
        text={text}
        knownNames={knownNames}
        chips={chips}
        findQuery={findQuery}
        active={activeRange}
      />
    );
  }
  const pieces = splitMentions(text, knownNames);
  if (pieces.length === 0) {
    return text ? (
      <FindText text={text} query={findQuery} active={activeRange} />
    ) : null;
  }
  let offset = 0;
  return (
    <>
      {pieces.map((piece, index) => {
        const start = offset;
        offset += piece.value.length;
        const local =
          activeRange &&
          activeRange.start >= start &&
          activeRange.start < start + piece.value.length
            ? {
                start: activeRange.start - start,
                end:
                  Math.min(activeRange.end, start + piece.value.length) - start,
              }
            : null;
        const body = (
          <FindText text={piece.value} query={findQuery} active={local} />
        );
        if (piece.type === "mention" && piece.resolved) {
          return (
            <span key={index} className={chips ? "mention-chip" : "mention"}>
              {body}
            </span>
          );
        }
        return <span key={index}>{body}</span>;
      })}
    </>
  );
}

function ToolStackHeader({
  count,
  expanded,
  onToggle,
}: {
  count: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="tool-trace tool-stack"
      aria-expanded={expanded}
      aria-label={collapsedToolsLabel(count)}
      onClick={onToggle}
    >
      <span
        className={expanded ? "tool-stack-chevron open" : "tool-stack-chevron"}
        aria-hidden="true"
      >
        {TOOL_STACK_CHEVRON}
      </span>
      {collapsedToolsLabel(count)}
    </button>
  );
}

function Avatar({
  src,
  name,
  size,
  session,
}: {
  src: string | null;
  name: string;
  size: number;
  session: Session | null;
}) {
  const resolved = src
    ? resolveMediaUrl(session?.baseUrl ?? "", src)
    : "";
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {resolved ? (
        <AuthedImg src={resolved} session={session} alt="" />
      ) : (
        <span>{displayInitials(name)}</span>
      )}
    </span>
  );
}

function MessageAttachmentChrome({
  message,
  session,
  onOpenFile,
  onOpenImage,
}: {
  message: ChatMessage;
  session: Session | null;
  onOpenFile: (file: { name: string; url: string }) => void;
  onOpenImage: (target: ImageLightboxTarget, trigger: HTMLElement) => void;
}) {
  const atts = userRightAttachments(message);
  const images = atts.filter((row) => isLightboxImage(row.kind));
  const videos = atts.filter((row) => row.kind === "video");
  const files = atts.filter((row) => row.kind === "file");
  if (!images.length && !videos.length && !files.length) return null;
  return (
    <div className="message-atts">
      {images.map((image) => {
        const url = resolveMediaUrl(session?.baseUrl ?? "", image.url);
        return (
          <button
            key={image.id}
            type="button"
            className="bubble-image-btn"
            aria-label={lightboxLabel(image.name)}
            onClick={(event) =>
              onOpenImage(
                { id: image.id, url, name: image.name },
                event.currentTarget,
              )
            }
          >
            <AuthedImg
              className="bubble-image"
              src={url}
              session={session}
              alt=""
            />
          </button>
        );
      })}
      {videos.map((video) => (
        <AuthedVideo
          key={video.id}
          className="bubble-video"
          src={resolveMediaUrl(session?.baseUrl ?? "", video.url)}
          session={session}
        />
      ))}
      {files.map((file) => (
        <button
          key={file.id}
          type="button"
          className="file-chip"
          onClick={() => void onOpenFile(file)}
        >
          {file.name}
        </button>
      ))}
    </div>
  );
}

function AuthedImg({
  src,
  session,
  alt,
  className,
}: {
  src: string;
  session: Session | null;
  alt: string;
  className?: string;
}) {
  const [out, setOut] = useState(src);

  useEffect(() => {
    if (!src) return;
    if (src.startsWith("data:") || src.startsWith("blob:") || !session) {
      setOut(src);
      return;
    }
    let dead = false;
    let objectUrl = "";
    fetch(src, { headers: { Authorization: `Bearer ${session.token}` } })
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((blob) => {
        if (dead) return;
        objectUrl = URL.createObjectURL(blob);
        setOut(objectUrl);
      })
      .catch(() => {
        if (!dead) setOut(src);
      });
    return () => {
      dead = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, session]);

  return <img className={className} src={out} alt={alt} />;
}

function PendingVideoThumb({
  row,
  onRemove,
}: {
  row: PendingAttachment;
  onRemove: () => void;
}) {
  const [hasFrame, setHasFrame] = useState(false);
  return (
    <div className="pending-thumb pending-video">
      {row.previewUrl ? (
        <video
          src={row.previewUrl}
          muted
          playsInline
          preload="metadata"
          onLoadedData={(event) => {
            if (event.currentTarget.videoWidth > 0) setHasFrame(true);
          }}
        />
      ) : null}
      {!hasFrame ? (
        <span className="pending-play" aria-hidden>
          <PlayMark size={16} />
        </span>
      ) : null}
      <button
        type="button"
        className="pending-x"
        aria-label={`Remove ${row.name}`}
        onClick={onRemove}
      >
        ×
      </button>
    </div>
  );
}

function AuthedVideo({
  src,
  session,
  className,
}: {
  src: string;
  session: Session | null;
  className?: string;
}) {
  const [out, setOut] = useState(src);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!src) return;
    if (src.startsWith("data:") || src.startsWith("blob:") || !session) {
      setOut(src);
      return;
    }
    let dead = false;
    let objectUrl = "";
    fetch(src, { headers: { Authorization: `Bearer ${session.token}` } })
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((blob) => {
        if (dead) return;
        objectUrl = URL.createObjectURL(blob);
        setOut(objectUrl);
      })
      .catch(() => {
        if (!dead) setOut(src);
      });
    return () => {
      dead = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, session]);

  return (
    <div className="bubble-video-wrap">
      <video
        ref={videoRef}
        className={className}
        src={out}
        controls={playing}
        playsInline
        preload="metadata"
      />
      {playing ? null : (
        <button
          type="button"
          className="bubble-video-play"
          aria-label="Play"
          onClick={() => {
            setPlaying(true);
            const el = videoRef.current;
            if (el) void el.play();
          }}
        >
          <PlayMark size={24} />
        </button>
      )}
    </div>
  );
}

function PlayMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7L8 5Z" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="9"
        y="3"
        width="6"
        height="12"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M6 11a6 6 0 0 0 12 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M12 17v3M9 20h6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Paperclip() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M21.44 11.05 12.25 20.24a6 6 0 1 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 1 1-2.82-2.83l8.49-8.48"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M19.4 13a7.6 7.6 0 0 0 .1-2l2-1.5-2-3.5-2.4.5a7.7 7.7 0 0 0-1.7-1L15 3h-4l-.4 2.5a7.7 7.7 0 0 0-1.7 1L6.5 6 4.5 9.5 6.5 11a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.5 2.4-.5a7.7 7.7 0 0 0 1.7 1L11 21h4l.4-2.5a7.7 7.7 0 0 0 1.7-1l2.4.5 2-3.5-2.1-1.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
      <path
        fill="currentColor"
        d="M2.4 8.75h8.44L7.7 12.9a.75.75 0 0 0 1.1 1.02l5.5-5.9a.75.75 0 0 0 0-1.04l-5.5-5.9A.75.75 0 1 0 7.7 3.1l3.14 3.4H2.4a.75.75 0 0 0 0 1.5Z"
      />
    </svg>
  );
}
