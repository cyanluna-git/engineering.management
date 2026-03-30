import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";

export function useGuides(params?: { category?: string; search?: string }) {
  return useQuery({
    queryKey: ["guides", params],
    queryFn: () => api.listGuides(params),
    staleTime: 1000 * 60 * 5,
  });
}

export function useGuide(id: string) {
  return useQuery({
    queryKey: ["guides", id],
    queryFn: () => api.getGuide(id),
    enabled: !!id,
  });
}

export function useCreateGuide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createGuide,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["guides"] }),
  });
}

export function useUpdateGuide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; title?: string; category?: string; content?: string }) =>
      api.updateGuide(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["guides"] }),
  });
}

export function useDeleteGuide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteGuide,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["guides"] }),
  });
}
