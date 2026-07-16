declare module '*/context/AuthContext' {
  export const AuthProvider: any;
  export const useAuth: () => any;
}

declare module '*/utils/helpers' {
  export const getAvatarColor: (name: string) => string;
  export const getInitials: (name: string) => string;
  export const formatRelativeTime: (timeMs: number) => string;
  export const sanitizeForDisplay: (str: string) => string;
}

declare module '*/lib/supabaseService' {
  export const subscribeToCollection: any;
  export const subscribeToDocument: any;
  export const updateDocument: any;
  export const getCollection: (tableName: string, includeDeleted?: boolean, maxResults?: number) => Promise<any[]>;
  export const getPaginatedCollection: any;
  export const getDocument: any;
  export const addDocument: any;
  export const deleteDocument: any;
  export const softDeleteDocument: any;
  export const upsertDocument: any;
  export const logAction: any;
  export const toCamel: (obj: any) => any;
  export const toSnake: (obj: any) => any;
  export const normaliseRow: (row: any) => any;
  export const supabase: any;
}
