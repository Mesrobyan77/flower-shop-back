import { env } from '../../config/env';
import type { PostType, SubscriptionCycle } from '../../constants';

export interface SeedPost {
  type: PostType;
  slug: string;
  title: { hy: string; en: string; ru: string };
  excerpt: { hy: string; en: string; ru: string };
  body: { hy: string; en: string; ru: string };
  coverImage?: string;
  tags?: string[];
  category?: string;
  isPinned?: boolean;
}

export const seedPosts: SeedPost[] = [
  {
    type: 'magazine',
    slug: 'how-to-keep-flowers-fresh',
    title: {
      hy: 'Ինչպես ծաղիկները թարմ պահել ավելի երկար',
      en: 'How to keep your flowers fresh for longer',
      ru: 'Как сохранить цветы свежими дольше',
    },
    excerpt: {
      hy: 'Հինգ պարզ քայլ, որոնք ծաղկեփունջը կպահեն թարմ մեկ շաբաթից ավելի։',
      en: 'Five simple steps that keep a bouquet alive for more than a week.',
      ru: 'Пять простых шагов, которые продлят жизнь букета больше чем на неделю.',
    },
    body: {
      hy: 'Ջուրը փոխեք ամեն օր։ Ցողունները կտրեք 45 աստիճան անկյան տակ։ Հեռու պահեք ուղիղ արևից և մրգերից։ Հեռացրեք ջրի մեջ ընկած տերևները։ Սենյակի ջերմաստիճանը պահեք 18-22 աստիճան։',
      en: 'Change the water daily. Cut the stems at a 45-degree angle. Keep the bouquet away from direct sun and from fruit. Remove any leaves sitting below the waterline. Keep the room between 18 and 22 degrees.',
      ru: 'Меняйте воду ежедневно. Подрезайте стебли под углом 45 градусов. Держите букет вдали от прямого солнца и фруктов. Удаляйте листья ниже уровня воды. Держите комнату при 18-22 градусах.',
    },
    coverImage: `/images/seed/magazine-01.${env.SEED_IMAGE_EXT}`,
    tags: ['care', 'guide'],
    category: 'care',
  },
  {
    type: 'magazine',
    slug: 'flower-language-guide',
    title: {
      hy: 'Ծաղիկների լեզուն. ի՞նչ ասել առանց բառերի',
      en: 'The language of flowers: saying it without words',
      ru: 'Язык цветов: сказать без слов',
    },
    excerpt: {
      hy: 'Վարդ, պիոն, կակաչ, քրիզանթեմ — յուրաքանչյուրն ունի իր իմաստը։',
      en: 'Rose, peony, tulip, chrysanthemum: each one carries its own meaning.',
      ru: 'Роза, пион, тюльпан, хризантема — у каждого свой смысл.',
    },
    body: {
      hy: 'Կարմիր վարդը սեր է, սպիտակը՝ մաքրություն։ Պիոնը բարեկեցություն է և երջանիկ ամուսնություն։ Դեղին կակաչը արև է և ջերմություն։ Սպիտակ քրիզանթեմը հարգանք է և հիշատակ։',
      en: 'A red rose is love, a white one is purity. The peony stands for prosperity and a happy marriage. A yellow tulip is sunshine and warmth. The white chrysanthemum is respect and remembrance.',
      ru: 'Красная роза — любовь, белая — чистота. Пион означает благополучие и счастливый брак. Жёлтый тюльпан — солнце и тепло. Белая хризантема — уважение и память.',
    },
    coverImage: `/images/seed/magazine-02.${env.SEED_IMAGE_EXT}`,
    tags: ['guide'],
    category: 'guide',
  },
  {
    type: 'magazine',
    slug: 'behind-the-studio',
    title: {
      hy: 'Ստուդիայի ետնաբեմում. մեկ օր ֆլորիստի հետ',
      en: 'Behind the studio: a day with our florists',
      ru: 'За кулисами студии: день с флористом',
    },
    excerpt: {
      hy: 'Առավոտյան 5-ին շուկա, 7-ին ստուդիա, 10-ին առաջին առաքումը։',
      en: 'Market at 5am, studio at 7, the first delivery at 10.',
      ru: 'Рынок в 5 утра, студия в 7, первая доставка в 10.',
    },
    body: {
      hy: 'Մեր օրը սկսվում է շուկայում, երբ քաղաքը դեռ քնած է։ Ամեն ցողուն ընտրվում է ձեռքով, որակի պատասխանատուն ստուգում է թարմությունը, հետո ֆլորիստները սկսում են ձևավորումը։',
      en: 'Our day starts at the market while the city is still asleep. Every stem is picked by hand, a quality lead checks freshness, and only then do the florists start arranging.',
      ru: 'Наш день начинается на рынке, когда город ещё спит. Каждый стебель отбирается вручную, менеджер по качеству проверяет свежесть, и только потом флористы начинают работу.',
    },
    coverImage: `/images/seed/magazine-03.${env.SEED_IMAGE_EXT}`,
    tags: ['studio'],
    category: 'studio',
  },
  {
    type: 'notice',
    slug: 'holiday-delivery-schedule',
    title: {
      hy: 'Տոնական օրերի առաքման ժամանակացույց',
      en: 'Holiday delivery schedule',
      ru: 'График доставки в праздничные дни',
    },
    excerpt: {
      hy: 'Տոներին պատվերների ծավալը մեծ է — խնդրում ենք պատվիրել նախօրոք։',
      en: 'Order volume is high on holidays, please order in advance.',
      ru: 'В праздники объём заказов высокий, просим заказывать заранее.',
    },
    body: {
      hy: 'Տոնական օրերին էքսպրես առաքումը կատարվում է 09:00-22:00։ Խնդրում ենք պատվերը ձևակերպել առնվազն մեկ օր առաջ, որպեսզի կարողանանք ապահովել ցանկալի ժամը։',
      en: 'On holidays express delivery runs from 09:00 to 22:00. Please place your order at least a day ahead so we can guarantee your preferred time slot.',
      ru: 'В праздники экспресс-доставка работает с 09:00 до 22:00. Пожалуйста, оформляйте заказ минимум за день, чтобы мы могли гарантировать нужное время.',
    },
    isPinned: true,
  },
  {
    type: 'faq',
    slug: 'faq-delivery-time',
    title: {
      hy: 'Որքա՞ն է տևում առաքումը',
      en: 'How long does delivery take?',
      ru: 'Сколько занимает доставка?',
    },
    excerpt: { hy: 'Երևանում 2-3 ժամ, մարզերում՝ հաջորդ օրը։', en: 'Two to three hours in Yerevan, next day in the regions.', ru: 'Два-три часа в Ереване, на следующий день в регионах.' },
    body: {
      hy: 'Երևանում և Կոտայքում էքսպրես առաքումը հասնում է 2-3 ժամում։ Մարզեր առաքումը կատարվում է փոստային ծառայությամբ և հասնում է հաջորդ աշխատանքային օրը։',
      en: 'Express delivery reaches addresses in Yerevan and Kotayk within two to three hours. Regional orders travel by parcel service and arrive the next working day.',
      ru: 'Экспресс-доставка по Еревану и Котайку занимает два-три часа. Заказы в регионы отправляются службой доставки и приходят на следующий рабочий день.',
    },
    category: 'delivery',
  },
  {
    type: 'faq',
    slug: 'faq-payment',
    title: {
      hy: 'Ինչպե՞ս է կատարվում վճարումը',
      en: 'How do I pay?',
      ru: 'Как происходит оплата?',
    },
    excerpt: { hy: 'Վճարումը կատարվում է առաքման պահին՝ կանխիկ։', en: 'Payment is made in cash when the order arrives.', ru: 'Оплата наличными в момент доставки.' },
    body: {
      hy: 'Մենք աշխատում ենք միայն կանխիկ վճարմամբ առաքման պահին։ Պատվերը ձևակերպելիս ոչինչ վճարել պետք չէ — գումարը փոխանցում եք սուրհանդակին ծաղիկները ստանալիս։',
      en: 'We work with cash on delivery only. Nothing is charged when you place the order: you pay the courier when the flowers arrive.',
      ru: 'Мы работаем только с оплатой наличными при доставке. При оформлении заказа ничего платить не нужно — вы рассчитываетесь с курьером при получении.',
    },
    category: 'payment',
  },
  {
    type: 'faq',
    slug: 'faq-change-order',
    title: {
      hy: 'Կարո՞ղ եմ փոխել կամ չեղարկել պատվերը',
      en: 'Can I change or cancel my order?',
      ru: 'Могу ли я изменить или отменить заказ?',
    },
    excerpt: { hy: 'Այո, մինչև ծաղիկների պատրաստումը սկսելը։', en: 'Yes, until we start preparing the flowers.', ru: 'Да, пока мы не начали собирать букет.' },
    body: {
      hy: 'Պատվերը կարելի է չեղարկել անձնական էջից, քանի դեռ կարգավիճակը «Պատրաստվում է» չէ։ Դրանից հետո զանգահարեք սպասարկման կենտրոն։',
      en: 'You can cancel from your account page while the status is still before "Preparing". After that, please call our support line.',
      ru: 'Отменить можно в личном кабинете, пока статус не перешёл в «Готовится». После этого позвоните в службу поддержки.',
    },
    category: 'order',
  },
  {
    type: 'event',
    slug: 'welcome-credit',
    title: {
      hy: 'Գրանցվի՛ր և ստացիր 2000 ֏ բոնուս',
      en: 'Register and get 2,000 AMD credit',
      ru: 'Зарегистрируйтесь и получите 2 000 драм',
    },
    excerpt: {
      hy: 'Նոր հաշիվ բացողները անմիջապես ստանում են 2000 ֏ բոնուսային միավոր։',
      en: 'New accounts receive 2,000 AMD in points straight away.',
      ru: 'Новые аккаунты сразу получают 2 000 драм бонусами.',
    },
    body: {
      hy: 'Գրանցումից անմիջապես հետո ձեր հաշվին ավելանում է 2000 ֏ բոնուս, որը կարող եք օգտագործել առաջին իսկ պատվերի ժամանակ։',
      en: 'Right after registration 2,000 AMD in points lands in your account, ready to use on your very first order.',
      ru: 'Сразу после регистрации на счёт зачисляется 2 000 драм бонусами, которые можно потратить на первый заказ.',
    },
    coverImage: `/images/seed/event-01.${env.SEED_IMAGE_EXT}`,
    isPinned: true,
  },
];

export interface SeedPlan {
  slug: string;
  name: { hy: string; en: string; ru: string };
  description: { hy: string; en: string; ru: string };
  pricePerDelivery: number;
  cycle: SubscriptionCycle;
  image: string;
  order: number;
}

export const seedPlans: SeedPlan[] = [
  {
    slug: 'weekly-desk',
    name: { hy: 'Շաբաթական՝ սեղանի', en: 'Weekly desk', ru: 'Еженедельный настольный' },
    description: {
      hy: 'Փոքր փունջ ամեն շաբաթ՝ աշխատասեղանի կամ խոհանոցի համար',
      en: 'A small bunch every week for a desk or a kitchen table',
      ru: 'Небольшой букет каждую неделю для стола или кухни',
    },
    pricePerDelivery: 9500,
    cycle: 'weekly',
    image: `/images/seed/subscribe-01.${env.SEED_IMAGE_EXT}`,
    order: 1,
  },
  {
    slug: 'biweekly-home',
    name: { hy: 'Երկշաբաթյա՝ տան', en: 'Biweekly home', ru: 'Раз в две недели, домашний' },
    description: {
      hy: 'Միջին չափի սեզոնային փունջ՝ երկու շաբաթը մեկ',
      en: 'A medium seasonal bouquet every two weeks',
      ru: 'Средний сезонный букет раз в две недели',
    },
    pricePerDelivery: 16000,
    cycle: 'biweekly',
    image: `/images/seed/subscribe-02.${env.SEED_IMAGE_EXT}`,
    order: 2,
  },
  {
    slug: 'monthly-signature',
    name: { hy: 'Ամսական՝ սիգնեչր', en: 'Monthly signature', ru: 'Ежемесячный signature' },
    description: {
      hy: 'Ֆլորիստի հեղինակային ձևավորում՝ ամիսը մեկ անգամ',
      en: 'A florist signature arrangement once a month',
      ru: 'Авторская композиция флориста раз в месяц',
    },
    pricePerDelivery: 26000,
    cycle: 'monthly',
    image: `/images/seed/subscribe-03.${env.SEED_IMAGE_EXT}`,
    order: 3,
  },
];

export const seedSettings = {
  key: 'storefront',
  promoBar: {
    enabled: true,
    text: {
      hy: 'Գրանցվի՛ր և ստացիր 2000 ֏ անմիջապես',
      en: 'Register and get 2,000 AMD instantly',
      ru: 'Зарегистрируйтесь и получите 2 000 драм сразу',
    },
    href: '/register',
  },
  heroSlides: [
    {
      image: `/images/seed/hero-01.${env.SEED_IMAGE_EXT}`,
      title: {
        hy: 'Ծաղիկների առաքում ամբողջ Հայաստանում',
        en: 'Flower delivery across Armenia',
        ru: 'Доставка цветов по всей Армении',
      },
      subtitle: {
        hy: 'Երևանում՝ 2-3 ժամում, նույն օրը',
        en: 'Two to three hours in Yerevan, same day',
        ru: 'Два-три часа по Еревану, в тот же день',
      },
      ctaLabel: { hy: 'Ընտրել ծաղկեփունջ', en: 'Choose a bouquet', ru: 'Выбрать букет' },
      href: '/catalog/flower-gifts',
      theme: 'dark',
      order: 1,
    },
    {
      image: `/images/seed/hero-02.${env.SEED_IMAGE_EXT}`,
      title: { hy: 'Ամսվա ծաղիկը՝ պիոն', en: 'Flower of the month: peony', ru: 'Цветок месяца: пион' },
      subtitle: {
        hy: 'Սեզոնի ամենասպասված ծաղիկն արդեն ստուդիայում է',
        en: 'The most awaited bloom of the season is in the studio',
        ru: 'Самый ожидаемый цветок сезона уже в студии',
      },
      ctaLabel: { hy: 'Տեսնել ընտրանին', en: 'See the selection', ru: 'Смотреть подборку' },
      href: '/collections/flower-of-the-month',
      theme: 'dark',
      order: 2,
    },
    {
      image: `/images/seed/hero-03.${env.SEED_IMAGE_EXT}`,
      title: { hy: 'Ծաղկի բաժանորդագրություն', en: 'Flower subscription', ru: 'Подписка на цветы' },
      subtitle: {
        hy: 'Թարմ ծաղիկներ՝ ամեն շաբաթ, առանց հիշեցումների',
        en: 'Fresh flowers every week, no reminders needed',
        ru: 'Свежие цветы каждую неделю, без напоминаний',
      },
      ctaLabel: { hy: 'Իմանալ ավելին', en: 'Learn more', ru: 'Узнать больше' },
      href: '/subscription',
      theme: 'dark',
      order: 3,
    },
  ],
  themeTiles: [
    { image: `/images/seed/tile-01.${env.SEED_IMAGE_EXT}`, title: { hy: 'Ծննդյան օր', en: 'Birthday', ru: 'День рождения' }, href: '/catalog/flower-gifts', animated: false, order: 1 },
    { image: `/images/seed/tile-02.${env.SEED_IMAGE_EXT}`, title: { hy: 'Սեր և շնորհակալություն', en: 'Love and thanks', ru: 'Любовь и благодарность' }, href: '/catalog/roses', animated: false, order: 2 },
    { image: `/images/seed/tile-03.${env.SEED_IMAGE_EXT}`, title: { hy: 'Այսօր առաքում', en: 'Same-day delivery', ru: 'Доставка сегодня' }, href: '/catalog/flower-gifts?delivery=quick', animated: true, order: 3 },
    { image: `/images/seed/tile-04.${env.SEED_IMAGE_EXT}`, title: { hy: 'Բացման նվեր', en: 'Opening gift', ru: 'Подарок на открытие' }, href: '/catalog/opening-plants', animated: false, order: 4 },
    { image: `/images/seed/tile-05.${env.SEED_IMAGE_EXT}`, title: { hy: 'Առաջխաղացում', en: 'Promotion', ru: 'Повышение' }, href: '/catalog/promotion', animated: false, order: 5 },
    { image: `/images/seed/tile-06.${env.SEED_IMAGE_EXT}`, title: { hy: 'Հարսանիք', en: 'Wedding', ru: 'Свадьба' }, href: '/catalog/wedding-flowers', animated: false, order: 6 },
    { image: `/images/seed/tile-07.${env.SEED_IMAGE_EXT}`, title: { hy: 'Հոգեհանգիստ', en: 'Condolence', ru: 'Соболезнование' }, href: '/catalog/funeral-wreaths', animated: false, order: 7 },
    { image: `/images/seed/tile-08.${env.SEED_IMAGE_EXT}`, title: { hy: 'DIY ծաղկաշուկա', en: 'DIY market', ru: 'DIY рынок' }, href: '/catalog/diy-market', animated: false, order: 8 },
  ],
  counters: { reviews: 103535, deliveries: 833111, awardYears: 9 },
  contact: {
    phone: '+374 10 500 700',
    overseasPhone: '+374 99 500 700',
    email: 'info@anahit-flower.am',
    hours: {
      hy: 'Ամեն օր 08:00 - 20:00',
      en: 'Every day 08:00 - 20:00',
      ru: 'Ежедневно 08:00 - 20:00',
    },
    address: {
      hy: 'Երևան, Հանրապետության 25',
      en: '25 Hanrapetutyan St, Yerevan',
      ru: 'Ереван, ул. Ханрапетутян 25',
    },
  },
  social: {
    instagram: 'https://instagram.com/',
    facebook: 'https://facebook.com/',
    youtube: 'https://youtube.com/',
    telegram: 'https://t.me/',
  },
};
