import type { SeedProduct } from './products';

/**
 * Products recreated from the public thanksflowers.am catalog. Only factual
 * attributes (category, colors, price levels, source image paths) come from
 * the source listing; every name above is adapted and all descriptive copy is
 * ORIGINAL text written for our store.
 *
 * source.images are site-relative paths kept as server-side metadata ONLY:
 * the seed pipeline downloads them, re-uploads them to OUR Cloudinary and the
 * storefront renders OUR Cloudinary URL (never the source host, never hotlinked).
 */
export const tfSeedProducts: SeedProduct[] = [
  {
    'slug': 'alstroemeria-magic',
    'name': {
      'hy': 'Ալստրոմերիաների կախարդանք',
      'en': 'Alstroemeria magic',
      'ru': 'Магия альстромерий'
    },
    'shortDescription': {
      'hy': 'Դեղին և վարդագույն ալստրոմերիաների թեթև փունջ՝ առօրյա ուրախ առիթների համար։ Ծաղիկները երկար են կանգնում և գեղեցիկ տեսք ունեն նաև չորացած վիճակում։',
      'en': 'A light bouquet of yellow and pink alstroemerias for everyday happy occasions. The flowers last long and keep their shape well.',
      'ru': 'Лёгкий букет из жёлтых и розовых альстромерий для радостных повседневных поводов. Цветы долго стоят и хорошо держат форму.'
    },
    'categoryCode': '00080004',
    'collections': [
      'season-picks',
      'birthday'
    ],
    'price': 10000,
    'image': 'bouquet-05',
    'withAddons': true,
    'rating': 4.7,
    'reviews': 58,
    'sold': 320,
    'source': {
      'provider': 'thanksflowers',
      'tfSlug': 'alstromerianeri-kakhardank',
      'tfId': 'd2443ad1-0ad0-4f20-85e2-caaf77dfb548',
      'productUrl': 'https://thanksflowers.am/product/alstromerianeri-kakhardank/',
      'images': [
        '/media/flowers/IMG004.webp',
        '/media/flowers/IMG005.webp',
        '/media/flowers/IMG006.webp'
      ]
    }
  },
  {
    'slug': 'avalanche-rose-bouquet',
    'name': {
      'hy': 'Ավալանժ վարդերի փունջ',
      'en': 'Avalanche rose bouquet',
      'ru': 'Букет роз Аваланж'
    },
    'shortDescription': {
      'hy': 'Ավալանժ սորտի խոշոր կոկոններով վարդերի փունջ՝ նուրբ վարդագույն երանգով։ Դասական ընտրություն ռոմանտիկ առիթների համար։',
      'en': 'A bouquet of Avalanche roses with large buds in a delicate pink shade. A classic choice for romantic occasions.',
      'ru': 'Букет роз сорта Аваланж с крупными бутонами нежного розового оттенка. Классический выбор для романтичного повода.'
    },
    'categoryCode': '00010001',
    'collections': [
      'best-sellers',
      'romantic'
    ],
    'price': 10000,
    'compareAtPrice': 14000,
    'image': 'roses-02',
    'badges': [
      'best',
      'sale'
    ],
    'withAddons': true,
    'rating': 4.9,
    'reviews': 112,
    'sold': 680,
    'source': {
      'provider': 'thanksflowers',
      'tfSlug': 'avalanzh-varderi-punj',
      'tfId': '50b68340-9f4a-4eef-bbac-e5e3607714eb',
      'productUrl': 'https://thanksflowers.am/product/avalanzh-varderi-punj/',
      'images': [
        '/media/flowers/IMG_5717.webp',
        '/media/flowers/IMG_5718.webp'
      ]
    }
  },
  {
    'slug': 'cherry-elegance',
    'name': {
      'hy': 'Բալի նրբություն',
      'en': 'Cherry elegance',
      'ru': 'Вишнёвая элегантность'
    },
    'shortDescription': {
      'hy': 'Բալի երանգների խառը փունջ՝ մուգ վարդագույն և բորդո ակցենտներով։ Ջերմ ու արտահայտիչ նվեր ցանկացած տոնի համար։',
      'en': 'A mixed bouquet in cherry tones with deep pink and bordeaux accents. A warm, expressive gift for any celebration.',
      'ru': 'Смешанный букет в вишнёвых тонах с акцентами тёмно-розового и бордо. Тёплый и выразительный подарок к любому празднику.'
    },
    'categoryCode': '00010001',
    'collections': [
      'florist-picks'
    ],
    'price': 15000,
    'image': 'bouquet-06',
    'withAddons': true,
    'rating': 4.8,
    'reviews': 64,
    'sold': 290,
    'source': {
      'provider': 'thanksflowers',
      'tfSlug': 'balayin-nrbutyun',
      'tfId': '23c115b8-1f56-4cf2-99b0-ca02a9c5dc2a',
      'productUrl': 'https://thanksflowers.am/product/balayin-nrbutyun/',
      'images': [
        '/media/flowers/IMG_3271.webp',
        '/media/flowers/IMG_3272.webp'
      ]
    }
  },
  {
    'slug': 'snow-white-horizons',
    'name': {
      'hy': 'Ձյան սպիտակ հեռավորություններ',
      'en': 'Snow-white horizons',
      'ru': 'Снежно-белые горизонты'
    },
    'shortDescription': {
      'hy': 'Ձյունաճերմակ ծաղիկների նուրբ փունջ՝ զուտ ու թեթև տեսքով։ Հարմար է շնորհակալության և նուրբ առիթների համար։',
      'en': 'A delicate all-white bouquet with a clean, airy look. Suited to thank-you moments and gentle occasions.',
      'ru': 'Нежный букет из снежно-белых цветов с чистым и лёгким обликом. Подойдёт для благодарности и деликатных поводов.'
    },
    'categoryCode': '00080004',
    'collections': [
      'season-picks'
    ],
    'price': 9000,
    'image': 'bouquet-01',
    'withAddons': true,
    'rating': 4.7,
    'reviews': 41,
    'sold': 180,
    'source': {
      'provider': 'thanksflowers',
      'tfSlug': 'dzyan-spitak-heravorutyunner',
      'tfId': 'bd3e1109-5fc6-419b-b6e7-5507c7d3df91',
      'productUrl': 'https://thanksflowers.am/product/dzyan-spitak-heravorutyunner/',
      'images': [
        '/media/flowers/IMG_5713.webp'
      ]
    }
  },
  {
    'slug': 'spring-elegance',
    'name': {
      'hy': 'Գարնանային էլեգանս',
      'en': 'Spring elegance',
      'ru': 'Весенняя элегантность'
    },
    'shortDescription': {
      'hy': 'Գարնանային կակաչների փունջ՝ դեղին, կարմիր և վարդագույն համադրությամբ։ Պայծառ տրամադրություն՝ առանց առիթ սպասելու։',
      'en': 'A spring bouquet of tulips in yellow, red and pink. Bright mood, no occasion required.',
      'ru': 'Весенний букет тюльпанов в жёлтой, красной и розовой гамме. Яркое настроение без ожидания повода.'
    },
    'categoryCode': '00080001',
    'collections': [
      'flower-of-the-month',
      'season-picks',
      'birthday'
    ],
    'price': 11000,
    'image': 'bouquet-09',
    'withAddons': true,
    'rating': 4.8,
    'reviews': 87,
    'sold': 430,
    'source': {
      'provider': 'thanksflowers',
      'tfSlug': 'garnanayin-elegans',
      'tfId': '7198c65f-617d-4472-9529-bd824a1fd000',
      'productUrl': 'https://thanksflowers.am/product/garnanayin-elegans/',
      'images': [
        '/media/flowers/IMG_5716.webp',
        '/media/flowers/IMG_5715.webp',
        '/media/flowers/IMG_5714.webp'
      ]
    }
  },
  {
    'slug': 'color-cloud-rose-bouquet',
    'name': {
      'hy': 'Գունային ամպ',
      'en': 'Color cloud',
      'ru': 'Цветное облако'
    },
    'shortDescription': {
      'hy': 'Բազմերանգ վարդերի փունջ՝ ամպի պես թեթև կոմպոզիցիայով։ Աչքի է ընկնում գույների խաղով և առատ տեսքով։',
      'en': 'A multicolored rose bouquet with a cloud-light composition. It stands out with a play of colors and a generous look.',
      'ru': 'Многоцветный букет роз с лёгкой, как облако, композицией. Выделяется игрой цвета и щедрым объёмом.'
    },
    'categoryCode': '00010001',
    'collections': [
      'premium-picks',
      'birthday',
      'best-sellers'
    ],
    'price': 60000,
    'image': 'bouquet-13',
    'badges': [
      'best'
    ],
    'isFeatured': true,
    'withAddons': true,
    'rating': 5,
    'reviews': 54,
    'sold': 190,
    'source': {
      'provider': 'thanksflowers',
      'tfSlug': 'gunayin-amp--varderi-punj',
      'tfId': '92959bec-3162-4537-8b66-a70aebb29e10',
      'productUrl': 'https://thanksflowers.am/product/gunayin-amp--varderi-punj/',
      'images': [
        '/media/flowers/IMG_1818.webp',
        '/media/flowers/IMG_1822.webp'
      ]
    }
  },
  {
    'slug': 'jumilia-eucalyptus',
    'name': {
      'hy': 'Ջումիլիա և էվկալիպտ',
      'en': 'Jumilia and eucalyptus',
      'ru': 'Джумилия и эвкалипт'
    },
    'shortDescription': {
      'hy': 'Ջումիլիա վարդեր՝ էվկալիպտի տերևների հետ։ Նուրբ վարդագույն փունջ՝ ժամանակակից ու զուսպ ձևավորմամբ։',
      'en': 'Jumilia roses finished with eucalyptus greenery. A soft pink bouquet with a modern, restrained look.',
      'ru': 'Розы Джумилия с веточками эвкалипта. Нежный розовый букет в современном сдержанном оформлении.'
    },
    'categoryCode': '00010004',
    'collections': [
      'florist-picks'
    ],
    'price': 9000,
    'image': 'roses-02',
    'withAddons': true,
    'rating': 4.8,
    'reviews': 73,
    'sold': 350,
    'source': {
      'provider': 'thanksflowers',
      'tfSlug': 'jumilia-ev-evkalipt',
      'tfId': '823a6f4c-fb21-4acb-93e6-aa789b6d4d71',
      'productUrl': 'https://thanksflowers.am/product/jumilia-ev-evkalipt/',
      'images': [
        '/media/flowers/IMG_5688.webp'
      ]
    }
  },
  {
    'slug': 'jumilia-grand',
    'name': {
      'hy': 'Ջումիլիա Գրանդ',
      'en': 'Jumilia Grand',
      'ru': 'Джумилия Гранд'
    },
    'shortDescription': {
      'hy': 'Խոշոր կոկոններով վարդերի տպավորիչ փունջ։ Վարդագույնի ու սպիտակի ներդաշնակ համադրություն։',
      'en': 'An impressive bouquet of large-bud roses. A harmonious blend of pink and white.',
      'ru': 'Впечатляющий букет роз с крупными бутонами. Гармония розового и белого.'
    },
    'categoryCode': '00010004',
    'collections': [
      'premium-picks'
    ],
    'price': 10000,
    'image': 'roses-02',
    'withAddons': true,
    'rating': 4.9,
    'reviews': 95,
    'sold': 520,
    'source': {
      'provider': 'thanksflowers',
      'tfSlug': 'jumilia-grand',
      'tfId': '4a0e6c21-5395-4ed4-a9d1-2fe83b77c7e7',
      'productUrl': 'https://thanksflowers.am/product/jumilia-grand/',
      'images': [
        '/media/flowers/IMG_5702.webp',
        '/media/flowers/IMG_5703.webp'
      ]
    }
  },
  {
    'slug': 'jumilia-roses',
    'name': {
      'hy': 'Ջումիլիա վարդեր',
      'en': 'Jumilia roses',
      'ru': 'Розы Джумилия'
    },
    'shortDescription': {
      'hy': 'Ջումիլիա սորտի վարդերի դասական փունջ՝ փափուկ վարդագույն երանգով։ Սիրելի ընտրություն նուրբ առիթների համար։',
      'en': 'A classic bouquet of Jumilia roses in a soft pink shade. A favourite for gentle occasions.',
      'ru': 'Классический букет роз сорта Джумилия в мягком розовом оттенке. Любимый выбор для нежных поводов.'
    },
    'categoryCode': '00010004',
    'collections': [
      'premium-picks',
      'romantic',
      'best-sellers'
    ],
    'price': 35000,
    'compareAtPrice': 40000,
    'image': 'roses-02',
    'badges': [
      'sale'
    ],
    'withAddons': true,
    'rating': 5,
    'reviews': 67,
    'sold': 240,
    'source': {
      'provider': 'thanksflowers',
      'tfSlug': 'jumilia-varder-1',
      'tfId': '80b05fb6-d1cb-4fa5-bccf-2cc624027788',
      'productUrl': 'https://thanksflowers.am/product/jumilia-varder-1/',
      'images': [
        '/media/flowers/IMG_5698.webp',
        '/media/flowers/IMG_5699.webp'
      ]
    }
  },
  {
    'slug': 'blue-rose-bouquet',
    'name': {
      'hy': 'Կապույտ վարդերի փունջ',
      'en': 'Blue rose bouquet',
      'ru': 'Букет синих роз'
    },
    'shortDescription': {
      'hy': 'Կապույտ վարդերի արտասովոր փունջ՝ խորը երանգով։ Ուշագրավ ընտրություն անսովոր անակնկալի համար։',
      'en': 'An unusual bouquet of blue roses in a deep shade. A striking choice for an unexpected surprise.',
      'ru': 'Необычный букет синих роз глубокого оттенка. Заметный выбор для нестандартного сюрприза.'
    },
    'categoryCode': '00010004',
    'collections': [
      'florist-picks'
    ],
    'price': 15000,
    'image': 'bouquet-02',
    'withAddons': true,
    'rating': 4.8,
    'reviews': 48,
    'sold': 210,
    'source': {
      'provider': 'thanksflowers',
      'tfSlug': 'kapuyt-varderi-punj',
      'tfId': 'c92e4b23-bc2b-4056-a918-fb7e6e84cb35',
      'productUrl': 'https://thanksflowers.am/product/kapuyt-varderi-punj/',
      'images': [
        '/media/flowers/IMG_1811.webp',
        '/media/flowers/IMG_1810.webp',
        '/media/flowers/IMG_1809.webp',
        '/media/flowers/IMG_1813.webp'
      ]
    }
  },
  {
    'slug': 'red-royal',
    'name': {
      'hy': 'Կարմիր Ռոյալ',
      'en': 'Red Royal',
      'ru': 'Красный Роял'
    },
    'shortDescription': {
      'hy': 'Հագեցած կարմիր վարդերի ազնիվ փունջ։ Կրքոտ դասական մեծ ու հստակ հայտարարության համար։',
      'en': 'A noble bouquet of saturated red roses. A passionate classic for a big, clear statement.',
      'ru': 'Благородный букет насыщенно-красных роз. Страстная классика для большого и ясного признания.'
    },
    'categoryCode': '00010004',
    'collections': [
      'best-sellers',
      'romantic'
    ],
    'price': 11000,
    'image': 'roses-01',
    'badges': [
      'best'
    ],
    'withAddons': true,
    'rating': 4.9,
    'reviews': 134,
    'sold': 760,
    'source': {
      'provider': 'thanksflowers',
      'tfSlug': 'karmir-royal',
      'tfId': '34db5977-c742-4337-8af2-0dc026b8a9d6',
      'productUrl': 'https://thanksflowers.am/product/karmir-royal/',
      'images': [
        '/media/flowers/IMG_5690.webp',
        '/media/flowers/IMG_5691.webp'
      ]
    }
  },
  {
    'slug': 'red-velvet',
    'name': {
      'hy': 'Կարմիր թավիշ',
      'en': 'Red velvet',
      'ru': 'Красный бархат'
    },
    'shortDescription': {
      'hy': 'Թավշյա կարմիր վարդերի փունջ։ Ջերմ ու ինտենսիվ տպավորություն հատուկ առիթների համար։',
      'en': 'A bouquet of velvet-red roses. A warm, intense impression for special occasions.',
      'ru': 'Букет бархатно-красных роз. Тёплое и интенсивное впечатление для особых случаев.'
    },
    'categoryCode': '00010004',
    'collections': [
      'romantic',
      'best-sellers'
    ],
    'price': 15000,
    'image': 'roses-01',
    'withAddons': true,
    'rating': 4.9,
    'reviews': 101,
    'sold': 540,
    'source': {
      'provider': 'thanksflowers',
      'tfSlug': 'karmir-tavish',
      'tfId': '9241ebd7-3030-4fd8-9876-50ed4b03161b',
      'productUrl': 'https://thanksflowers.am/product/karmir-tavish/',
      'images': [
        '/media/flowers/IMG000.webp',
        '/media/flowers/IMG009_1.webp'
      ]
    }
  },
  {
    'slug': 'red-pink-tulips',
    'name': {
      'hy': 'Կարմիր-վարդագույն կակաչներ',
      'en': 'Red-pink tulips',
      'ru': 'Красно-розовые тюльпаны'
    },
    'shortDescription': {
      'hy': 'Կարմիր-վարդագույն կակաչների վառ փունջ՝ գարնանային թարմությամբ։ Հարմար է անակնկալի և ջերմ շնորհավորանքի համար։',
      'en': 'A vivid red-and-pink tulip bouquet with spring freshness. Great for a surprise or a warm congratulations.',
      'ru': 'Яркий букет красно-розовых тюльпанов со свежестью весны. Подойдёт для сюрприза и тёплого поздравления.'
    },
    'categoryCode': '00080001',
    'collections': [
      'season-picks'
    ],
    'price': 20000,
    'image': 'bouquet-09',
    'withAddons': true,
    'rating': 4.7,
    'reviews': 36,
    'sold': 150,
    'source': {
      'provider': 'thanksflowers',
      'tfSlug': 'karmir-vardaguyn-kakachner',
      'tfId': '524feb47-a4e4-4ccc-8aca-2a89a50b6959',
      'productUrl': 'https://thanksflowers.am/product/karmir-vardaguyn-kakachner/',
      'images': [
        '/media/flowers/633732687_17977689518977370_8096167839834807546_n.webp',
        '/media/flowers/640322453_17977689521977370_15033825529946812_n.webp',
        '/media/flowers/640393104_17977689503977370_247687196715249527_n.webp'
      ]
    }
  },
  {
    'slug': 'love-symphony-roses',
    'name': {
      'hy': 'Սիրո սիմֆոնիա',
      'en': 'Love symphony',
      'ru': 'Симфония любви'
    },
    'shortDescription': {
      'hy': 'Կարմիր վարդերի առատ փունջ՝ սիրո սիմֆոնիա բոլոր նոտաներով։ Ամբողջական հայտարարություն ամենակարևոր մարդու համար։',
      'en': 'A generous red rose bouquet: a love symphony in every note. A complete declaration for the most important person.',
      'ru': 'Щедрый букет красных роз — симфония любви во всех нотах. Полное признание для самого важного человека.'
    },
    'categoryCode': '00010004',
    'collections': [
      'romantic',
      'premium-picks',
      'best-sellers'
    ],
    'price': 30000,
    'image': 'roses-01',
    'isFeatured': true,
    'withAddons': true,
    'rating': 5,
    'reviews': 88,
    'sold': 410,
    'source': {
      'provider': 'thanksflowers',
      'tfSlug': 'karmir-varder--siro-simfonia',
      'tfId': '63602603-296a-4bd2-a78b-9bac0551727d',
      'productUrl': 'https://thanksflowers.am/product/karmir-varder--siro-simfonia/',
      'images': [
        '/media/flowers/a85ae0ea-7197-4838-bad7-f6a342537f05.webp',
        '/media/flowers/e4525dba-561f-424c-b08f-16ece58b9b64.webp',
        '/media/flowers/3876f1aa-e6e1-45f8-9023-980bdfa6843f.webp',
        '/media/flowers/96115520-e8de-4423-916e-75eadf812509.webp'
      ]
    }
  },
  {
    'slug': 'kenyan-rose-bouquet',
    'name': {
      'hy': 'Քենիական վարդերի փունջ',
      'en': 'Kenyan rose bouquet',
      'ru': 'Букет кенийских роз'
    },
    'shortDescription': {
      'hy': 'Քենիական վարդերի փունջ՝ խոշոր կոկոններով և կայուն ձևով։ Հուսալի դասական ցանկացած տոնի համար։',
      'en': 'A Kenyan rose bouquet with large buds and a steady shape. A dependable classic for any celebration.',
      'ru': 'Букет кенийских роз с крупными бутонами и стойкой формой. Надёжная классика для любого праздника.'
    },
    'categoryCode': '00010004',
    'collections': [
      'florist-picks'
    ],
    'price': 18000,
    'image': 'roses-02',
    'withAddons': true,
    'rating': 4.8,
    'reviews': 59,
    'sold': 260,
    'source': {
      'provider': 'thanksflowers',
      'tfSlug': 'keniakan-varderi-punj',
      'tfId': 'f7dc956b-73b4-4a6a-8a6c-a92c4bcb786f',
      'productUrl': 'https://thanksflowers.am/product/keniakan-varderi-punj/',
      'images': [
        '/media/flowers/j8tkk6bfaxrmw0cwv5kb03y4n8.webp'
      ]
    }
  },
  {
    'slug': 'lavender-shade',
    'name': {
      'hy': 'Լավանդայի երանգ',
      'en': 'Lavender shade',
      'ru': 'Лавандовый оттенок'
    },
    'shortDescription': {
      'hy': 'Լավանդի երանգի փունջ՝ մանուշակագույնի ու վարդագույնի մեղմ անցումներով։ Նուրբ և զուսպ ընտրություն։',
      'en': 'A lavender-shaded bouquet with soft transitions between purple and pink. A delicate, restrained choice.',
      'ru': 'Букет лавандового оттенка с мягкими переходами фиолетового и розового. Нежный и сдержанный выбор.'
    },
    'categoryCode': '00010004',
    'collections': [
      'art-line',
      'season-picks'
    ],
    'price': 15000,
    'image': 'bouquet-02',
    'withAddons': true,
    'rating': 4.8,
    'reviews': 52,
    'sold': 230,
    'source': {
      'provider': 'thanksflowers',
      'tfSlug': 'lavandayi-erang',
      'tfId': '5dad1d3c-e3a1-40ca-aee0-86d08880b26c',
      'productUrl': 'https://thanksflowers.am/product/lavandayi-erang/',
      'images': [
        '/media/flowers/IMG005_1.webp',
        '/media/flowers/IMG006_1.webp'
      ]
    }
  },
  {
    'slug': 'charm-mixed-bouquet',
    'name': {
      'hy': 'Միքս փունջ՝ «Հմայք»',
      'en': 'Mixed bouquet “Charm”',
      'ru': 'Микс-букет «Шарм»'
    },
    'shortDescription': {
      'hy': '«Հմայք» խառը փունջ՝ սպիտակ, վարդագույն և մանուշակագույն երանգներով։ Հավասարակշռված կոմպոզիցիա ցանկացած առիթի։',
      'en': 'The “Charm” mixed bouquet in white, pink and purple tones. A balanced composition for any occasion.',
      'ru': 'Микс-букет «Шарм» в белых, розовых и фиолетовых тонах. Сбалансированная композиция на любой случай.'
    },
    'categoryCode': '00010001',
    'collections': [
      'flower-of-the-month',
      'florist-picks',
      'birthday'
    ],
    'price': 14000,
    'compareAtPrice': 17000,
    'image': 'bouquet-05',
    'badges': [
      'sale'
    ],
    'withAddons': true,
    'rating': 4.8,
    'reviews': 77,
    'sold': 390,
    'source': {
      'provider': 'thanksflowers',
      'tfSlug': 'miks-punj-hmayk',
      'tfId': '1f2ee2ce-76fc-4d7f-8d4e-9a9e8416a189',
      'productUrl': 'https://thanksflowers.am/product/miks-punj-hmayk/',
      'images': [
        '/media/flowers/IMG_1581.webp',
        '/media/flowers/IMG_1583.webp',
        '/media/flowers/IMG_1584.webp',
        '/media/flowers/IMG_1582.webp'
      ]
    }
  },
  {
    'slug': 'orange-rose-bouquets',
    'name': {
      'hy': 'Նարնջագույն վարդերի փունջ',
      'en': 'Orange rose bouquet',
      'ru': 'Букет оранжевых роз'
    },
    'shortDescription': {
      'hy': 'Նարնջագույն վարդերի արևոտ փունջ՝ ջերմ ու էներգիկ տրամադրությամբ։ Ուրախ անակնկալ առանց հատուկ առիթի։',
      'en': 'A sunny bouquet of orange roses with a warm, energetic mood. A cheerful surprise with no special reason needed.',
      'ru': 'Солнечный букет оранжевых роз с тёплым и энергичным настроением. Радостный сюрприз без особого повода.'
    },
    'categoryCode': '00010004',
    'collections': [
      'premium-picks'
    ],
    'price': 50000,
    'image': 'roses-01',
    'isFeatured': true,
    'withAddons': true,
    'rating': 5,
    'reviews': 42,
    'sold': 130,
    'source': {
      'provider': 'thanksflowers',
      'tfSlug': 'narnjaguyn-vardi-pnjer',
      'tfId': '9235eb77-49cf-4021-b2dd-18de691c15ce',
      'productUrl': 'https://thanksflowers.am/product/narnjaguyn-vardi-pnjer/',
      'images': [
        '/media/flowers/IMG_5711-2.webp',
        '/media/flowers/IMG_5712.webp'
      ]
    }
  },
  {
    'slug': 'peony-style-rose-bouquet',
    'name': {
      'hy': 'Պիոնանման վարդերի փունջ',
      'en': 'Peony-style rose bouquet',
      'ru': 'Букет пионовидных роз'
    },
    'shortDescription': {
      'hy': 'Պիոնանման վարդերի փունջ՝ բացված, փարթամ ծաղիկներով։ Ռոմանտիկ տեսք՝ առանց սեզոնային սահմանափակումների։',
      'en': 'A peony-style rose bouquet with open, lush blooms. A romantic look without seasonal limits.',
      'ru': 'Букет пионовидных роз с раскрытыми пышными цветами. Романтичный вид без сезонных ограничений.'
    },
    'categoryCode': '00010004',
    'collections': [
      'flower-of-the-month',
      'romantic'
    ],
    'price': 15000,
    'compareAtPrice': 20000,
    'image': 'bouquet-08',
    'badges': [
      'sale'
    ],
    'withAddons': true,
    'rating': 4.9,
    'reviews': 86,
    'sold': 470,
    'source': {
      'provider': 'thanksflowers',
      'tfSlug': 'pionanman-varderi-punj',
      'tfId': '7cc13965-3092-4229-8c5a-3a42a0537032',
      'productUrl': 'https://thanksflowers.am/product/pionanman-varderi-punj/',
      'images': [
        '/media/flowers/IMG_3468.webp',
        '/media/flowers/IMG_3463.webp',
        '/media/flowers/IMG_3464.webp',
        '/media/flowers/IMG_3461.webp'
      ]
    }
  },
  {
    'slug': 'eustoma-spray-rose-bouquet',
    'name': {
      'hy': 'Էուստոմաների և թփային վարդերի փունջ',
      'en': 'Eustoma and spray rose bouquet',
      'ru': 'Букет эустом и кустовых роз'
    },
    'shortDescription': {
      'hy': 'Էուստոմաների և թփային վարդերի փունջ՝ նուրբ սպիտակ-վարդագույն համադրությամբ։ Թեթև ու ռոմանտիկ ընտրություն ջերմ առիթների համար։',
      'en': 'A bouquet of eustomas and spray roses in a delicate white-and-pink blend. A light, romantic choice for warm occasions.',
      'ru': 'Букет из эустом и кустовых роз в нежном бело-розовом сочетании. Лёгкий романтичный выбор для тёплых поводов.'
    },
    'categoryCode': '00010001',
    'collections': [
      'florist-picks',
      'birthday'
    ],
    'price': 15000,
    'image': 'bouquet-06',
    'withAddons': true,
    'rating': 4.8,
    'reviews': 63,
    'sold': 300,
    'source': {
      'provider': 'thanksflowers',
      'tfSlug': 'punj-euutomanerov-ev-tpayin-varderov',
      'tfId': 'aab8b6c0-c3b2-4f58-bc93-a96d7feaee7c',
      'productUrl': 'https://thanksflowers.am/product/punj-euutomanerov-ev-tpayin-varderov/',
      'images': [
        '/media/flowers/IMG_1592.webp',
        '/media/flowers/IMG_1594.webp',
        '/media/flowers/IMG_1587.webp',
        '/media/flowers/IMG_1589.webp'
      ]
    }
  },
  {
    'slug': 'white-pearl',
    'name': {
      'hy': 'Սպիտակ մարգարիտ',
      'en': 'White pearl',
      'ru': 'Белая жемчужина'
    },
    'shortDescription': {
      'hy': 'Մաքուր սպիտակ վարդերի նուրբ փունջ։ Հանգիստ շքեղություն զուսպ ճաշակի համար։',
      'en': 'A delicate bouquet of pure white roses. Quiet luxury for understated taste.',
      'ru': 'Нежный букет чисто-белых роз. Тихая роскошь для сдержанного вкуса.'
    },
    'categoryCode': '00010004',
    'collections': [
      'romantic'
    ],
    'price': 15000,
    'image': 'roses-02',
    'withAddons': true,
    'rating': 4.9,
    'reviews': 71,
    'sold': 330,
    'source': {
      'provider': 'thanksflowers',
      'tfSlug': 'spitak-margarit',
      'tfId': '96389f8b-ed03-4a23-a4c3-4e320eba1640',
      'productUrl': 'https://thanksflowers.am/product/spitak-margarit/',
      'images': [
        '/media/flowers/IMG007_1.webp',
        '/media/flowers/IMG008_1.webp'
      ]
    }
  },
  {
    'slug': 'white-rose-bouquet',
    'name': {
      'hy': 'Սպիտակ վարդերի փունջ',
      'en': 'White rose bouquet',
      'ru': 'Букет белых роз'
    },
    'shortDescription': {
      'hy': 'Սպիտակ վարդերի դասական փունջ՝ թարմ ու անմեղ տեսքով։ Հարմար է համեստ և իմաստալից առիթների համար։',
      'en': 'A classic white rose bouquet with a fresh, innocent look. Suited to modest and meaningful occasions.',
      'ru': 'Классический букет белых роз со свежим и чистым обликом. Подойдёт для скромных и значимых поводов.'
    },
    'categoryCode': '00010004',
    'collections': [
      'best-sellers'
    ],
    'price': 10000,
    'image': 'bouquet-01',
    'badges': [
      'best'
    ],
    'withAddons': true,
    'rating': 4.8,
    'reviews': 97,
    'sold': 560,
    'source': {
      'provider': 'thanksflowers',
      'tfSlug': 'spitak-varderi-punj',
      'tfId': 'c006eb10-9c38-491b-a6e6-04028ae0fae6',
      'productUrl': 'https://thanksflowers.am/product/spitak-varderi-punj/',
      'images': [
        '/media/flowers/IMG_1807.webp',
        '/media/flowers/IMG_1808.webp'
      ]
    }
  },
  {
    'slug': 'royal-red-dutch-roses',
    'name': {
      'hy': 'Հոլանդական թագավորական վարդեր',
      'en': 'Royal Dutch roses',
      'ru': 'Королевские голландские розы'
    },
    'shortDescription': {
      'hy': 'Հոլանդական վարդերի թագավորական փունջ՝ խորը կարմիր երանգով։ Առանձնահատուկ տպավորություն հատուկ օրերի համար։',
      'en': 'A royal bouquet of Dutch roses in a deep red shade. A distinguished impression for special days.',
      'ru': 'Королевский букет голландских роз глубокого красного оттенка. Особое впечатление для значимых дней.'
    },
    'categoryCode': '00010004',
    'collections': [
      'premium-picks',
      'romantic'
    ],
    'price': 30000,
    'image': 'roses-01',
    'withAddons': true,
    'rating': 5,
    'reviews': 58,
    'sold': 220,
    'source': {
      'provider': 'thanksflowers',
      'tfSlug': 'tagavorakan-karmir--holandakan-varder',
      'tfId': '2b5e886f-2ca0-4cbb-a8ac-997d4db44dab',
      'productUrl': 'https://thanksflowers.am/product/tagavorakan-karmir--holandakan-varder/',
      'images': [
        '/media/flowers/IMG_1819.webp',
        '/media/flowers/IMG_1820.webp',
        '/media/flowers/IMG_1821.webp'
      ]
    }
  },
  {
    'slug': 'floral-mosaic-spray-roses',
    'name': {
      'hy': 'Ծաղկային մոզաիկա',
      'en': 'Floral mosaic',
      'ru': 'Цветочная мозаика'
    },
    'shortDescription': {
      'hy': 'Թփային վարդերի խճանկարային փունջ՝ բազմաթիվ մանր ծաղիկներով։ Ամբողջական ու մանրամասն կոմպոզիցիա։',
      'en': 'A mosaic-style spray rose bouquet made of many small blooms. A full, detailed composition.',
      'ru': 'Мозаичный букет кустовых роз из множества мелких цветков. Полная и детальная композиция.'
    },
    'categoryCode': '00010004',
    'collections': [
      'florist-picks'
    ],
    'price': 18000,
    'image': 'bouquet-05',
    'withAddons': true,
    'rating': 4.8,
    'reviews': 44,
    'sold': 200,
    'source': {
      'provider': 'thanksflowers',
      'tfSlug': 'tpayin-varder--tsaghkayin-mozaika',
      'tfId': '1ad849bd-8839-475e-9b5f-e3f7a793f388',
      'productUrl': 'https://thanksflowers.am/product/tpayin-varder--tsaghkayin-mozaika/',
      'images': [
        '/media/flowers/IMG_3133.webp',
        '/media/flowers/IMG_3136.webp',
        '/media/flowers/IMG_3139.webp'
      ]
    }
  },
  {
    'slug': 'lady-bombastic-spray-roses',
    'name': {
      'hy': 'Թփային վարդեր «Լեդի Բոմբաստիկ»',
      'en': '“Lady Bombastic” spray roses',
      'ru': 'Кустовые розы «Леди Бомбастик»'
    },
    'shortDescription': {
      'hy': '«Լեդի Բոմբաստիկ» թփային վարդեր՝ հատիկ-հատիկ բացվող կոկոններով։ Նուրբ փունջ ռոմանտիկ բնավորությամբ։',
      'en': '“Lady Bombastic” spray roses with buds opening one by one. A delicate bouquet with a romantic character.',
      'ru': 'Кустовые розы «Леди Бомбастик» с бутонами, раскрывающимися один за другим. Нежный букет с романтичным характером.'
    },
    'categoryCode': '00010004',
    'collections': [
      'premium-picks',
      'romantic'
    ],
    'price': 35000,
    'compareAtPrice': 38000,
    'image': 'bouquet-03',
    'badges': [
      'sale'
    ],
    'isFeatured': true,
    'withAddons': true,
    'rating': 5,
    'reviews': 51,
    'sold': 180,
    'source': {
      'provider': 'thanksflowers',
      'tfSlug': 'tpayin-varder-ledi-bombastik',
      'tfId': '3dff528c-da99-47c3-99b4-db70278ccac1',
      'productUrl': 'https://thanksflowers.am/product/tpayin-varder-ledi-bombastik/',
      'images': [
        '/media/flowers/IMG_6476.webp',
        '/media/flowers/IMG_6472.webp',
        '/media/flowers/IMG_6474.webp',
        '/media/flowers/IMG_6479.webp'
      ]
    }
  },
  {
    'slug': 'odilia-spray-roses',
    'name': {
      'hy': 'Թփային վարդեր՝ Օդիլիա',
      'en': 'Odilia spray roses',
      'ru': 'Кустовые розы Одилия'
    },
    'shortDescription': {
      'hy': 'Օդիլիա թփային վարդեր՝ վարդագույնի ու սպիտակի մեղմ համադրությամբ։ Զուսպ ու նրբագեղ փունջ։',
      'en': 'Odilia spray roses in a gentle pink-and-white blend. A restrained, elegant bouquet.',
      'ru': 'Кустовые розы Одилия в мягком розово-белом сочетании. Сдержанный и элегантный букет.'
    },
    'categoryCode': '00010001',
    'collections': [
      'flower-of-the-month'
    ],
    'price': 15000,
    'compareAtPrice': 18000,
    'image': 'bouquet-03',
    'badges': [
      'sale'
    ],
    'withAddons': true,
    'rating': 4.8,
    'reviews': 39,
    'sold': 170,
    'source': {
      'provider': 'thanksflowers',
      'tfSlug': 'tpayin-varder-odilia',
      'tfId': '364a4158-577c-4284-8ae6-2c297e4184e6',
      'productUrl': 'https://thanksflowers.am/product/tpayin-varder-odilia/',
      'images': [
        '/media/flowers/IMG_5696.webp',
        '/media/flowers/IMG_5695.webp'
      ]
    }
  },
  {
    'slug': 'spray-roses-matthiola',
    'name': {
      'hy': 'Թփային վարդերի և մաթիոլայի փունջ',
      'en': 'Spray rose and matthiola bouquet',
      'ru': 'Букет кустовых роз и маттиолы'
    },
    'shortDescription': {
      'hy': 'Թփային վարդերի և մաթիոլայի փունջ՝ սպիտակ ու մանուշակագույն երանգներով։ Հազվադեպ համադրություն՝ նուրբ բույրով։',
      'en': 'A bouquet of spray roses and matthiola in white and purple tones. A rare pairing with a delicate scent.',
      'ru': 'Букет кустовых роз и маттиолы в белых и фиолетовых тонах. Редкое сочетание с нежным ароматом.'
    },
    'categoryCode': '00010001',
    'collections': [
      'flower-of-the-month'
    ],
    'price': 15000,
    'image': 'bouquet-06',
    'withAddons': true,
    'rating': 4.7,
    'reviews': 34,
    'sold': 140,
    'source': {
      'provider': 'thanksflowers',
      'tfSlug': 'tpayin-varderi-ev-matiolayi-punj',
      'tfId': 'b7123df2-cac4-45f0-b036-a6f36bb9d376',
      'productUrl': 'https://thanksflowers.am/product/tpayin-varderi-ev-matiolayi-punj/',
      'images': [
        '/media/flowers/IMG009.webp'
      ]
    }
  },
  {
    'slug': 'pink-powder-spray-roses',
    'name': {
      'hy': 'Թփային վարդեր՝ «Վարդագույն փուդրա»',
      'en': '“Pink Powder” spray roses',
      'ru': 'Кустовые розы «Розовая пудра»'
    },
    'shortDescription': {
      'hy': '«Վարդագույն փուդրա» թփային վարդերի փունջ՝ փոշեկան ու թեթև երանգով։ Նուրբ ընտրություն ցանկացած առիթի։',
      'en': '“Pink Powder” spray rose bouquet in a powdery, light shade. A gentle choice for any occasion.',
      'ru': 'Букет кустовых роз «Розовая пудра» в пудровом лёгком оттенке. Нежный выбор к любому поводу.'
    },
    'categoryCode': '00010004',
    'collections': [
      'birthday'
    ],
    'price': 10000,
    'image': 'bouquet-03',
    'withAddons': true,
    'rating': 4.7,
    'reviews': 56,
    'sold': 280,
    'source': {
      'provider': 'thanksflowers',
      'tfSlug': 'tpayin-varderi-punj-vardaguyn-pudra',
      'tfId': '79b0ee00-a1e9-4f87-bb97-d8204a047173',
      'productUrl': 'https://thanksflowers.am/product/tpayin-varderi-punj-vardaguyn-pudra/',
      'images': [
        '/media/flowers/IMG_1815.webp',
        '/media/flowers/IMG_1816.webp',
        '/media/flowers/IMG_1817.webp'
      ]
    }
  },
  {
    'slug': 'luxurious-spray-rose-bouquet',
    'name': {
      'hy': 'Թփային վարդերի շքեղ փունջ',
      'en': 'Luxurious spray rose bouquet',
      'ru': 'Роскошный букет кустовых роз'
    },
    'shortDescription': {
      'hy': 'Թփային վարդերի շքեղ փունջ՝ առատ ու փարթամ տեսքով։ Նուրբ ծաղիկների ամբողջական կոմպոզիցիա։',
      'en': 'A luxurious spray rose bouquet with a generous, lush look. A full composition of delicate blooms.',
      'ru': 'Роскошный букет кустовых роз с щедрым пышным видом. Полная композиция из нежных цветов.'
    },
    'categoryCode': '00010001',
    'collections': [
      'florist-picks',
      'birthday'
    ],
    'price': 15000,
    'image': 'bouquet-03',
    'withAddons': true,
    'rating': 4.9,
    'reviews': 69,
    'sold': 310,
    'source': {
      'provider': 'thanksflowers',
      'tfSlug': 'tpayin-varderi-shkegh-punj',
      'tfId': '0f44cd75-b75d-4f1d-bc61-39ee951427a1',
      'productUrl': 'https://thanksflowers.am/product/tpayin-varderi-shkegh-punj/',
      'images': [
        '/media/flowers/WhatsApp_Image_2026-03-21_at_20.41.53_1.webp',
        '/media/flowers/WhatsApp_Image_2026-03-21_at_20.41.53_2.webp',
        '/media/flowers/WhatsApp_Image_2026-03-21_at_20.41.53_3.webp',
        '/media/flowers/WhatsApp_Image_2026-03-21_at_20.41.53.webp'
      ]
    }
  },
  {
    'slug': 'pink-dream',
    'name': {
      'hy': 'Վարդագույն երազ',
      'en': 'Pink dream',
      'ru': 'Розовый сон'
    },
    'shortDescription': {
      'hy': 'Մեղմ վարդագույն և սպիտակ երանգների փունջ։ Թեթև ու ռոմանտիկ տրամադրություն։',
      'en': 'A bouquet of soft pink and white tones. A light and romantic mood.',
      'ru': 'Букет мягких розово-белых оттенков. Лёгкое романтичное настроение.'
    },
    'categoryCode': '00080004',
    'collections': [
      'season-picks',
      'birthday'
    ],
    'price': 16000,
    'compareAtPrice': 18000,
    'image': 'bouquet-05',
    'badges': [
      'sale'
    ],
    'withAddons': true,
    'rating': 4.8,
    'reviews': 72,
    'sold': 360,
    'source': {
      'provider': 'thanksflowers',
      'tfSlug': 'vardaguyn-eraz',
      'tfId': 'd808db09-326c-4de4-bca3-3bf7ff49a676',
      'productUrl': 'https://thanksflowers.am/product/vardaguyn-eraz/',
      'images': [
        '/media/flowers/IMG001.webp',
        '/media/flowers/IMG002.webp'
      ]
    }
  },
  {
    'slug': 'pink-cascade',
    'name': {
      'hy': 'Վարդագույն կասկադ',
      'en': 'Pink cascade',
      'ru': 'Розовый каскад'
    },
    'shortDescription': {
      'hy': 'Աստիճանաբար բացվող վարդագույն երանգների փունջ։ Հարթ ու հոսող կոմպոզիցիա։',
      'en': 'A bouquet of pink shades unfolding gradually. A smooth, flowing composition.',
      'ru': 'Букет розовых оттенков, раскрывающихся постепенно. Плавная струящаяся композиция.'
    },
    'categoryCode': '00080004',
    'collections': [
      'art-line',
      'birthday'
    ],
    'price': 10000,
    'image': 'bouquet-05',
    'withAddons': true,
    'rating': 4.7,
    'reviews': 48,
    'sold': 240,
    'source': {
      'provider': 'thanksflowers',
      'tfSlug': 'vardaguyn-kaskad',
      'tfId': '36c94ba6-7310-45b0-a42a-841467993256',
      'productUrl': 'https://thanksflowers.am/product/vardaguyn-kaskad/',
      'images': [
        '/media/flowers/IMG_5692.webp',
        '/media/flowers/IMG_5693.webp',
        '/media/flowers/IMG_5694.webp'
      ]
    }
  },
  {
    'slug': 'pink-mist',
    'name': {
      'hy': 'Վարդագույն մշուշ',
      'en': 'Pink mist',
      'ru': 'Розовый туман'
    },
    'shortDescription': {
      'hy': 'Փափուկ վարդագույն վարդերի նուրբ փունջ։ Թեթև տպավորություն՝ մշուշի պես։',
      'en': 'A delicate bouquet of soft pink roses. A light impression, like mist.',
      'ru': 'Нежный букет мягких розовых роз. Лёгкое впечатление, как туман.'
    },
    'categoryCode': '00010004',
    'collections': [
      'premium-picks',
      'flower-of-the-month'
    ],
    'price': 30000,
    'compareAtPrice': 35000,
    'image': 'roses-02',
    'badges': [
      'sale'
    ],
    'isFeatured': true,
    'withAddons': true,
    'rating': 5,
    'reviews': 61,
    'sold': 250,
    'source': {
      'provider': 'thanksflowers',
      'tfSlug': 'vardaguyn-mshush',
      'tfId': '222024a9-b4b7-47dd-aaa4-31bdd7debc60',
      'productUrl': 'https://thanksflowers.am/product/vardaguyn-mshush/',
      'images': [
        '/media/flowers/IMG001_1.webp',
        '/media/flowers/IMG002_1.webp',
        '/media/flowers/IMG003_2.webp'
      ]
    }
  },
  {
    'slug': 'mixed-rose-bouquet',
    'name': {
      'hy': 'Վարդերի խառը փունջ',
      'en': 'Mixed rose bouquet',
      'ru': 'Смешанный букет роз'
    },
    'shortDescription': {
      'hy': 'Տարբեր երանգների վարդերի խառը փունջ՝ առատ ու ուրախ տեսքով։ Համադրություն, որը հարմար է գրեթե բոլորին։',
      'en': 'A mixed rose bouquet in assorted shades with a generous, cheerful look. A blend that suits almost everyone.',
      'ru': 'Смешанный букет роз разных оттенков — щедрый и радостный. Сочетание, подходящее почти каждому.'
    },
    'categoryCode': '00010004',
    'collections': [
      'best-sellers'
    ],
    'price': 14000,
    'compareAtPrice': 15000,
    'image': 'bouquet-05',
    'badges': [
      'sale'
    ],
    'withAddons': true,
    'rating': 4.8,
    'reviews': 83,
    'sold': 450,
    'source': {
      'provider': 'thanksflowers',
      'tfSlug': 'varderi-punj',
      'tfId': 'ef07b261-b753-419f-b0d9-b79dd153064c',
      'productUrl': 'https://thanksflowers.am/product/varderi-punj/',
      'images': [
        '/media/flowers/639478534_17979877913974709_1181429064217471343_n.jpg',
        '/media/flowers/de_Qzqv2pQ.jpg'
      ]
    }
  }
];
