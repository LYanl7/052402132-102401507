'use client';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { Post } from '@/modules/message/models';
import { loadBaiduMap, type BaiduMapSDK, type MapPosition } from '@/lib/baidu-map';

interface Props {
  center: MapPosition;
  posts?: Post[];
  radius?: number;
  position?: MapPosition | null;
  onMove?: (position: MapPosition) => void;
  onPick?: (position: MapPosition) => void;
  children?: ReactNode;
  className?: string;
}
const noPosts: Post[] = [];

export function BaiduMap({
  center,
  posts = noPosts,
  radius,
  position,
  onMove,
  onPick,
  children,
  className = '',
}: Props) {
  const router = useRouter();
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<InstanceType<BaiduMapSDK['Map']> | null>(null);
  const latest = useRef({ center, onMove, onPick });
  latest.current = { center, onMove, onPick };
  const [sdk, setSdk] = useState<BaiduMapSDK | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let instance: InstanceType<BaiduMapSDK['Map']> | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setError('');
    setSdk(null);
    loadBaiduMap()
      .then((api) => {
        if (cancelled || !container.current) return;
        instance = new api.Map(container.current);
        instance.addEventListener('tilesloaded', () => {
          if (cancelled) return;
          clearTimeout(timer);
          setError('');
          setSdk(api);
        });
        timer = setTimeout(() => {
          if (!cancelled) setError('地图未能显示，请检查网络或联系管理员确认地图服务已开启');
        }, 15000);
        const point = latest.current.center;
        instance.centerAndZoom(new api.Point(point.lng, point.lat), 16);
        instance.enableScrollWheelZoom();
        instance.addEventListener('dragend', () => {
          const value = instance!.getCenter();
          latest.current.onMove?.({ lat: value.lat, lng: value.lng });
        });
        instance.addEventListener('click', (event) => {
          const point = event.point ?? event.latlng;
          if (point && !event.overlay) latest.current.onPick?.({ lat: point.lat, lng: point.lng });
        });
        map.current = instance;
      })
      .catch((failure: unknown) => {
        if (!cancelled)
          setError(failure instanceof Error ? failure.message : '地图加载失败，请重试');
      });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      instance?.destroy();
      map.current = null;
    };
  }, [retry]);
  useEffect(() => {
    if (sdk && map.current) map.current.panTo(new sdk.Point(center.lng, center.lat));
  }, [sdk, center.lat, center.lng]);
  useEffect(() => {
    const instance = map.current;
    if (!sdk || !instance) return;
    const overlays: InstanceType<BaiduMapSDK['Label']>[] = [];
    function add(overlay: InstanceType<BaiduMapSDK['Label']>) {
      overlays.push(overlay);
      instance!.addOverlay(overlay);
    }
    if (radius)
      add(
        new sdk.Circle(new sdk.Point(center.lng, center.lat), radius, {
          strokeColor: '#5185dd',
          strokeWeight: 1,
          strokeOpacity: 0.45,
          fillColor: '#5185dd',
          fillOpacity: 0.08,
          enableClicking: false,
        }),
      );
    if (position)
      add(
        new sdk.Label('<span class="map-position-dot"></span>', {
          position: new sdk.Point(position.lng, position.lat),
          offset: new sdk.Size(-9, -9),
          styles: { border: 'none', background: 'transparent' },
          enableClicking: false,
        }),
      );
    if (radius)
      add(
        new sdk.Label('<span class="map-search-dot"></span>', {
          position: new sdk.Point(center.lng, center.lat),
          offset: new sdk.Size(-5, -5),
          styles: { border: 'none', background: 'transparent' },
          enableClicking: false,
        }),
      );
    // DOM serialization escapes user titles before inserting the SDK's HTML labels.
    const groups = new Map<string, number>();
    for (const post of posts) {
      if (post.lat === null || post.lng === null) continue;
      const key = `${post.lat},${post.lng}`;
      const index = groups.get(key) ?? 0;
      groups.set(key, index + 1);
      const link = document.createElement('a');
      link.href = `/posts/${encodeURIComponent(post.id)}`;
      link.setAttribute('aria-label', post.title);
      link.title = `${post.title} · ${post.location}`;
      link.className = `map-post-pin ${post.type}`;
      link.textContent = post.type === 'lost' ? '寻' : '领';
      add(
        new sdk.Label(link.outerHTML, {
          position: new sdk.Point(post.lng, post.lat),
          offset: new sdk.Size(-18 + (index % 4) * 38, -36 - Math.floor(index / 4) * 38),
          styles: { border: 'none', background: 'transparent' },
        }),
      );
    }
    return () => {
      if (map.current !== instance) return;
      for (const overlay of overlays) {
        instance.removeOverlay(overlay);
        overlay.dispose?.();
      }
    };
  }, [sdk, posts, radius, center.lat, center.lng, position?.lat, position?.lng]);
  return (
    <div className={`baidu-map ${className}`}>
      <div
        ref={container}
        className="baidu-map-canvas"
        aria-label={onPick ? '选择地图位置' : '附近信息地图'}
        onClickCapture={(event) => {
          const link = (event.target as Element).closest<HTMLAnchorElement>('a.map-post-pin');
          if (!link) return;
          // The SDK cancels native overlay link navigation; handle it before its map listeners.
          event.preventDefault();
          event.stopPropagation();
          router.push(link.pathname);
        }}
      />
      {(!sdk || error) && (
        <div className="map-state" role={error ? 'alert' : 'status'}>
          <p>{error || '正在加载地图…'}</p>
          {error && (
            <button type="button" onClick={() => setRetry((value) => value + 1)}>
              重新加载地图
            </button>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
