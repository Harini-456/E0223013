# Stage 1

## Core Actions for Notification Platform

- Fetch active notifications for a logged-in student
- Mark notifications as read/unread
- Retrieve notification counts and summary (unread count, priority count)
- Create and broadcast new notifications
- Subscribe to real-time notifications
- Fetch a priority inbox view with top-N notifications

## REST API Design

### 1. Fetch notifications

`GET /notifications?studentId={studentId}&page={page}&limit={limit}&unreadOnly={true|false}`

Request headers:
- `Authorization: Bearer <token>`
- `Accept: application/json`

Response:
```json
{
  "studentId": 10420,
  "page": 1,
  "limit": 20,
  "total": 312,
  "notifications": [
    {
      "id": "d14695a8-0d86-4a34-9e69-3908a14576bc",
      "type": "Result",
      "title": "Mid-sem Results",
      "message": "Your mid-sem results are available.",
      "isRead": false,
      "timestamp": "2026-04-22T17:51:30Z",
      "priority": 2
    }
  ]
}
```

### 2. Fetch priority inbox

`GET /notifications/priority?studentId={studentId}&top={n}`

Response:
```json
{
  "studentId": 10420,
  "top": 10,
  "notifications": [ ... ]
}
```

### 3. Mark notification read/unread

`PATCH /notifications/{notificationId}`

Request body:
```json
{
  "isRead": true
}
```

Response:
```json
{
  "id": "d14695a8-0d86-4a34-9e69-3908a14576bc",
  "isRead": true
}
```

### 4. Create a new notification

`POST /notifications`

Request body:
```json
{
  "studentId": 10420,
  "type": "Event",
  "title": "Placement Drive",
  "message": "ACME Corp is hiring for software interns.",
  "metadata": {
    "category": "Placement",
    "source": "HR"
  }
}
```

Response:
```json
{
  "id": "f2d5a144-7c7e-4a9f-9a80-c04f7d133915",
  "createdAt": "2026-06-10T12:34:00Z"
}
```

### 5. Notification summary

`GET /notifications/summary?studentId={studentId}`

Response:
```json
{
  "studentId": 10420,
  "unreadCount": 24,
  "placementCount": 8,
  "resultCount": 5,
  "eventCount": 11,
  "topPriority": [ ... ]
}
```

## Real-time Delivery Mechanism

Preferred approach:

- WebSocket `/ws/notifications`
- Server-Sent Events (SSE) `/events/notifications`

The client subscribes once after login. The backend publishes events when:

- a new notification is created
- an existing notification is updated
- the student’s unread count changes

Example SSE payload:
```json
event: notification
data: {"id":"...","type":"Placement","message":"HR posted a new role", "timestamp":"2026-06-10T12:34:00Z"}
```

# Stage 2

## Database Recommendation

I recommend PostgreSQL for this notification platform because:

- relational integrity for student and notification references
- support for JSON metadata if needed
- strong indexing and query optimization for feed queries
- good support for partitioning, materialized views, and read replicas as scale increases

## Schema Design

```sql
CREATE TABLE students (
  student_id BIGINT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TYPE notification_type AS ENUM ('Event', 'Result', 'Placement');

CREATE TABLE notifications (
  notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id BIGINT NOT NULL REFERENCES students(student_id),
  type notification_type NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  priority SMALLINT NOT NULL DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_student_unread_created_at
  ON notifications (student_id, is_read, created_at DESC);

CREATE INDEX idx_notifications_student_priority_created_at
  ON notifications (student_id, priority DESC, created_at DESC);
```

## Growth Challenges

As the data grows, these issues may appear:

- index maintenance overhead for writes when every notification is inserted
- stale or invalidated cache entries for unread counts and priority inbox
- large page scans when clients request deep pagination
- hot partitions for popular students if all notifications are stored in one table
- increasing storage and backup time for an append-only notification history

# Stage 3

## Query Accuracy

The query below is logically accurate for fetching unread notifications for a single student:

```sql
SELECT *
FROM notifications
WHERE studentID = 10420
  AND isRead = false
ORDER BY createdAt DESC;
```

## Why it may be slow

This query is slow because the database must filter millions of rows and sort the results. If there is no supporting index, it may scan most of the student’s rows or the entire table. Even with an index on `studentID`, the `isRead` filter and `ORDER BY createdAt DESC` can still force a less efficient plan unless the index covers both predicates and sort order.

## Recommended change

Use a composite index tuned for the query pattern:

```sql
CREATE INDEX idx_notifications_student_read_created_at
  ON notifications (studentID, isRead, createdAt DESC);
```

This index allows the database to quickly find unread rows for the student in descending time order, avoiding a full scan and expensive sort.

## Likely computation cost

With the composite index, the query can run in roughly `O(log N + K)` time for the matching rows, where `N` is the number of notifications and `K` is the number of returned rows. Without it, the query may degrade toward `O(N)` for the filtered table scan plus `O(K log K)` for sort.

## Indexing every column

Adding indexes on every column is not effective. It increases write latency, storage usage, and index maintenance overhead. Only create indexes that support actual query patterns. For notification feeds, focus on composite indexes for student id, read state, type, priority, and timestamp.

## Placement notification query

```sql
SELECT *
FROM notifications
WHERE notificationType = 'Placement'
  AND createdAt >= NOW() - INTERVAL '7 days';
```

If you also want to filter by student:

```sql
SELECT *
FROM notifications
WHERE studentID = 10420
  AND notificationType = 'Placement'
  AND createdAt >= NOW() - INTERVAL '7 days';
```

# Stage 4

## Suggested performance improvements

1. Cache the recent notification feed in Redis
   - store per-student unread summary and the latest 20 notifications
   - refresh when new notification arrives or when read state changes
   - tradeoff: potential stale reads for a short interval, but much lower DB load

2. Use a dedicated read model or materialized view
   - build a precomputed unread feed for each student
   - refresh asynchronously via change data capture or application events
   - tradeoff: additional complexity and eventual consistency

3. Introduce pagination with cursor-based paging
   - avoid deep OFFSET scans by using `created_at` cursor
   - tradeoff: slightly more complex client logic, but stable performance

4. Push notifications to the client
   - use WebSockets, SSE, or push channels so the browser receives only updates instead of polling every page load
   - tradeoff: additional infrastructure and session management overhead

5. Shard or partition the notifications table
   - partition by student bucket or date for very large datasets
   - tradeoff: more complex schema and query planning, but better write and read scalability

## Recommended approach

The best combination is:
- keep the authoritive notifications table in PostgreSQL
- cache the most recent unread notifications per student in Redis
- use push delivery for browser clients and only fall back to fetch when missed events occur

# Stage 5

## Why the pseudocode is a problem

The given `notify_all` function is synchronous and sequential. It performs email sending, DB insert, and push for each student one by one. At 50,000 students, this will take far too long and may fail under load. It also couples the three side effects without retry or backpressure handling.

## Better solution

Use an asynchronous, event-driven pipeline:

1. enqueue a bulk notification job in a queue (`notify_all_job`)
2. use worker processes to:
   - write notification rows in bulk or via batched inserts
   - push app notifications asynchronously
   - send email using a separate email delivery worker
3. ensure each step is idempotent with a unique job and notification key
4. track progress and errors separately, and retry failed deliveries

## Tradeoffs

- asynchronous delivery improves throughput and user experience
- there is eventual consistency between email, in-app, and database state
- failure handling becomes more important, but the system is more resilient

# Stage 6

## Priority Inbox approach

Priority is determined by:
- notification type weight: `Placement > Result > Event`
- recency: newer notifications should surface higher among similar weight messages

### Scoring formula

Use a composite score such as:

```text
score = typeWeight * 1_000_000_000 + unixTimestamp
```

This guarantees that the notification type is the primary sorter and recency is the secondary sorter.

## Efficient maintenance of top N

- keep a fixed-size min-heap of the top N notifications
- for each incoming notification, compute its score and insert only if it is better than the current smallest top-N notification
- this is `O(log N)` per incoming notification and `O(M log N)` to process `M` notifications

This is much more efficient than sorting the entire notification feed every time.

## Code implementation

A functioning implementation is available in `notification_app_be/priority_inbox.js`.

### How to use

```bash
AUTH_TOKEN=your_token node notification_app_be/priority_inbox.js
```

### Output

The script prints the top priority notifications by type and timestamp.

## Notes on new notifications

When new notifications arrive, maintain the top 10 by:
- recomputing only against the current top 10 buffer and the new item
- removing the current minimum if the new item scores higher
- this avoids a full resort of the full notification list on every arrival
