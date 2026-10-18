import '../styles/tailwind.css'

import { createRoot } from 'react-dom/client'

import { AppWrapper } from '../components/AppWrapper'
import { InsightStory, type InsightStoryData } from '../components/InsightStory'

function InsightStoryApp(): JSX.Element {
    return (
        <AppWrapper<InsightStoryData> appName="PostHog Chart Walkthrough">
            {({ data, openLink }) => <InsightStory data={data!} openLink={openLink} />}
        </AppWrapper>
    )
}

const container = document.getElementById('root')
if (container) {
    createRoot(container).render(<InsightStoryApp />)
}
