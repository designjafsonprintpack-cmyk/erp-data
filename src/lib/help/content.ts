/**
 * The in-app manual.
 *
 * WRITTEN IN ROMAN URDU + ENGLISH, on purpose: the people who read this are
 * shop-floor and office staff, and that is the language the shop actually runs
 * in. Technical nouns (Job Card, MRN, GSM, Ups) stay in English because that is
 * what is printed on the screens and the paperwork.
 *
 * WHAT IS WRITTEN HERE AND WHAT IS NOT
 *   The prose is here. The list of screens a role can actually open is NOT —
 *   that is computed at render time from live `role_permissions` crossed with
 *   NAV_ITEMS (see the help page's server component). If it were written down
 *   here it would go stale the first time Mehboob changed a permission in
 *   Settings → Roles & Permissions, and a manual that lies about what you can
 *   see is worse than no manual.
 *
 * Every rule stated below was checked against the code or the migrations, not
 * assumed. Where the system's behaviour is deliberately surprising (planned vs
 * actual GSM, packets vs sheets, proof jobs) the reason is given, because staff
 * who know the reason stop trying to "fix" it.
 */

export interface HelpStep {
  /** What to do. Imperative, one action. */
  do: string
  /** Why it matters, or what breaks if skipped. Optional. */
  why?: string
}

export interface HelpSection {
  heading: string
  body?: string
  steps?: HelpStep[]
  /** Things that bite. Shown in a warning block. */
  warnings?: string[]
}

export interface ModuleGuide {
  /** Permission module key — matches NavLink.module and permissions.module. */
  module: string
  title: string
  /** One line: what this screen is for. */
  purpose: string
  sections: HelpSection[]
}

export interface RoleGuide {
  /** roles.slug */
  slug: string
  title: string
  /** One line the person can recognise themselves in. */
  oneLiner: string
  /** The shape of their day, in order. */
  dailyFlow: HelpStep[]
  /** Modules whose guides matter most to this role, in reading order. */
  keyModules: string[]
  /** What this role deliberately cannot do, and why. Honesty prevents tickets. */
  cannot?: string[]
}

/* ═══════════════════════════════════════════════════════════════════════════
   SHARED CONCEPTS — read once, applies everywhere
   ═══════════════════════════════════════════════════════════════════════════ */

export const CONCEPTS: HelpSection[] = [
  {
    heading: 'Document numbers',
    body:
      'Har document ka apna number khud ban jaata hai — aap ko likhna nahi padta. ' +
      'JOB- (job), QT- (quotation), SO- (sales order), MRN- (material requisition), ' +
      'PO- (purchase order), INV- (invoice), DISP- (dispatch), CUST- (customer), VND- (vendor).',
    warnings: [
      'Purani Excel wali 478 jobs JOB-2025-##### hain, aur naya kaam JOB-2026-##### se shuru hota hai. ' +
      'Do series jaan-boojh kar alag rakhi gayi hain taake ek nazar mein pata chale ke kaam purana hai ya naya.',
    ],
  },
  {
    heading: 'Ups aur Sheet Qty',
    body:
      'Ups = ek sheet par kitne box aate hain. Yeh estimator KHUD likhta hai — system andaza nahi lagata, ' +
      'kyunki box ka dieline seedha L/W grid nahi hota. Sheet Qty phir khud nikal aati hai: ' +
      'Sheet Qty = Box Qty ÷ Ups, upar wale poore number tak (ceil).',
    warnings: ['Ups khali chhorne se Sheet Qty nahi banti, aur Board Issue ke waqt MRN bhi nahi banta.'],
  },
  {
    heading: 'Packet aur Sheet — yeh farq sab se zyada ghalti karata hai',
    body:
      'Store packet ginta hai. Job sheet khaata hai. System ke andar SAB KUCH sheets mein store hota hai — ' +
      'stock, ledger, har movement. Packet sirf dekhne aur likhne ke liye hai, aur form khud convert kar deta hai. ' +
      'Ek packet = 100 sheets board; paper ka ream 500 ya 250 hota hai, is liye har item ka apna ' +
      '"Sheets per Packet" hai.',
    warnings: [
      'Stock In mein quantity PACKETS mein likhein, sheets mein nahi. Form neeche dikha deta hai ke kitni ' +
      'sheets ban rahi hain — save karne se pehle wo number ek dafa parh lein.',
      'Paper ka naya item banaate waqt Sheets per Packet 500 (ya 250) karna na bhoolein, warna har hisaab 5 guna ghalat hoga.',
    ],
  },
  {
    heading: 'Board ka rate per KG hota hai',
    body:
      'Board wazan ke hisaab se khareeda jaata hai. System wahi formula use karta hai jo estimating mein hai: ' +
      'L × W × GSM ÷ 15500 = 100 sheets ka wazan kg mein. Is liye Stock In aur Purchase Order dono par rate ' +
      'PER KG poocha jaata hai, aur system usay per-sheet cost mein badal kar rakhta hai — wahi cost jis par ' +
      'job ka board kharch hota hai. Paper ream ke liye per-packet ka option bhi maujood hai.',
    warnings: [
      'Per-kg rate ke liye item ka Sheet Size aur GSM zaroori hai. Na hon to system rate lena mana kar dega — ' +
      'pehle Board Inventory mein Edit se wo daal dein.',
    ],
  },
  {
    heading: 'GSM ki teen alag alag values — inhein aik na samjhein',
    body:
      'Quoted GSM: jo customer ne approve kiya (quotation par jama, kabhi badalti nahi). ' +
      'Planned GSM: job par likhi hui (quotation se aati hai, ya stock se chuni jaati hai). ' +
      'Actual GSM: jo board asal mein issue hua (MRN se khud nikalti hai, kahin store nahi hoti). ' +
      'Planned kabhi Actual se overwrite NAHI hoti — dono ka farq hi asal record hai, ' +
      'kyunki customer ne aik wazan manzoor kiya tha aur purchase ne shayad doosra khareeda.',
  },
  {
    heading: 'Kuch bhi asal mein delete nahi hota',
    body:
      'Delete karne par row chhupti hai, mitti nahi (soft delete). Is ka faida: ghalti se delete hui cheez ' +
      'ka record maujood rehta hai aur purane document waise hi print hote rehte hain. ' +
      'Jobs is ka apwaad hai — job ka delete asli delete hai, aur wo sirf Super Admin kar sakta hai.',
  },
  {
    heading: 'Job khud agli stage par chala jaata hai',
    body:
      'Job ko haath se kisi department mein "bhejna" nahi padta. Har stage complete hone par job apne aap ' +
      'agle department ki queue mein aa jaati hai. Apna kaam dekhne ke liye My Queue kholein — ' +
      'wahi jobs aati hain jo is waqt aap ke department par khari hain.',
  },
  {
    heading: 'Har list 50 par page hoti hai',
    body:
      'Har list ek page par 50 rows dikhati hai, aur filter/search bhi server par chalte hain — ' +
      'yaani aap jo filter lagayenge, Export bhi POORE filter ka aayega, sirf saamne wale page ka nahi.',
  },
]

/* ═══════════════════════════════════════════════════════════════════════════
   MODULE GUIDES
   ═══════════════════════════════════════════════════════════════════════════ */

export const MODULE_GUIDES: ModuleGuide[] = [
  {
    module: 'dashboard',
    title: 'Dashboard',
    purpose: 'Aaj kya chal raha hai — ek nazar mein.',
    sections: [
      {
        heading: 'Kya dikhta hai',
        body:
          'Upar ke stat cards, phir Recent Jobs | Machines | Alerts. Alerts mein woh cheezein aati hain ' +
          'jinhein kisi ke tawajjo ki zaroorat hai — stock kam hona, koi job atki hui hona.',
      },
      {
        heading: 'Phone par',
        body: 'Phone par dashboard tiles ki shakal mein khulta hai, aur tiles aap ke role ke hisaab se badalte hain — ' +
          'operator ko My Queue aur Scan pehle milte hain, office wale ko unka paperwork.',
      },
    ],
  },
  {
    module: 'customers',
    title: 'Customers',
    purpose: 'Customer ka record, uske contacts, aur uska ledger.',
    sections: [
      {
        heading: 'Naya customer',
        steps: [
          { do: 'Customers → Add Customer.' },
          { do: 'Naam, phone, address bharein.', why: 'Customer code (CUST-) khud ban jaata hai.' },
          { do: 'Contact person alag se add karein.', why: 'Quotation kis shakhs ke naam jaayegi, yeh wahan se chunte hain.' },
        ],
      },
      {
        heading: 'Customer Portal link',
        body: 'Customer ko ek link diya ja sakta hai jis se wo apni jobs ka status khud dekh le — ' +
          'us ke liye login ki zaroorat nahi, link hi kaafi hai aur uski expiry hoti hai.',
      },
    ],
  },
  {
    module: 'quotations',
    title: 'Quotations (Estimate)',
    purpose: 'Rate banana, customer se approve karana, aur approve hone par Sales Order bana dena.',
    sections: [
      {
        heading: 'Rate banana',
        steps: [
          { do: 'Quotations → New Quotation. Customer chunein.' },
          { do: 'Line item par Box Type, phir Board / Paper Type chunein.', why: 'Board chunne par sheet size aur rate khud bhar jaate hain — phir bhi badal sakte hain.' },
          { do: 'Size, Quantity, Colors aur UPS bharein.', why: 'Ups ke bina Sheet Qty nahi banti, aur poora costing usi par khara hai.' },
          { do: 'Calculator kholein aur Finish Goods ki rows tick karein — printing, die cutting, pasting, packing, cartage.', why: 'Sirf tick ki hui rows cost mein jaati hain. Untick karne par rate wahin rehta hai, gum nahi hota.' },
          { do: 'Profit margin daal kar rate nikaal lein.', why: 'System suggest karta hai; aakhri rate estimator ka apna faisla hai.' },
        ],
        warnings: [
          'Board costing ab default PER KG hai, kyunki board wazan par khareeda jaata hai. ' +
          'Per Sheet chahiye to line par badal lein.',
          'Quoted GSM jama ho jaati hai — baad mein koi cheez usay nahi badalti. Yeh jaan-boojh kar hai.',
        ],
      },
      {
        heading: 'Customer se approve karana',
        steps: [
          { do: 'Quotation ko Sent karein.', why: 'Har dafa Sent karne par 7 din wala naya approval link banta hai aur purana link mar jaata hai.' },
          { do: 'Link customer ko bhejein. Wo khud Approve ya Reject karega.' },
          { do: 'Approve hone par Convert to Sales Order dabayein.' },
        ],
        warnings: ['Sirf APPROVED quotation Sales Order ban sakti hai. Aur ek quotation sirf ek baar convert hoti hai.'],
      },
      {
        heading: 'Revision',
        body: 'Quotation edit karne par purani copy version ban kar sambhal jaati hai — ' +
          'yaani customer ko kya kya rate diye gaye, wo record kabhi gum nahi hota.',
      },
    ],
  },
  {
    module: 'sales_orders',
    title: 'Sales Orders',
    purpose: 'Approve hui quotation ka confirm order — jahan se job banti hai.',
    sections: [
      {
        heading: 'Order se job',
        steps: [
          { do: 'Sales Order ko Confirmed karein.', why: 'Sirf confirmed order New Job ki list mein aata hai.' },
          { do: 'Jobs → New Job → Sales Order chunein, phir uski line chunein.', why: 'Size, quantity, colours, board/paper aur GSM khud bhar jaate hain.' },
        ],
      },
      {
        heading: 'Yahan rate nahi hote',
        body: 'Sales Order aur Job Card par jaan-boojh kar paisa nahi dikhaya jaata — ' +
          'shop floor ko rate ki zaroorat nahi, aur Job Card customer ke saamne bhi ja sakta hai.',
      },
    ],
  },
  {
    module: 'jobs',
    title: 'Jobs',
    purpose: 'Har kaam ka markaz — spec, workflow, board, plates, QC, dispatch, sab yahin se.',
    sections: [
      {
        heading: 'Nayi job',
        steps: [
          { do: 'New / Repeat chunein. Repeat mein purani job dhoond kar uski copy ban jaati hai.' },
          { do: 'Spec bharein: L / W / H / Ups, phir Sheet W / Sheet H / Board / GSM, phir Colors / Quantity / Die Number / Box Type.' },
          { do: 'Box Type chunein.', why: 'Box Type hi decide karta hai ke job ko kaunsa workflow milega — Box ko Standard Carton, HL ko Hinge Lid, Label/Sticker ko apna. Yeh dropdown khud aage badal jaata hai.' },
          { do: 'Board Type aur Sheet Qty zaroor bharein.', why: 'In dono ke baghair Board Issue ke waqt MRN nahi banega, aur wo stage kabhi complete nahi ho sakegi.' },
        ],
        warnings: [
          'Repeat with Changes: agar kuch badla hai to batana zaroori hai. Jis change se chhapne wali tasveer badalti hai, ' +
          'us par Artwork skip karna band ho jaata hai — sirf GSM ya finishing badalne par skip chalta rehta hai.',
        ],
      },
      {
        heading: 'Job ka safar',
        body:
          'Aam carton ki 10 stages: Artwork & Customer Approval → Planning → Board Issue → Printing → ' +
          'UV Coating → Die Cutting → Folder Gluing → Packing → Quality Check → Dispatch. ' +
          'Artwork aur customer approval AIK hi stage hai, do nahi. UV Coating aur Folder Gluing optional hain. ' +
          'Lamination aur Hot Foil wali jobs ka apna template hai ("Carton with Lamination / Foil", 12 stages), ' +
          'jo saal mein do-chaar jobs par haath se chuna jaata hai. ' +
          'Poora tafseeli safar "Job ka safar" tab mein hai.',
        warnings: [
          'Stage aage peeche nahi ho sakti — system pehle wali stage maangta hai.',
          'Printing plate ke baghair BILKUL nahi chalti — active plate row zaroori hai.',
          'Board kam ho to system sirf warning deta hai, rokta nahi — shop bara board bhi use karta hai ya kam par shuru kar deta hai.',
        ],
      },
      {
        heading: 'Press Proof',
        body:
          'Proof bhi ek JOB hi hoti hai — 100/200/500 sheets asli press par, taake customer asli colour dekhe. ' +
          'Number PARENT-P1, -P2 hota hai. Uski sheet count hi quantity hai, boxes zero. ' +
          'Ek dafa koi proof ban gayi, to parent job ki Printing us waqt tak band rehti hai jab tak koi proof approve na ho.',
      },
      { heading: 'Edit / Delete', body: 'Job ka edit aur delete sirf Super Admin kar sakta hai — Owner bhi nahi. Yeh jaan-boojh kar hai.' },
    ],
  },
  {
    module: 'artwork',
    title: 'Artwork',
    purpose: 'Design upload karna, customer se approve karana, aur markup par kaam karna.',
    sections: [
      {
        heading: 'Approval ka tareeqa',
        steps: [
          { do: 'Artwork file upload karein.' },
          { do: 'Customer ko approval link bhejein.' },
          { do: 'Customer approve ya changes maange. Uske marks seedha tasveer par nazar aate hain.' },
        ],
      },
      {
        heading: 'Markup editor',
        body: 'WhatsApp jaisa — draw, arrow, box, text, emboss aur undo. Marks tasveer par fee sadi (%) ke hisaab se ' +
          'save hote hain, is liye choti bari screen par bhi theek jagah dikhte hain.',
      },
      {
        heading: 'Artwork ke baghair aage nahi',
        body: 'Job ki Artwork stage complete nahi hoti jab tak approved artwork maujood na ho. ' +
          'Yeh gate jaan-boojh kar hai — bina approval chhapayi shop ka sab se mehnga error hai.',
      },
    ],
  },
  {
    module: 'plates',
    title: 'Plates',
    purpose: 'CMYK plate banana, purani plate dobara use karna, aur job par lagana.',
    sections: [
      {
        heading: 'Plate set',
        steps: [
          { do: 'Plates → jis job ki plate chahiye us par Generate Set.', why: 'CMYK ka poora set ek saath ban jaata hai, plate code bhi.' },
          { do: 'Plate job par assign karein.' },
        ],
        warnings: [
          'Printing plate ke baghair chal hi nahi sakti — yeh hard block hai, warning nahi.',
          'Repeat job par purani plate dobara use ki ja sakti hai, magar agar design badla hai to system warning deta hai.',
        ],
      },
    ],
  },
  {
    module: 'planning',
    title: 'Planning',
    purpose: 'Kis din kaunsi job, aur us din kaunsi pehle — machine ke saath.',
    sections: [
      {
        heading: 'Din ka plan',
        steps: [
          { do: 'Job ko kisi date par plan karein.', why: 'Nayi plan us din ke AAKHIR mein lagti hai.' },
          { do: 'Us din ke andar order upar neeche kar lein.', why: 'Shop floor bhi yahi order dekhta hai — is se pata chalta hai ke pehle kaunsi job chalegi.' },
          { do: 'Machine attach karein.', why: 'Machine baad mein bhi lag sakti hai, sirf banate waqt nahi.' },
        ],
        warnings: [
          'Jis machine par kaam record ho chuka hai (start time ya hours), wo hataayi nahi ja sakti — ' +
          'system naam le kar mana kar dega. Yeh record bachane ke liye hai.',
        ],
      },
    ],
  },
  {
    module: 'store',
    title: 'Store (MRN) — Issue Materials',
    purpose: 'Job ko board aur material dena, aur stock se kaatna.',
    sections: [
      {
        heading: 'Board Issue',
        steps: [
          { do: 'Job ki Board Issue stage start hone par draft MRN KHUD ban jaata hai.', why: 'Aap ko naya MRN banane ki zaroorat nahi.' },
          { do: 'MRN kholein, board item chunein aur quantity issue karein.' },
          { do: 'MRN ko Issued karein.', why: 'MRN issued hone tak Board Issue stage complete nahi hoti.' },
        ],
        warnings: [
          'MRN sirf us waqt khud banta hai jab job par Board Type AUR Sheet Qty dono maujood hon. ' +
          'Na hon to error Store ko blame karta hai, magar asal kami job par hoti hai.',
          'Issue ki hui GSM aur planned GSM alag hon to system warning deta hai aur wajah poochta hai — rokta nahi.',
        ],
      },
      {
        heading: 'Return to Store',
        body: 'Floor se bacha hua board wapas aaye to Return to Store se daalein, aur job zaroor batayein. ' +
          'Monthly report mein yeh apne alag column "Return From Production" mein aata hai, purchase ke saath mila kar nahi.',
      },
    ],
  },
  {
    module: 'board_inventory',
    title: 'Board Inventory',
    purpose: 'Board aur paper ka stock, uska rate, lot history, aur mahine ka stock report.',
    sections: [
      {
        heading: 'Naya item',
        steps: [
          { do: 'Add Item. Description, phir Board / Paper Type chunein.', why: 'Ek hi dropdown mein Board aur Paper dono groups hain — store dono rakhta hai.' },
          { do: 'GSM, Sheet Width, Sheet Height bharein.', why: 'Inhi se wazan nikalta hai. Na hon to per-kg rate nahi liya ja sakega.' },
          { do: 'Sheets per Packet theek karein — board 100, paper ka ream 500 ya 250.' },
          { do: 'Opening stock PACKETS mein daalein.', why: 'Form neeche sheets dikha deta hai — save se pehle wo number parh lein.' },
        ],
      },
      {
        heading: 'Stock In (board aaya)',
        steps: [
          { do: 'Item par In dabayein. Quantity packets mein.' },
          { do: 'Vendor chunein.', why: 'Item ka apna vendor pehle se chuna hota hai; alag delivery ho to badal lein.' },
          { do: 'Yeh board kis job ke liye aaya — job chunein. Khali chhorna bhi theek jawab hai (general stock).' },
          { do: 'Rate per KG daalein.', why: 'System per-sheet cost khud nikaal kar item ke rate ka weighted average update kar deta hai — job usi rate par costing karta hai.' },
        ],
        warnings: [
          'Board reserve nahi hota. Job likhne ka matlab record hai — wo board phir bhi kisi bhi job ko issue ho sakta hai.',
          'Rate khali chhorna bhi theek hai; is se purana rate kharab nahi hota. Magar rate ke baghair job par board zero par book hoga.',
        ],
      },
      {
        heading: 'Edit / Out / Adjust',
        body:
          'Edit se item ki tafseel theek hoti hai — magar STOCK edit se nahi badalta. Stock sirf In / Out / Adjust ' +
          'se badlein taake har tabdeeli ka ledger record bane. Adjust ka matlab: "jo maine ginn kar dekha, wahi kar do".',
      },
      {
        heading: 'Lot History aur Stock Report',
        body:
          'Lot History har delivery alag dikhati hai — vendor, date, rate per sheet, kitna bacha hai, aur kis job ke liye aaya tha. ' +
          'Stock Report shop ki apni monthly sheet hai: Opening / Received / Return / Issued / Balance, vendor ke hisaab se. ' +
          'Yeh ledger se banti hai, is liye koi bhi purana mahina hamesha dobara nikaala ja sakta hai.',
        warnings: [
          'July 2026 ka report Excel se match nahi karega — July system se bahir hui thi. August se har mahina theek chalega.',
        ],
      },
    ],
  },
  {
    module: 'purchase',
    title: 'Purchase Orders',
    purpose: 'Vendor se board aur material mangwana, aur aane par stock mein daalna.',
    sections: [
      {
        heading: 'PO banana',
        steps: [
          { do: 'Purchase → New PO. Vendor chunein.' },
          { do: 'Har line par Board stock item chunein.', why: 'Is link ke baghair receive karne par stock mein KUCH bhi nahi barhega — PO sirf kaghaz reh jaayega.' },
          { do: 'Yeh line kis job ke liye hai — job chunein, ya general stock ke liye khali chhor dein.' },
          { do: 'Quantity PACKETS mein, aur rate ka basis chunein: /kg board ke liye, /pkt paper ream ke liye, /unit service ke liye.', why: 'Per-kg line ka total wazan × rate hota hai, aur wazan line par likha aata hai — vendor ke invoice se match kar lein.' },
        ],
        warnings: [
          'Per-kg line ke liye us stock item par Sheet Size aur GSM zaroori hai, warna PO save nahi hoga. ' +
          'Ya to item theek karein, ya line /pkt par rakhein.',
          'Jo banda PO banata hai wo usay approve NAHI kar sakta. Yeh jaan-boojh kar hai.',
        ],
      },
      {
        heading: 'Receive karna',
        steps: [
          { do: 'PO par Receive dabayein aur jitne packets aaye hain wo likhein.' },
          { do: 'Save karein.', why: 'Stock sheets mein barhta hai, ledger row banti hai, lot banta hai (vendor, rate aur job ke saath), aur item ka rate weighted average par update ho jaata hai.' },
        ],
        warnings: ['Aadha maal bhi receive ho sakta hai — baqi baad mein.'],
      },
    ],
  },
  {
    module: 'vendors',
    title: 'Vendors',
    purpose: 'Supplier ka record aur uska ledger.',
    sections: [
      { heading: 'Naya vendor', steps: [{ do: 'Vendors → Add Vendor. Code (VND-) khud ban jaata hai.' }] },
      { heading: 'Ledger', body: 'Har PO aur har payment vendor ke ledger mein khud chala jaata hai — kitna dena hai, ek jagah.' },
    ],
  },
  {
    module: 'printing',
    title: 'Printing (aur baqi production stages)',
    purpose: 'Machine par khare ho kar apna kaam start aur complete karna.',
    sections: [
      {
        heading: 'Kaam ka tareeqa',
        steps: [
          { do: 'My Queue kholein.', why: 'Sirf wahi jobs aati hain jo is waqt aap ke department par khari hain — dhoondna nahi padta.' },
          { do: 'Job par Start dabayein.' },
          { do: 'Kaam ke doran wastage, ink usage aur shift (A / B / C) record karein.', why: 'Shift haath se chuni jaati hai, ghari se nahi — kyunki shift ke waqt badalte rehte hain.' },
          { do: 'Complete dabayein.', why: 'Job khud agle department ki queue mein chali jaati hai.' },
        ],
        warnings: [
          'Printing plate ke baghair start nahi hogi.',
          'Board stock kam hone par sirf warning aayegi — kaam ruke ga nahi.',
          'Phone par Scan se seedha job khul jaati hai — number likhne ki zaroorat nahi.',
        ],
      },
      {
        heading: 'Production Operator ka daira',
        body: 'Yeh aik hi role Printing, Lamination, Die Cutting, Hot Foil, Folder Gluing aur Packing — ' +
          'sab ko cover karta hai, is liye is ka naam "Production Operator" hai.',
      },
    ],
  },
  {
    module: 'qc',
    title: 'QC (Quality Control)',
    purpose: 'Job pass ya fail karna, aur reprint mangwana.',
    sections: [
      {
        heading: 'Inspection',
        steps: [
          { do: 'QC ki list se job kholein.' },
          { do: 'Pass, Conditional Pass, ya Fail record karein.' },
        ],
        warnings: [
          'QC stage complete nahi hoti jab tak pass ya conditional pass na ho. Fail par, ya inspection na hone par, job aage nahi jaati.',
          'Jo jobs 092 se pehle chal rahi thin, un par QC row nahi hai — sirf uske baad banne wali jobs par hai.',
          'QC aik hi role hai jise approve/reject ka haq hai, kyunki wahi uska kaam hai.',
        ],
      },
      { heading: 'Reprint', body: 'Fail hone par reprint request banti hai, aur us se nayi job banti hai — usi material aur usi spec par.' },
    ],
  },
  {
    module: 'dispatch',
    title: 'Dispatch',
    purpose: 'Tayyar maal customer ko bhejna aur delivery ka record rakhna.',
    sections: [
      {
        heading: 'Bhejna',
        steps: [
          { do: 'Dispatch kholein — upar "action needed" panel batata hai kaunsi jobs dispatch ke intezaar mein hain.' },
          { do: 'Dispatch note banayein (DISP-), quantity aur vehicle ki tafseel daalein.' },
          { do: 'Print kar ke driver ko dein.' },
        ],
      },
      { heading: 'Job band kab hoti hai', body: 'Aakhri stage complete hone par job khud completed ho jaati hai aur uski date lag jaati hai. Koi aur cheez job ko band nahi karti.' },
    ],
  },
  {
    module: 'finance',
    title: 'Finance',
    purpose: 'Invoice banana, payment record karna, aur job ki asli lagat dekhna.',
    sections: [
      {
        heading: 'Invoice',
        steps: [
          { do: 'Finance → New Invoice. Customer aur job chunein.' },
          { do: 'Invoice bhejein (INV-), phir payment aane par record karein.', why: 'Customer ka ledger khud update hota hai.' },
        ],
        warnings: ['Jo banda invoice banata hai wo usay approve nahi karta.'],
      },
      {
        heading: 'Job Costing',
        body:
          'Job par board, plate aur baqi material ka ASAL kharch khud aata hai — Store se issue hone ke waqt. ' +
          'Board ka rate item ka weighted average per-sheet rate hota hai.',
        warnings: [
          'Abhi job us LOT ke rate par nahi, item ke AUSAT rate par book hota hai. ' +
          'Yaani do deliveries ke rate ka farq job-to-job nazar nahi aayega.',
        ],
      },
      { heading: 'Stat cards', body: 'Upar ke total database se ginne jaate hain, screen par dikhne wali rows se nahi — is liye wo 200 ya 1000 rows ke baad bhi theek rehte hain.' },
    ],
  },
  {
    module: 'reports',
    title: 'Reports',
    purpose: 'Kaam, wastage, turnaround, material, customer aur breakdown ke numbers.',
    sections: [
      {
        heading: 'Date range',
        body: 'Har report ka apna From/To hai. Tabs: Jobs, Wastage, Turnaround, Materials, Customers, Breakdown.',
      },
      {
        heading: 'Breakdown tab',
        body: 'Jobs ko kisi bhi cheez ke hisaab se tor kar dekh lein — box type, customer, colours, quantity band, repeat. ' +
          'Har sawal ki alag report banane ki zaroorat nahi.',
      },
      {
        heading: 'Materials tab',
        body: 'Board consumption, downtime, planned-vs-issued GSM ka farq, aur reprint ki lagat — ' +
          'yeh sab saalon se record ho raha tha magar kabhi parha nahi gaya tha.',
      },
    ],
  },
  {
    module: 'production',
    title: 'Production — Floor View aur My Queue',
    purpose: 'Poori factory is waqt kahan khari hai.',
    sections: [
      { heading: 'My Queue', body: 'Sirf aap ke department ka kaam, sahi order mein — planned date, phir us din ka order.' },
      { heading: 'Floor View', body: 'Saari machines aur saari chalti hui jobs ek screen par — supervisor ke liye.' },
    ],
  },
  {
    module: 'machines',
    title: 'Machines',
    purpose: 'Machine ka record, uski availability aur downtime.',
    sections: [
      { heading: 'Downtime', body: 'Machine band ho to downtime record karein. Reports mein khuli hui downtime ab tak ki ginn kar dikhayi jaati hai.' },
    ],
  },
  {
    module: 'users',
    title: 'Users',
    purpose: 'Staff ke account, unke role aur password.',
    sections: [
      {
        heading: 'Naya banda',
        steps: [
          { do: 'Users → Add User. Naam, email, role aur department dein.' },
          { do: 'Password ek dafa dikhaya jaata hai — usi waqt note kar lein.' },
        ],
        warnings: [
          'Password baad mein DIKHAYA nahi ja sakta, sirf reset ho sakta hai — wo one-way encrypted hota hai. ' +
          'Reset Super Admin karta hai; apna password har banda khud Header se badal sakta hai.',
          'User delete karne par uska login account bhi khatam ho jaata hai, taake email dobara use ho sake.',
          'WhatsApp notification ke liye phone number 923... ki shakal mein hona chahiye.',
        ],
      },
    ],
  },
  {
    module: 'settings',
    title: 'Settings',
    purpose: 'Master data — jin par poora system chalta hai.',
    sections: [
      {
        heading: 'Materials',
        body: 'Board Types, Paper Types, Box Types, Ink, Glue, Foil, Coating Types aur Cost Items. ' +
          'Coating ka dropdown yahin se aata hai — code mein koi list nahi hai.',
      },
      {
        heading: 'Workflow Engine',
        body: 'Templates, stages, aur kaunsi stage kis department ki hai. ' +
          'Box Type par workflow map hota hai — yaani nayi job ko kaunsa route milega, wo Box Type decide karta hai.',
        warnings: [
          'Template ko delete karne par uski stages khud delete nahi hotin — is se aisi stages reh jaati hain ' +
          'jo kisi ki nahi hotin. Template hatane se pehle batayein.',
          'Stage par department na ho to us department ki queue khali rehti hai aur notification bhi nahi jaata.',
        ],
      },
      {
        heading: 'Roles & Permissions',
        body: 'Har role ke liye view / create / edit / delete / approve / reject / export / print. ' +
          'Yahan ki tabdeeli foran lagoo hoti hai — aur is Help page ki "aap ke screens" wali list bhi ' +
          'yahin se aati hai, is liye wo hamesha sach dikhati hai.',
      },
      {
        heading: 'Units',
        body: 'Sheet, KG, Box waghera. Ek dafa yeh list do baar seed ho gayi thi aur har unit do dafa dikhti thi — ' +
          'wo theek ho chuka hai, magar naya unit banate waqt dekh lein ke pehle se maujood na ho.',
      },
    ],
  },
  {
    module: 'admin',
    title: 'Admin',
    purpose: 'Company level settings aur audit log.',
    sections: [
      { heading: 'Audit log', body: 'Kis ne kya badla, kab. Har table par record hota hai.' },
    ],
  },
  {
    module: 'workflow',
    title: 'Workflow',
    purpose: 'Stage ka order aur kaunsi stage kis par ruki hui hai.',
    sections: [
      {
        heading: 'Gating',
        body: 'Jahan rules likhe hain wo chalte hain; jahan nahi likhe wahan stages seedha aage peeche chalti hain. ' +
          'Kuch stages doosri stage ke START par khulti hain, complete par nahi — jaise Die Cutting Printing shuru hote hi khul jaati hai.',
      },
    ],
  },
  {
    module: 'lamination',
    title: 'Lamination',
    purpose: 'Lamination stage ka kaam.',
    sections: [{ heading: 'Kaam', body: 'My Queue → Start → wastage/shift → Complete. Lamination sirf "Carton with Lamination / Foil" template wali jobs par aati hai.' }],
  },
  {
    module: 'die_cutting',
    title: 'Die Cutting',
    purpose: 'Die cutting stage ka kaam.',
    sections: [{ heading: 'Kaam', body: 'My Queue → Start → wastage/shift → Complete. Yeh stage Printing SHURU hone par khul jaati hai, uske complete hone ka intezaar nahi karti.' }],
  },
  {
    module: 'hot_foil',
    title: 'Hot Foil',
    purpose: 'Hot foil stage ka kaam.',
    sections: [{ heading: 'Kaam', body: 'My Queue → Start → wastage/shift → Complete. Foil bhi sirf lamination/foil wale template par aata hai.' }],
  },
  {
    module: 'folder_gluing',
    title: 'Folder Gluing (Pasting)',
    purpose: 'Pasting stage ka kaam.',
    sections: [{ heading: 'Kaam', body: 'My Queue → Start → wastage/shift → Complete.' }],
  },
  {
    module: 'packing',
    title: 'Packing',
    purpose: 'Packing stage ka kaam.',
    sections: [{ heading: 'Kaam', body: 'My Queue → Start → Complete. Iske baad job QC par jaati hai, phir Dispatch par.' }],
  },
]

/* ═══════════════════════════════════════════════════════════════════════════
   ROLE GUIDES — all 15 roles seeded on live
   ═══════════════════════════════════════════════════════════════════════════ */

export const ROLE_GUIDES: RoleGuide[] = [
  {
    slug: 'superadmin',
    title: 'Super Admin',
    oneLiner: 'Poore system ka malik — har screen, har permission, aur wo cheezein jo kisi aur ko nahi milti.',
    keyModules: ['settings', 'users', 'admin', 'jobs', 'reports', 'finance'],
    dailyFlow: [
      { do: 'Dashboard se din ka haal dekhein.' },
      { do: 'Alerts par nazar — kam stock, atki hui jobs.' },
      { do: 'Naye staff ke account aur role Settings → Roles & Permissions se set karein.' },
      { do: 'Migration ke baad Help page kholein.', why: 'Har role ki "aap ke screens" wali list live permissions se banti hai — permission badalne ka asar yahan foran dikh jaata hai.' },
    ],
    cannot: [],
  },
  {
    slug: 'owner',
    title: 'Owner',
    oneLiner: 'Karobar ka malik — sab kaam dikhta hai, settings tak pahunch hai.',
    keyModules: ['jobs', 'reports', 'quotations', 'dispatch', 'planning', 'settings'],
    dailyFlow: [
      { do: 'Dashboard aur Reports — aaj kitna kaam nikla, kahan atka hai.' },
      { do: 'Jobs list se kisi bhi job ka poora safar dekhein.' },
      { do: 'Quotations par nazar — kya bheja gaya, kya approve hua.' },
    ],
    cannot: [
      'Job ka edit aur delete — wo sirf Super Admin ke paas hai, jaan-boojh kar. ' +
      'Iske ilawa Owner par koi rok nahi: Super Admin aur Owner dono permission check se bypass hain, ' +
      'is liye har screen khulti hai chahe Settings mein us ka tick lagaya gaya ho ya nahi.',
    ],
  },
  {
    slug: 'ceo',
    title: 'CEO',
    oneLiner: 'Numbers pehle — kaam ka rukh, margin, aur customer ka haal.',
    keyModules: ['reports', 'finance', 'quotations', 'customers', 'jobs'],
    dailyFlow: [
      { do: 'Reports → date range daal kar mahine ka haal dekhein.' },
      { do: 'Customers tab — win rate aur customer ka margin.' },
      { do: 'Breakdown tab — kaam ko box type, customer ya quantity band ke hisaab se tor kar dekhein.' },
      { do: 'Finance — kitna invoice hua, kitna aana hai.' },
    ],
  },
  {
    slug: 'gm',
    title: 'General Manager',
    oneLiner: 'Factory chalane wala — kaam, machine, aur log.',
    keyModules: ['jobs', 'planning', 'production', 'qc', 'dispatch', 'reports'],
    dailyFlow: [
      { do: 'Floor View — is waqt kahan kya chal raha hai.' },
      { do: 'Planning — aaj aur kal ka order theek karein.' },
      { do: 'QC aur Dispatch ke "action needed" panels dekhein.' },
      { do: 'Reports → Wastage aur Turnaround.', why: 'Kahan waqt aur maal zaya ho raha hai, yeh wahin dikhta hai.' },
    ],
  },
  {
    slug: 'admin',
    title: 'Admin',
    oneLiner: 'Daftar ka intezaam — kaam, log, aur settings.',
    keyModules: ['jobs', 'users', 'settings', 'planning', 'dispatch', 'reports'],
    dailyFlow: [
      { do: 'Jobs list se din ka kaam dekhein.' },
      { do: 'Naye staff ke account banayein aur role dein.' },
      { do: 'Settings mein master data theek rakhein — board types, box types, coating.' },
    ],
    cannot: [
      'Dashboard aur Customers is waqt Admin role par BAND hain. Agar yeh ghalti se hua hai to ' +
      'Settings → Roles & Permissions se khol dein — Super Admin ya Owner kar sakta hai.',
    ],
  },
  {
    slug: 'sales',
    title: 'Sales',
    oneLiner: 'Customer, rate aur order — kaam yahan se shuru hota hai.',
    keyModules: ['customers', 'quotations', 'sales_orders', 'jobs'],
    dailyFlow: [
      { do: 'Naya customer ya uska contact add karein.' },
      { do: 'Quotation banayein — box type, board/paper, size, quantity, ups, phir calculator.' },
      { do: 'Quotation Sent karein aur link customer ko bhejein.' },
      { do: 'Approve hone par Convert to Sales Order.' },
      { do: 'Sales Order Confirm karein.', why: 'Confirm hone tak wo New Job ki list mein nahi aata.' },
    ],
    cannot: [
      'Board stock aur purchase nazar nahi aate — un ki zaroorat sales ko nahi.',
      'Job ka spec badalna sales ka kaam nahi; wo planning aur estimator ka hai.',
    ],
  },
  {
    slug: 'artwork',
    title: 'Artwork',
    oneLiner: 'Design, customer approval, aur plate se pehle ka sab kaam.',
    keyModules: ['artwork', 'jobs', 'plates', 'quotations'],
    dailyFlow: [
      { do: 'Artwork list se nayi job uthayein.' },
      { do: 'File upload karein aur customer ko approval link bhejein.' },
      { do: 'Customer ke marks dekh kar changes karein aur dobara bhejein.' },
      { do: 'Approve hone par job ki Artwork stage complete karein.', why: 'Approved artwork ke baghair yeh stage complete nahi hogi.' },
    ],
    cannot: ['Changed repeat par Artwork skip nahi kar sakte, agar change se chhapne wali tasveer badalti hai.'],
  },
  {
    slug: 'planning',
    title: 'Planning',
    oneLiner: 'Kaam ka naqsha — kaunsi job kab, kis machine par, aur board hai ya nahi.',
    keyModules: ['planning', 'jobs', 'board_inventory', 'store', 'production'],
    dailyFlow: [
      { do: 'Nayi jobs ka spec check karein — Board Type aur Sheet Qty zaroor.', why: 'In ke baghair MRN nahi banega aur Board Issue kabhi complete nahi hogi.' },
      { do: 'Board Inventory dekh kar confirm karein ke maal maujood hai.' },
      { do: 'Job ko din par plan karein aur us din ka order set karein.' },
      { do: 'Machine attach karein.' },
    ],
  },
  {
    slug: 'store',
    title: 'Store',
    oneLiner: 'Maal ka rakhwala — board andar, board bahir, aur har cheez ka hisaab.',
    keyModules: ['store', 'board_inventory', 'purchase'],
    dailyFlow: [
      { do: 'Store (MRN) kholein — kaunsi jobs board ke intezaar mein hain.' },
      { do: 'MRN par board item aur quantity daal kar Issued karein.' },
      { do: 'Naya board aane par Board Inventory → In. Vendor, job aur rate per KG zaroor daalein.' },
      { do: 'Floor se maal wapas aaye to Return to Store se daalein, job ke saath.' },
      { do: 'Mahine ke aakhir mein Stock Report dekh lein.', why: 'Ledger se banti hai — koi bhi purana mahina hamesha nikaala ja sakta hai.' },
    ],
    cannot: [
      'Jobs ki list is waqt Store role par nahi khulti. MRN se job ka number aur zaroorat nazar aa jaati hai; ' +
      'poori job dekhni ho to Settings → Roles & Permissions se jobs::view khol dein.',
    ],
  },
  {
    slug: 'purchase',
    title: 'Purchase',
    oneLiner: 'Kharidari — vendor, PO, aur maal aane par stock.',
    keyModules: ['purchase', 'vendors', 'board_inventory', 'store'],
    dailyFlow: [
      { do: 'MRP ya Board Inventory se dekhein kis cheez ki kami hai.' },
      { do: 'PO banayein — har line par board stock item aur job zaroor chunein.', why: 'Stock item ke baghair receive karne par stock mein kuch nahi barhega.' },
      { do: 'Rate ka basis theek chunein — board /kg, paper ream /pkt, service /unit.' },
      { do: 'Maal aane par Receive karein.' },
    ],
    cannot: [
      'Apna banaya hua PO khud approve nahi kar sakte — jo raise kare wo approve na kare, yeh jaan-boojh kar hai.',
    ],
  },
  {
    slug: 'plates',
    title: 'Plate Making',
    oneLiner: 'Plate banane wala — printing is ke baghair chal hi nahi sakti.',
    keyModules: ['plates', 'jobs', 'artwork'],
    dailyFlow: [
      { do: 'Plates screen ka "action needed" panel dekhein — kis job ko plate chahiye.' },
      { do: 'Generate Set se CMYK ka poora set banayein.' },
      { do: 'Plate job par assign karein.', why: 'Jab tak active plate na ho, Printing hard-blocked rehti hai.' },
      { do: 'Repeat job par purani plate dobara use karein — magar warning parh lein.' },
    ],
  },
  {
    slug: 'printing',
    title: 'Production Operator',
    oneLiner: 'Machine par khara banda — Printing, Lamination, Die Cutting, Hot Foil, Folder Gluing aur Packing, sab aik hi role.',
    keyModules: ['printing', 'jobs', 'lamination', 'die_cutting', 'hot_foil', 'folder_gluing', 'packing'],
    dailyFlow: [
      { do: 'My Queue kholein — sirf aap ke department ka kaam, sahi order mein.' },
      { do: 'Job par Start.' },
      { do: 'Wastage, ink aur shift (A / B / C) record karein.' },
      { do: 'Complete.', why: 'Job khud agle department par chali jaati hai — kisi ko batana nahi padta.' },
    ],
    cannot: [
      'Plate ke baghair Printing start nahi hogi.',
      'QC aur Reports is role par band hain — apna kaam My Queue se hi chalta hai.',
    ],
  },
  {
    slug: 'qc',
    title: 'Quality Control',
    oneLiner: 'Maal ka darban — pass, conditional pass, ya fail.',
    keyModules: ['qc', 'jobs', 'production'],
    dailyFlow: [
      { do: 'QC list kholein.' },
      { do: 'Job dekh kar Pass / Conditional Pass / Fail record karein.' },
      { do: 'Fail par reprint request banayein.', why: 'Us se nayi job banti hai — usi material aur usi spec par.' },
    ],
    cannot: ['Dispatch nazar nahi aata — QC pass hone par job khud dispatch wale ke paas chali jaati hai.'],
  },
  {
    slug: 'dispatch',
    title: 'Dispatch',
    oneLiner: 'Maal bahir bhejne wala — aur delivery ka record.',
    keyModules: ['dispatch', 'jobs'],
    dailyFlow: [
      { do: 'Dispatch ka "action needed" panel dekhein.' },
      { do: 'Dispatch note banayein, quantity aur vehicle daalein.' },
      { do: 'Print kar ke driver ko dein.' },
      { do: 'Dispatch complete karein.', why: 'Aakhri stage complete hone par job khud completed ho jaati hai.' },
    ],
  },
  {
    slug: 'accounts',
    title: 'Accounts',
    oneLiner: 'Paisa — invoice, payment, aur ledger.',
    keyModules: ['finance', 'customers', 'quotations', 'sales_orders', 'reports'],
    dailyFlow: [
      { do: 'Finance kholein — kitna invoice hua, kitna aana hai.' },
      { do: 'Nayi invoice banayein aur bhejein.' },
      { do: 'Payment aane par record karein.', why: 'Customer ka ledger khud update ho jaata hai.' },
      { do: 'Reports → Customers se margin dekhein.' },
    ],
    cannot: [
      'Apni banayi hui invoice khud approve nahi kar sakte — yeh jaan-boojh kar hai.',
      'Purchase aur Store nazar nahi aate.',
    ],
  },
]

/* ═══════════════════════════════════════════════════════════════════════════
   THE JOURNEY — customer ki call se le kar paise tak, ek hi jagah
   ═══════════════════════════════════════════════════════════════════════════

   Yeh page naye bande ke liye sab se ahem hai: har role apna hissa jaanta hai,
   magar poora silsila kisi ko nahi dikhta.

   STAGE NAMES AND ORDER WERE READ OFF THE LIVE DATABASE, not from memory or
   from CLAUDE.md. Two things that were assumed wrong before checking:
     - "Artwork" and "Customer Approval" are ONE stage ("Artwork & Customer
       Approval"), not two.
     - On the Label / Sticker template, PLANNING COMES BEFORE ARTWORK.
   The default Standard Carton Workflow has 10 stages (its sequence_order
   values skip 2, 6 and 9 — Lamination and Hot Foil were deleted by hand in
   July 2026 and stay deleted).
   ═══════════════════════════════════════════════════════════════════════════ */

export interface JourneyStep {
  /** Display number in the timeline. */
  n: number
  title: string
  /** Role slugs whose people do this. Used to mark "yeh aap ka kaam hai". */
  who: string[]
  whoLabel: string
  /** Where it happens. */
  where: string
  href?: string
  /** What the person actually does. */
  what: string[]
  /** What stops this step until it's satisfied. Hard block unless it says warning. */
  gate?: string
  /** What the system does by itself here — nobody has to remember it. */
  auto?: string
  /** True for the 10 real workflow stages, false for the paperwork around them. */
  isStage?: boolean
}

export const JOURNEY: JourneyStep[] = [
  {
    n: 1, title: 'Customer aur uska kaam',
    who: ['sales'], whoLabel: 'Sales',
    where: 'Customers', href: '/dashboard/customers',
    what: ['Naya customer add karein, ya purana dhoond lein.', 'Contact person add karein — quotation isi ke naam jaayegi.'],
    auto: 'Customer code (CUST-) khud ban jaata hai.',
  },
  {
    n: 2, title: 'Rate banana (Quotation)',
    who: ['sales'], whoLabel: 'Sales / Estimator',
    where: 'Quotations → New Quotation', href: '/dashboard/quotations',
    what: [
      'Line par Box Type, phir Board / Paper Type chunein.',
      'Size, Quantity, Colours aur UPS bharein.',
      'Calculator kholein, Finish Goods ki rows tick karein, margin daalein.',
    ],
    gate: 'UPS ke baghair Sheet Qty nahi banti, aur poora costing usi par khara hai.',
    auto: 'Board chunte hi sheet size aur rate bhar jaate hain. Board ka rate ab default PER KG hai.',
  },
  {
    n: 3, title: 'Customer se approval',
    who: ['sales'], whoLabel: 'Sales → Customer',
    where: 'Quotation → Sent',
    what: ['Quotation Sent karein.', 'Link customer ko bhejein — wo khud Approve ya Reject karega.'],
    gate: 'Sirf APPROVED quotation Sales Order ban sakti hai.',
    auto: 'Har dafa Sent karne par 7 din wala naya link banta hai aur purana mar jaata hai.',
  },
  {
    n: 4, title: 'Sales Order',
    who: ['sales'], whoLabel: 'Sales',
    where: 'Quotation → Convert to Sales Order', href: '/dashboard/sales-orders',
    what: ['Convert dabayein.', 'Sales Order ko Confirmed karein.'],
    gate: 'Confirm hone tak yeh order New Job ki list mein nahi aata.',
    auto: 'Saari lines, board/paper aur quoted GSM ke saath, order par utar aati hain.',
  },
  {
    n: 5, title: 'Job banti hai',
    who: ['sales', 'planning', 'admin'], whoLabel: 'Sales ya Planning',
    where: 'Jobs → New Job', href: '/dashboard/jobs/new',
    what: [
      'Sales Order aur uski line chunein — spec khud bhar jaata hai.',
      'Box Type check karein.',
      'Board Type aur Sheet Qty zaroor bharein.',
    ],
    gate: 'Board Type ya Sheet Qty na ho to aage Board Issue par MRN nahi banega, aur wo stage kabhi complete nahi hogi.',
    auto:
      'Box Type hi decide karta hai ke kaunsa workflow milega — Box → Standard Carton (10 stages), ' +
      'HL → HL Hinge Lid (9), Label ya Sticker → Label / Sticker (7). Job number (JOB-) khud banta hai, ' +
      'aur saari stages khud ban kar pehle department ki queue mein chali jaati hain.',
  },
  {
    n: 6, title: 'Stage 1 — Artwork & Customer Approval', isStage: true,
    who: ['artwork'], whoLabel: 'Artwork',
    where: 'Artwork', href: '/dashboard/artwork',
    what: ['Design upload karein.', 'Customer ko approval link bhejein.', 'Uske marks dekh kar theek karein aur dobara bhejein.'],
    gate: 'Approved artwork ke baghair yeh stage complete NAHI hoti. Changed repeat par skip bhi band ho jaata hai, agar change se chhapne wali tasveer badalti hai.',
    auto: 'Artwork aur customer approval aik hi stage hai, do nahi. Label / Sticker par yeh Planning ke BAAD aati hai.',
  },
  {
    n: 7, title: 'Stage 2 — Planning', isStage: true,
    who: ['planning'], whoLabel: 'Planning',
    where: 'Planning', href: '/dashboard/planning',
    what: ['Job ko din par plan karein.', 'Us din ke andar order set karein.', 'Machine attach karein.'],
    auto: 'Nayi plan us din ke aakhir mein lagti hai. Shop floor bhi yahi order dekhta hai.',
  },
  {
    n: 8, title: 'Stage 3 — Board Issue', isStage: true,
    who: ['store'], whoLabel: 'Store',
    where: 'Store (MRN)', href: '/dashboard/store',
    what: ['MRN kholein, board item aur quantity daalein.', 'MRN ko Issued karein.'],
    gate: 'MRN issued hone tak yeh stage complete nahi hoti.',
    auto:
      'Stage start hote hi draft MRN KHUD ban jaata hai (MRN-) — naya banane ki zaroorat nahi. ' +
      'Stock sheets mein kam hota hai, ledger row banti hai, aur job par board ka asal kharch lag jaata hai. ' +
      'Issue ki hui GSM planned se alag ho to warning aati hai — rokti nahi.',
  },
  {
    n: 9, title: 'Plate banana — stage nahi, magar Printing is par ruki hai',
    who: ['plates'], whoLabel: 'Plate Making',
    where: 'Plates', href: '/dashboard/plates',
    what: ['Generate Set se CMYK ka poora set banayein.', 'Plate job par assign karein.'],
    gate: 'Active plate ke baghair Printing BILKUL start nahi hogi — yeh hard block hai, warning nahi.',
    auto: 'Plate code job number se banta hai. Repeat job par purani plate dobara use ho sakti hai, warning ke saath.',
  },
  {
    n: 10, title: 'Stage 4 — Printing', isStage: true,
    who: ['printing'], whoLabel: 'Production Operator',
    where: 'My Queue', href: '/dashboard/production/queue',
    what: ['My Queue se job par Start.', 'Wastage, ink aur shift (A / B / C) record karein.', 'Complete.'],
    gate:
      'Active plate zaroori hai. Aur agar is job ki koi press proof bani hui hai, to jab tak koi proof approve na ho, ' +
      'parent job ki Printing band rehti hai.',
    auto: 'Board kam ho to sirf warning aati hai — kaam rukta nahi, kyunki shop bara board bhi use karta hai.',
  },
  {
    n: 11, title: 'Stage 5 — UV Coating (optional)', isStage: true,
    who: ['printing'], whoLabel: 'Production Operator',
    where: 'My Queue', href: '/dashboard/production/queue',
    what: ['Start → kaam → Complete.'],
    auto: 'Optional stage hai — na chahiye to skip ho sakti hai. Coating ki list Settings → Materials se aati hai.',
  },
  {
    n: 12, title: 'Stage 6 — Die Cutting', isStage: true,
    who: ['printing'], whoLabel: 'Production Operator',
    where: 'My Queue', href: '/dashboard/production/queue',
    what: ['Start → kaam → Complete.'],
    auto:
      'Yeh stage Printing ke SHURU hote hi khul jaati hai, uske complete hone ka intezaar nahi karti — ' +
      'shop mein asal mein aisa hi hota hai.',
  },
  {
    n: 13, title: 'Stage 7 — Folder Gluing / Pasting (optional)', isStage: true,
    who: ['printing'], whoLabel: 'Production Operator',
    where: 'My Queue', href: '/dashboard/production/queue',
    what: ['Start → kaam → Complete.'],
    auto: 'Yeh Die Cutting ke shuru hote hi khul jaati hai.',
  },
  {
    n: 14, title: 'Stage 8 — Packing', isStage: true,
    who: ['printing'], whoLabel: 'Production Operator',
    where: 'My Queue', href: '/dashboard/production/queue',
    what: ['Start → packing → Complete.'],
  },
  {
    n: 15, title: 'Stage 9 — Quality Check', isStage: true,
    who: ['qc'], whoLabel: 'Quality Control',
    where: 'QC', href: '/dashboard/qc',
    what: ['Job dekh kar Pass / Conditional Pass / Fail record karein.', 'Fail par reprint request banayein.'],
    gate: 'Pass ya Conditional Pass ke baghair yeh stage complete nahi hoti. Fail par, ya inspection na hone par, job aage nahi jaati.',
    auto: 'Reprint request se nayi job banti hai — usi material aur usi spec par.',
  },
  {
    n: 16, title: 'Stage 10 — Dispatch', isStage: true,
    who: ['dispatch'], whoLabel: 'Dispatch',
    where: 'Dispatch', href: '/dashboard/dispatch',
    what: ['Dispatch note (DISP-) banayein, quantity aur vehicle daalein.', 'Print kar ke driver ko dein.', 'Complete karein.'],
    auto: 'Aakhri stage complete hote hi job KHUD completed ho jaati hai aur uski date lag jaati hai. Koi aur cheez job ko band nahi karti.',
  },
  {
    n: 17, title: 'Invoice aur payment',
    who: ['accounts'], whoLabel: 'Accounts',
    where: 'Finance', href: '/dashboard/finance',
    what: ['Invoice (INV-) banayein aur bhejein.', 'Payment aane par record karein.'],
    gate: 'Jo banda invoice banata hai wo usay approve nahi karta.',
    auto: 'Customer ka ledger khud update hota hai. Job par board aur material ka asal kharch Store se pehle hi aa chuka hota hai.',
  },
]

/** Baaki templates — jo Standard Carton se alag chalte hain. */
export const JOURNEY_VARIANTS: HelpSection[] = [
  {
    heading: 'HL (Hinge Lid) — 9 stages',
    body:
      'Artwork & Customer Approval → Planning → Board Issue → Printing → Varnish / Coating (optional) → ' +
      'Die Cutting & Embossing → Packing → Quality Check → Dispatch. ' +
      'Is mein Folder Gluing nahi hai, aur die cutting ke saath embossing bhi isi stage mein hai.',
  },
  {
    heading: 'Label / Sticker — 7 stages',
    body:
      'Planning → Artwork & Customer Approval → Printing → Die Cutting → Packing → Quality Check → Dispatch. ' +
      'Yahan PLANNING ARTWORK SE PEHLE aati hai, aur Board Issue ki stage hai hi nahi.',
  },
  {
    heading: 'Carton with Lamination / Foil — 12 stages',
    body:
      'Standard Carton wala hi rasta, magar Lamination (5) aur Hot Foil (8) wapas daal kar. Dono optional hain. ' +
      'Yeh kisi box type par map NAHI hai — saal ke do-chaar jobs par New Job ke form se haath se chuna jaata hai.',
  },
  {
    heading: 'Proofing Run — 2 stages',
    body:
      'Board Issue → Printing. Press proof bhi aik JOB hi hoti hai (number PARENT-P1, -P2), ' +
      'taake board issue, plates aur costing ka wahi nizaam chale. Uski sheet count hi quantity hai, boxes zero. ' +
      'Ek dafa proof bani, to parent job ki Printing us waqt tak band rehti hai jab tak koi proof approve na ho.',
  },
]

/** Lookup helpers. */
export const roleGuide = (slug: string) => ROLE_GUIDES.find(r => r.slug === slug)
export const moduleGuide = (module: string) => MODULE_GUIDES.find(m => m.module === module)
