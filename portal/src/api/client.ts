import axios from "axios";

const baseURL = import.meta.env.VITE_PORTAL_API_URL || "/api";

export const apiClient = axios.create({ baseURL });

export interface GuideResponse {
  id: string;
  title: string;
  category: string;
  content: string;
  author: string;
  created_at: string;
  updated_at: string;
}

export const api = {
  listGuides: (params?: { category?: string; search?: string }) =>
    apiClient
      .get<GuideResponse[]>("/guides", { params })
      .then((r) => r.data),
  getGuide: (id: string) =>
    apiClient.get<GuideResponse>(`/guides/${id}`).then((r) => r.data),
  createGuide: (data: { title: string; category: string; content: string }) =>
    apiClient.post<GuideResponse>("/guides", data).then((r) => r.data),
  updateGuide: (
    id: string,
    data: { title?: string; category?: string; content?: string },
  ) => apiClient.put<GuideResponse>(`/guides/${id}`, data).then((r) => r.data),
  deleteGuide: (id: string) => apiClient.delete(`/guides/${id}`),
  healthCheck: () =>
    apiClient.get<{ portal: string; services: unknown[]; all_online: boolean }>(
      "/health",
    ).then((r) => r.data),
};
