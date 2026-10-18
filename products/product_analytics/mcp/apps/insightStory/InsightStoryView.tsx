import { type ReactElement, type ReactNode, useMemo, useState } from 'react'

import { Button, Text } from '@posthog/quill'

import type { InsightStoryData, StoryChapter } from './insightStoryTypes'
import { StoryChapterView } from './StoryChapterView'
import { StoryChartOverlay } from './StoryChartOverlay'
import { buildStoryPages, type StoryPage } from './storyPages'
import { StorySteps } from './StorySteps'
import { StorySummaryView } from './StorySummaryView'

const defaultFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format

export interface InsightStoryViewProps {
    data: InsightStoryData
    /** Draws the chart with the overlay as a child, so the overlay can read the chart's scales. */
    renderChart: (overlay: ReactNode) => ReactNode
    openLink: (url: string) => void
    title?: string | null
    formatValue?: (value: number) => string
    onPageChange?: (index: number) => void
}

function hasChapter(page: StoryPage): page is StoryPage & { chapter: StoryChapter } {
    return page.chapter !== null
}

function warningMessages(warnings: unknown[] = []): string[] {
    return warnings.map((warning) =>
        typeof warning === 'string' ? warning : ((warning as { message?: string }).message ?? JSON.stringify(warning))
    )
}

function seriesNoteOf(data: InsightStoryData): string | null {
    if (data.results.length < 2) {
        return null
    }
    const series = data.results[data.seriesIndex]
    const label = series?.label || series?.action?.name || `series ${data.seriesIndex + 1}`
    return `This follows ${label}, one of the ${data.results.length} series on the chart.`
}

export function InsightStoryView({
    data,
    renderChart,
    openLink,
    title,
    formatValue = defaultFormat,
    onPageChange,
}: InsightStoryViewProps): ReactElement {
    const pages = useMemo(() => buildStoryPages(data, formatValue), [data, formatValue])
    const [activeIndex, setActiveIndex] = useState(0)
    const [previewIndex, setPreviewIndex] = useState<number | null>(null)
    const active = pages[activeIndex] ?? pages[0]!
    const hasNext = activeIndex + 1 < pages.length

    const select = (index: number): void => {
        setActiveIndex(index)
        setPreviewIndex(null)
        onPageChange?.(index)
    }

    const overlay = (
        <StoryChartOverlay
            seriesKey={String(data.seriesIndex)}
            pages={pages}
            highlightedIndex={previewIndex ?? activeIndex}
            activeIndex={activeIndex}
            onSelect={select}
        />
    )

    return (
        <div className="@container/story" data-attr="insight-story">
            <div className="flex flex-col @3xl/story:flex-row">
                <div className="min-w-0 flex-1">
                    {title && (
                        <Text size="sm" weight="medium" className="block pb-2">
                            {title}
                        </Text>
                    )}
                    {renderChart(overlay)}
                </div>
                <aside
                    className="relative shrink-0 border-t border-border @3xl/story:w-80 @3xl/story:border-t-0 @3xl/story:border-l"
                    aria-label="Walkthrough of this chart"
                >
                    {/* Beside the chart, the panel takes the chart's height and the page scrolls inside it. */}
                    <div className="flex flex-col @3xl/story:absolute @3xl/story:inset-0">
                        <div className="min-h-0 flex-1 p-4 @3xl/story:overflow-y-auto">
                            {hasChapter(active) ? (
                                <StoryChapterView key={activeIndex} page={active} openLink={openLink} />
                            ) : (
                                <StorySummaryView
                                    headline={data.headline}
                                    pages={pages}
                                    seriesNote={seriesNoteOf(data)}
                                    warnings={warningMessages(data.warnings)}
                                    onSelect={select}
                                    onPreview={setPreviewIndex}
                                />
                            )}
                        </div>
                        <div className="flex items-center justify-between gap-3 border-t border-border py-2 ps-4 pe-3">
                            <StorySteps
                                pages={pages}
                                activeIndex={activeIndex}
                                onSelect={select}
                                onPreview={setPreviewIndex}
                            />
                            <div className="flex shrink-0 gap-1">
                                {activeIndex > 0 && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => select(activeIndex - 1)}
                                        data-attr="insight-story-back"
                                    >
                                        Back
                                    </Button>
                                )}
                                {hasNext && (
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        onClick={() => select(activeIndex + 1)}
                                        data-attr="insight-story-next"
                                    >
                                        Next
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    )
}
