'use client'
import { useState, type ReactNode } from 'react'
import { TabStrip } from '@/components/ui/TabStrip'

/**
 * Purchase ke do hisse: **kya khareedna hai** (Demands) aur **kya khareed liya**
 * (Orders).
 *
 * Demands pehle hai, kyunke shop ka sawal yahi hota hai — "aaj kya mangwana
 * hai". Orders wo hai jo pehle se tha.
 *
 * Dono hisse SERVER par render hote hain aur yahan `ReactNode` ki soorat mein
 * aate hain. Ye ahem hai: is file mein koi component ya callback prop ke tor par
 * nahi ja sakta (settings/page.tsx wali ghalti — tsc bhi paas, build bhi paas,
 * aur render par phat gaya). Tayyar shuda markup guzarna mehfooz hai.
 */
export default function PurchaseTabs({
  demandCount, demands, orders, orderCount,
}: {
  demandCount: number
  orderCount: number
  demands: ReactNode
  orders: ReactNode
}) {
  const [tab, setTab] = useState<'demands' | 'orders'>('demands')

  return (
    <div className="space-y-5">
      <TabStrip
        tabs={[
          { key: 'demands', label: `To Buy${demandCount ? ` (${demandCount})` : ''}` },
          { key: 'orders',  label: `Purchase Orders${orderCount ? ` (${orderCount})` : ''}` },
        ]}
        active={tab}
        onChange={k => setTab(k as 'demands' | 'orders')}
      />
      {/* Dono hamesha mount rehte hain: tab badalne par list dobara load ho to
          jo tick lagaye the wo chale jate. `hidden` sirf chhupata hai. */}
      <div className={tab === 'demands' ? '' : 'hidden'}>{demands}</div>
      <div className={tab === 'orders'  ? '' : 'hidden'}>{orders}</div>
    </div>
  )
}

export { PurchaseTabs }
