/* Shared shapes for Sono AI's assistant (stage 3). */

export type Mode = 'casual' | 'studio' | 'search';
export type Channel = 'studio' | 'telegram';

export interface Source {
  label: string;
  href: string;
}

export interface Message {
  id: string;
  projectId: string | null;
  channel: Channel;
  role: 'user' | 'assistant';
  text: string;
  mode: Mode | 'rule' | 'draft' | 'build' | null;
  sources: Source[];
  createdAt: string;
  /** The chat it's in (studio messages); Telegram is one running conversation. */
  threadId?: string | null;
}
export type NewMessage = Omit<Message, 'id' | 'createdAt'>;

/** A chat with Sono AI in the studio. */
export interface Thread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface Draft {
  id: string;
  projectId: string | null;
  kind: 'follow_up' | 'quote' | 'checklist';
  /** How the message reaches the client once you approve it; null means copy it. */
  channel: 'whatsapp' | 'instagram' | null;
  /** The number or handle it goes to. */
  recipient: string;
  title: string;
  why: string;
  body: string;
  finalBody: string | null;
  status: 'pending' | 'approved' | 'skipped';
  createdAt: string;
  decidedAt: string | null;
}
export type NewDraft = Omit<Draft, 'id' | 'finalBody' | 'status' | 'createdAt' | 'decidedAt'>;
export type DraftDecision = 'approved' | 'skipped';

export interface Rule {
  id: string;
  text: string;
  enabled: boolean;
  confirmed: boolean;
  source: Channel;
  createdAt: string;
}

export interface ScoreRow {
  task: string;
  provider: string;
  model: string;
  requests: number;
  failures: number;
  kept: number;
  edited: number;
  undone: number;
  regenerated: number;
}
