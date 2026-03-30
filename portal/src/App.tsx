import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { PortalPage } from "@/pages/PortalPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PortalLayout />}>
          <Route path="/" element={<PortalPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
