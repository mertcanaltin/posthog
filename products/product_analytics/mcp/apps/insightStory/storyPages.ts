import type { InsightStoryData, StoryChapter } from './insightStoryTypes'
import { anchorOf, chapterFacts, overviewFacts, type StoryFactsOptions } from './storyFacts'

export interface StoryPage {
    title: string
    range: [number, number] | null
    /** The point the page's marker sits on. Null for a page with no point of its own. */
    anchor: number | null
    /** What the chart itself says, worked out here so that no number comes from the agent's text. */
    facts: string
    /** The agent's chapter. Null for the summary that opens the story. */
    chapter: StoryChapter | null
}

export const SUMMARY_TITLE = 'The big picture'

export function buildStoryPages(data: InsightStoryData, formatValue: StoryFactsOptions['formatValue']): StoryPage[] {
    const series = data.results[data.seriesIndex]
    const values = series?.data ?? []
    const days = series?.days ?? []
    const options: StoryFactsOptions = {
        interval: data.query.interval ?? 'day',
        lastPointInProgress: data.lastPointInProgress,
        formatValue,
    }
    const summary: StoryPage = {
        title: SUMMARY_TITLE,
        range: null,
        anchor: null,
        facts: overviewFacts(values, options),
        chapter: null,
    }
    const chapters = data.chapters.map((chapter): StoryPage => {
        const range = chapter.range && chapter.range[1] < values.length ? chapter.range : null
        return {
            title: chapter.title,
            range,
            anchor: range ? anchorOf(values, range, options) : null,
            facts: range ? chapterFacts(values, days, range, options) : '',
            chapter,
        }
    })
    return [summary, ...chapters]
}
