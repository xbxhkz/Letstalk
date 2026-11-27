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
  kind: "like" | "comment" | "follow";
  createdAt: string;
  user: { id: string; username: string; displayName: string; avatarUrl: string | null };
  text?: string;
  video?: { id: string; thumbnailUrl: string | null; url: string };
};
