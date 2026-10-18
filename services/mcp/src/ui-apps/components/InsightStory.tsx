import { type ReactElement, useEffect, useMemo } from 'react'

import { Card, CardContent } from '@posthog/quill'
import { buildYTickFormatter } from '@posthog/quill-charts'

import { trendsFilterToYFormatterConfig } from 'products/product_analytics/frontend/insights/trends/shared/trendsAxisFormat'
import type { InsightStoryData } from 'products/product_analytics/mcp/apps/insightStory/insightStoryTypes'
import { InsightStoryView } from 'products/product_analytics/mcp/apps/insightStory/InsightStoryView'

import { capture } from '../analytics/posthog'
import { TrendsVisualizer } from './TrendsVisualizer'
import type { TrendsQuery, TrendsResult } from './types'

// The render-ui dispatch imports the data type from this module.
export type { InsightStoryData }

export interface InsightStoryProps {
    data: InsightStoryData
    openLink: (url: string) => void
}

export function InsightStory({ data, openLink }: InsightStoryProps): ReactElement {
    const query = data.query as unknown as TrendsQuery

    useEffect(() => {
        capture('mcp_ui_app_insight_story_viewed', {
            chapter_count: data.chapters.length,
            unmatched_chapter_count: data.chapters.filter((chapter) => !chapter.range).length,
        })
    }, [data])

    // A number in a sentence reads better in full, so the chart's axis format is only used when it adds a unit.
    const formatValue = useMemo(() => {
        const format = query.trendsFilter?.aggregationAxisFormat
        return format && format !== 'numeric'
            ? buildYTickFormatter(trendsFilterToYFormatterConfig(query.trendsFilter, false))
            : undefined
    }, [query])

    return (
        <Card>
            <CardContent>
                <InsightStoryView
                    // The host updates `data` in place, so key on the story to start each new one at its summary.
                    key={`${JSON.stringify(data.query)}:${data.headline}`}
                    data={data}
                    title={data.insightName ?? 'Trends'}
                    renderChart={(overlay) => (
                        <TrendsVisualizer
                            query={query}
                            results={data.results as TrendsResult}
                            title={data.insightName ?? 'Trends'}
                            overlay={overlay}
                            showControls={false}
                            chartClassName="h-[260px] @3xl/story:h-[400px]"
                            showTitle={false}
                        />
                    )}
                    openLink={openLink}
                    formatValue={formatValue}
                    onPageChange={(index) =>
                        capture('mcp_ui_app_insight_story_page_viewed', {
                            page_index: index,
                            page_count: data.chapters.length + 1,
                        })
                    }
                />
            </CardContent>
        </Card>
    )
}
