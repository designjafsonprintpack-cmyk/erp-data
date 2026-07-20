import ApproveArtworkClient from './ApproveArtworkClient'

export default function ApproveArtworkPage({ params }: { params: { token: string } }) {
  return <ApproveArtworkClient token={params.token} />
}
