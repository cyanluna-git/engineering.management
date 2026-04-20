Create a new FastAPI endpoint for $ARGUMENTS following the EOB layer pattern:

1. **Schema** in `backend/app/schemas/{name}.py`
   - Base, Create, Update, Response schema triplet
   - Use `Field(...)` with validation constraints
   - `class Config: from_attributes = True`

2. **Model** in `backend/app/models/{name}.py`
   - UUID primary key (`default=uuid.uuid4`)
   - `created_at`, `updated_at` timestamps
   - Relationships where applicable

3. **Service** in `backend/app/services/{name}_service.py`
   - Constructor takes `db: Session`
   - Methods: `list()`, `get_by_id()`, `create()`, `update()`, `delete()`
   - All business logic here, not in endpoint

4. **Endpoint** in `backend/app/api/endpoints/{name}.py`
   - `APIRouter(prefix="/{name}s", tags=["{name}s"])`
   - Include `Depends(get_db)` and role guards
   - Set `response_model` on all endpoints
   - Thin handlers — delegate to service

5. **Register** router in `backend/app/main.py`

6. **Test** in `backend/tests/test_{name}.py`
   - Test CRUD operations
   - Test authorization (role-based)
   - Test error cases (404, 409)

Reference patterns: `backend/app/api/endpoints/users.py`, `backend/app/services/user_service.py`
