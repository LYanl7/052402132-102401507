'use client';

// All new map positions use BD-09. Browser GPS must be converted before use.
export interface MapPosition {
  lat: number;
  lng: number;
}
interface Point {
  lat: number;
  lng: number;
}
interface MapEvent {
  latlng?: Point;
  point?: Point;
  overlay?: unknown;
}
interface Overlay {
  dispose?(): void;
}
interface MapInstance {
  centerAndZoom(point: Point, zoom: number): void;
  panTo(point: Point): void;
  getCenter(): Point;
  enableScrollWheelZoom(): void;
  addOverlay(overlay: Overlay): void;
  removeOverlay(overlay: Overlay): void;
  addEventListener(event: string, callback: (event: MapEvent) => void): void;
  removeEventListener(event: string, callback: (event: MapEvent) => void): void;
  destroy(): void;
}
export interface BaiduMapSDK {
  Map: new (element: HTMLElement) => MapInstance;
  Point: new (lng: number, lat: number) => Point;
  Size: new (width: number, height: number) => object;
  Label: new (content: string, options: object) => Overlay;
  Circle: new (point: Point, radius: number, options: object) => Overlay;
  Convertor: new () => {
    translate(
      points: Point[],
      from: number,
      to: number,
      callback: (result: { status: number; points: Point[] }) => void,
    ): void;
  };
  Geocoder: new () => {
    getLocation(point: Point, callback: (result: { address: string } | null) => void): void;
    getPoint(address: string, callback: (point: Point | null) => void, city: string): void;
  };
}
declare global {
  interface Window {
    BMap?: BaiduMapSDK;
    __mayoimonBaiduReady?: () => void;
  }
}

let loading: Promise<BaiduMapSDK> | null = null;
export function loadBaiduMap(): Promise<BaiduMapSDK> {
  if (window.BMap?.Map) return Promise.resolve(window.BMap);
  if (loading) return loading;
  const ak = process.env.NEXT_PUBLIC_BAIDU_MAP_AK;
  if (!ak) return Promise.reject(new Error('地图暂未配置，请联系管理员'));
  loading = new Promise<BaiduMapSDK>((resolve, reject) => {
    const script = document.createElement('script');
    let finished = false;
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      delete window.__mayoimonBaiduReady;
      script.onerror = null;
      if (error) {
        script.remove();
        reject(error);
      } else if (window.BMap?.Map) resolve(window.BMap);
      else {
        script.remove();
        reject(new Error('地图服务未能初始化，请重试'));
      }
    };
    const timer = setTimeout(() => finish(new Error('地图加载超时，请检查网络后重试')), 15000);
    window.__mayoimonBaiduReady = () => finish();
    script.async = true;
    script.src = `https://api.map.baidu.com/api?v=4.0&ak=${encodeURIComponent(ak)}&callback=__mayoimonBaiduReady`;
    script.onerror = () => finish(new Error('地图加载失败，请检查网络后重试'));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    loading = null;
    throw error;
  });
  return loading;
}

export async function locateOnBaiduMap(): Promise<MapPosition> {
  if (!navigator.geolocation) throw new Error('浏览器不支持定位，请在地图上选择位置');
  const sdk = await loadBaiduMap();
  const position = await new Promise<GeolocationPosition>((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(
      resolve,
      (error) =>
        reject(
          new Error(
            error.code === 1
              ? '定位权限未开启，可在地图上选择位置'
              : '暂时无法获取位置，请重试或在地图上选择位置',
          ),
        ),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    ),
  );
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('定位转换超时，请重试')), 10000);
    new sdk.Convertor().translate(
      [new sdk.Point(position.coords.longitude, position.coords.latitude)],
      1,
      5,
      (result) => {
        clearTimeout(timer);
        if (result.status !== 0 || !result.points?.[0])
          reject(new Error('定位转换失败，请在地图上选择位置'));
        else resolve({ lat: result.points[0].lat, lng: result.points[0].lng });
      },
    );
  });
}

export async function findMapAddress(address: string, city: string): Promise<MapPosition> {
  const sdk = await loadBaiduMap();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('地点搜索超时，请重试')), 10000);
    new sdk.Geocoder().getPoint(
      address,
      (point) => {
        clearTimeout(timer);
        if (point) resolve({ lat: point.lat, lng: point.lng });
        else reject(new Error('未找到这个地点，请补充城市或更详细的地址'));
      },
      city,
    );
  });
}

export async function describeMapPosition(position: MapPosition): Promise<string> {
  const sdk = await loadBaiduMap();
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(''), 5000);
    new sdk.Geocoder().getLocation(new sdk.Point(position.lng, position.lat), (result) => {
      clearTimeout(timer);
      resolve(result?.address ?? '');
    });
  });
}
