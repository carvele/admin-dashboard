export type OffsetPageResult<T> = {
  items: T[];
  hasMore: boolean;
  nextOffset: number;
  totalCount?: number;
};

export type CursorPageResult<T, C> = {
  items: T[];
  hasMore: boolean;
  nextCursor?: C;
};

export type MessageCursor = {
  createdAt: string;
  id: string;
};
