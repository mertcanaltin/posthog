export type StoryConfidence = 'high' | 'medium' | 'low'

export interface StoryEvidence {
    text: string
    url: string | null
}

export interface StoryChapter {
    title: string
    /** Inclusive indexes into the series' points. Null when the chapter's dates match no point on the chart. */
    range: [number, number] | null
    summary: string | null
    cause: string | null
    confidence: StoryConfidence | null
    confidenceReason: string | null
    evidence: StoryEvidence[]
}

export interface StorySeriesResult {
    label?: string
    data?: number[]
    days?: string[]
    action?: { name?: string }
}

export interface StoryTrendsQuery {
    kind: 'TrendsQuery'
    interval?: string
    trendsFilter?: Record<string, unknown>
    series?: Record<string, unknown>[]
    [key: string]: unknown
}

export interface InsightStoryData {
    query: StoryTrendsQuery
    results: StorySeriesResult[]
    seriesIndex: number
    insightName: string | null
    /** The last point is a period that has not ended, so its value will still grow. */
    lastPointInProgress: boolean
    headline: string
    chapters: StoryChapter[]
    /** Query warnings, such as stale warehouse data or access-control filtering, as the API returned them. */
    warnings?: unknown[]
    _posthogUrl?: string
}
