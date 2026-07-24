/**
 * Shared contracts between main process, preload and renderer.
 * Keep this file dependency-free and types-only (plus tiny const enums),
 * it is imported from both Node (electron/) and browser (src/) code.
 */

/** ---------------------------------------------------------------------- */
/** Colors                                                                */
/** ---------------------------------------------------------------------- */

export interface ThemeColors {
  background: string;
  panel: string;
  panelAlt: string;
  accent: string;
  accentAlt: string;
  secondary: string;
  highlight: string;
  text: string;
  muted: string;
  line: string;
}

/** v2 canonical palette. */
export interface ThemePalette {
  background: string;
  panel: string;
  panelAlt: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  accentAlt: string;
  secondary: string;
  highlight: string;
}

/** ---------------------------------------------------------------------- */
/** Layout                                                                */
/** ---------------------------------------------------------------------- */

export const LAYOUT_KINDS = [
  "dream-banner",
  "split-studio",
  "full-canvas",
  "terminal-grid",
  "paper-board",
  "minimal-focus",
  "retro-messenger",
  "silk-scroll",
] as const;

export type LayoutKind = (typeof LAYOUT_KINDS)[number];

/** ---------------------------------------------------------------------- */
/** Schema v1 (legacy, fully compatible with Codex-Dream-Skin)            */
/** ---------------------------------------------------------------------- */

export interface ThemeConfigV1 {
  schemaVersion: 1;
  id: string;
  name: string;
  brandSubtitle: string;
  tagline: string;
  projectPrefix: string;
  projectLabel: string;
  statusText: string;
  quote: string;
  image: string;
  colors: ThemeColors;
}

/** ---------------------------------------------------------------------- */
/** Schema v2                                                             */
/** ---------------------------------------------------------------------- */

export type ImageFit = "cover" | "contain";
export type TextAlign = "left" | "center" | "right";
export type RadiusPreset = "none" | "sm" | "md" | "lg" | "xl";
export type DensityPreset = "compact" | "normal" | "spacious";
export type FontPreset = "system" | "rounded" | "mono";
export type ShadowPreset = "none" | "sm" | "md" | "lg";

export interface ThemeEffectLevels {
  particles?: number;
  aurora?: number;
  glow?: number;
  noise?: number;
  grid?: number;
  float?: number;
}

export interface ThemeConfigV2 {
  schemaVersion: 2;
  /** Stable UUID for the theme. */
  uuid: string;
  /** Display / filesystem id (kept for backwards compatibility). */
  id: string;
  /** Semantic version. */
  version: string;
  /** Minimum Codex Themes engine version required. */
  minEngineVersion: string;
  /** Whether a bundled preset appears in the app and website galleries. */
  galleryVisible?: boolean;
  name: string;
  description: string;
  tagline: string;
  tags: string[];

  /** Resource filenames (all bare filenames inside the theme dir). */
  hero: string;
  wallpaper?: string;
  stamp?: string;
  preview?: string;

  /** Palettes. */
  light: ThemePalette;
  dark?: ThemePalette;

  /** Layout skeleton. */
  layout: LayoutKind;

  /** Hero image parameters. */
  heroFit: ImageFit;
  heroFocusX: number;
  heroFocusY: number;
  heroZoom: number;
  heroHeight: number;
  heroTextAlign: TextAlign;
  heroScrim: number;

  /** Wallpaper parameters. */
  wallpaperEnabled: boolean;
  wallpaperFocusX: number;
  wallpaperFocusY: number;
  wallpaperOpacity: number;
  wallpaperBlur: number;

  /** Appearance parameters. */
  radius: RadiusPreset;
  density: DensityPreset;
  fontPreset: FontPreset;
  glass: boolean;
  shadow: ShadowPreset;
  decoration: number;

  /** Built-in effects and their intensity (0 = off, 1 = full). */
  effects: ThemeEffectLevels;

  /** Optional Ed25519 signature (base64) of the canonical theme.json. */
  signature?: string;

  /** Copy / labels. */
  brandSubtitle: string;
  projectPrefix: string;
  projectLabel: string;
  statusText: string;
  quote: string;

  /** If true, the package is only a preview placeholder; the full theme must be purchased and downloaded. */
  catalogOnly?: boolean;
}

/** Raw theme config loaded from disk: v1 legacy or v2 structured. */
export type ThemeConfig = ThemeConfigV1 | ThemeConfigV2;

/** ---------------------------------------------------------------------- */
/** Normalized runtime theme                                                */
/** ---------------------------------------------------------------------- */

export interface NormalizedResources {
  hero: string;
  wallpaper?: string;
  stamp?: string;
  preview?: string;
}

export interface NormalizedHero {
  fit: ImageFit;
  focusX: number;
  focusY: number;
  zoom: number;
  height: number;
  textAlign: TextAlign;
  scrim: number;
}

export interface NormalizedWallpaper {
  enabled: boolean;
  focusX: number;
  focusY: number;
  opacity: number;
  blur: number;
}

export interface NormalizedAppearance {
  radius: RadiusPreset;
  density: DensityPreset;
  fontPreset: FontPreset;
  glass: boolean;
  shadow: ShadowPreset;
  decoration: number;
}

export interface NormalizedEffects {
  particles: number;
  aurora: number;
  glow: number;
  noise: number;
  grid: number;
  float: number;
}

export interface NormalizedCopy {
  brandSubtitle: string;
  projectPrefix: string;
  projectLabel: string;
  statusText: string;
  quote: string;
}

export interface NormalizedTheme {
  schemaVersion: 2;
  uuid: string;
  id: string;
  version: string;
  minEngineVersion: string;
  name: string;
  description: string;
  tagline: string;
  tags: string[];
  resources: NormalizedResources;
  light: ThemePalette;
  dark: ThemePalette;
  layout: LayoutKind;
  hero: NormalizedHero;
  wallpaper: NormalizedWallpaper;
  appearance: NormalizedAppearance;
  effects: NormalizedEffects;
  copy: NormalizedCopy;
  /** If true, the package is only a preview placeholder; the full theme must be purchased and downloaded. */
  catalogOnly?: boolean;
}

/** ---------------------------------------------------------------------- */
/** Library / UI summaries                                                */
/** ---------------------------------------------------------------------- */

export type ThemeSource = "preset" | "custom" | "imported" | "purchased";

export type AuthProvider = "email" | "github" | "google";

export interface AuthUserSummary {
  id: string;
  email: string;
  /** Provider display name, falling back to the account email. */
  displayName: string;
  avatarUrl: string | null;
  provider: AuthProvider;
  /** ISO timestamp of account creation. */
  createdAt: string;
}

export type AuthStateStatus = "loading" | "unauthenticated" | "authenticated" | "error";

export interface AuthState {
  status: AuthStateStatus;
  user: AuthUserSummary | null;
  /** Count of purchased themes, surfaced in the account card. */
  entitlementCount: number;
  error: string | null;
}

export interface ThemeProduct {
  id: string;
  name: string;
  tagline: string;
  description: string;
  version: string;
  layout: LayoutKind;
  previewUrl: string;
  /** Price in Chinese yuan cents. */
  priceCents: number;
  /** Point price used for every new marketplace unlock. */
  pricePoints: number;
  minEngineVersion: string;
  /** Whether the product is publicly listed. */
  published: boolean;
  origin: "official" | "community";
  authorId: string | null;
  author: PublicCreatorProfile | null;
  /** Unique users who have unlocked this theme. */
  unlockCount: number;
  downloadsEnabled: boolean;
  publishedAt: string | null;
}

export interface PublicCreatorProfile {
  handle: string | null;
  displayName: string;
  avatarUrl: string | null;
}

export interface CreatorProfile extends PublicCreatorProfile {
  id: string;
  email: string;
  provider: AuthProvider;
  createdAt: string;
  isAdmin: boolean;
}

export interface PointWallet {
  balance: number;
  lifetimePurchased: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  updatedAt: string;
}

export interface PointPack {
  id: string;
  name: string;
  priceCents: number;
  basePoints: number;
  bonusPoints: number;
  totalPoints: number;
}

export type PointOrderStatus =
  | "pending"
  | "paid"
  | "refund_pending"
  | "refunded"
  | "closed"
  | "failed";

export interface PointOrder {
  id: string;
  userId?: string;
  packId: string;
  packName: string;
  priceCents: number;
  basePoints: number;
  bonusPoints: number;
  totalPoints: number;
  status: PointOrderStatus;
  outTradeNo: string;
  createdAt: string;
  paidAt: string | null;
  refundedAt: string | null;
  checkoutUrl?: string;
}

export type PointLedgerEntryType =
  | "topup"
  | "theme_unlock"
  | "creator_reward"
  | "refund_hold"
  | "refund_reversal"
  | "admin_adjustment";

export interface PointLedgerEntry {
  id: string;
  userId?: string;
  delta: number;
  balanceAfter: number;
  entryType: PointLedgerEntryType;
  themeId: string | null;
  reason: string | null;
  createdAt: string;
}

export type ThemeSubmissionStatus =
  | "uploading"
  | "pending"
  | "approved"
  | "rejected"
  | "withdrawn"
  | "failed";

export interface ThemeSubmission {
  id: string;
  themeId: string;
  authorId: string;
  revision: number;
  version: string;
  sourceKind: "custom" | "ai";
  status: ThemeSubmissionStatus;
  proposedPricePoints: number;
  approvedPricePoints: number | null;
  name: string;
  tagline: string;
  description: string;
  layout: LayoutKind;
  previewUrl: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewReason: string | null;
  createdAt: string;
  author?: PublicCreatorProfile | null;
  /** Current marketplace state for the stable community theme. */
  product?: {
    version: string;
    published: boolean;
    downloadsEnabled: boolean;
    unlockCount: number;
    pricePoints: number;
    priceCents: number;
    publishedAt: string | null;
    previewUrl: string | null;
  } | null;
  /** Creator-facing aggregate data. Values are scoped to this theme. */
  metrics?: {
    uniqueUsers: number;
    totalRewardPoints: number;
    recentUnlocks: number;
    recentRewardPoints: number;
    dailyUnlocks: Array<{
      date: string;
      count: number;
    }>;
  };
}

export interface SubmitThemeInput {
  localThemeId: string;
  sourceKind: "custom" | "ai";
  proposedPricePoints: 0 | 49 | 99 | 199 | 399;
  rightsAccepted: true;
  /** Set when submitting a new revision of an existing community theme. */
  themeId?: string;
}

export interface AdminOverview {
  pendingSubmissions: number;
  publishedCommunityThemes: number;
  paidPointOrders: number;
  paidThemeOrders: number;
  grossPointRevenueCents: number;
  grossThemeRevenueCents: number;
  pointsInCirculation: number;
  lifetimePointsPurchased: number;
  lifetimeCreatorRewards: number;
  lifetimePointsSpent: number;
  recentPointOrders: PointOrder[];
  recentThemeOrders: PurchaseOrder[];
  recentLedger: PointLedgerEntry[];
  userBalances: Array<{
    userId: string;
    handle: string | null;
    displayName: string;
    balance: number;
    lifetimePurchased: number;
    lifetimeEarned: number;
    lifetimeSpent: number;
  }>;
  themeSales: Array<{
    themeId: string;
    name: string;
    unlockCount: number;
    pointsSpent: number;
    creatorRewards: number;
  }>;
}

export type PurchaseOrderStatus =
  | "pending"
  | "paid"
  | "closed"
  | "failed"
  | "refunded";

export interface PurchaseOrder {
  id: string;
  userId?: string;
  themeId: string;
  themeName: string;
  priceCents: number;
  status: PurchaseOrderStatus;
  /** Alipay out_trade_no. */
  outTradeNo: string;
  /** ISO timestamp when the order was created. */
  createdAt: string;
  /** ISO timestamp when the order was paid, if applicable. */
  paidAt: string | null;
  /** Alipay cashier URL returned by the server; client opens it in system browser. */
  checkoutUrl?: string;
}

export interface ThemeEntitlement {
  themeId: string;
  themeName: string;
  version: string;
  status: "active" | "revoked";
  /** ISO timestamp when the entitlement was granted. */
  createdAt: string;
  acquisitionType?: "legacy_alipay" | "alipay" | "points" | "free" | "author";
  pointsSpent?: number;
  creatorRewardPoints?: number;
}

export interface CommerceThemeSummary extends ThemeSummary {
  /** Present when the theme is part of the paid catalog. */
  product?: ThemeProduct;
  /** Entitlement status, if the user owns this theme. */
  entitlement?: ThemeEntitlement;
  /** Latest local installed state for purchased themes. */
  local?: ThemeSummary;
}

export interface ThemeSummary {
  id: string;
  uuid: string;
  name: string;
  tagline: string;
  description: string;
  version: string;
  layout: LayoutKind;
  source: ThemeSource;
  /** Whether the theme is read-only (built-in / imported). */
  readOnly: boolean;
  /** Whether the package passed local validation. */
  valid: boolean;
  /** Whether the package carries a market signature. Kept for compatibility; always false now. */
  signed: boolean;
  /** Minimum engine version required. */
  minEngineVersion: string;
  /** Absolute directory holding theme.json + assets. */
  dir: string;
  /** theme-image:// URL usable as <img src> in the renderer. */
  previewUrl: string;
  colors: ThemePalette;
  /** If true, the package is only a preview placeholder; the full theme must be purchased and downloaded. */
  catalogOnly?: boolean;
}

/** ---------------------------------------------------------------------- */
/** Runtime / app state                                                   */
/** ---------------------------------------------------------------------- */

export interface CodexDesktopStatus {
  installed: boolean;
  bundlePath: string | null;
  version: string | null;
  running: boolean;
  cdpPort: number | null;
  cdpHealthy: boolean;
}

export interface CodexCliStatus {
  installed: boolean;
  executablePath: string | null;
  version: string | null;
  supported: boolean;
  appServerRunning: boolean;
  authenticated: boolean;
  authMode: string | null;
  imageGeneration: boolean | null;
  error: string | null;
}

export interface AppState {
  codexDesktop: CodexDesktopStatus;
  codexCli: CodexCliStatus;
  activeThemeId: string | null;
  activeThemeName: string | null;
  activeLayout: LayoutKind | null;
  watcherActive: boolean;
  applying: boolean;
  lastError: string | null;
  engineVersion: string;
}

export type ApplyStatus = "applied" | "partial" | "failed";

export interface ApplyResult {
  ok: boolean;
  status: ApplyStatus;
  /** True when Codex had to (and did) restart with the debug port. */
  restarted: boolean;
  /** True when Codex is running without CDP and user consent is required. */
  needsRestart: boolean;
  notes: string[];
  error?: string;
}

/** Safe action passed from a public website deep link to the renderer. */
export type OpenThemeAction =
  | {
      type: "open-theme";
      themeId: string;
    }
  | {
      type: "open-workspace";
      workspace: "editor" | "ai-studio";
    };

/** ---------------------------------------------------------------------- */
/** Image / palette extraction                                            */
/** ---------------------------------------------------------------------- */

export interface ExtractedPalette {
  accent: string;
  accentAlt: string;
  secondary: string;
  highlight: string;
}

export interface PickedImage {
  path: string;
  /** theme-image:// or data: URL for preview. */
  previewUrl: string;
  palette: ExtractedPalette;
  bytes: number;
}

/** ---------------------------------------------------------------------- */
/** Editor inputs                                                         */
/** ---------------------------------------------------------------------- */

export interface CustomThemeInput {
  name: string;
  tagline: string;
  quote: string;
  statusText?: string;
  colors: Pick<ThemeColors, "accent" | "accentAlt" | "secondary" | "highlight">;
  /** Absolute path of the chosen background image on disk. */
  imagePath: string;
}

/** Draft for the v2 theme studio. */
export interface ThemeDraftInput {
  uuid?: string;
  name: string;
  description: string;
  tagline: string;
  tags: string[];
  layout: LayoutKind;
  colors: ExtractedPalette;
  heroFit: ImageFit;
  heroFocusX: number;
  heroFocusY: number;
  heroZoom: number;
  heroHeight: number;
  heroTextAlign: TextAlign;
  heroScrim: number;
  wallpaperEnabled: boolean;
  wallpaperFocusX: number;
  wallpaperFocusY: number;
  wallpaperOpacity: number;
  wallpaperBlur: number;
  radius: RadiusPreset;
  density: DensityPreset;
  fontPreset: FontPreset;
  glass: boolean;
  shadow: ShadowPreset;
  decoration: number;
  effects: NormalizedEffects;
  copy: NormalizedCopy;
  /** Optional explicit light/dark palettes. When provided, they override the
   * derivation from `colors` during save. This lets advanced users edit every
   * shell color directly. */
  palettes?: { light: ThemePalette; dark: ThemePalette };
  /** Absolute path of the hero image on disk. */
  heroImagePath: string;
  /** Optional absolute path of a wallpaper image on disk. */
  wallpaperImagePath?: string;
  /** Optional absolute path of a stamp image on disk. */
  stampImagePath?: string;
}

/** A saved theme loaded back into the editor for in-place editing. */
export interface LoadedThemeDraft {
  /** The theme id updateTheme() must target; the ID/UUID stay stable. */
  editingId: string;
  source: ThemeSource;
  draft: ThemeDraftInput;
  heroPreviewUrl: string;
  wallpaperPreviewUrl: string | null;
  stampPreviewUrl: string | null;
}

/** ---------------------------------------------------------------------- */
/** AI theme generation                                                   */
/** ---------------------------------------------------------------------- */

export type AiThemeJobStage =
  | "created"
  | "preparing"
  | "generating-images"
  | "awaiting-selection"
  | "generating-recipe"
  | "synthesizing"
  | "preview-ready"
  | "adopting"
  | "saving"
  | "completed"
  | "failed"
  | "cancelled";

export interface ThemeGenerationRequest {
  prompt: string;
  mode: "generate-image" | "use-reference-image" | "recipe-only";
  appearance: "auto" | "light" | "dark";
  layoutPreference?: LayoutKind;
  candidateCount: 1 | 2 | 3;
  referenceImagePath?: string;
}

export interface ThemeGenerationRecipe {
  schemaVersion: 1;
  name: string;
  description: string;
  tagline: string;
  tags: string[];
  layout: LayoutKind;
  hero: {
    fit: ImageFit;
    focusX: number;
    focusY: number;
    zoom: number;
    height: number;
    textAlign: TextAlign;
    scrim: number;
  };
  wallpaper: {
    enabled: boolean;
    focusX: number;
    focusY: number;
    opacity: number;
    blur: number;
  };
  appearance: {
    radius: RadiusPreset;
    density: DensityPreset;
    fontPreset: FontPreset;
    glass: boolean;
    shadow: ShadowPreset;
    decoration: number;
  };
  effects: NormalizedEffects;
  copy: NormalizedCopy;
  paletteIntent: {
    appearance: "light" | "dark";
    contrast: "soft" | "normal" | "high";
    temperature: "cool" | "neutral" | "warm";
  };
}

export interface AiThemeCandidate {
  candidateId: string;
  /** Candidate batch that owns this image. Missing only on legacy jobs. */
  batchId?: string;
  /** One-based requested slot inside the batch. */
  slot?: number;
  /** Absolute path to the generated image in the job directory. */
  imagePath: string;
  /** picked-image:// URL for renderer preview. */
  previewUrl: string;
  /** Codex item id that produced this image, for tracing. */
  itemId?: string;
  /** SHA-256 of the image bytes, used to prove recipe-only turns kept the art. */
  sha256?: string;
}

export type AiThemeMessageMode = "theme-only" | "regenerate-image";
export type AiThemeMessageStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface AiThemeMessageInput {
  text: string;
  mode: AiThemeMessageMode;
}

export interface AiThemeMessage {
  messageId: string;
  role: "user" | "assistant" | "system";
  text: string;
  createdAt: string;
  status: AiThemeMessageStatus;
  mode?: AiThemeMessageMode;
  operationId?: string;
  revisionId?: string;
  changeSummary?: string[];
}

export interface AiThemeCandidateBatch {
  batchId: string;
  requestedCount: 1 | 2 | 3;
  createdAt: string;
  sourceMessageId: string | null;
  baseRevisionId: string | null;
  instruction: string;
  status: "generating" | "awaiting-selection" | "completed" | "partial" | "cancelled";
  candidates: AiThemeCandidate[];
  selectedCandidateId: string | null;
  currentSlot: number | null;
  /** Initial attempt is 1; each slot can reach 3 after two automatic retries. */
  attemptsBySlot: Record<string, number>;
  error: string | null;
}

export interface AiThemeRevision {
  revisionId: string;
  number: number;
  createdAt: string;
  parentRevisionId: string | null;
  sourceMessageId: string | null;
  candidateId: string;
  recipe: ThemeGenerationRecipe;
  assistantMessage: string;
  changeSummary: string[];
}

export interface AiThemeOperation {
  operationId: string;
  type: "initial-images" | "image-regeneration" | "recipe" | "adopt" | "apply";
  status: "running" | "completed" | "failed" | "cancelled";
  stage: AiThemeJobStage;
  startedAt: string;
  completedAt: string | null;
  sourceMessageId: string | null;
  batchId: string | null;
  baseRevisionId: string | null;
  candidateId: string | null;
  currentSlot: number | null;
  turnId: string | null;
  error: string | null;
}

export interface AiThemeStructuredResult {
  message: string;
  changeSummary: string[];
  recipe: ThemeGenerationRecipe;
}

export interface AiThemeJob {
  jobId: string;
  stage: AiThemeJobStage;
  createdAt: string;
  updatedAt: string;
  request: ThemeGenerationRequest;
  threadId: string | null;
  error: string | null;
  candidates: AiThemeCandidate[];
  selectedCandidateId: string | null;
  recipe: ThemeGenerationRecipe | null;
  /** Absolute path to the saved theme directory, once completed. */
  savedThemeDir: string | null;
  /** Durable multi-turn conversation state. */
  messages: AiThemeMessage[];
  candidateBatches: AiThemeCandidateBatch[];
  revisions: AiThemeRevision[];
  currentRevisionId: string | null;
  adoptedRevisionId: string | null;
  adoptedThemeId: string | null;
  operation: AiThemeOperation | null;
  /** Human-readable streaming progress line from the model. */
  progressMessage?: string;
  /** Type of the App Server item currently being processed. */
  progressItemType?: string;
}

export interface AiThemeJobSummary {
  jobId: string;
  stage: AiThemeJobStage;
  createdAt: string;
  updatedAt: string;
  prompt: string;
  selectedCandidateId: string | null;
  savedThemeDir: string | null;
  error: string | null;
  currentRevisionNumber?: number | null;
  revisionCount?: number;
}

export interface AiThemeApplyResult {
  theme: ThemeSummary;
  apply: ApplyResult;
}

export interface CodexApprovalRequest {
  requestId: string;
  jobId: string;
  kind: "command" | "file" | "permissions" | "patch" | "unknown";
  title: string;
  detail: string;
}

export type CodexApprovalDecision = "accept" | "decline" | "cancel";

/** ---------------------------------------------------------------------- */
/** Logging / settings                                                    */
/** ---------------------------------------------------------------------- */

export interface LogLine {
  at: string;
  level: "info" | "warn" | "error";
  message: string;
}

/** Settings exposed to the renderer (mirrors electron/settings.ts). */
export interface RendererSettings {
  onboardingDone: boolean;
  launchAtLogin: boolean;
  /**
   * Re-apply the active theme automatically whenever Codex is found running
   * without its debug port (e.g. after the user relaunches Codex normally).
   * Enabling this is standing consent for the required Codex restart.
   */
  autoApply: boolean;
  /** Absolute path to a user-selected Codex CLI executable, if any. */
  codexCliPath: string | null;
}

/** ---------------------------------------------------------------------- */
/** Application updates                                                   */
/** ---------------------------------------------------------------------- */

export type AppUpdateStatus =
  | "disabled"
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "error";

export interface AppUpdateState {
  status: AppUpdateStatus;
  currentVersion: string;
  availableVersion: string | null;
  releaseName: string | null;
  releaseNotes: string | null;
  releaseDate: string | null;
  releaseUrl: string | null;
  progressPercent: number | null;
  transferredBytes: number | null;
  totalBytes: number | null;
  bytesPerSecond: number | null;
  error: string | null;
}

/** ---------------------------------------------------------------------- */
/** Theme package inspection                                              */
/** ---------------------------------------------------------------------- */

export interface InspectedThemePackage {
  /** Temporary directory where the package has been extracted for preview. */
  tempDir: string;
  summary: ThemeSummary;
  /** SHA-256 of the original .codextheme file. */
  sha256: string;
  /** Signature status: verified / missing / invalid. Kept for compatibility; always missing now. */
  signatureStatus: "verified" | "missing" | "invalid";
  /** Validation warnings (low contrast, oversized assets, etc.). */
  warnings: string[];
  /** True if the package can be imported. */
  canImport: boolean;
}

/** ---------------------------------------------------------------------- */
/** Renderer-callable API surface (implemented in preload).               */
/** ---------------------------------------------------------------------- */

export interface CodexThemesApi {
  /** Consume the next validated website deep-link action, if one is queued. */
  consumeOpenThemeAction(): Promise<OpenThemeAction | null>;
  getState(): Promise<AppState>;
  getSettings(): Promise<RendererSettings>;
  updateSettings(patch: Partial<RendererSettings>): Promise<RendererSettings>;
  getAppUpdateState(): Promise<AppUpdateState>;
  checkForAppUpdate(): Promise<AppUpdateState>;
  downloadAppUpdate(): Promise<AppUpdateState>;
  installAppUpdate(): Promise<{ ok: boolean; error?: string }>;
  openAppUpdateRelease(): Promise<void>;
  openAppUpdateDownload(): Promise<void>;
  listThemes(): Promise<ThemeSummary[]>;
  applyTheme(id: string, opts?: { confirmRestart?: boolean }): Promise<ApplyResult>;
  restoreOfficial(): Promise<{ ok: boolean; error?: string }>;
  openCodex(): Promise<{ ok: boolean; error?: string }>;

  /** Legacy v1 simple editor save path. */
  saveCustomTheme(input: CustomThemeInput): Promise<ThemeSummary>;
  /** v2 studio: save a draft. */
  saveThemeDraft(input: ThemeDraftInput): Promise<ThemeSummary>;
  /** v2 studio: update an existing custom draft. */
  updateTheme(id: string, input: ThemeDraftInput): Promise<ThemeSummary>;
  /** v2 studio: load a saved theme back into the editor. */
  loadThemeDraft(id: string): Promise<LoadedThemeDraft>;
  /** v2 studio: duplicate any theme (generates new UUID). */
  duplicateTheme(id: string): Promise<ThemeSummary>;
  deleteTheme(id: string): Promise<{ ok: boolean; error?: string }>;

  pickImage(): Promise<PickedImage | null>;
  /** Inspect + register an image dropped into the editor (returns palette). */
  inspectImage(path: string): Promise<PickedImage>;
  /** Generate a square stamp crop from the current hero image. */
  autoCropStamp(heroPath: string): Promise<PickedImage>;
  extractPalette(imagePath: string): Promise<ExtractedPalette>;

  /** Inspect a .codextheme package without installing it. */
  inspectThemePackage(): Promise<InspectedThemePackage | null>;
  /** Install a package that has already been inspected. */
  importInspectedTheme(inspection: InspectedThemePackage, opts?: { newId?: string }): Promise<ThemeSummary>;
  /** Legacy direct import. */
  importThemePackage(): Promise<ThemeSummary | null>;
  /** Drop the temp dir of a cancelled inspection. */
  discardInspection(tempDir: string): Promise<void>;
  exportThemePackage(id: string): Promise<string | null>;

  getCodexCliStatus(): Promise<CodexCliStatus>;
  selectCodexCli(): Promise<CodexCliStatus | null>;
  refreshCodexCliStatus(): Promise<CodexCliStatus>;

  createAiThemeJob(input: ThemeGenerationRequest): Promise<AiThemeJob>;
  startAiThemeJob(jobId: string): Promise<void>;
  selectAiThemeCandidate(jobId: string, batchId: string, candidateId: string): Promise<void>;
  sendAiThemeMessage(jobId: string, input: AiThemeMessageInput): Promise<void>;
  setCurrentAiThemeRevision(jobId: string, revisionId: string): Promise<AiThemeJob>;
  adoptAiThemeRevision(jobId: string, revisionId: string): Promise<ThemeSummary>;
  applyAiThemeRevision(
    jobId: string,
    revisionId: string,
    opts?: { confirmRestart?: boolean },
  ): Promise<AiThemeApplyResult>;
  cancelAiThemeOperation(jobId: string, operationId: string): Promise<void>;
  retryAiThemeOperation(jobId: string, operationId: string): Promise<void>;
  refineAiThemeJob(jobId: string, instruction: string, regenerateImage: boolean): Promise<void>;
  cancelAiThemeJob(jobId: string): Promise<void>;
  retryAiThemeJob(jobId: string): Promise<void>;
  getAiThemeJob(jobId: string): Promise<AiThemeJob>;
  listAiThemeJobs(): Promise<AiThemeJobSummary[]>;
  deleteAiThemeJob(jobId: string): Promise<void>;
  respondToCodexApproval(requestId: string, decision: CodexApprovalDecision): Promise<void>;

  /** ---------------------------------------------------------------------- */
  /** Auth & commerce                                                        */
  /** ---------------------------------------------------------------------- */

  authGetState(): Promise<AuthState>;
  authSignInGitHub(): Promise<{ ok: boolean; error?: string; url?: string }>;
  authSignInGoogle(): Promise<{ ok: boolean; error?: string; url?: string }>;
  authSignOut(): Promise<{ ok: boolean; error?: string }>;

  commerceListCatalog(): Promise<ThemeProduct[]>;
  commerceCreateOrder(themeId: string): Promise<PurchaseOrder>;
  commerceGetOrder(orderId: string): Promise<PurchaseOrder>;
  commerceReconcileOrder(orderId: string): Promise<PurchaseOrder>;
  commerceListEntitlements(): Promise<ThemeEntitlement[]>;
  commerceUnlockTheme(themeId: string): Promise<ThemeEntitlement>;
  commerceDownloadTheme(themeId: string): Promise<{ ok: boolean; error?: string; filePath?: string }>;
  commerceGetProfile(): Promise<CreatorProfile>;
  commerceUpdateProfile(input: { handle: string; displayName: string }): Promise<CreatorProfile>;
  /** Opens the native image picker and uploads a normalized profile avatar. */
  commerceUploadAvatar(): Promise<CreatorProfile | null>;
  commerceGetWallet(): Promise<PointWallet>;
  commerceListPointPacks(): Promise<PointPack[]>;
  commerceListPointLedger(): Promise<PointLedgerEntry[]>;
  commerceCreatePointOrder(packId: string): Promise<PointOrder>;
  commerceGetPointOrder(orderId: string): Promise<PointOrder>;
  commerceReconcilePointOrder(orderId: string): Promise<PointOrder>;
  commerceListSubmissions(): Promise<ThemeSubmission[]>;
  commerceSubmitTheme(input: SubmitThemeInput): Promise<ThemeSubmission>;
  commerceRetrySubmission(submissionId: string): Promise<ThemeSubmission>;
  commerceWithdrawSubmission(submissionId: string): Promise<ThemeSubmission>;
  commerceUnpublishOwnTheme(themeId: string, reason: string): Promise<{ ok: boolean }>;
  commerceAdminListSubmissions(status?: ThemeSubmissionStatus): Promise<ThemeSubmission[]>;
  commerceAdminReviewSubmission(
    submissionId: string,
    input: { action: "approve" | "reject"; pricePoints?: number; reason: string },
  ): Promise<ThemeSubmission>;
  commerceAdminGetOverview(): Promise<AdminOverview>;
  commerceAdminAdjustPoints(input: { userId: string; delta: number; reason: string }): Promise<PointWallet>;
  commerceAdminSetThemeState(
    themeId: string,
    input: {
      action: "unpublish" | "republish" | "suspend_downloads" | "restore_downloads";
      reason: string;
    },
  ): Promise<{ ok: boolean }>;
  commerceAdminReconcilePointOrder(orderId: string): Promise<PointOrder>;
  commerceAdminRefundPointOrder(orderId: string, reason: string): Promise<PointOrder>;
  commerceAdminReconcileThemeOrder(orderId: string): Promise<PurchaseOrder>;
  commerceAdminRefundThemeOrder(orderId: string, reason: string): Promise<PurchaseOrder>;

  onStateChanged(cb: (state: AppState) => void): () => void;
  /** Fired whenever update availability, progress, or install readiness changes. */
  onAppUpdateStateChanged(cb: (state: AppUpdateState) => void): () => void;
  /** Fired when a website deep-link action is ready to consume. */
  onOpenThemeActionAvailable(cb: () => void): () => void;
  onLog(cb: (line: LogLine) => void): () => void;
  /** Fired when the app opened a .codextheme file from Finder/Dock. */
  onPackageImported(cb: (summary: ThemeSummary) => void): () => void;
  /** Fired when an AI theme job changes. */
  onAiThemeJobChanged(cb: (job: AiThemeJob) => void): () => void;
  /** Fired when Codex asks for an approval during an AI job. */
  onCodexApprovalRequested(cb: (request: CodexApprovalRequest) => void): () => void;
  /** Fired when the authenticated user or auth error changes. */
  onAuthChanged(cb: (state: AuthState) => void): () => void;
  /** Fired when an order status changes (payment completed, etc.). */
  onOrderChanged(cb: (order: PurchaseOrder) => void): () => void;
  /** Fired when a point-pack order changes. */
  onPointOrderChanged(cb: (order: PointOrder) => void): () => void;
}
