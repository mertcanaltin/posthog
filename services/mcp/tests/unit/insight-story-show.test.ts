import { describe, expect, it, vi } from 'vitest'

import { findStoryRange, lastBucketInProgress } from '@/tools/insights/storyRanges'
import { storyShowHandler } from '@/tools/insights/storyShow'
import { type Context, POSTHOG_FORMATTED_RESULTS_OVERRIDE_KEY } from '@/tools/types'

import { chapterFacts, overviewFacts } from 'products/product_analytics/mcp/apps/insightStory/storyFacts'

const DAYS = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']
const HOURS = ['2026-10-01 22:00:00', '2026-10-01 23:00:00', '2026-10-02 00:00:00', '2026-10-02 01:00:00']
const WEEKS = ['2026-09-21', '2026-09-28', '2026-10-05']
const MONTHS = ['2025-12-01', '2026-01-01', '2026-02-01']

function createContext(query: Record<string, unknown>, response: Record<string, unknown> = {}): Context {
    return {
        api: {
            insights: vi.fn().mockReturnValue({
                get: vi.fn().mockResolvedValue({
                    success: true,
                    data: { id: 7, short_id: 'abc12345', name: 'Sign-ups', query },
                }),
            }),
            query: vi.fn().mockReturnValue({
                runQuery: vi.fn().mockResolvedValue({
                    results: [{ label: 'signed_up', data: [5, 50, 6, 5, 4], days: DAYS }],
                    ...response,
                }),
            }),
            getProjectBaseUrl: vi.fn().mockReturnValue('https://us.posthog.com/project/1'),
        },
        stateManager: { getProjectId: vi.fn().mockResolvedValue('1') },
    } as unknown as Context
}

describe('insight-story-show', () => {
    it.each([
        ['a day on a daily chart', DAYS, 'day', '2026-10-02', undefined, [1, 1]],
        ['a stretch on a daily chart', DAYS, 'day', '2026-10-02', '2026-10-04', [1, 3]],
        ['a timestamp with a zone on a daily chart', DAYS, 'day', '2026-10-02T00:00:00Z', undefined, [1, 1]],
        ['a day on an hourly chart covers its hours', HOURS, 'hour', '2026-10-02', undefined, [2, 3]],
        ['a date mid-week on a weekly chart', WEEKS, 'week', '2026-10-01', undefined, [1, 1]],
        ['a stretch that starts before the chart', DAYS, 'day', '2026-09-20', '2026-10-02', [0, 1]],
        ['a day after a daily chart ends', DAYS, 'day', '2026-10-09', undefined, null],
        ['a date after the last weekly bucket', WEEKS, 'week', '2026-10-20', undefined, null],
        ['the last day of a short final month', MONTHS, 'month', '2026-02-28', undefined, [2, 2]],
        ['a date after a short final month', MONTHS, 'month', '2026-03-01', undefined, null],
    ] as const)('finds the points for %s', (_, days, interval, start, end, expected) => {
        expect(findStoryRange([...days], interval, start, end)).toEqual(expected)
    })

    it('shows the chapters and tells the agent which dates matched no point', async () => {
        const context = createContext({ kind: 'InsightVizNode', source: { kind: 'TrendsQuery', series: [] } })

        const result = await storyShowHandler(context, {
            insightId: 'abc12345',
            series: 0,
            headline: 'One day stands out.',
            chapters: [
                { title: 'A spike on October 2', start: '2026-10-02' },
                { title: 'A gap in November', start: '2026-11-01' },
            ],
        })

        expect(result.chapters.map((chapter) => chapter.range)).toEqual([[1, 1], null])
        expect(result._posthogUrl).toBe('https://us.posthog.com/project/1/insights/abc12345')
        expect(result[POSTHOG_FORMATTED_RESULTS_OVERRIDE_KEY]).toContain('"A gap in November"')
    })

    it('refuses a chart that is not a trends chart', async () => {
        const context = createContext({ kind: 'InsightVizNode', source: { kind: 'FunnelsQuery', series: [] } })

        await expect(
            storyShowHandler(context, {
                insightId: 'abc12345',
                series: 0,
                headline: 'Conversion fell.',
                chapters: [{ title: 'A drop', start: '2026-10-02' }],
            })
        ).rejects.toThrow('only explains trends charts')
    })

    it.each([
        ['a day that is still running', ['2026-10-17', '2026-10-18'], 'day', 'UTC', '2026-10-18T10:00:00Z', true],
        ['a day that has ended', ['2026-10-16', '2026-10-17'], 'day', 'UTC', '2026-10-18T10:00:00Z', false],
        [
            'a day still running west of Greenwich',
            ['2026-10-17'],
            'day',
            'America/Los_Angeles',
            '2026-10-18T03:00:00Z',
            true,
        ],
        ['a month that is still running', ['2026-09-01', '2026-10-01'], 'month', 'UTC', '2026-10-18T10:00:00Z', true],
    ] as const)('knows whether the last point is complete for %s', (_, days, interval, timezone, now, expected) => {
        expect(lastBucketInProgress([...days], interval, timezone, Date.parse(now))).toBe(expected)
    })

    it('draws a slope or number chart as a line chart and passes the query warnings on', async () => {
        const context = createContext(
            { kind: 'TrendsQuery', series: [], trendsFilter: { display: 'SlopeGraph' } },
            { warnings: [{ type: 'stale', message: 'Warehouse data is 3 days old.' }] }
        )

        const result = await storyShowHandler(context, {
            insightId: 'abc12345',
            series: 0,
            headline: 'One day stands out.',
            chapters: [{ title: 'A spike on October 2', start: '2026-10-02' }],
        })

        expect(context.api.query({ projectId: '1' }).runQuery).toHaveBeenCalledWith({
            query: expect.objectContaining({ trendsFilter: { display: 'ActionsLineGraph' } }),
        })
        expect(result.warnings).toEqual([{ type: 'stale', message: 'Warehouse data is 3 days old.' }])
        expect(result[POSTHOG_FORMATTED_RESULTS_OVERRIDE_KEY]).toContain('Warehouse data is 3 days old.')
    })

    it('keeps a small rate from rounding to zero', () => {
        const facts = chapterFacts([0.02, 0.02, 0.02, 0.02, 0.02], DAYS, [1, 3], {
            interval: 'day',
            lastPointInProgress: false,
            formatValue: (value) => `${value * 100}%`,
        })

        expect(facts).toContain('2%')
        expect(facts).not.toContain('0%')
    })

    it('describes a series with more points than a function call can take', () => {
        const values = Array.from({ length: 200_000 }, (_, index) => index % 7)

        expect(
            overviewFacts(values, { interval: 'minute', lastPointInProgress: false, formatValue: String })
        ).toContain('The range runs from 0 to 6.')
    })

    it('does not compare a period that has not ended with complete ones', () => {
        const facts = chapterFacts([60, 62, 58, 61, 9], DAYS, [4, 4], {
            interval: 'day',
            lastPointInProgress: true,
            formatValue: String,
        })

        expect(facts).not.toContain('below')
        expect(facts).toContain('not over yet')
    })
})
