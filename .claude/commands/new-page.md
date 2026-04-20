Create a new frontend page for $ARGUMENTS following the EOB React pattern:

1. **Page** in `frontend/src/pages/{Name}Page.tsx`
   - Lazy-loaded in App.tsx: `const {Name}Page = lazy(() => import('./pages/{Name}Page'))`
   - Use TanStack Query hooks for data fetching
   - Loading/error states via Suspense + ErrorBoundary

2. **Hook** in `frontend/src/hooks/use{Name}.ts`
   - Wrap API calls with `useQuery` / `useMutation`
   - Set `staleTime: 10 * 60 * 1000` (10 min)
   - Invalidate related queries on mutation success

3. **API function** in `frontend/src/api/client.ts`
   - Add typed fetch/create/update/delete functions
   - Use existing `client` (Axios instance with auth interceptor)

4. **Components** in `frontend/src/components/{Name}/`
   - Extract reusable pieces into sub-components
   - Use shadcn/UI primitives from `components/ui/`
   - Tailwind + `cn()` for styling

5. **Types** in `frontend/src/types/index.ts`
   - Add TypeScript interfaces for the entity

6. **Route** in `frontend/src/App.tsx`
   - Add route inside ProtectedRoute wrapper

Reference patterns: `frontend/src/pages/DashboardPage.tsx`, `frontend/src/hooks/useUsers.ts`
