import NewGangClient from './NewGangClient'

/**
 * Everything here is fetched by the client from /api/v1/gangs/candidates, which
 * already applies the "same customer, same board, same sheet size" filter and
 * computes both scenarios with the same `gangScenario()` the create route uses.
 * Duplicating that query server-side would be a second place for the two to
 * disagree about what can be ganged.
 */
export default function NewGangPage({ searchParams }: { searchParams: { job?: string } }) {
  return <NewGangClient initialJobId={searchParams.job ?? ''} />
}
