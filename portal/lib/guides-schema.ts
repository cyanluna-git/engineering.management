export const GUIDE_CATEGORY_OPTIONS = [
  "IT",
  "HR",
  "Finance",
  "General",
] as const;

export interface Guide {
  id: string;
  title: string;
  category: string;
  content: string;
  author: string;
  created_at: string;
  updated_at: string;
}

export interface GuideListQuery {
  category?: string;
  search?: string;
}

export interface GuideCreateInput {
  title: string;
  category: string;
  content: string;
  author: string;
}

export interface GuideUpdateInput {
  title?: string;
  category?: string;
  content?: string;
  author?: string;
}
