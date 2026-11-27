export type UserLite = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

export type VideoDTO = {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  caption: string;
  hashtags: string[];
  audioName: string;
  createdAt: string;
  author: UserLite & { followedByMe: boolean; isMe: boolean };
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  views: number;
  likedByMe: boolean;
  savedByMe: boolean;
  /** Why For You picked this video (only on the For You feed). */
  why?: string[];
};

export type CommentDTO = {
  id: string;
  text: string;
  createdAt: string;
  user: UserLite;
  likes: number;
  likedByMe: boolean;
};

export type Activity = {
  id: string;
  kind: "like" | "comment" | "comment_like" | "mention" | "follow";
  createdAt: string;
  user: { id: string; username: string; displayName: string; avatarUrl: string | null };
  text?: string;
  video?: { id: string; thumbnailUrl: string | null; url: string };
};

export type MessageDTO = {
  id: string;
  text: string;
  createdAt: string;
  readAt: string | null;
  senderId: string;
  video: { id: string; thumbnailUrl: string | null; url: string; caption: string; author: { username: string } } | null;
};

export type ConversationDTO = { user: UserLite; last: MessageDTO; unread: number };

export type NoticeDTO = { id: string; title: string; body: string; link: string | null; createdAt: string; readAt: string | null };

export type InboxSummary = {
  unread: { followers: number; activity: number; system: number; messages: number; total: number };
  latestFollower: UserLite | null;
  latestActivity: Activity | null;
  latestNotice: NoticeDTO | null;
  conversations: ConversationDTO[];
  friends: (UserLite & { mutual: boolean })[];
};
