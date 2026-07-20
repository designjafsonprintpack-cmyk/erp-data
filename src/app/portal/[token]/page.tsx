import CustomerPortalClient from './CustomerPortalClient'

export default function CustomerPortalPage({ params }: { params: { token: string } }) {
  return <CustomerPortalClient token={params.token} />
}
