export const categories = {
  keys: '钥匙',
  electronics: '数码',
  umbrella: '雨伞',
  wallet: '卡包',
  card: '证件卡片',
  other: '其他',
} as const;
export const campusPlaces = [
  { name: '图书馆 · 2楼' },
  { name: '教学楼A座 · 1楼' },
  { name: '体育馆 · 门口' },
  { name: '食堂西门' },
  { name: '操场 · 看台' },
  { name: '宿舍楼 · 门口' },
  { name: '图书馆 · 服务台' },
] as const;
// Initial map viewport only; never substitute this for the device's location.
export const defaultMapCenter = { lat: 26.0575, lng: 119.1968 };
