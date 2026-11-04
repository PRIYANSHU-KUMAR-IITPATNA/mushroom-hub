export type Language = 'en' | 'hi'

const english = {
  skipToContent: 'Skip to content',
  brandName: 'Mushroom Hub',
  brandDescriptor: 'Oyster mushrooms · Dhanbad',
  navigationLabel: 'Main navigation',
  navHowItWorks: 'How It Works',
  navFarmers: 'For Farmers',
  navBuyers: 'For Buyers',
  navAbout: 'About',
  getStarted: 'Get Started',
  languageGroup: 'Choose language',
  heroEyebrow: 'A new growing opportunity in Dhanbad, Jharkhand',
  heroTitle: 'Growing Mushrooms. Creating Opportunities.',
  heroDescription:
    'Mushroom Hub aims to connect oyster mushroom farmers with training, ready-to-grow bags and reliable market access.',
  heroLocation: 'Starting in Dhanbad, Jharkhand',
  becomeFarmer: 'Become a Farmer',
  buyFresh: 'Buy Fresh Mushrooms',
  heroVisualLabel: 'Illustration of a fresh oyster mushroom',
  heroVisualCaption: 'DHANBAD · JHARKHAND',
  locationStamp: 'Dhanbad · Jharkhand',
  howEyebrow: 'A proposed local model',
  howTitle: 'How Mushroom Hub Works',
  howDescription:
    'A simple, planned journey from cultivation support to organized market connections. These services are proposed and may not yet be available.',
  stepOneTitle: 'Learn the basics',
  stepOneDescription:
    'Farmers register their interest and can access free, in-person cultivation training.',
  stepTwoTitle: 'Get ready-to-grow bags',
  stepTwoDescription:
    'Farmers purchase prepared oyster mushroom growing bags and receive practical guidance.',
  stepThreeTitle: 'Bring in the harvest',
  stepThreeDescription:
    'Farmers grow the mushrooms and bring their harvest to the physical collection hub.',
  stepFourTitle: 'Weigh, grade and record',
  stepFourDescription:
    'The planned hub weighs and grades each accepted harvest, records the transaction and pays according to the applicable grade and price.',
  plannedModelNote:
    'This describes the intended operating model, not a claim that every service is already live.',
  farmerEyebrow: 'For people who grow',
  farmerTitle: 'Grow with practical support',
  farmerDescription:
    'The proposed farmer program is designed to make oyster mushroom cultivation more accessible, with clear guidance from growing through harvest.',
  farmerBenefitTraining: 'Free, in-person training',
  farmerBenefitBags: 'Ready-to-grow bag purchasing',
  farmerBenefitGuidance: 'Practical cultivation guidance',
  farmerBenefitIntake: 'Harvest intake and quality grading',
  farmerBenefitRecords:
    'Clear records of accepted weight, grade, rate and payment',
  farmerEntryLabel: 'Farmer entry point',
  farmerEntryNote:
    'Farmer registration is not available yet. Open the Farmer Portal demo to explore a clearly simulated registration experience.',
  buyerEyebrow: 'For businesses that buy',
  buyerTitle: 'A clearer way to source fresh mushrooms',
  buyerDescription:
    'We aim to connect vegetable retailers, wholesalers, restaurants, hotels and other commercial buyers with fresh oyster mushrooms sourced through a farmer network.',
  buyerBenefitSource:
    'Fresh oyster mushrooms are intended to be sourced through the farmer network',
  buyerBenefitGrade:
    'Grade and quantity details before any order is confirmed',
  buyerBenefitEnquiry: 'A buyer enquiry option for regular supply interest',
  buyerEntryLabel: 'Business buyer enquiry',
  buyerEntryNote:
    'Explore the Buyer Portal demo with sample catalogue values and a simulated enquiry and order journey. Nothing is live or sent to a fulfilment team.',
  aboutEyebrow: 'Rooted in Dhanbad',
  aboutTitle: 'A more connected mushroom supply chain',
  aboutDescription:
    'Mushroom Hub’s mission is to help farmers access cultivation support and market connections while building a more organized fresh-mushroom supply chain.',
  aboutLocation:
    'Our initial focus is Dhanbad, Jharkhand, with the model being developed for the local community.',
  finalEyebrow: 'Take the next step',
  finalTitle: 'Find your path with Mushroom Hub',
  finalDescription:
    'Interested in growing oyster mushrooms or exploring supply for your business? Choose the path that fits you.',
  farmerPath: 'Explore the farmer path',
  buyerPath: 'Explore business buying',
  footerDescriptor:
    'Oyster mushroom growing and supply · Dhanbad, Jharkhand',
  footerNavigationLabel: 'Footer navigation',
  backToTop: 'Back to top',
  pageTitle: 'Mushroom Hub | Oyster Mushrooms in Dhanbad',
  pageDescription:
    'Mushroom Hub aims to connect oyster mushroom farmers with training and market access, and businesses with fresh mushrooms in Dhanbad, Jharkhand.',
} as const

export type TranslationKey = keyof typeof english

const hindi: Record<TranslationKey, string> = {
  skipToContent: 'मुख्य सामग्री पर जाएँ',
  brandName: 'मशरूम हब',
  brandDescriptor: 'ऑयस्टर मशरूम · धनबाद',
  navigationLabel: 'मुख्य नेविगेशन',
  navHowItWorks: 'यह कैसे काम करता है',
  navFarmers: 'किसानों के लिए',
  navBuyers: 'खरीदारों के लिए',
  navAbout: 'हमारे बारे में',
  getStarted: 'शुरू करें',
  languageGroup: 'भाषा चुनें',
  heroEyebrow: 'धनबाद, झारखंड में खेती का नया अवसर',
  heroTitle: 'मशरूम उगाएँ। नए अवसर बनाएँ।',
  heroDescription:
    'मशरूम हब का उद्देश्य ऑयस्टर मशरूम किसानों को प्रशिक्षण, उगाने के लिए तैयार बैग और बाज़ार तक भरोसेमंद पहुँच से जोड़ना है।',
  heroLocation: 'धनबाद, झारखंड से शुरुआत',
  becomeFarmer: 'किसान बनें',
  buyFresh: 'ताज़े मशरूम खरीदें',
  heroVisualLabel: 'ताज़े ऑयस्टर मशरूम का चित्र',
  heroVisualCaption: 'धनबाद · झारखंड',
  locationStamp: 'धनबाद · झारखंड',
  howEyebrow: 'प्रस्तावित स्थानीय मॉडल',
  howTitle: 'मशरूम हब कैसे काम करता है',
  howDescription:
    'खेती में सहायता से लेकर बाज़ार से जुड़ने तक का एक सरल, प्रस्तावित सफ़र। ये सेवाएँ प्रस्तावित हैं और अभी उपलब्ध न भी हों।',
  stepOneTitle: 'खेती की बुनियाद सीखें',
  stepOneDescription:
    'किसान अपनी रुचि दर्ज कर सकते हैं और आमने-सामने मुफ़्त खेती प्रशिक्षण प्राप्त कर सकते हैं।',
  stepTwoTitle: 'उगाने के लिए तैयार बैग लें',
  stepTwoDescription:
    'किसान तैयार ऑयस्टर मशरूम बैग खरीदें और व्यावहारिक मार्गदर्शन पाएँ।',
  stepThreeTitle: 'अपनी फसल लाएँ',
  stepThreeDescription:
    'किसान मशरूम उगाएँ और अपनी फसल भौतिक संग्रह केंद्र पर लाएँ।',
  stepFourTitle: 'तौल, श्रेणी और रिकॉर्ड',
  stepFourDescription:
    'प्रस्तावित केंद्र स्वीकार की गई फसल का वज़न और श्रेणी तय करेगा, लेन-देन दर्ज करेगा और लागू श्रेणी व दर के अनुसार भुगतान करेगा।',
  plannedModelNote:
    'यह प्रस्तावित संचालन मॉडल है; इसका अर्थ यह नहीं कि सभी सेवाएँ अभी चालू हैं।',
  farmerEyebrow: 'उगाने वालों के लिए',
  farmerTitle: 'व्यावहारिक सहायता के साथ उगाएँ',
  farmerDescription:
    'प्रस्तावित किसान कार्यक्रम ऑयस्टर मशरूम की खेती को आसान बनाने के लिए है, जिसमें उगाने से फसल तक स्पष्ट मार्गदर्शन मिलेगा।',
  farmerBenefitTraining: 'आमने-सामने मुफ़्त प्रशिक्षण',
  farmerBenefitBags: 'उगाने के लिए तैयार बैग खरीदने का विकल्प',
  farmerBenefitGuidance: 'खेती के व्यावहारिक सुझाव',
  farmerBenefitIntake: 'फसल संग्रह और गुणवत्ता श्रेणी',
  farmerBenefitRecords: 'स्वीकृत वज़न, श्रेणी, दर और भुगतान का स्पष्ट रिकॉर्ड',
  farmerEntryLabel: 'किसानों के लिए प्रवेश',
  farmerEntryNote:
    'किसान पंजीकरण अभी उपलब्ध नहीं है। स्पष्ट रूप से सिम्युलेटेड पंजीकरण अनुभव देखने के लिए किसान पोर्टल डेमो खोलें।',
  buyerEyebrow: 'व्यापारिक खरीदारों के लिए',
  buyerTitle: 'ताज़े मशरूम की खरीद का स्पष्ट तरीका',
  buyerDescription:
    'हमारा उद्देश्य सब्ज़ी विक्रेताओं, थोक विक्रेताओं, रेस्तराँ, होटलों और अन्य व्यावसायिक खरीदारों को किसान नेटवर्क से ताज़े ऑयस्टर मशरूम उपलब्ध कराना है।',
  buyerBenefitSource:
    'ताज़े ऑयस्टर मशरूम किसान नेटवर्क से उपलब्ध कराने की योजना है',
  buyerBenefitGrade:
    'किसी भी ऑर्डर की पुष्टि से पहले श्रेणी और मात्रा की जानकारी',
  buyerBenefitEnquiry: 'नियमित आपूर्ति में रुचि रखने वाले कारोबारों के लिए पूछताछ',
  buyerEntryLabel: 'व्यापारिक पूछताछ',
  buyerEntryNote:
    'नमूना कैटलॉग और सिम्युलेटेड पूछताछ व ऑर्डर प्रक्रिया देखने के लिए खरीदार पोर्टल डेमो खोलें। कुछ भी लाइव नहीं है या पूर्ति टीम को नहीं भेजा जाता।',
  aboutEyebrow: 'धनबाद से जुड़ी पहल',
  aboutTitle: 'मशरूम आपूर्ति को बेहतर ढंग से जोड़ना',
  aboutDescription:
    'मशरूम हब का उद्देश्य किसानों को खेती में सहायता और बाज़ार से जुड़ने के अवसर देना, और ताज़े मशरूम की आपूर्ति श्रृंखला को अधिक व्यवस्थित बनाना है।',
  aboutLocation:
    'शुरुआत में हमारा ध्यान धनबाद, झारखंड पर है; स्थानीय समुदाय के लिए इस मॉडल को विकसित किया जा रहा है।',
  finalEyebrow: 'अगला कदम चुनें',
  finalTitle: 'मशरूम हब के साथ अपनी राह चुनें',
  finalDescription:
    'ऑयस्टर मशरूम उगाने या अपने व्यवसाय के लिए आपूर्ति जानने में रुचि है? अपने लिए सही रास्ता चुनें।',
  farmerPath: 'किसानों के लिए विकल्प देखें',
  buyerPath: 'व्यापारिक खरीद के विकल्प देखें',
  footerDescriptor: 'ऑयस्टर मशरूम की खेती और आपूर्ति · धनबाद, झारखंड',
  footerNavigationLabel: 'फ़ुटर नेविगेशन',
  backToTop: 'ऊपर जाएँ',
  pageTitle: 'मशरूम हब | धनबाद में ऑयस्टर मशरूम',
  pageDescription:
    'मशरूम हब का उद्देश्य ऑयस्टर मशरूम किसानों को प्रशिक्षण और बाज़ार से, और व्यवसायों को ताज़े मशरूम से जोड़ना है। शुरुआत धनबाद, झारखंड से।',
}

export const translations: Record<
  Language,
  Record<TranslationKey, string>
> = {
  en: english,
  hi: hindi,
}

export function translate(language: Language, key: TranslationKey): string {
  return translations[language][key]
}
