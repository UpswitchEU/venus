# Session Management API Documentation

**Purpose**: Define backend API endpoints for valuation session management  
**Status**: 🔴 Not Yet Implemented (Frontend Ready)  
**Required For**: ChatGPT/Cursor-style session continuity

---

## Overview

The session management API enables users to:
- View all their previous valuations (like ChatGPT chat history)
- Continue existing valuations from where they left off
- Delete unwanted valuations
- Prefill data from main frontend business cards

**Architecture**: RESTful API with PostgreSQL persistence

---

## Database Schema

### ValuationSession Table

```sql
CREATE TABLE valuation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id VARCHAR(255) UNIQUE NOT NULL,
  user_id UUID,  -- Nullable for guest sessions
  guest_session_id VARCHAR(255),  -- For guest tracking
  
  -- Session metadata
  status VARCHAR(50) DEFAULT 'IN_PROGRESS',  -- IN_PROGRESS, COMPLETED, ARCHIVED, DELETED
  current_view VARCHAR(50) DEFAULT 'MANUAL',  -- MANUAL, CONVERSATIONAL
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  
  -- Session data (JSONB)
  form_data JSONB,
  collected_data JSONB,
  conversation_history JSONB,
  valuation_result JSONB,
  
  -- Business card integration
  business_card_token VARCHAR(255),
  prefilled_from_card BOOLEAN DEFAULT FALSE,
  
  -- Indexes
  INDEX idx_user_updated (user_id, updated_at DESC),
  INDEX idx_guest_updated (guest_session_id, updated_at DESC),
  INDEX idx_status (status),
  INDEX idx_report_id (report_id)
);
```

### Migration Script

```prisma
model ValuationSession {
  id                   String    @id @default(uuid())
  report_id            String    @unique @map("report_id")
  user_id              String?   @map("user_id")
  guest_session_id     String?   @map("guest_session_id")
  
  status               SessionStatus @default(IN_PROGRESS)
  current_view         FlowType  @default(MANUAL) @map("current_view")
  
  created_at           DateTime  @default(now()) @map("created_at")
  updated_at           DateTime  @updatedAt @map("updated_at")
  completed_at         DateTime? @map("completed_at")
  
  form_data            Json?     @map("form_data")
  collected_data       Json?     @map("collected_data")
  conversation_history Json?     @map("conversation_history")
  valuation_result     Json?     @map("valuation_result")
  
  business_card_token  String?   @map("business_card_token")
  prefilled_from_card  Boolean   @default(false) @map("prefilled_from_card")
  
  @@index([user_id, updated_at])
  @@index([guest_session_id, updated_at])
  @@index([status])
  @@map("valuation_sessions")
}

enum SessionStatus {
  IN_PROGRESS
  COMPLETED
  ARCHIVED
  DELETED
}

enum FlowType {
  MANUAL
  CONVERSATIONAL
}
```

---

## API Endpoints

### 1. List Sessions

**Endpoint**: `GET /api/sessions`

**Purpose**: Fetch recent valuation sessions for home page display

**Authentication**: Optional (supports guest and authenticated users)

**Query Parameters**:
- `user_id` (optional, string) - Filter by user ID
- `guest_session_id` (optional, string) - Filter by guest session
- `limit` (optional, number, default: 20) - Max results
- `offset` (optional, number, default: 0) - Pagination offset
- `status` (optional, enum) - Filter by status: `in_progress` | `completed` | `archived` | `all`

**Request Example**:
```bash
GET /api/sessions?limit=20&status=all
Authorization: Bearer <token>  # Optional - for authenticated users
Cookie: guest_session=<id>  # Optional - for guests
```

**Response**:
```typescript
{
  sessions: [
    {
      id: "uuid",
      report_id: "val_1234567890_abc",
      status: "IN_PROGRESS",
      current_view: "MANUAL",
      created_at: "2024-12-13T10:00:00Z",
      updated_at: "2024-12-13T10:30:00Z",
      completed_at: null,
      form_data: {
        company_name: "Tech Corp",
        industry: "technology",
        // ... partial form data
      },
      valuation_result: null
    },
    // ... more sessions
  ],
  total: 45,
  has_more: true
}
```

**Response Codes**:
- `200 OK` - Sessions returned
- `401 Unauthorized` - No auth token and no guest session
- `500 Server Error` - Database error

**Implementation Notes**:
- Query by `user_id` OR `guest_session_id` (not both)
- Exclude `DELETED` status by default
- Sort by `updated_at DESC` (most recent first)
- Return only necessary fields (not full session data)
- Paginate results (default 20 per page)

---

### 2. Get Session by ID

**Endpoint**: `GET /api/sessions/:reportId`

**Purpose**: Load full session data for restoration

**Authentication**: Optional

**Path Parameters**:
- `reportId` (required, string) - Report ID (e.g., `val_1234567890_abc`)

**Request Example**:
```bash
GET /api/sessions/val_1234567890_abc
Authorization: Bearer <token>  # Optional
Cookie: guest_session=<id>  # Optional
```

**Response**:
```typescript
{
  session: {
    id: "uuid",
    report_id: "val_1234567890_abc",
    user_id: "user_uuid",
    guest_session_id: null,
    status: "IN_PROGRESS",
    current_view: "CONVERSATIONAL",
    created_at: "2024-12-13T10:00:00Z",
    updated_at: "2024-12-13T10:30:00Z",
    completed_at: null,
    form_data: { /* complete form data */ },
    collected_data: [ /* DataResponse[] */ ],
    conversation_history: [ /* Message[] */ ],
    valuation_result: null,  // Or ValuationResponse if completed
    business_card_token: "abc123",
    prefilled_from_card: true
  }
}
```

**Response Codes**:
- `200 OK` - Session found
- `404 Not Found` - Session doesn't exist
- `403 Forbidden` - Session belongs to different user
- `500 Server Error` - Database error

**Implementation Notes**:
- Verify ownership (user_id OR guest_session_id matches)
- Return full session data including history
- Handle deleted sessions (404)

---

### 3. Create Session

**Endpoint**: `POST /api/sessions`

**Purpose**: Create new valuation session

**Authentication**: Optional

**Request Body**:
```typescript
{
  report_id: "val_1234567890_abc",
  current_view: "manual",  // "manual" | "conversational"
  initial_data?: {
    company_name: "Tech Corp",
    industry: "technology",
    // ... any prefilled fields
  },
  business_card_token?: "abc123"
}
```

**Request Example**:
```bash
POST /api/sessions
Content-Type: application/json
Authorization: Bearer <token>  # Optional

{
  "report_id": "val_1234567890_abc",
  "current_view": "manual",
  "initial_data": {
    "company_name": "Tech Corp",
    "industry": "technology"
  }
}
```

**Response**:
```typescript
{
  session: {
    id: "uuid",
    report_id: "val_1234567890_abc",
    user_id: "user_uuid",  // Or null if guest
    guest_session_id: "guest_xyz",  // Or null if authenticated
    status: "IN_PROGRESS",
    current_view: "MANUAL",
    created_at: "2024-12-13T10:00:00Z",
    updated_at: "2024-12-13T10:00:00Z",
    form_data: { /* initial_data */ },
    // ... other fields
  }
}
```

**Response Codes**:
- `201 Created` - Session created
- `400 Bad Request` - Invalid request body
- `409 Conflict` - Report ID already exists
- `500 Server Error` - Database error

**Implementation Notes**:
- Auto-assign `user_id` if authenticated
- Auto-assign `guest_session_id` if guest
- Initialize with `status: IN_PROGRESS`
- Store `initial_data` in `form_data`
- If `business_card_token` provided, mark `prefilled_from_card: true`

---

### 4. Update Session

**Endpoint**: `PATCH /api/sessions/:reportId`

**Purpose**: Update session data (auto-save)

**Authentication**: Optional

**Path Parameters**:
- `reportId` (required, string)

**Request Body**:
```typescript
{
  partial_data?: {
    // Any ValuationRequest fields
    company_name?: string,
    revenue?: number,
    // ... incremental updates
  },
  current_view?: "manual" | "conversational",
  conversation_history?: Message[],
  valuation_result?: ValuationResponse  // When calculation completes
}
```

**Request Example**:
```bash
PATCH /api/sessions/val_1234567890_abc
Content-Type: application/json

{
  "partial_data": {
    "company_name": "Tech Corp Updated",
    "revenue": 1000000
  }
}
```

**Response**:
```typescript
{
  session: {
    id: "uuid",
    report_id: "val_1234567890_abc",
    updated_at: "2024-12-13T10:35:00Z",
    // ... full session data
  }
}
```

**Response Codes**:
- `200 OK` - Session updated
- `404 Not Found` - Session doesn't exist
- `403 Forbidden` - Unauthorized
- `500 Server Error` - Database error

**Implementation Notes**:
- Deep merge `partial_data` with existing `form_data`
- Update `updated_at` timestamp
- If `valuation_result` provided, set `status: COMPLETED` and `completed_at`
- Verify ownership before updating

---

### 5. Delete Session

**Endpoint**: `DELETE /api/sessions/:reportId`

**Purpose**: Soft-delete valuation session

**Authentication**: Optional

**Path Parameters**:
- `reportId` (required, string)

**Request Example**:
```bash
DELETE /api/sessions/val_1234567890_abc
Authorization: Bearer <token>  # Optional
```

**Response**:
```typescript
{
  success: true,
  deleted_report_id: "val_1234567890_abc"
}
```

**Response Codes**:
- `200 OK` - Session deleted
- `404 Not Found` - Session doesn't exist
- `403 Forbidden` - Unauthorized
- `500 Server Error` - Database error

**Implementation Notes**:
- Soft delete: Set `status: DELETED` (don't remove from DB)
- Verify ownership before deleting
- Deleted sessions excluded from list endpoint
- Hard delete after 30 days (background job)

---

### 6. Duplicate Session

**Endpoint**: `POST /api/sessions/:reportId/duplicate`

**Purpose**: Create copy of existing session

**Authentication**: Optional

**Path Parameters**:
- `reportId` (required, string) - Original report ID

**Request Body**: None

**Request Example**:
```bash
POST /api/sessions/val_1234567890_abc/duplicate
Authorization: Bearer <token>
```

**Response**:
```typescript
{
  original_report_id: "val_1234567890_abc",
  new_report_id: "val_0987654321_xyz",
  session: {
    id: "new_uuid",
    report_id: "val_0987654321_xyz",
    // ... copied data from original
    created_at: "2024-12-13T10:40:00Z",
    status: "IN_PROGRESS",  // Reset to IN_PROGRESS
    valuation_result: null  // Clear result
  }
}
```

**Response Codes**:
- `201 Created` - Session duplicated
- `404 Not Found` - Original session not found
- `403 Forbidden` - Unauthorized
- `500 Server Error` - Database error

**Implementation Notes**:
- Copy `form_data` from original
- Generate new `report_id`
- Reset `status` to `IN_PROGRESS`
- Clear `valuation_result`
- Set new timestamps

---

### 7. Get Business Card

**Endpoint**: `GET /api/business-cards`

**Purpose**: Fetch business card data from main frontend

**Authentication**: None required (uses token)

**Query Parameters**:
- `token` (required, string) - Business card token from main frontend

**Request Example**:
```bash
GET /api/business-cards?token=abc123xyz
```

**Response**:
```typescript
{
  company_name: "Tech Corp",
  industry: "technology",
  business_type_id: "saas-b2b",
  revenue: 1000000,
  employee_count: 25,
  country_code: "BE",
  founding_year: 2018,
  description: "B2B SaaS platform for...",
  city: "Brussels",
  business_highlights: "High growth, recurring revenue",
  reason_for_selling: "Retirement"
}
```

**Response Codes**:
- `200 OK` - Business card found
- `400 Bad Request` - Missing token
- `404 Not Found` - Invalid token
- `500 Server Error` - Database error

**Implementation Notes**:
- Query main database (not valuation tester DB)
- Validate token format
- Return only public fields (no sensitive data)
- Cache for 5 minutes (token doesn't change frequently)

---

## Authentication & Authorization

### Guest Users
- Tracked via `guest_session_id` cookie
- Can create sessions without login
- Sessions stored with `guest_session_id`, `user_id = null`
- On login: Migrate sessions (`user_id` set, `guest_session_id` cleared)

### Authenticated Users
- Tracked via JWT token in Authorization header
- Sessions stored with `user_id`, `guest_session_id = null`
- Can access only their own sessions

### Ownership Verification
```typescript
// Check if user owns session
const isOwner = 
  (userId && session.user_id === userId) ||
  (guestSessionId && session.guest_session_id === guestSessionId);

if (!isOwner) {
  return res.status(403).json({ error: 'Unauthorized' });
}
```

---

## Error Handling

### Standard Error Response
```typescript
{
  error: string,  // Human-readable message
  code?: string,  // Machine-readable code
  details?: any   // Additional context
}
```

### Error Codes
- `SESSION_NOT_FOUND` - Session doesn't exist
- `UNAUTHORIZED` - User doesn't own session
- `INVALID_TOKEN` - Business card token invalid
- `VALIDATION_ERROR` - Request body validation failed
- `DATABASE_ERROR` - Database operation failed

---

## Rate Limiting

### Per User
- 100 requests per minute per user
- 1000 requests per hour per user

### Per Guest Session
- 50 requests per minute per guest
- 500 requests per hour per guest

### Implementation
```typescript
// Redis-based rate limiting
const rateLimiter = new RateLimiter({
  redis,
  keyPrefix: 'session-api',
  points: 100,
  duration: 60,
});

// Apply to all session endpoints
router.use('/sessions', rateLimiter.middleware);
```

---

## Implementation Priority

### Phase 1: Critical (Week 1)
1. **List Sessions** (GET /api/sessions)
   - Essential for showing recent reports on home page
   - Estimated: 2 hours

2. **Get Session by ID** (Already exists as GET /api/valuation-session/:reportId)
   - Used by restoreSession
   - ✅ Already implemented

3. **Create Session** (Already exists as POST /api/valuation-session)
   - Used when starting new valuation
   - ✅ Already implemented

4. **Update Session** (Already exists as PATCH /api/valuation-session/:reportId)
   - Used for auto-save
   - ✅ Already implemented

### Phase 2: Important (Week 2)
5. **Delete Session** (DELETE /api/sessions/:reportId)
   - Estimated: 1 hour
   - Nice to have but not blocking

6. **Business Cards** (GET /api/business-cards)
   - Estimated: 2 hours
   - Required for prefill feature

### Phase 3: Optional (Future)
7. **Duplicate Session** (POST /api/sessions/:reportId/duplicate)
   - Estimated: 1 hour
   - Convenience feature

---

## Testing Strategy

### Unit Tests
```typescript
describe('Session API', () => {
  describe('GET /api/sessions', () => {
    it('should list sessions for authenticated user', async () => {
      const response = await request(app)
        .get('/api/sessions?limit=10')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      
      expect(response.body.sessions).toBeInstanceOf(Array);
      expect(response.body.total).toBeGreaterThan(0);
    });
    
    it('should list sessions for guest', async () => {
      const response = await request(app)
        .get('/api/sessions?limit=10')
        .set('Cookie', `guest_session=${guestSessionId}`)
        .expect(200);
      
      expect(response.body.sessions).toBeInstanceOf(Array);
    });
    
    it('should filter by status', async () => {
      const response = await request(app)
        .get('/api/sessions?status=completed')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      
      expect(response.body.sessions.every(s => s.status === 'COMPLETED')).toBe(true);
    });
  });
  
  describe('DELETE /api/sessions/:reportId', () => {
    it('should delete own session', async () => {
      const response = await request(app)
        .delete(`/api/sessions/${reportId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
    });
    
    it('should return 403 for other user session', async () => {
      await request(app)
        .delete(`/api/sessions/${otherUserReportId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });
});
```

### Integration Tests
```typescript
describe('Session Management Flow', () => {
  it('should complete full session lifecycle', async () => {
    // 1. Create session
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ report_id: reportId, current_view: 'manual' })
      .expect(201);
    
    const sessionId = createRes.body.session.id;
    
    // 2. Update session
    await request(app)
      .patch(`/api/sessions/${reportId}`)
      .send({ partial_data: { company_name: 'Updated' } })
      .expect(200);
    
    // 3. List sessions (should include new one)
    const listRes = await request(app)
      .get('/api/sessions')
      .expect(200);
    
    expect(listRes.body.sessions.some(s => s.id === sessionId)).toBe(true);
    
    // 4. Delete session
    await request(app)
      .delete(`/api/sessions/${reportId}`)
      .expect(200);
    
    // 5. Verify deleted (should return 404)
    await request(app)
      .get(`/api/sessions/${reportId}`)
      .expect(404);
  });
});
```

---

## Performance Considerations

### Database Indexes
```sql
-- Critical for performance
CREATE INDEX idx_user_updated ON valuation_sessions(user_id, updated_at DESC);
CREATE INDEX idx_guest_updated ON valuation_sessions(guest_session_id, updated_at DESC);
CREATE INDEX idx_status ON valuation_sessions(status);
```

### Caching Strategy
- Cache recent sessions per user (5 minutes TTL)
- Invalidate on: create, update, delete
- Use Redis for distributed caching

### Query Optimization
- Only select necessary fields for list endpoint
- Use pagination (limit + offset)
- Filter deleted sessions in query (not in application)

---

## Security Considerations

### Data Privacy
- ✅ Users can only access their own sessions
- ✅ Guests can only access sessions with their guest_session_id
- ✅ Soft delete preserves data for audit (hard delete after 30 days)

### Input Validation
- ✅ Validate report_id format
- ✅ Validate status enum values
- ✅ Validate limit/offset ranges
- ✅ Sanitize business card data

### GDPR Compliance
- User can request all their data (GET /api/sessions)
- User can delete all their data (DELETE with status=all)
- Deleted sessions hard-deleted after 30 days

---

## Monitoring & Observability

### Metrics to Track
- `session.created.count` - New sessions per hour
- `session.restored.count` - Continued sessions per hour
- `session.deleted.count` - Deleted sessions per hour
- `session.list.duration` - List endpoint latency
- `session.restore.duration` - Restore endpoint latency

### Alerts
- Session list latency >500ms
- Session restore failure rate >5%
- Database connection errors

### Logging
```typescript
logger.info('Session created', { 
  reportId, 
  userId: user?.id, 
  guestSessionId, 
  currentView 
});

logger.info('Session restored', { 
  reportId, 
  duration: Date.now() - startTime,
  hasFormData: !!session.form_data,
  hasResult: !!session.valuation_result
});
```

---

## Migration Strategy

### From Current State to New API

**Current**: Sessions created via `POST /api/valuation-session`  
**New**: Sessions listed via `GET /api/sessions`

**Migration Steps**:
1. Add new list/delete endpoints (backward compatible)
2. Frontend uses new endpoints
3. Keep old endpoints for backward compatibility
4. Deprecate old endpoints after 2 months
5. Remove old endpoints after 6 months

### Data Migration
```sql
-- Backfill status for existing sessions
UPDATE valuation_sessions
SET status = CASE
  WHEN valuation_result IS NOT NULL THEN 'COMPLETED'
  ELSE 'IN_PROGRESS'
END
WHERE status IS NULL;
```

---

## Timeline Estimate

| Task | Estimate | Priority |
|------|----------|----------|
| Database schema + migrations | 1 hour | Critical |
| List sessions endpoint | 2 hours | Critical |
| Delete session endpoint | 1 hour | High |
| Business cards endpoint | 2 hours | High |
| Testing (unit + integration) | 2 hours | Critical |
| Documentation | 1 hour | Medium |
| **Total** | **9 hours** | |

**Recommendation**: Implement in 2 sprints (4-5 hours each)

---

## Frontend Integration Status

### ✅ Complete
- Report lifecycle service (`src/services/reports/ReportService`)
- Report asset persistence service (`src/services/report/ReportAssetService`)
- BusinessCardService (with placeholder fetch method)
- useReportsStore
- ReportCard component
- RecentReportsSection component
- HomePage integration
- ValuationSessionManager restoration logic

### ⏳ Waiting for Backend
- Actual list endpoint (currently returns `[]`)
- Actual delete endpoint (currently logs only)
- Actual business cards endpoint (currently returns `{}`)

### 🎯 Once Backend Ready
Frontend will work immediately - no code changes needed! Just:
1. Deploy backend endpoints
2. Update environment variables if needed
3. Test end-to-end flows

---

**End of API Documentation**

**Next**: Implement backend endpoints as specified above
