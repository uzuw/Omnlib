import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// ---- enums (kept as const arrays; used for CHECK constraints via drizzle) ----
export const mediaTypes = ["anime", "manga", "light_novel", "webseries", "movie", "book"] as const;
export type MediaType = (typeof mediaTypes)[number];

export const mediaStatuses = ["releasing", "finished", "upcoming", "hiatus", "cancelled"] as const;
export type MediaStatus = (typeof mediaStatuses)[number];

export const relationTypes = [
  "prequel", "sequel", "adaptation", "side_story", "spinoff",
  "alternate", "contains", "parent",
] as const;
export type RelationType = (typeof relationTypes)[number];

export const libraryStatuses = ["planned", "in_progress", "completed", "on_hold", "dropped"] as const;
export type LibraryStatus = (typeof libraryStatuses)[number];

export const progressUnits = ["episode", "chapter", "volume", "page", "percent"] as const;
export type ProgressUnit = (typeof progressUnits)[number];

export const activityActions = ["added", "status_change", "progress_update", "rated", "imported", "removed"] as const;
export type ActivityAction = (typeof activityActions)[number];

// ---- unified media catalog (the "own database built from provider APIs") ----
export const media = sqliteTable(
  "media",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    mediaType: text("media_type", { enum: mediaTypes }).notNull(),
    title: text("title").notNull(),
    nativeTitle: text("native_title"),
    synopsis: text("synopsis"),
    coverUrl: text("cover_url"),
    bannerUrl: text("banner_url"),
    year: integer("year"),
    status: text("status", { enum: mediaStatuses }).notNull().default("upcoming"),
    genres: text("genres", { mode: "json" }).$type<string[]>(),
    avgRating: real("avg_rating"),
    episodesTotal: integer("episodes_total"),
    chaptersTotal: integer("chapters_total"),
    volumesTotal: integer("volumes_total"),
    runtimeMinutes: integer("runtime_minutes"),
    creator: text("creator"),
    providerSource: text("provider_source").notNull(),
    providerId: text("provider_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("media_provider_uniq").on(t.providerSource, t.providerId),
    index("media_type_idx").on(t.mediaType),
    index("media_title_idx").on(t.title),
  ],
);

// cross-provider identity (dedupe/linking layer)
export const mediaExternalIds = sqliteTable(
  "media_external_ids",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    mediaId: integer("media_id").notNull().references(() => media.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
  },
  (t) => [
    uniqueIndex("ext_ids_uniq").on(t.mediaId, t.provider),
    index("ext_ids_provider_idx").on(t.provider, t.externalId),
  ],
);

// the cross-format media graph (anime <-> manga <-> novel <-> series)
export const mediaRelations = sqliteTable(
  "media_relations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceId: integer("source_id").notNull().references(() => media.id, { onDelete: "cascade" }),
    targetId: integer("target_id").notNull().references(() => media.id, { onDelete: "cascade" }),
    relationType: text("relation_type", { enum: relationTypes }).notNull(),
  },
  (t) => [
    uniqueIndex("relations_uniq").on(t.sourceId, t.targetId, t.relationType),
    index("relations_target_idx").on(t.targetId),
  ],
);

// per-episode data (anime + webseries)
export const mediaEpisodes = sqliteTable(
  "media_episodes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    mediaId: integer("media_id").notNull().references(() => media.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title"),
    airedAt: integer("aired_at", { mode: "timestamp_ms" }),
    synopsis: text("synopsis"),
  },
  (t) => [uniqueIndex("episodes_uniq").on(t.mediaId, t.number)],
);

// user library entries (multi-user-ready via userId)
export const userMedia = sqliteTable(
  "user_media",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().default(1),
    mediaId: integer("media_id").notNull().references(() => media.id, { onDelete: "cascade" }),
    status: text("status", { enum: libraryStatuses }).notNull().default("planned"),
    progress: real("progress").notNull().default(0),
    progressUnit: text("progress_unit", { enum: progressUnits }).notNull().default("episode"),
    total: integer("total"),
    rating: real("rating"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    notes: text("notes"),
    rewatchCount: integer("rewatch_count").notNull().default(0),
    importedFrom: text("imported_from"),
    importedRef: text("imported_ref"),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("user_media_uniq").on(t.userId, t.mediaId),
    index("user_media_user_idx").on(t.userId, t.status),
  ],
);

// unified activity timeline
export const activityLog = sqliteTable(
  "activity_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().default(1),
    mediaId: integer("media_id").references(() => media.id, { onDelete: "set null" }),
    action: text("action", { enum: activityActions }).notNull(),
    value: text("value", { mode: "json" }).$type<Record<string, unknown>>(),
    occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    index("activity_user_time_idx").on(t.userId, t.occurredAt),
    index("activity_media_idx").on(t.mediaId),
  ],
);

// Franchise / series collections (e.g. TMDB belongs_to_collection: LOTR trilogy, MCU, ...)
export const collections = sqliteTable(
  "collections",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    providerSource: text("provider_source").notNull(),
    providerId: text("provider_id").notNull(),
    title: text("title").notNull(),
    coverUrl: text("cover_url"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("collections_provider_uniq").on(t.providerSource, t.providerId)],
);

export const mediaCollections = sqliteTable(
  "media_collections",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    collectionId: integer("collection_id").notNull().references(() => collections.id, { onDelete: "cascade" }),
    mediaId: integer("media_id").notNull().references(() => media.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("media_collections_uniq").on(t.collectionId, t.mediaId)],
);

// ETL staging: relations whose target item may not exist yet (resolved in resolveRelations)
export const mediaRelationStaging = sqliteTable(
  "media_relation_staging",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    providerSource: text("provider_source").notNull(),
    sourceProviderId: text("source_provider_id").notNull(),
    targetProviderId: text("target_provider_id").notNull(),
    relationType: text("relation_type", { enum: relationTypes }).notNull(),
    targetTitle: text("target_title"),
    targetType: text("target_type", { enum: mediaTypes }),
  },
  (t) => [uniqueIndex("staging_uniq").on(t.providerSource, t.sourceProviderId, t.targetProviderId, t.relationType)],
);

// ETL sync bookkeeping
export const syncState = sqliteTable("sync_state", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  provider: text("provider").notNull().unique(),
  lastRunAt: integer("last_run_at", { mode: "timestamp_ms" }),
  lastSuccessAt: integer("last_success_at", { mode: "timestamp_ms" }),
  cursor: text("cursor"),
});

// ---- inferred row/insert types ----
export type Media = typeof media.$inferSelect;
export type NewMedia = typeof media.$inferInsert;
export type UserMedia = typeof userMedia.$inferSelect;
export type ActivityLog = typeof activityLog.$inferSelect;