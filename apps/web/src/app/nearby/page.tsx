'use client';
import { useState } from 'react';
import Link from 'next/link';
import { LocateFixed } from 'lucide-react';
import { campusCenter, type Post } from '@mayoimon/shared';
import { Frame, Header, PostRow, Loading, Empty, ErrorState } from '@/components/ui';
import { useResource, useSession } from '@/components/providers';
export default function NearbyPage() {
  const [center, setCenter] = useState<{ lat: number; lng: number }>(campusCenter),
    [located, setLocated] = useState(false),
    [locating, setLocating] = useState(false),
    [type, setType] = useState(''),
    [radius, setRadius] = useState('1500');
  const { toast } = useSession();
  const result = useResource<{ items: Post[]; total: number }>(
    `/posts/nearby?lat=${center.lat}&lng=${center.lng}&radius=${radius}${type ? '&type=' + type : ''}`,
  );
  function locate() {
    if (!navigator.geolocation) {
      toast('浏览器不支持定位，使用校园示例中心');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setCenter({ lat: p.coords.latitude, lng: p.coords.longitude });
        setLocated(true);
        setLocating(false);
        toast('已更新当前位置');
      },
      () => {
        toast('未获取定位，请允许定位权限或继续使用校园示例中心');
        setLocating(false);
      },
      { timeout: 10000, maximumAge: 60000 },
    );
  }
  const markers =
    result.data?.items.filter(
      (p) =>
        p.lat !== null &&
        p.lng !== null &&
        p.lat >= 26.0555 &&
        p.lat <= 26.0593 &&
        p.lng >= 119.1945 &&
        p.lng <= 119.1985,
    ) ?? [];
  return (
    <Frame>
      <Header
        title="附近"
        action={
          <select aria-label="附近范围" value={radius} onChange={(e) => setRadius(e.target.value)}>
            <option value="500">500 m</option>
            <option value="1500">1.5 km</option>
            <option value="3000">3 km</option>
          </select>
        }
      />
      <div className="campus-map">
        <svg viewBox="0 0 390 470" preserveAspectRatio="none" aria-label="校园示意地图">
          <rect width="390" height="470" fill="#edf0e6" />
          <path
            d="M0 120h390M0 258h390M0 377h390M116 0v470M250 0v470M348 0v470"
            stroke="white"
            strokeWidth="18"
          />
          <path d="M22 14h74v58H22ZM22 285h82v77H22ZM265 290h65v69h-65Z" fill="#dfe8d3" />
          <rect x="145" y="40" width="80" height="48" rx="9" fill="#d7dccd" />
          <rect x="277" y="182" width="59" height="42" rx="9" fill="#d8ddd3" />
          <rect x="155" y="310" width="70" height="54" rx="9" fill="#d9dacd" />
          <rect x="24" y="197" width="67" height="37" rx="9" fill="#dbdfd2" />
          <ellipse cx="65" cy="391" rx="41" ry="40" fill="#dce6d4" />
          <g fill="#6f7b72" fontSize="12">
            <text x="157" y="68">
              图书馆
            </text>
            <text x="270" y="245">
              教学楼 A 座
            </text>
            <text x="166" y="340">
              学生食堂
            </text>
            <text x="34" y="218">
              宿舍区
            </text>
            <text x="47" y="397">
              体育馆
            </text>
          </g>
          <g fill="#a0a9a0" fontSize="10">
            <text x="165" y="125">
              青藤路
            </text>
            <text x="160" y="265">
              学府路
            </text>
          </g>
          <g aria-label={located ? '当前位置' : '校园示例中心'}>
            <circle
              cx={((center.lng - 119.1945) / 0.004) * 390}
              cy={((26.0593 - center.lat) / 0.0038) * 470}
              r="10"
              fill="white"
            />
            <circle
              cx={((center.lng - 119.1945) / 0.004) * 390}
              cy={((26.0593 - center.lat) / 0.0038) * 470}
              r="6"
              fill="#578fe5"
            />
          </g>
        </svg>
        <div className="map-filters">
          {[
            ['lost', '寻物'],
            ['found', '招领'],
          ].map(([v, l]) => (
            <button
              key={v}
              className={`${v} ${type === v ? 'selected' : ''}`}
              onClick={() => setType(type === v ? '' : v)}
            >
              <i />
              {l}
            </button>
          ))}
        </div>
        {markers.map((post) => (
          <Link
            key={post.id}
            href={'/posts/' + post.id}
            aria-label={post.title}
            className={`map-marker ${post.type}`}
            style={{
              left: `${((post.lng! - 119.1945) / 0.004) * 100}%`,
              top: `${((26.0593 - post.lat!) / 0.0038) * 100}%`,
            }}
          >
            {post.type === 'lost' ? '寻' : '领'}
          </Link>
        ))}
        <button
          className="locate-button"
          aria-label="获取当前位置"
          disabled={locating}
          onClick={locate}
        >
          <LocateFixed size={22} />
        </button>
        <span className="map-caption">校园示意 · 非导航地图</span>
      </div>
      <section className="nearby-panel">
        <div className="panel-handle" />
        <div className="results-heading">
          <h2>附近动态</h2>
          <span>{result.data?.total ?? 0} 条</span>
        </div>
        <p className="muted small">
          距离基于{located ? '设备当前位置' : '校园示例中心'}计算
          {!located && ' · 可点击定位按钮更新'}
        </p>
        {result.loading ? (
          <Loading />
        ) : result.error ? (
          <ErrorState message={result.error} retry={result.reload} />
        ) : result.data?.items.length ? (
          result.data.items.map((post) => <PostRow key={post.id} post={post} />)
        ) : (
          <Empty text="当前范围暂无信息，试试扩大范围" />
        )}
      </section>
    </Frame>
  );
}
