import { PageHeader } from '@/components/ui/PageHeader'
import StageQueueClient from '@/components/production/StageQueueClient'

// Was a bare redirect to the machine-centric Floor view, which only ever
// listed jobs someone had manually assigned to a machine — so a planned job
// never showed up at its own department. This is now the stage's own work
// queue, derived from job_stage_progress: nothing to add by hand.
export default function LaminationPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="Lamination" subtitle="Jobs ready for lamination, UV or varnish" />
      <StageQueueClient stageSlug="lamination" stageLabel="Lamination" />
    </div>
  )
}
