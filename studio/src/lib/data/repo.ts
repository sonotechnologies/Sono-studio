import type { ProviderId, StockProviderId, Tier } from '@/ai/types';
import type { Asset, Brief, GenerationJob } from '@/generate/brief';
import type { PaymentProvider, SiteConfig, SiteTheme } from '@/site/schema';
import type { Order } from '@/site/store/payments';
import type { MirrorMeta } from '@/mirror/copy';
import type {
  ClientPatch,
  DeployProviderId,
  NewProjectInput,
  PaymentKeyProvider,
  Project,
  ProjectPatch,
  ProjectStatus,
  StudioSettings,
} from '../types';

export interface Repo {
  listProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | null>;
  createProject(input: NewProjectInput, opts: { pitchSlug: string; pitchBanner: boolean }): Promise<Project>;
  updateProject(id: string, patch: ProjectPatch): Promise<void>;
  updateClient(id: string, patch: ClientPatch): Promise<void>;
  deleteProject(id: string): Promise<void>;
  /** The newest saved version of the project's site, or null before version 1 exists. */
  getSiteVersion(projectId: string): Promise<SiteVersion | null>;
  /** Saves a new version (config already validated) and makes it current. Returns its number. */
  saveSiteVersion(projectId: string, config: SiteConfig, summary: string): Promise<number>;
  /** Newest first, without the configs. */
  listSiteVersions(projectId: string, limit?: number): Promise<VersionInfo[]>;
  getSiteVersionNumber(projectId: string, version: number): Promise<SiteVersion | null>;
  listChatMessages(projectId: string): Promise<ChatMessage[]>;
  addChatMessage(projectId: string, message: Omit<ChatMessage, 'id' | 'createdAt'>): Promise<ChatMessage>;
  createJob(projectId: string, brief: Brief): Promise<GenerationJob>;
  getJob(id: string): Promise<GenerationJob | null>;
  /** The most recent generation job for a project, if any. */
  getLatestJob(projectId: string): Promise<GenerationJob | null>;
  /** Saves a job's progress (everything except its ids and timestamps). */
  saveJob(job: GenerationJob): Promise<void>;
  listAssets(projectId: string): Promise<Asset[]>;
  /** Stores an uploaded file, or records an external (stock) image when `file` is absent. */
  addAsset(projectId: string, input: NewAsset, file?: UploadFile): Promise<Asset>;
  deleteAsset(projectId: string, assetId: string): Promise<void>;
  listProviderKeys(): Promise<ProviderKeyRow[]>;
  upsertProviderKey(provider: KeyProvider, patch: ProviderKeyPatch): Promise<void>;
  deleteProviderKey(provider: KeyProvider): Promise<void>;
  /** Counts one request against today's usage for the daily meter. */
  recordUsage(provider: ProviderId): Promise<void>;
  setCooldown(provider: ProviderId, until: string | null): Promise<void>;
  getSettings(): Promise<StudioSettings>;
  /** What the public pitch page shows. Works without a signed-in user. */
  getPitch(slug: string): Promise<PitchView | null>;
  /** Logs one open of a live pitch link. Works without a signed-in user. */
  logPitchOpen(slug: string, open: { device: Device; isBot: boolean; path: string }): Promise<void>;
  /** Newest first. */
  listPitchEvents(projectId: string, limit?: number): Promise<PitchEvent[]>;
  /** The newest deploy of a project, if any. */
  getLatestDeployment(projectId: string): Promise<Deployment | null>;
  createDeployment(projectId: string, init: Omit<Deployment, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>): Promise<Deployment>;
  updateDeployment(id: string, patch: Partial<Omit<Deployment, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>>): Promise<void>;
  /** An exact copy of a client's own site: what it holds, and the zip itself. */
  getSiteCopyMeta(projectId: string): Promise<MirrorMeta | null>;
  getSiteCopy(projectId: string): Promise<{ meta: MirrorMeta; zip: Uint8Array } | null>;
  saveSiteCopy(projectId: string, meta: MirrorMeta, zip: Uint8Array): Promise<void>;
  /** Your own styles, newest first. */
  listStyles(): Promise<CustomStyle[]>;
  getStyle(id: string): Promise<CustomStyle | null>;
  saveStyle(input: { id?: string; name: string; note: string; theme: SiteTheme }): Promise<CustomStyle>;
  deleteStyle(id: string): Promise<void>;
  /** Records where the site lives once a deploy is ready. */
  setProjectLinks(projectId: string, links: { liveUrl?: string; repoUrl?: string }): Promise<void>;
  updateSettings(settings: StudioSettings): Promise<void>;

  /* Orders. The pitch and report methods work without a signed-in user. */
  /** The encrypted test key for a live pitch link's demo checkout, or null. */
  getPitchPaymentKey(slug: string, provider: PaymentKeyProvider): Promise<string | null>;
  /** A test checkout from a pitch link, pending until paid. `tokenHash` is the sha256 of its settle token. */
  createPitchOrder(slug: string, order: Order, tokenHash: string): Promise<void>;
  /** A test checkout from the studio preview (signed in). */
  createOrder(projectId: string, order: Order, tokenHash: string): Promise<void>;
  /** Marks an order paid or failed once the provider confirmed it; needs the order's token. */
  settleOrder(reference: string, token: string, status: 'paid' | 'failed'): Promise<boolean>;
  /** The pitch slug an order came from, for webhooks. */
  orderPitchSlug(reference: string): Promise<string | null>;
  /** A paid order reported by a live site with its project's order key. */
  reportSiteOrder(projectId: string, key: string, order: Order, mode: 'test' | 'live'): Promise<boolean>;
  /** Sets the hash of the key a deployed site reports orders with. */
  setOrdersKeyHash(projectId: string, hash: string): Promise<void>;
  /** Newest first. */
  listOrders(projectId: string, limit?: number): Promise<OrderRecord[]>;
  setOrderStatus(projectId: string, orderId: string, status: OrderStatus): Promise<void>;

  /* Bookings. The pitch, site and settle methods work without a signed-in user. */
  /** Taken times (never who took them) on a live pitch link, a deployed site, or your own project. */
  pitchBusy(slug: string, from: string, to: string): Promise<Busy[]>;
  siteBusy(projectId: string, from: string, to: string): Promise<Busy[]>;
  projectBusy(projectId: string, from: string, to: string): Promise<Busy[]>;
  /** Holds a time for 30 minutes while a test deposit is paid. Throws "time taken" if it's gone. */
  createPitchBooking(slug: string, hold: BookingHold, tokenHash: string): Promise<void>;
  createPreviewBooking(projectId: string, hold: BookingHold, tokenHash: string): Promise<void>;
  /** A deployed site's booking, with its project's order key. False if the key is wrong. */
  holdSiteBooking(projectId: string, key: string, hold: BookingHold, mode: 'test' | 'live'): Promise<boolean>;
  settleBooking(reference: string, token: string): Promise<boolean>;
  confirmSiteBooking(projectId: string, key: string, reference: string): Promise<boolean>;
  bookingPitchSlug(reference: string): Promise<string | null>;
  /** Soonest first, from `since` on. */
  listBookings(projectId: string, since: string, limit?: number): Promise<BookingRecord[]>;
  setBookingStatus(projectId: string, bookingId: string, status: BookingStatus): Promise<void>;
}

export interface Busy {
  start: string;
  end: string;
}

export interface BookingHold {
  reference: string;
  serviceId: string;
  serviceName: string;
  start: string;
  end: string;
  capacity: number;
  provider: PaymentProvider | null;
  currency: string;
  deposit: number;
  price: number;
  customer: Order['customer'];
}

export type BookingStatus = 'held' | 'confirmed' | 'cancelled' | 'done' | 'no_show';

export interface BookingRecord {
  id: string;
  reference: string;
  serviceId: string;
  serviceName: string;
  start: string;
  end: string;
  status: BookingStatus;
  /** Until when a held booking keeps its time. */
  holdUntil: string | null;
  provider: PaymentProvider | null;
  mode: 'test' | 'live';
  currency: string;
  deposit: number;
  price: number;
  customer: Order['customer'];
  createdAt: string;
}

export type OrderStatus = 'pending' | 'paid' | 'failed' | 'fulfilled' | 'cancelled';

export interface OrderRecord {
  id: string;
  reference: string;
  provider: PaymentProvider;
  mode: 'test' | 'live';
  status: OrderStatus;
  currency: string;
  total: number;
  lines: Order['lines'];
  customer: Order['customer'];
  createdAt: string;
  paidAt: string | null;
}

export type KeyProvider = Exclude<ProviderId, 'demo'> | StockProviderId | DeployProviderId | PaymentKeyProvider;

export interface ProviderKeyRow {
  provider: KeyProvider;
  ciphertext: string;
  hint: string;
  models: Partial<Record<Tier, string>>;
  position: number;
  dailyLimit: number | null;
  usageDay: string | null;
  usageCount: number;
  cooldownUntil: string | null;
}

export type ProviderKeyPatch = Partial<Pick<ProviderKeyRow, 'ciphertext' | 'hint' | 'models' | 'position' | 'dailyLimit'>>;

export interface NewAsset {
  kind: Asset['kind'];
  source: Asset['source'];
  url?: string;
  alt: string;
  credit: string;
  width: number | null;
  height: number | null;
}

export interface UploadFile {
  bytes: Uint8Array;
  contentType: string;
  ext: string;
}

/** Today's usage, treating a count from an earlier day as zero. */
export function usageToday(row: Pick<ProviderKeyRow, 'usageDay' | 'usageCount'>, now: Date = new Date()): number {
  return row.usageDay === now.toISOString().slice(0, 10) ? row.usageCount : 0;
}

export type VersionInfo = Omit<SiteVersion, 'config'>;

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  scope: 'site' | 'page' | 'section' | null;
  /** Short description of what the message changed, shown as a pill. */
  change: string;
  version: number | null;
  createdAt: string;
}

export type Device = 'mobile' | 'tablet' | 'desktop';

export interface PitchView {
  name: string;
  paused: boolean;
  banner: boolean;
  expiresAt: string | null;
  /** Your contact details for the banner, from Settings. */
  whatsapp: string;
  instagram: string;
  /** Set once the site is live: the pitch link forwards here. */
  liveUrl?: string | null;
  /** The current site config; null while the link is paused or expired, or before version 1 exists. */
  config: unknown;
}

export interface PitchEvent {
  id: string;
  openedAt: string;
  device: Device;
  isBot: boolean;
  path: string;
}

/** When a pitch link stops working: the expiry counts from the day the pitch was sent, or the project was created. */
export function pitchExpiresAt(p: Pick<Project, 'pitchExpiryDays' | 'pitchSentAt' | 'createdAt'>): string | null {
  if (p.pitchExpiryDays === null) return null;
  const start = new Date(p.pitchSentAt ?? p.createdAt).getTime();
  return new Date(start + p.pitchExpiryDays * 24 * 60 * 60 * 1000).toISOString();
}

/** A style of your own: a built-in preset (theme.preset) with its colours, fonts and corners replaced. */
export interface CustomStyle {
  id: string;
  name: string;
  note: string;
  theme: SiteTheme;
  createdAt: string;
  updatedAt: string;
}

export interface Deployment {
  id: string;
  projectId: string;
  version: number;
  status: 'building' | 'ready' | 'error';
  repoFullName: string | null;
  repoUrl: string | null;
  vercelProject: string | null;
  vercelDeploymentId: string | null;
  url: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SiteVersion {
  version: number;
  config: SiteConfig;
  summary: string;
  createdAt: string;
}

/** Timestamps that a status change sets the first time it happens. */
export function statusTimestamps(
  current: { pitchSentAt: string | null; liveAt: string | null },
  status: ProjectStatus | undefined,
  now: string,
): { pitchSentAt?: string; liveAt?: string } {
  const out: { pitchSentAt?: string; liveAt?: string } = {};
  if ((status === 'pitch_sent' || status === 'client_approved') && !current.pitchSentAt) out.pitchSentAt = now;
  if (status === 'live' && !current.liveAt) out.liveAt = now;
  return out;
}

export function byNewest(a: Project, b: Project): number {
  return b.createdAt.localeCompare(a.createdAt);
}
