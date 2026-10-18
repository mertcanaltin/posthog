import type { Meta, StoryFn, StoryObj } from '@storybook/react'
import { within } from '@testing-library/dom'
import type { ReactElement, ReactNode } from 'react'

import { McpThemeDecorator } from '@posthog/mcp-ui/storybook/decorator'
import { DEFAULT_CHART_COLORS, TimeSeriesLineChart, useChartTheme } from '@posthog/quill-charts'

import { userEvent } from 'storybook/test'

import type { InsightStoryData } from './insightStoryTypes'
import { InsightStoryView } from './InsightStoryView'

const VALUES = [
    58, 24, 22, 61, 64, 59, 63, 57, 26, 21, 60, 66, 62, 59, 498, 31, 23, 63, 58, 65, 61, 92, 41, 38, 95, 101, 97, 104,
    99, 18,
]
const DAYS = VALUES.map((_, index) => new Date(Date.UTC(2026, 8, 18 + index)).toISOString().slice(0, 10))

const story: InsightStoryData = {
    query: { kind: 'TrendsQuery', interval: 'day', series: [{ kind: 'EventsNode', event: 'signed_up' }] },
    results: [{ label: 'signed_up', data: VALUES, days: DAYS }],
    seriesIndex: 0,
    insightName: 'Sign-ups',
    lastPointInProgress: true,
    headline:
        'One article on **news.example.com** caused the spike, and sign-ups from **Canada** lifted the level since.',
    chapters: [
        {
            title: 'A spike on October 2',
            range: [14, 14],
            summary: 'One day stands far above the rest of the month, and the next day is back to normal.',
            cause: 'Almost all of the extra sign-ups came from **news.example.com** to the **/pricing** page. This looks like one article sending visitors, not a change in the product.',
            confidence: 'high',
            confidenceReason:
                'The referrer and the page both account for most of the day, and an annotation marks the article.',
            evidence: [
                {
                    text: '**news.example.com** sent 412 of the 498 sign-ups that day, against 3 on a typical day.',
                    url: 'https://us.posthog.com/project/1/insights/new',
                },
                { text: 'An annotation on October 2 reads "Launch article published".', url: null },
            ],
        },
        {
            title: 'Higher since October 9',
            range: [21, 28],
            summary: 'The level steps up and stays there.',
            cause: 'Most of the rise comes from **Canada**, which started the same week as the **French-language** signup page.',
            confidence: 'medium',
            confidenceReason: null,
            evidence: [
                {
                    text: 'Sign-ups from **Canada** went from 4 to 38 on a typical day.',
                    url: 'https://us.posthog.com/project/1/insights/new',
                },
            ],
        },
        {
            title: 'Today so far',
            range: [29, 29],
            summary: null,
            cause: null,
            confidence: null,
            confidenceReason: null,
            evidence: [],
        },
    ],
}

function StoryChart({ overlay }: { overlay: ReactNode }): ReactElement {
    const theme = useChartTheme()
    return (
        <div className="flex h-[320px] flex-col">
            <TimeSeriesLineChart
                series={[{ key: '0', label: 'signed_up', data: VALUES, color: DEFAULT_CHART_COLORS[0] }]}
                labels={DAYS}
                theme={theme}
            >
                {overlay}
            </TimeSeriesLineChart>
        </div>
    )
}

const renderStory = (): ReactElement => (
    <InsightStoryView data={story} renderChart={(overlay) => <StoryChart overlay={overlay} />} openLink={() => {}} />
)

// The chart sizes its canvas off a ResizeObserver, so give it a definite width.
const width =
    (className: string) =>
    (Story: StoryFn): ReactElement => (
        <div className={className}>
            <Story />
        </div>
    )

const meta: Meta = {
    title: 'MCP Apps/Insight Story',
    decorators: [McpThemeDecorator],
    parameters: {
        testOptions: {
            // McpThemeDecorator has no dark mode, so skip it to avoid duplicated snapshots.
            skipDarkMode: true,
        },
    },
}
export default meta

type Story = StoryObj<{}>

export const Summary: Story = {
    decorators: [width('w-[680px]')],
    render: renderStory,
}

export const ChapterBesideTheChart: Story = {
    decorators: [width('w-[1100px]')],
    render: renderStory,
    play: async ({ canvasElement }) => {
        // The step and the marker on the chart share this name, and either one opens the chapter.
        const [button] = within(canvasElement).getAllByRole('button', { name: 'Chapter 2: A spike on October 2' })
        await userEvent.click(button!)
    },
}
