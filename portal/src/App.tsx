import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { PortalPage } from "@/pages/PortalPage";
import { GuidesPage } from "@/pages/GuidesPage";
import { GuideDetailPage } from "@/pages/GuideDetailPage";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 60 * 5 } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<PortalLayout />}>
            <Route path="/" element={<PortalPage />} />
            <Route path="/guides" element={<GuidesPage />} />
            <Route path="/guides/:id" element={<GuideDetailPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
