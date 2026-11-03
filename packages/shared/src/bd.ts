// Bangladesh reference data and identifier formats. Moves into the BD country pack (M2).

export interface Division {
  code: string;
  name: string;
  nameBn: string;
  districts: readonly string[];
}

/** The 8 divisions and 64 districts. Upazilas are free text until the full gazetteer lands. */
export const BD_DIVISIONS: readonly Division[] = [
  {
    code: 'barishal',
    name: 'Barishal',
    nameBn: 'বরিশাল',
    districts: ['Barguna', 'Barishal', 'Bhola', 'Jhalokati', 'Patuakhali', 'Pirojpur'],
  },
  {
    code: 'chattogram',
    name: 'Chattogram',
    nameBn: 'চট্টগ্রাম',
    districts: [
      'Bandarban',
      'Brahmanbaria',
      'Chandpur',
      'Chattogram',
      "Cox's Bazar",
      'Cumilla',
      'Feni',
      'Khagrachhari',
      'Lakshmipur',
      'Noakhali',
      'Rangamati',
    ],
  },
  {
    code: 'dhaka',
    name: 'Dhaka',
    nameBn: 'ঢাকা',
    districts: [
      'Dhaka',
      'Faridpur',
      'Gazipur',
      'Gopalganj',
      'Kishoreganj',
      'Madaripur',
      'Manikganj',
      'Munshiganj',
      'Narayanganj',
      'Narsingdi',
      'Rajbari',
      'Shariatpur',
      'Tangail',
    ],
  },
  {
    code: 'khulna',
    name: 'Khulna',
    nameBn: 'খুলনা',
    districts: [
      'Bagerhat',
      'Chuadanga',
      'Jashore',
      'Jhenaidah',
      'Khulna',
      'Kushtia',
      'Magura',
      'Meherpur',
      'Narail',
      'Satkhira',
    ],
  },
  {
    code: 'mymensingh',
    name: 'Mymensingh',
    nameBn: 'ময়মনসিংহ',
    districts: ['Jamalpur', 'Mymensingh', 'Netrokona', 'Sherpur'],
  },
  {
    code: 'rajshahi',
    name: 'Rajshahi',
    nameBn: 'রাজশাহী',
    districts: [
      'Bogura',
      'Chapainawabganj',
      'Joypurhat',
      'Naogaon',
      'Natore',
      'Pabna',
      'Rajshahi',
      'Sirajganj',
    ],
  },
  {
    code: 'rangpur',
    name: 'Rangpur',
    nameBn: 'রংপুর',
    districts: [
      'Dinajpur',
      'Gaibandha',
      'Kurigram',
      'Lalmonirhat',
      'Nilphamari',
      'Panchagarh',
      'Rangpur',
      'Thakurgaon',
    ],
  },
  {
    code: 'sylhet',
    name: 'Sylhet',
    nameBn: 'সিলেট',
    districts: ['Habiganj', 'Moulvibazar', 'Sunamganj', 'Sylhet'],
  },
];

export const BD_DIVISION_CODES = BD_DIVISIONS.map((d) => d.code) as [string, ...string[]];

export const isDistrictInDivision = (divisionCode: string, district: string) =>
  BD_DIVISIONS.find((d) => d.code === divisionCode)?.districts.includes(district) ?? false;

/** Mobile numbers: 01[3-9] and 8 more digits, optionally prefixed with 88 or +88. */
export const BD_MOBILE = /^(?:\+?88)?01[3-9]\d{8}$/;
/** Stored as +8801XXXXXXXXX. */
export const normalizeBdMobile = (raw: string) => `+88${raw.replace(/\D/g, '').slice(-11)}`;

/** Smart card (10), old (13) or old with birth year (17) national ID numbers. */
export const BD_NID = /^(?:\d{10}|\d{13}|\d{17})$/;
export const BD_BIRTH_REGISTRATION = /^\d{17}$/;
/** e-passport: 1 letter + 8 digits; machine-readable passport: 2 letters + 7 digits. */
export const BD_PASSPORT = /^(?:[A-Z]\d{8}|[A-Z]{2}\d{7})$/;
export const BD_TIN = /^\d{12}$/;
/** Business identification number: 9 digits, optionally plus a 4-digit branch suffix. */
export const BD_BIN = /^\d{9}(?:\d{4})?$/;
/** Bank branch routing number used by BEFTN. */
export const BD_ROUTING_NUMBER = /^\d{9}$/;

/** The Labour Act bars employing children under 14; 14–17 are adolescents with limits. */
export const BD_MIN_WORKING_AGE = 14;
export const BD_ADULT_AGE = 18;

export function divisionName(code: string, locale: string): string {
  const division = BD_DIVISIONS.find((d) => d.code === code);
  return division ? (locale === 'bn' ? division.nameBn : division.name) : code;
}

/** An address on one line: "House 12, Road 5, Gulshan, Dhaka, Dhaka Division, 1212". */
export function formatAddress(
  address: {
    line: string;
    upazila?: string | null;
    district: string;
    division: string;
    postcode?: string | null;
    countryCode?: string;
  },
  locale: string,
): string {
  return [
    address.line,
    address.upazila,
    address.district,
    divisionName(address.division, locale),
    address.postcode,
    address.countryCode && address.countryCode !== 'BD' ? address.countryCode : undefined,
  ]
    .filter(Boolean)
    .join(', ');
}
