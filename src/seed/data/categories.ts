/**
 * Category tree mirrors the reference GNB:
 *   0001 flower gifts / 0002 opening plants / 0003 promotion / 0004 wedding-funeral
 *   0006 trend pick / 0007 DIY flower market / 0008 flower types
 * Codes are kept in the same 4-digit + 4-digit shape so sub-categories sort naturally.
 */
export interface SeedCategory {
  code: string;
  slug: string;
  name: { hy: string; en: string; ru: string };
  parentCode?: string;
  order: number;
  showInNav?: boolean;
  icon?: string;
}

export const seedCategories: SeedCategory[] = [
  {
    code: '0001',
    slug: 'flower-gifts',
    name: { hy: 'Ծաղկային նվերներ', en: 'Flower gifts', ru: 'Цветочные подарки' },
    order: 1,
    icon: 'bouquet',
  },
  {
    code: '00010001',
    slug: 'bouquets',
    name: { hy: 'Ծաղկեփնջեր', en: 'Bouquets', ru: 'Букеты' },
    parentCode: '0001',
    order: 1,
  },
  {
    code: '00010002',
    slug: 'flower-baskets',
    name: { hy: 'Ծաղկազամբյուղներ', en: 'Flower baskets', ru: 'Корзины цветов' },
    parentCode: '0001',
    order: 2,
  },
  {
    code: '00010003',
    slug: 'flower-boxes',
    name: { hy: 'Ծաղիկներ տուփով', en: 'Flower boxes', ru: 'Цветы в коробке' },
    parentCode: '0001',
    order: 3,
  },
  {
    code: '00010004',
    slug: 'roses',
    name: { hy: 'Վարդեր', en: 'Roses', ru: 'Розы' },
    parentCode: '0001',
    order: 4,
  },

  {
    code: '0002',
    slug: 'opening-plants',
    name: { hy: 'Բացման ծաղկամաններ', en: 'Opening plants', ru: 'Растения на открытие' },
    order: 2,
    icon: 'plant',
  },
  {
    code: '00020001',
    slug: 'congratulation-plants',
    name: { hy: 'Շնորհավորական բույսեր', en: 'Congratulation plants', ru: 'Поздравительные растения' },
    parentCode: '0002',
    order: 1,
  },
  {
    code: '00020002',
    slug: 'orchids',
    name: { hy: 'Օրխիդեաներ', en: 'Orchids', ru: 'Орхидеи' },
    parentCode: '0002',
    order: 2,
  },
  {
    code: '00020003',
    slug: 'planterior',
    name: { hy: 'Պլանթերիոր', en: 'Planterior', ru: 'Плантериор' },
    parentCode: '0002',
    order: 3,
  },

  {
    code: '0003',
    slug: 'promotion',
    name: { hy: 'Առաջխաղացում / Պաշտոն', en: 'Promotion / Inauguration', ru: 'Повышение / Вступление' },
    order: 3,
    icon: 'award',
  },
  {
    code: '00030001',
    slug: 'promotion-bouquets',
    name: { hy: 'Շնորհավորական փնջեր', en: 'Congratulation bouquets', ru: 'Поздравительные букеты' },
    parentCode: '0003',
    order: 1,
  },
  {
    code: '00030002',
    slug: 'office-plants',
    name: { hy: 'Գրասենյակային բույսեր', en: 'Office plants', ru: 'Офисные растения' },
    parentCode: '0003',
    order: 2,
  },

  {
    code: '0004',
    slug: 'wedding-funeral',
    name: { hy: 'Հարսանիք / Հոգեհանգիստ', en: 'Wedding / Funeral', ru: 'Свадьба / Похороны' },
    order: 4,
    icon: 'wreath',
  },
  {
    code: '00040001',
    slug: 'wedding-flowers',
    name: { hy: 'Հարսանեկան ծաղիկներ', en: 'Wedding flowers', ru: 'Свадебные цветы' },
    parentCode: '0004',
    order: 1,
  },
  {
    code: '00040002',
    slug: 'funeral-wreaths',
    name: { hy: 'Սգո ծաղկեպսակներ', en: 'Funeral wreaths', ru: 'Траурные венки' },
    parentCode: '0004',
    order: 2,
  },

  {
    code: '0006',
    slug: 'trend-pick',
    name: { hy: 'Թրենդ ընտրանի', en: 'Trend pick', ru: 'Тренд-подборка' },
    order: 5,
    icon: 'star',
  },

  {
    code: '0007',
    slug: 'diy-market',
    name: { hy: 'DIY ծաղկաշուկա', en: 'DIY flower market', ru: 'DIY цветочный рынок' },
    order: 6,
    icon: 'scissors',
  },
  {
    code: '00070001',
    slug: 'single-stems',
    name: { hy: 'Առանձին ցողուններ', en: 'Single stems', ru: 'Поштучно' },
    parentCode: '0007',
    order: 1,
  },
  {
    code: '00070002',
    slug: 'florist-supplies',
    name: { hy: 'Ֆլորիստի պարագաներ', en: 'Florist supplies', ru: 'Товары для флористов' },
    parentCode: '0007',
    order: 2,
  },

  {
    code: '0008',
    slug: 'flower-types',
    name: { hy: 'Ծաղիկներն ըստ տեսակի', en: 'Flowers by type', ru: 'Цветы по видам' },
    order: 7,
    icon: 'flower',
  },
  {
    code: '00080001',
    slug: 'tulips',
    name: { hy: 'Կակաչներ', en: 'Tulips', ru: 'Тюльпаны' },
    parentCode: '0008',
    order: 1,
  },
  {
    code: '00080002',
    slug: 'lilies',
    name: { hy: 'Շուշաններ', en: 'Lilies', ru: 'Лилии' },
    parentCode: '0008',
    order: 2,
  },
  {
    code: '00080003',
    slug: 'sunflowers',
    name: { hy: 'Արևածաղիկներ', en: 'Sunflowers', ru: 'Подсолнухи' },
    parentCode: '0008',
    order: 3,
  },
  {
    code: '00080004',
    slug: 'mixed-bouquets',
    name: { hy: 'Խառը փնջեր', en: 'Mixed bouquets', ru: 'Смешанные букеты' },
    parentCode: '0008',
    order: 4,
  },
  {
    code: '00080005',
    slug: 'premium-bouquets',
    name: { hy: 'Պրեմիում փնջեր', en: 'Premium bouquets', ru: 'Премиум букеты' },
    parentCode: '0008',
    order: 5,
  },
  {
    code: '00080006',
    slug: 'seasonal-flowers',
    name: { hy: 'Սեզոնային ծաղիկներ', en: 'Seasonal flowers', ru: 'Сезонные цветы' },
    parentCode: '0008',
    order: 6,
  },
];

export interface SeedCollection {
  slug: string;
  title: { hy: string; en: string; ru: string };
  subtitle: { hy: string; en: string; ru: string };
  showOnHome: boolean;
  order: number;
  /** Wide backdrop the art-line home section lays its product rail over. */
  bannerImage?: string;
}

/** Reference equivalents of /goods/brand?code=XXXX curated sets. */
export const seedCollections: SeedCollection[] = [
  {
    slug: 'florist-picks',
    title: { hy: 'Ֆլորիստի ընտրանի', en: 'Florist picks', ru: 'Выбор флориста' },
    subtitle: {
      hy: 'Մեր ֆլորիստների ամենասիրված աշխատանքները',
      en: 'The arrangements our florists love most',
      ru: 'Любимые работы наших флористов',
    },
    showOnHome: true,
    order: 1,
  },
  {
    slug: 'flower-of-the-month',
    title: { hy: 'Ամսվա ծաղիկը', en: 'Flower of the month', ru: 'Цветок месяца' },
    subtitle: {
      hy: 'Սեզոնային ծաղիկներ՝ թարմ շուկայից',
      en: 'Seasonal stems straight from the market',
      ru: 'Сезонные цветы прямо с рынка',
    },
    showOnHome: true,
    order: 2,
  },
  {
    slug: 'flowers-and-gifts',
    title: { hy: 'Ծաղիկ և նվեր', en: 'Flowers & gifts', ru: 'Цветы и подарки' },
    subtitle: {
      hy: 'Ծաղկեփունջ՝ քաղցրավենիքի կամ տորթի հետ',
      en: 'A bouquet paired with sweets or cake',
      ru: 'Букет вместе со сладостями или тортом',
    },
    showOnHome: true,
    order: 3,
  },
  {
    slug: 'newborn-gifts',
    title: { hy: 'Նորածնի նվերներ', en: 'Newborn gifts', ru: 'Подарки новорождённым' },
    subtitle: {
      hy: 'Նուրբ գույներ՝ ամենակարևոր օրվա համար',
      en: 'Soft colours for the most important day',
      ru: 'Нежные оттенки для самого важного дня',
    },
    showOnHome: true,
    order: 4,
  },
  {
    slug: 'season-picks',
    title: { hy: 'Սեզոնի հիթեր', en: 'Season picks', ru: 'Хиты сезона' },
    subtitle: {
      hy: 'Այն, ինչ այս շաբաթ ամենաշատն են պատվիրում',
      en: 'What everyone is ordering this week',
      ru: 'Что заказывают на этой неделе',
    },
    showOnHome: true,
    order: 5,
  },
  {
    slug: 'art-line',
    title: { hy: 'Արվեստի գիծ', en: 'Art line', ru: 'Линия искусства' },
    subtitle: {
      hy: 'Փունջեր՝ ներշնչված նկարչությունից',
      en: 'Bouquets composed like paintings',
      ru: 'Букеты, вдохновлённые живописью',
    },
    showOnHome: true,
    order: 6,
    bannerImage: 'bg-famous',
  },
  {
    slug: 'romantic',
    title: { hy: 'Ռոմանտիկ', en: 'Romantic', ru: 'Романтичное' },
    subtitle: {
      hy: 'Փունջեր՝ սիրո խոստովանության համար',
      en: 'Bouquets that say it better than words',
      ru: 'Букеты, говорящие лучше слов',
    },
    showOnHome: true,
    order: 7,
  },
  {
    slug: 'premium-picks',
    title: { hy: 'Պրեմիում ընտրանի', en: 'Premium picks', ru: 'Премиум-подборка' },
    subtitle: {
      hy: 'Հազվագյուտ ծաղիկներ՝ մեծ առիթների համար',
      en: 'Rare stems for the biggest occasions',
      ru: 'Редкие цветы для особых случаев',
    },
    showOnHome: true,
    order: 8,
  },
  {
    slug: 'birthday',
    title: { hy: 'Ծննդյան օր', en: 'Birthday', ru: 'День рождения' },
    subtitle: {
      hy: 'Ուրախ փունջեր՝ ծննդյան տոնի համար',
      en: 'Joyful arrangements for the big day',
      ru: 'Яркие букеты для праздника',
    },
    showOnHome: true,
    order: 9,
  },
  {
    slug: 'best-sellers',
    title: { hy: 'Բեսթսելլերներ', en: 'Best sellers', ru: 'Бестселлеры' },
    subtitle: {
      hy: 'Ամենապատվիրված փունջերը ստուդիայից',
      en: 'The bouquets our customers reorder most',
      ru: 'Букеты, которые заказывают снова и снова',
    },
    showOnHome: true,
    order: 10,
  },
];
