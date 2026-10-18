import { type ReactElement } from 'react'

import { Button, Text } from '@posthog/quill'

import type { StoryEvidence } from './insightStoryTypes'
import { StoryMarkedText } from './StoryMarkedText'

export interface StoryEvidenceListProps {
    evidence: StoryEvidence[]
    openLink: (url: string) => void
}

export function StoryEvidenceList({ evidence, openLink }: StoryEvidenceListProps): ReactElement | null {
    if (!evidence.length) {
        return null
    }
    return (
        <div className="flex flex-col gap-1.5" data-attr="insight-story-evidence">
            <Text size="xs" weight="medium" variant="muted">
                Evidence
            </Text>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {evidence.map((item, index) => (
                    <li key={index} className="flex items-start gap-2">
                        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground" aria-hidden />
                        <Text size="sm" className="min-w-0 flex-1">
                            <StoryMarkedText text={item.text} />
                            {item.url && (
                                <>
                                    {' '}
                                    <Button
                                        variant="link"
                                        size="xs"
                                        className="h-auto p-0 align-baseline"
                                        onClick={() => item.url && openLink(item.url)}
                                        data-attr="insight-story-evidence-link"
                                    >
                                        Open
                                    </Button>
                                </>
                            )}
                        </Text>
                    </li>
                ))}
            </ul>
        </div>
    )
}
