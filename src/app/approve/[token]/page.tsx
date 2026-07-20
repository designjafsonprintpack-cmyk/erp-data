import ApproveQuotationClient from './ApproveQuotationClient'

export default function ApproveQuotationPage({ params }: { params: { token: string } }) {
  return <ApproveQuotationClient token={params.token} />
}
